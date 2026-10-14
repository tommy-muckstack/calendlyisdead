import { and, eq, gte, lte } from "drizzle-orm";
import { DateTime } from "luxon";
import { nanoid } from "nanoid";
import { getDb, schema } from "./db";
import { generateSlots, holidayDates } from "./slots";
import { externalBusy, writeEvent, removeEvent } from "./calendars";
import { buildIcs } from "./ics";
import { sendMail } from "./email";
import type { Question } from "./db/schema";
const { users, eventTypes, schedules, bookings } = schema;

export async function loadEvent(username: string, slug: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.username, username));
  if (!u) return null;
  const [et] = await db.select().from(eventTypes).where(and(eq(eventTypes.userId, u.id), eq(eventTypes.slug, slug)));
  if (!et || !et.active) return null;
  const [sc] = await db.select().from(schedules).where(et.scheduleId ? eq(schedules.id, et.scheduleId) : and(eq(schedules.userId, u.id), eq(schedules.isDefault, true)));
  return { user: u, eventType: et, schedule: sc };
}

export async function slotsFor(username: string, slug: string, from: string, to: string, tz: string, now = DateTime.utc(), excludeUid?: string) {
  const ev = await loadEvent(username, slug);
  if (!ev) return null;
  const db = await getDb();
  const lo = DateTime.fromISO(from, { zone: tz }).minus({ days: 2 }).toJSDate();
  const hi = DateTime.fromISO(to, { zone: tz }).plus({ days: 2 }).toJSDate();
  const existing = await db.select().from(bookings).where(and(eq(bookings.hostId, ev.user.id), eq(bookings.status, "confirmed"), gte(bookings.start, lo), lte(bookings.start, hi)));
  const mine = existing.filter((b: any) => b.uid !== excludeUid);
  const ext = await externalBusy(ev.user.id, lo, hi);
  const busy = [...mine.map((b: any) => ({ start: b.start.toISOString(), end: b.end.toISOString() })), ...ext.busy];
  const et = ev.eventType;
  // limits count bookings of this event type across the whole week(s) touched, not just the visible window
  const wLo = DateTime.fromJSDate(lo).startOf("week").minus({ days: 1 }).toJSDate(), wHi = DateTime.fromJSDate(hi).endOf("week").plus({ days: 1 }).toJSDate();
  const forLimits = (et.maxPerDay || et.maxPerWeek)
    ? (await db.select().from(bookings).where(and(eq(bookings.eventTypeId, et.id), eq(bookings.status, "confirmed"), gte(bookings.start, wLo), lte(bookings.start, wHi))))
        .filter((b: any) => b.uid !== excludeUid).map((b: any) => b.start.toISOString())
    : [];
  const y0 = DateTime.fromJSDate(lo).year, y1 = DateTime.fromJSDate(hi).year;
  return {
    ev,
    slots: generateSlots({ schedule: { timezone: ev.schedule.timezone, weekly: ev.schedule.weekly, overrides: ev.schedule.overrides ?? {} },
      durationMin: et.durationMin, bufferBeforeMin: et.bufferBeforeMin, bufferAfterMin: et.bufferAfterMin, minNoticeMin: et.minNoticeMin,
      rangeDays: et.rangeDays, now, from, to, inviteeTz: tz, busy,
      blockedDates: holidayDates(ev.schedule.holidayCountry, y0, y1), limits: { perDay: et.maxPerDay, perWeek: et.maxPerWeek }, existing: forLimits }),
    calendarErrors: ext.errors,
  };
}

export const baseUrl = () => process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";

async function notify(kind: "confirmed" | "cancelled" | "rescheduled", b: any, ev: any) {
  const when = DateTime.fromJSDate(b.start).setZone(b.inviteeTz).toFormat("cccc, LLLL d, yyyy 'at' h:mm a ZZZZ");
  const ics = buildIcs({ uid: `${b.uid}@calendlyisdead`, start: b.start, end: b.end, title: `${ev.eventType.title} with ${ev.user.name}`,
    description: describe(b, ev.eventType), location: b.meetingUrl || ev.eventType.location, organizer: { name: ev.user.name, email: ev.user.email }, attendee: { name: b.inviteeName, email: b.inviteeEmail },
    cancelled: kind === "cancelled", sequence: kind === "confirmed" ? 0 : 1 });
  const manage = `${baseUrl()}/booking/${b.uid}`;
  const verb = { confirmed: "is booked", cancelled: "was cancelled", rescheduled: "moved" }[kind];
  for (const to of [b.inviteeEmail, ev.user.email, ...(b.guests ?? [])]) {
    await sendMail({ to, subject: `${ev.eventType.title} ${verb}: ${when}`, ics,
      text: `${ev.eventType.title} with ${ev.user.name} ${verb}.\nWhen: ${when}\nWhere: ${b.meetingUrl || ev.eventType.location || "TBD"}${answersText(b, ev.eventType)}\n\nReschedule: ${manage}/reschedule\nCancel: ${manage}/cancel` });
  }
}

