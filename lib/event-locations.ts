import { z } from "zod";

const Id = z.string().regex(/^[a-z0-9-]{1,64}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
export const PHONE_PATTERN = /^[+()\d\s.\-xext#]{5,40}$/i;
export const validPhone = (value: string) => PHONE_PATTERN.test(value) && (value.match(/\d/g)?.length ?? 0) >= 5;
export const VIDEO_LABELS = { zoom: "Zoom", google_meet: "Google Meet", teams: "Microsoft Teams", webex: "Webex", gotomeeting: "GoTo Meeting" } as const;
const MeetingLink = z.string().trim().url().max(1000).refine(value => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}, "Enter an HTTPS meeting link without embedded credentials.");
export const LocationOptionSchema = z.discriminatedUnion("kind", [
  z.object({ id: Id, kind: z.literal("in_person"), address: text(500), notes: z.string().trim().max(1000) }).strict(),
  z.object({ id: Id, kind: z.literal("phone"), direction: z.enum(["host_calls", "invitee_calls"]), phone: z.string().trim().max(40) }).strict(),
  z.object({ id: Id, kind: z.literal("custom"), details: text(1000), showBeforeBooking: z.boolean() }).strict(),
  z.object({ id: Id, kind: z.literal("invitee"), prompt: text(200) }).strict(),
  z.object({ id: Id, kind: z.literal("google_meet") }).strict(),
  z.object({ id: Id, kind: z.literal("video"), provider: z.enum(["zoom", "google_meet", "teams", "webex", "gotomeeting"]), url: MeetingLink }).strict(),
]).superRefine((option, ctx) => {
  if (option.kind === "phone" && option.direction === "invitee_calls" && !validPhone(option.phone)) ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter your phone number." });
});
export const LocationOptionsSchema = z.array(LocationOptionSchema).max(10).superRefine((options, ctx) => {
  if (new Set(options.map(option => option.id)).size !== options.length) ctx.addIssue({ code: "custom", message: "Location identifiers must be unique." });
});
export type LocationOption = z.infer<typeof LocationOptionSchema>;
export type BookedLocationChoice = { id: string; kind: LocationOption["kind"]; input: string; phone: string; meetingUrl: string | null };
export type PublicLocationOption = { id: string; label: string; description: string; input: "phone" | "text" | null; prompt: string };
export const LocationSelectionSchema = z.object({ id: Id, input: z.string().trim().max(1000).default("") }).strict();
export type LocationSelection = z.infer<typeof LocationSelectionSchema>;

export function locationLabel(option: LocationOption) {
  return option.kind === "video" ? VIDEO_LABELS[option.provider] : { in_person: "In-person meeting", phone: "Phone call", custom: "Custom", invitee: "Ask invitee", google_meet: "Google Meet" }[option.kind];
}
export function locationSummary(options: LocationOption[]) {
  return options.length > 1 ? `Choose from ${options.length} locations` : options[0] ? locationLabel(options[0]) : "";
}
// Construct an explicit allowlist: never serialize hidden configuration to an invitee.
export function publicLocations(options: LocationOption[] | null | undefined): PublicLocationOption[] | null {
  if (options == null) return null;
  return options.map(option => ({ id: option.id, label: locationLabel(option),
    description: option.kind === "in_person" ? [option.address, option.notes].filter(Boolean).join("\n")
      : option.kind === "custom" && option.showBeforeBooking ? option.details
      : option.kind === "phone" && option.direction === "host_calls" ? "Your host will call the number you provide."
      : option.kind === "invitee" ? "Provide the meeting location below." : "Details will be provided after booking.",
    input: option.kind === "phone" && option.direction === "host_calls" ? "phone" : option.kind === "invitee" ? "text" : null,
    prompt: option.kind === "invitee" ? option.prompt : "Phone number",
  }));
}
export function supportsLocationChoices(kind: string) { return ["one_on_one", "collective", "managed", "one_off"].includes(kind); }
export function validLocationsForKind(options: LocationOption[] | null | undefined, kind: string) {
  return !options || ((supportsLocationChoices(kind) || options.length <= 1) && (kind !== "group" || options.every(option => option.kind !== "invitee" && !(option.kind === "phone" && option.direction === "host_calls"))));
}
export function normalizeLocationPatch<T extends { location?: string; locations?: LocationOption[] | null }>(current: { location: string; locations?: LocationOption[] | null }, patch: T): T {
  if (patch.locations !== undefined && patch.locations !== null) return { ...patch, location: locationSummary(patch.locations) };
  if (patch.locations === null) return { ...patch, location: patch.location ?? "" };
  if (patch.location !== undefined && patch.location !== current.location) return { ...patch, locations: null };
  return patch;
}
export function withLocationLocks(fields: readonly string[]) {
  return [...new Set([...fields, ...(fields.includes("location") || fields.includes("locations") ? ["location", "locations"] : [])])];
}
export function canonicalLocations(options: LocationOption[] | null | undefined) {
  return JSON.stringify(options == null ? null : LocationOptionsSchema.parse(options));
}
export const hasAutomaticMeet = (options: LocationOption[] | null | undefined) => !!options?.some(option => option.kind === "google_meet");
export function resolveLocation(event: { location: string; locations?: LocationOption[] | null }, selection?: LocationSelection): { location: string; locationChoice: BookedLocationChoice | null } {
  if (event.locations == null) { if (selection) throw new Error("location_changed"); return { location: event.location, locationChoice: null }; }
  const options = LocationOptionsSchema.parse(event.locations);
  if (!options.length) { if (selection) throw new Error("location_changed"); return { location: "", locationChoice: null }; }
  const option = selection ? options.find(option => option.id === selection.id) : options.length === 1 ? options[0] : undefined;
  if (!option) throw new Error(selection ? "location_changed" : "location_required");
  const input = selection?.input?.trim() ?? "";
  const phone = option.kind === "phone" && option.direction === "host_calls" ? input : "";
  if (option.kind === "phone" && option.direction === "host_calls" && !validPhone(phone)) throw new Error("location_phone_required");
  if (option.kind === "invitee" && !input) throw new Error("location_input_required");
  const location = option.kind === "in_person" ? [option.address, option.notes].filter(Boolean).join("\n")
    : option.kind === "phone" ? `Phone call: ${option.direction === "host_calls" ? phone : option.phone}`
    : option.kind === "custom" ? option.details : option.kind === "video" ? option.url : option.kind === "google_meet" ? "Google Meet" : input;
  return { location, locationChoice: { id: option.id, kind: option.kind, input: option.kind === "invitee" || phone ? input : "", phone,
    meetingUrl: option.kind === "video" ? option.url : option.kind === "custom" && MeetingLink.safeParse(option.details).success ? option.details : null } };
}
