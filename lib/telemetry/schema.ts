import { z } from "zod";
import { BP } from "@/lib/basepath";

// Shared website vocabulary. Subapps change app_id, not these event names.
const method = z.enum(["email", "google"]);
const flow = z.enum(["login", "signup", "password_reset"]);
export const websiteEvents = {
  $pageview: z.object({}),
  website_signup_clicked: z.object({ method, placement: z.literal("homepage_hero") }),
  website_auth_started: z.object({ method, flow }),
  website_auth_completed: z.object({ method, flow }),
  website_auth_failed: z.object({ method, flow, reason: z.enum(["credentials", "account_exists", "validation", "popup_closed", "rate_limited", "other"]) }),
} as const;
export type WebsiteEvent = keyof typeof websiteEvents;
export type WebsiteProperties<E extends WebsiteEvent> = z.infer<(typeof websiteEvents)[E]>;
export type Surface = "marketing" | "auth" | "app" | "booking" | "other";

const staticRoutes: Record<string, Surface> = {
  "/": "marketing", "/pricing": "marketing", "/pricing/calculator": "marketing",
  "/login": "auth", "/signup": "auth", "/app": "app", "/app/contact-settings": "app",
  ...Object.fromEntries(["analytics", "assistant", "availability", "availability/advanced", "branding", "calendars", "contacts", "embed", "meetings", "one-off", "polls", "profile", "routing", "teams", "workflows"].map(p => [`/app/${p}`, "app" as const])),
};
const dynamicRoutes: [RegExp, string, Surface][] = [
  [/^\/app\/contacts\/[^/]+$/, "/app/contacts/[id]", "app"],
  [/^\/app\/meetings\/[^/]+$/, "/app/meetings/[uid]", "app"],
  [/^\/booking\/[^/]+\/cancel$/, "/booking/[uid]/cancel", "booking"],
  [/^\/booking\/[^/]+\/reschedule$/, "/booking/[uid]/reschedule", "booking"],
  [/^\/booking\/[^/]+$/, "/booking/[uid]", "booking"],
  [/^\/invite\/[^/]+$/, "/invite/[token]", "auth"],
  [/^\/f\/[^/]+$/, "/f/[id]", "booking"],
  [/^\/poll\/[^/]+$/, "/poll/[id]", "booking"],
  [/^\/meet\/[^/]+$/, "/meet/[room]", "booking"],
  [/^\/pay\/[^/]+$/, "/pay/[uid]", "booking"],
  [/^\/team\/[^/]+\/[^/]+$/, "/team/[team]/[slug]", "booking"],
  [/^\/team\/[^/]+$/, "/team/[team]", "booking"],
  [/^\/(?!api(?:\/|$)|app(?:\/|$)|_next(?:\/|$))[^/]+\/[^/]+$/, "/[user]/[slug]", "booking"],
  [/^\/(?!api$|_next$)[^/]+$/, "/[user]", "booking"],
];

/** Never send raw paths: booking IDs, usernames and invitation tokens live there. */
export function websiteRoute(pathname: string, basePath = BP) {
  let path = pathname.split(/[?#]/, 1)[0];
  if (basePath && (path === basePath || path.startsWith(`${basePath}/`))) path = path.slice(basePath.length);
  path = path.replace(/\/+$/, "") || "/";
  if (path === "/[unknown]") return { route_template: path, surface: "other" as const };
  if (Object.hasOwn(staticRoutes, path)) return { route_template: path, surface: staticRoutes[path] };
  const route = dynamicRoutes.find(([pattern]) => pattern.test(path));
  return route ? { route_template: route[1], surface: route[2] } : { route_template: "/[unknown]", surface: "other" as const };
}

export function authFailureReason(error: unknown): WebsiteProperties<"website_auth_failed">["reason"] {
  const code = String((error as { code?: unknown } | null)?.code ?? "");
  if (/invalid-credential|wrong-password|user-not-found/.test(code)) return "credentials";
  if (code.includes("email-already-in-use")) return "account_exists";
  if (/weak-password|invalid-email/.test(code)) return "validation";
  if (code.includes("popup-closed")) return "popup_closed";
  if (code.includes("too-many-requests")) return "rate_limited";
  return "other";
}