export async function createBooking(input: { username: string; slug: string; start: string; name: string; email: string; tz: string; notes?: string; guests?: string[]; rescheduleUid?: string; answers?: Record<string, string> }) {
  const startDt = DateTime.fromISO(input.start, { zone: "utc" });
  const day = startDt.setZone(input.tz).toFormat("yyyy-MM-dd");
  const r = await slotsFor(input.username, input.slug, day, day, input.tz, DateTime.utc(), input.rescheduleUid);
  if (!r) throw new Error("not_found");
  if (!(r.slots[day] ?? []).includes(startDt.toISO()!)) throw new Error("slot_unavailable");
  const answers = validateAnswers(r.ev.eventType.questions ?? [], input.answers ?? {});
  const db = await getDb();
  const uid = nanoid(12);
  const b = { uid, eventTypeId: r.ev.eventType.id, hostId: r.ev.user.id, start: startDt.toJSDate(), end: startDt.plus({ minutes: r.ev.eventType.durationMin }).toJSDate(),
    inviteeName: input.name, inviteeEmail: input.email, inviteeTz: input.tz, notes: input.notes ?? "", guests: input.guests ?? [], rescheduledFrom: input.rescheduleUid ?? null, answers } as any;
  let old: any = null;
  if (input.rescheduleUid) {
    [old] = await db.select().from(bookings).where(eq(bookings.uid, input.rescheduleUid));
    await db.update(bookings).set({ status: "cancelled", cancelReason: "rescheduled" }).where(eq(bookings.uid, input.rescheduleUid));
  }
  try { await db.insert(bookings).values(b); } catch {
    if (old) await db.update(bookings).set({ status: "confirmed", cancelReason: null }).where(eq(bookings.uid, old.uid));
    throw new Error("slot_unavailable");
  }
  if (old) await removeEvent(old.externalCalendarId, old.externalEventId);
  const et = r.ev.eventType;
  const w = await writeEvent(r.ev.user.id, { uid, title: `${et.title}: ${b.inviteeName}`, description: describe(b, et), location: et.location, start: b.start, end: b.end,
    organizer: { name: r.ev.user.name ?? "", email: r.ev.user.email ?? "" }, attendees: [{ name: b.inviteeName, email: b.inviteeEmail }, ...b.guests.map((g: string) => ({ name: g, email: g }))],
    wantsMeet: /google meet/i.test(et.location) });
  if (w) { Object.assign(b, { externalCalendarId: w.externalCalendarId, externalEventId: w.externalEventId, meetingUrl: w.meetingUrl ?? null });
    await db.update(bookings).set({ externalCalendarId: w.externalCalendarId, externalEventId: w.externalEventId, meetingUrl: w.meetingUrl ?? null }).where(eq(bookings.uid, uid)); }
  await notify(input.rescheduleUid ? "rescheduled" : "confirmed", b, r.ev);
  return b;
}

export async function getBooking(uid: string) {
  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.uid, uid));
  if (!b) return null;
  const [et] = await db.select().from(eventTypes).where(eq(eventTypes.id, b.eventTypeId));
  const [u] = await db.select().from(users).where(eq(users.id, b.hostId));
  return { booking: b, eventType: et, user: u };
}

export async function cancelBooking(uid: string, reason: string) {
  const db = await getDb();
  const g = await getBooking(uid);
  if (!g || g.booking.status !== "confirmed") return null;
  await db.update(bookings).set({ status: "cancelled", cancelReason: reason }).where(eq(bookings.uid, uid));
  await removeEvent(g.booking.externalCalendarId, g.booking.externalEventId);
  await notify("cancelled", g.booking, { eventType: g.eventType, user: g.user });
  return g;
}

export function validateAnswers(qs: Question[], a: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const q of qs) {
    const v = String(a[q.id] ?? "").trim().slice(0, 5000);
    if (q.required && !v) throw new Error(`answer_required:${q.id}`);
    if (v && q.type === "select" && !(q.options ?? []).includes(v)) throw new Error(`answer_invalid:${q.id}`);
    if (v && q.type === "phone" && !/^[+()\d\s.-]{5,25}$/.test(v)) throw new Error(`answer_invalid:${q.id}`);
    if (v) out[q.id] = v;
  }
  return out;
}
function answersText(b: any, et: any) {
  const qs: Question[] = et.questions ?? [];
  const lines = qs.filter(q => b.answers?.[q.id]).map(q => `${q.label}: ${b.answers[q.id]}`);
  return lines.length ? `\n\n${lines.join("\n")}` : "";
}
function describe(b: any, et: any) { return `${b.notes ?? ""}${answersText(b, et)}`.trim(); }
