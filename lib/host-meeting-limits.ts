import { and, eq, gte, lte } from "drizzle-orm";
import { DateTime } from "luxon";
import { getDb, schema } from "./db";
import type { MeetingLimits } from "./meeting-limits";

type LimitHost = MeetingLimits & { id: string; timezone: string };
/** Account limits use the account timezone, independent of the event's schedule
 * or invitee timezone. Reuse the reservation transaction for the final check. */
export async function hostLimitCheck(db: Awaited<ReturnType<typeof getDb>>, host: LimitHost, from: Date, to: Date, exclude = new Set<string>()) {
  if (!host.meetingLimitPerDay && !host.meetingLimitPerWeek && !host.meetingLimitPerMonth) return () => false;
  const first = DateTime.fromJSDate(from, { zone: host.timezone }), last = DateTime.fromJSDate(to, { zone: host.timezone });
  const lo = (host.meetingLimitPerMonth ? first.startOf("month") : first).startOf("week").toJSDate();
  const hi = (host.meetingLimitPerMonth ? last.endOf("month") : last).endOf("week").toJSDate();
  const { bookings, eventTypes } = schema;
  const rows = await db.select({ uid: bookings.uid, start: bookings.start, eventTypeId: bookings.eventTypeId, groupUid: bookings.groupUid, kind: eventTypes.kind })
    .from(bookings).innerJoin(eventTypes, eq(eventTypes.id, bookings.eventTypeId))
    .where(and(eq(bookings.hostId, host.id), eq(bookings.status, "confirmed"), gte(bookings.start, lo), lte(bookings.start, hi)));
  const unique = new Set<string>(), days = new Map<string, number>(), weeks = new Map<string, number>(), months = new Map<string, number>();
  for (const row of rows) {
    if (exclude.has(row.uid)) continue;
    const id = row.kind === "group" ? `${row.eventTypeId}:${row.start.toISOString()}` : row.groupUid ?? row.uid;
    if (unique.has(id)) continue;
    unique.add(id);
    const start = DateTime.fromJSDate(row.start, { zone: host.timezone });
    for (const [map, key] of [[days, start.toISODate()!], [weeks, start.toFormat("kkkk-WW")], [months, start.toFormat("yyyy-MM")]] as const)
      map.set(key, (map.get(key) ?? 0) + 1);
  }
  return (instant: string) => {
    const at = DateTime.fromISO(instant).setZone(host.timezone);
    return (host.meetingLimitPerDay != null && (days.get(at.toISODate()!) ?? 0) >= host.meetingLimitPerDay)
      || (host.meetingLimitPerWeek != null && (weeks.get(at.toFormat("kkkk-WW")) ?? 0) >= host.meetingLimitPerWeek)
      || (host.meetingLimitPerMonth != null && (months.get(at.toFormat("yyyy-MM")) ?? 0) >= host.meetingLimitPerMonth);
  };
}
