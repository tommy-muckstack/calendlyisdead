import { DateTime } from "luxon";
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.").refine(value => {
  const parsed = DateTime.fromISO(value, { zone: "UTC" });
  return parsed.isValid && parsed.year > 0 && parsed.toISODate() === value;
}, "Enter a valid date.");

export const BookingDateRangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rolling"), days: z.number({ error: "Enter a whole number of days." }).int("Enter a whole number of days.")
    .min(1, "Enter at least 1 day.").max(730, "Enter no more than 730 days."), unit: z.enum(["calendar", "weekdays"]) }).strict(),
  z.object({ kind: z.literal("fixed"), start: date, end: date }).strict().refine(range => range.end >= range.start,
    { message: "End date must be on or after the start date.", path: ["end"] }),
  z.object({ kind: z.literal("indefinite") }).strict(),
]);
export type BookingDateRange = z.infer<typeof BookingDateRangeSchema>;

// Null preserves each legacy event's rolling day count, without a data rewrite.
export function effectiveDateRange(event: { dateRange?: BookingDateRange | null; rangeDays?: number }): BookingDateRange {
  return event.dateRange ?? (event.rangeDays == null ? { kind: "indefinite" } : { kind: "rolling", days: event.rangeDays, unit: "calendar" });
}

/** Inclusive local start date and exclusive next-midnight end, independent of invitee zone. */
export function dateRangeBounds(range: BookingDateRange, now: DateTime, timezone: string) {
  const valid = BookingDateRangeSchema.parse(range);
  if (valid.kind === "indefinite") return { start: null, end: null };
  // Count calendar dates before resolving local midnights. Adding days after
  // resolving a nonexistent date (e.g. Apia's 2011-12-30) extends the range.
  const midnight = (calendarDate: DateTime) => DateTime.fromISO(calendarDate.toISODate()!, { zone: timezone }).startOf("day");
  if (valid.kind === "fixed") return {
    start: DateTime.fromISO(valid.start, { zone: timezone }).startOf("day"),
    end: midnight(DateTime.fromISO(valid.end, { zone: "UTC" }).plus({ days: 1 })),
  };
  let last = DateTime.fromISO(now.setZone(timezone).toISODate()!, { zone: "UTC" });
  if (valid.unit === "calendar") last = last.plus({ days: valid.days });
  else for (let left = valid.days; left > 0;) {
    last = last.plus({ days: 1 });
    if (last.weekday <= 5) left--;
  }
  return { start: null, end: midnight(last.plus({ days: 1 })) };
}

export function dateRangeSummary(range: BookingDateRange): string {
  if (range.kind === "indefinite") return "Indefinitely into the future";
  if (range.kind === "fixed") return `${range.start || "Start date"} – ${range.end || "End date"}`;
  return `${range.days} ${range.unit === "weekdays" ? "weekdays" : "calendar days"} ahead`;
}

// Legacy rangeDays and the new atomic range are one managed setting. Locking
// either representation must also protect copies from edits through the other.
export function withDateRangeLocks(fields: readonly string[]): string[] {
  return fields.includes("rangeDays") || fields.includes("dateRange")
    ? [...new Set([...fields, "rangeDays", "dateRange"])] : [...fields];
}
