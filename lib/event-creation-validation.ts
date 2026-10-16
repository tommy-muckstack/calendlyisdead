import { LocationOptionsSchema, validLocationsForKind } from "./event-locations";
import { z } from "zod";
import { SharedEventSettings } from "./shared-event-validation";
import { EventTypePatch } from "./event-type-validation";

export const NewEventFields = EventTypePatch.omit({ rangeDays: true, secret: true, rrMode: true }).required().extend({
  locations: LocationOptionsSchema.nullable().default(null),
  title: z.string().trim().min(1, "Enter an event name.").max(120),
  kind: z.enum(["one_on_one", "group", "collective", "round_robin"]),
}).strict().superRefine((event, ctx) => {
  if (event.kind === "group" ? event.seats < 2 : event.seats !== 1) ctx.addIssue({ code: "custom", path: ["seats"], message: event.kind === "group" ? "Invitee limit must be at least 2." : "One-on-one events have one invitee." });
  if (!validLocationsForKind(event.locations, event.kind)) ctx.addIssue({ code: "custom", path: ["locations"], message: "Choose locations supported by this event type." });
  const ids = new Set<string>();
  event.questions.forEach((question, index) => {
    if (ids.has(question.id) || !question.label.trim() || (question.type === "select" && (!question.options?.length || question.options.some(value => !value.trim())))) ctx.addIssue({ code: "custom", path: ["questions", index], message: "Each question needs a unique ID, a label and any required choices." });
    ids.add(question.id);
  });
});
export const EventCreation = z.object({ draftId: z.uuid(), autoSlug: z.boolean(), settings: NewEventFields, shared: SharedEventSettings.optional() }).strict().superRefine((input, ctx) => {
  if (["collective", "round_robin"].includes(input.settings.kind) !== !!input.shared) ctx.addIssue({ code: "custom", path: ["shared"], message: "Shared event types need workspace hosts." });
  if (input.shared && input.settings.scheduleId !== null) ctx.addIssue({ code: "custom", path: ["settings", "scheduleId"], message: "Choose schedules for each host." });
});
export type EventCreation = z.infer<typeof EventCreation>;
export function eventSlug(title: string) { return title.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "meeting"; }
export function initialEventFields(kind: "one_on_one" | "group" | "collective" | "round_robin", scheduleId: string | null): Required<z.infer<typeof NewEventFields>> {
  return { title: "", slug: "meeting", description: "", durationMin: 30, startIntervalMin: 30, location: "", locations: null, color: "#8247F5",
    bufferBeforeMin: 0, bufferAfterMin: 0, minNoticeMin: 240, dateRange: null, active: true, lockedTimezone: null,
    scheduleId, maxPerDay: null, maxPerWeek: null, maxPerMonth: null, questions: [], kind, seats: kind === "group" ? 2 : 1,
    priceCents: 0, currency: "usd", redirectUrl: null };
}
