import { and, asc, desc, eq, gt, gte, ilike, lt, lte, ne, or, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";
import { getDb, schema } from "./db";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => DateTime.fromISO(v, { zone: "UTC" }).isValid);
export const MeetingFilters = z.object({
  status: z.enum(["upcoming", "past", "cancelled", "all"]).default("upcoming"),
  q: z.string().trim().max(200).default(""),
  eventType: z.string().max(100).default(""),
  from: Day.optional(), to: Day.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).refine(v => !v.from || !v.to || v.from <= v.to, "Start date must be on or before end date");
export type MeetingFilter = z.infer<typeof MeetingFilters>;
export function parseMeetingFilters(params: URLSearchParams) {
  return MeetingFilters.safeParse(Object.fromEntries([...params].filter(([, value]) => value !== "")));
}
export function meetingQuery(filters: MeetingFilter, page = filters.page) {
  const params = new URLSearchParams({ status: filters.status, page: String(page) });
  for (const key of ["q", "eventType", "from", "to"] as const) if (filters[key]) params.set(key, filters[key]);
  return params.toString();
}
export function meetingZone(zone: string) {
  return DateTime.now().setZone(zone).isValid ? zone : "UTC";
}
const B = schema.bookings, E = schema.eventTypes;
const summary = { uid: B.uid, title: E.title, eventTypeId: B.eventTypeId, start: B.start, end: B.end,
  inviteeName: B.inviteeName, inviteeEmail: B.inviteeEmail, inviteeTz: B.inviteeTz, status: B.status, location: E.location };
export type HostMeeting = { uid: string; title: string; eventTypeId: string; start: Date; end: Date;
  inviteeName: string; inviteeEmail: string; inviteeTz: string; status: string; location: string };
function whereMeetings(userId: string, timezone: string, filters: MeetingFilter, now: Date) {
  const conditions = [eq(B.hostId, userId)];
  if (filters.status === "cancelled") conditions.push(eq(B.status, "cancelled"));
  if (filters.status === "upcoming") conditions.push(ne(B.status, "cancelled"), gt(B.end, now));
  if (filters.status === "past") conditions.push(ne(B.status, "cancelled"), lte(B.end, now));
  if (filters.eventType) conditions.push(eq(B.eventTypeId, filters.eventType));
  if (filters.from) conditions.push(gte(B.start, DateTime.fromISO(filters.from, { zone: meetingZone(timezone) }).startOf("day").toJSDate()));
  if (filters.to) conditions.push(lt(B.start, DateTime.fromISO(filters.to, { zone: meetingZone(timezone) }).plus({ days: 1 }).startOf("day").toJSDate()));
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(or(ilike(B.inviteeName, pattern), ilike(B.inviteeEmail, pattern), ilike(E.title, pattern))!);
  }
  return and(...conditions);
}
export async function listHostMeetings(userId: string, timezone: string, filters: MeetingFilter, now = new Date()) {
  const db = await getDb(), where = whereMeetings(userId, timezone, filters, now);
  const order = filters.status === "past" || filters.status === "cancelled" ? desc : asc;
  const [rows, count] = await Promise.all([
    db.select(summary).from(B).innerJoin(E, eq(B.eventTypeId, E.id)).where(where)
      .orderBy(order(B.start), asc(B.uid)).limit(25).offset((filters.page - 1) * 25),
    db.select({ total: sql<number>`count(*)::int` }).from(B).innerJoin(E, eq(B.eventTypeId, E.id)).where(where),
  ]);
  return { rows: rows as HostMeeting[], total: Number(count[0].total) };
}
export async function hostMeetingTypes(userId: string): Promise<{ id: string; title: string }[]> {
  const db = await getDb();
  return db.selectDistinct({ id: E.id, title: E.title }).from(B).innerJoin(E, eq(B.eventTypeId, E.id))
    .where(eq(B.hostId, userId)).orderBy(asc(E.title), asc(E.id));
}
export async function getHostMeeting(userId: string, uid: string) {
  const db = await getDb();
  const [row] = await db.select({ ...summary, notes: B.notes, guests: B.guests, answers: B.answers,
    questions: E.questions, cancelReason: B.cancelReason, meetingUrl: B.meetingUrl }).from(B)
    .innerJoin(E, eq(B.eventTypeId, E.id)).where(and(eq(B.hostId, userId), eq(B.uid, uid)));
  return (row ?? null) as (HostMeeting & { notes: string; guests: string[]; answers: Record<string, string>;
    questions: typeof schema.eventTypes.$inferSelect.questions; cancelReason: string | null; meetingUrl: string | null }) | null;
}

// Quote CSV text and neutralize formulas from invitee-controlled fields.
function csvCell(value: string) {
  const safe = /^[\s]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export async function* exportHostMeetings(userId: string, timezone: string, filters: MeetingFilter, now = new Date()) {
  yield "\uFEFF" + ["Event type", "Invitee name", "Invitee email", "Invitee timezone", "Start (UTC)", "End (UTC)", "Status", "Location"].map(csvCell).join(",") + "\r\n";
  const db = await getDb();
  let cursor: { start: Date; uid: string } | undefined;
  while (true) {
    const after = cursor ? or(gt(B.start, cursor.start), and(eq(B.start, cursor.start), gt(B.uid, cursor.uid))) : undefined;
    const rows: HostMeeting[] = await db.select(summary).from(B).innerJoin(E, eq(B.eventTypeId, E.id))
      .where(and(whereMeetings(userId, timezone, filters, now), lte(B.createdAt, now), after))
      .orderBy(asc(B.start), asc(B.uid)).limit(500);
    if (!rows.length) return;
    yield rows.map(row => [row.title, row.inviteeName, row.inviteeEmail, row.inviteeTz, row.start.toISOString(), row.end.toISOString(), row.status, row.location].map(csvCell).join(",")).join("\r\n") + "\r\n";
    cursor = rows[rows.length - 1];
    if (rows.length < 500) return;
  }
}
