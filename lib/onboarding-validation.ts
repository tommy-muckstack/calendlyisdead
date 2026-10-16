import { z } from "zod";

export const ONBOARDING_ROLES = ["Sales", "Recruiting", "Customer success", "Education", "Consulting", "Other"] as const;
export const OnboardingTimezone = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Choose a valid time zone.");
const Clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const Hours = z.array(z.object({ start: Clock, end: z.union([Clock, z.literal("24:00")]) }).strict()).max(12).superRefine((ranges, ctx) => {
  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
  if (sorted.some((range, i) => range.start >= range.end || (i > 0 && sorted[i - 1].end > range.start))) {
    ctx.addIssue({ code: "custom", message: "Hours must end after they start and cannot overlap." });
  }
});
export const OnboardingWeekly = z.object({ 1: Hours, 2: Hours, 3: Hours, 4: Hours, 5: Hours, 6: Hours, 7: Hours }).strict();
const Version = z.number().int().positive();
export const OnboardingMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("role"), version: Version, role: z.enum(ONBOARDING_ROLES), timezone: OnboardingTimezone }).strict(),
  z.object({ action: z.literal("calendar"), version: Version, skip: z.boolean() }).strict(),
  z.object({ action: z.literal("finish"), version: Version, timezone: OnboardingTimezone, weekly: OnboardingWeekly }).strict(),
  z.object({ action: z.literal("keep_existing"), version: Version }).strict(),
]);
export type OnboardingMutation = z.infer<typeof OnboardingMutation>;
export const OnboardingData = z.object({
  step: z.enum(["role", "calendar", "availability", "complete"]), role: z.enum(ONBOARDING_ROLES).nullable(),
  timezone: OnboardingTimezone.nullable(), weekly: OnboardingWeekly, calendarSkipped: z.boolean().nullable(), version: Version,
});
export type OnboardingData = z.infer<typeof OnboardingData>;

/** App and invitation destinations; Next redirects add the base path separately. */
export function loginDestination(callback: string | undefined, basePath: string) {
  const relative = callback?.startsWith(basePath + "/") ? callback.slice(basePath.length) : callback;
  if (!relative || /[\\\x00-\x20]/.test(relative)) return "/app";
  try {
    const url = new URL(relative, "https://local.invalid");
    if (!relative.startsWith("/") || url.origin !== "https://local.invalid" || !(url.pathname === "/app" || url.pathname.startsWith("/app/") || /^\/invite\/[^/]+$/.test(url.pathname))) return "/app";
    return url.pathname + url.search + url.hash;
  } catch { return "/app"; }
}
