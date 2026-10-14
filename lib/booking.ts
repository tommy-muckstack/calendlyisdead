import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import { nanoid } from "nanoid";
import { getDb, schema } from "./db";
import { generateSlots, holidayDates } from "./slots";
import { externalBusy, writeEvent, removeEvent } from "./calendars";
import { buildIcs } from "./ics";
import { sendMail } from "./email";
import { onBooked, onCancelled } from "./workflows";
import type { Question } from "./db/schema";
const { users, eventTypes, schedules, bookings, teams, eventTypeHosts } = schema;

export type Host = { user: any; schedule: any; priority: number };
export type Loaded = { eventType: any; ownerName: string; ownerUser: any | null; team: any | null; hosts: Host[] };

/** owner is a username, or "team:<slug>" for team event types. */
export async function loadEvent(owner: string, slug: string): Promise<Loaded | null> {
  const db = await getDb();
  let et: any, team: any = null, ownerUser: any = null;
  if (owner.startsWith("team:")) {
    [team] = await db.select().from(teams).where(eq(teams.slug, owner.slice(5)));
    if (!team) return null;
    [et] = await db.select().from(eventTypes).where(and(eq(eventTypes.teamId, team.id), eq(eventTypes.slug, slug)));
  } else {
    [ownerUser] = await db.select().from(users).where(eq(users.username, owner));
    if (!ownerUser) return null;
    [et] = await db.select().from(eventTypes).where(and(eq(eventTypes.userId, ownerUser.id), eq(eventTypes.slug, slug)));
    if (et?.teamId) et = null; // team types are only bookable under the team URL
  }
  if (!et || !et.active || et.kind === "managed") return null;
  const defaultSchedule = async (uid: string) => (await db.select().from(schedules).where(and(eq(schedules.userId, uid), eq(schedules.isDefault, true))))[0];
  let hosts: Host[];
  if (team) {
    const hs = await db.select().from(eventTypeHosts).where(eq(eventTypeHosts.eventTypeId, et.id));
    if (!hs.length) return null;
    const us = await db.select().from(users).where(inArray(users.id, hs.map((h: any) => h.userId)));
    hosts = await Promise.all(hs.map(async (h: any) => ({ user: us.find((u: any) => u.id === h.userId), schedule: await defaultSchedule(h.userId), priority: h.priority })));
  } else {
    const sc = et.scheduleId ? (await db.select().from(schedules).where(eq(schedules.id, et.scheduleId)))[0] : await defaultSchedule(ownerUser.id);
    hosts = [{ user: ownerUser, schedule: sc, priority: 2 }];
  }
  hosts = hosts.filter(h => h.user && h.schedule);
  if (!hosts.length) return null;
  return { eventType: et, ownerName: team?.name ?? ownerUser.name ?? owner, ownerUser, team, hosts };
}

async function hostSlots(h: Host, et: any, from: string, to: string, tz: string, now: DateTime, exclude: Set<string>) {
  const db = await getDb();
  const lo = DateTime.fromISO(from, { zone: tz }).minus({ days: 2 }).toJSDate();
  const hi = DateTime.fromISO(to, { zone: tz }).plus({ days: 2 }).toJSDate();
  const existing = (await db.select().from(bookings).where(and(eq(bookings.hostId, h.user.id), eq(bookings.status, "confirmed"), gte(bookings.start, lo), lte(bookings.start, hi))))
    .filter((b: any) => !exclude.has(b.uid));
  const isGroup = et.kind === "group";
  const busyRows = isGroup ? existing.filter((b: any) => b.eventTypeId !== et.id) : existing;
  const ext = await externalBusy(h.user.id, lo, hi);
  // a group session that already exists is shown on the host's external calendar too; don't let that hide its own open seats
  const ownStarts = new Set(existing.filter((b: any) => b.eventTypeId === et.id).map((b: any) => b.start.toISOString()));
  const extBusy = isGroup ? ext.busy.filter(b => !ownStarts.has(new Date(b.start).toISOString())) : ext.busy;
  const busy = [...busyRows.map((b: any) => ({ start: b.start.toISOString(), end: b.end.toISOString() })), ...extBusy];
  const wLo = DateTime.fromJSDate(lo).startOf("week").minus({ days: 1 }).toJSDate(), wHi = DateTime.fromJSDate(hi).endOf("week").plus({ days: 1 }).toJSDate();
  const forLimits = (et.maxPerDay || et.maxPerWeek)
    ? [...new Set((await db.select().from(bookings).where(and(eq(bookings.eventTypeId, et.id), eq(bookings.hostId, h.user.id), eq(bookings.status, "confirmed"), gte(bookings.start, wLo), lte(bookings.start, wHi))))
        .filter((b: any) => !exclude.has(b.uid)).map((b: any) => b.start.toISOString()))] as string[]
    : [];
  const y0 = DateTime.fromJSDate(lo).year, y1 = DateTime.fromJSDate(hi).year;
  const sc = h.schedule;
  let slots = generateSlots({ schedule: { timezone: sc.timezone, weekly: sc.weekly, overrides: sc.overrides ?? {} },
    durationMin: et.durationMin, bufferBeforeMin: et.bufferBeforeMin, bufferAfterMin: et.bufferAfterMin, minNoticeMin: et.minNoticeMin,
    rangeDays: et.rangeDays, now, from, to, inviteeTz: tz, busy, blockedDates: holidayDates(sc.holidayCountry, y0, y1),
    limits: { perDay: et.maxPerDay, perWeek: et.maxPerWeek }, existing: isGroup ? forLimits.filter(s => !ownStarts.has(s)) : forLimits });
  if (isGroup) {
    const taken = new Map<string, number>();
    for (const b of existing) if (b.eventTypeId === et.id) taken.set(b.start.toISOString(), (taken.get(b.start.toISOString()) ?? 0) + 1);
    slots = Object.fromEntries(Object.entries(slots).map(([d, ss]) => [d, ss.filter(s => (taken.get(s) ?? 0) < et.seats)]).filter(([, ss]) => ss.length));
  }
  return { slots, errors: ext.errors };
}

/** Open slots for an event type plus, per slot, which hosts are free (needed for round robin). */
export async function availability(owner: string, slug: string, from: string, to: string, tz: string, now = DateTime.utc(), excludeUids: string[] = []) {
  const ev = await loadEvent(owner, slug);
  if (!ev) return null;
  const et = ev.eventType, exclude = new Set(excludeUids);
  const per = await Promise.all(ev.hosts.map(h => hostSlots(h, et, from, to, tz, now, exclude)));
  const free = new Map<string, string[]>(); // slot -> host ids
  per.forEach((p, i) => { for (const ss of Object.values(p.slots)) for (const s of ss) free.set(s, [...(free.get(s) ?? []), ev.hosts[i].user.id]); });
  const need = et.kind === "collective" ? ev.hosts.length : 1;
  const slots: Record<string, string[]> = {};
  for (const [s, hs] of free) if (hs.length >= need) {
    const d = DateTime.fromISO(s).setZone(tz).toFormat("yyyy-MM-dd"); (slots[d] ??= []).push(s);
  }
  for (const d of Object.keys(slots)) slots[d].sort();
  return { ev, slots, free, calendarErrors: per.flatMap(p => p.errors) };
}

/** Back-compat wrapper used by older callers. */
export async function slotsFor(owner: string, slug: string, from: string, to: string, tz: string, now = DateTime.utc(), excludeUid?: string) {
  return availability(owner, slug, from, to, tz, now, excludeUid ? [excludeUid] : []);
}

/** Round robin: pick the host. even = fewest bookings of this type in the last 30 days and upcoming; priority = highest priority first, then even. */
export async function pickHost(et: any, hosts: Host[], candidates: string[]) {
  const db = await getDb();
  const since = DateTime.utc().minus({ days: 30 }).toJSDate();
  const rows = await db.select().from(bookings).where(and(eq(bookings.eventTypeId, et.id), eq(bookings.status, "confirmed"), gte(bookings.start, since)));
  const count = (id: string) => rows.filter((b: any) => b.hostId === id).length;
  const last = (id: string) => Math.max(0, ...rows.filter((b: any) => b.hostId === id).map((b: any) => +b.createdAt));
  const prio = (id: string) => hosts.find(h => h.user.id === id)?.priority ?? 2;
  return [...candidates].sort((a, b) =>
    (et.rrMode === "priority" ? prio(b) - prio(a) : 0) || count(a) - count(b) || last(a) - last(b) || a.localeCompare(b))[0];
}

export const baseUrl = () => process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";

async function notify(kind: "confirmed" | "cancelled" | "rescheduled", b: any, et: any, hostUsers: any[]) {
  const when = DateTime.fromJSDate(b.start).setZone(b.inviteeTz).toFormat("cccc, LLLL d, yyyy 'at' h:mm a ZZZZ");
  const hostNames = hostUsers.map(h => h.name).join(", ");
  const ics = buildIcs({ uid: `${b.uid}@calendlyisdead`, start: b.start, end: b.end, title: `${et.title} with ${hostNames}`,
    description: describe(b, et), location: b.meetingUrl || et.location, organizer: { name: hostUsers[0].name, email: hostUsers[0].email }, attendee: { name: b.inviteeName, email: b.inviteeEmail },
    cancelled: kind === "cancelled", sequence: kind === "confirmed" ? 0 : 1 });
  const manage = `${baseUrl()}/booking/${b.uid}`;
  const verb = { confirmed: "is booked", cancelled: "was cancelled", rescheduled: "moved" }[kind];
  for (const to of [b.inviteeEmail, ...hostUsers.map(h => h.email), ...(b.guests ?? [])]) {
    await sendMail({ to, subject: `${et.title} ${verb}: ${when}`, ics,
      text: `${et.title} with ${hostNames} ${verb}.\nWhen: ${when}\nWhere: ${b.meetingUrl || et.location || "TBD"}${answersText(b, et)}\n\nReschedule: ${manage}/reschedule\nCancel: ${manage}/cancel` });
  }
}

export type BookingInput = { username: string; slug: string; start: string; name: string; email: string; tz: string; notes?: string; guests?: string[]; rescheduleUid?: string; answers?: Record<string, string> };

export async function createBooking(input: BookingInput) {
  const db = await getDb();
  const startDt = DateTime.fromISO(input.start, { zone: "utc" });
  const startIso = startDt.toISO()!;
  const day = startDt.setZone(input.tz).toFormat("yyyy-MM-dd");
  let old: any = null, oldGroup: any[] = [];
  if (input.rescheduleUid) {
    [old] = await db.select().from(bookings).where(eq(bookings.uid, input.rescheduleUid));
    if (!old || old.status !== "confirmed") throw new Error("not_found");
    oldGroup = old.groupUid ? await db.select().from(bookings).where(eq(bookings.groupUid, old.groupUid)) : [old];
  }
  const r = await availability(input.username, input.slug, day, day, input.tz, DateTime.utc(), oldGroup.map(b => b.uid));
  if (!r) throw new Error("not_found");
  if (!(r.slots[day] ?? []).includes(startIso)) throw new Error("slot_unavailable");
  const et = r.ev.eventType;
  const answers = validateAnswers(et.questions ?? [], input.answers ?? {});
  const free = r.free.get(startIso) ?? [];
  const hostIds = et.kind === "collective" ? r.ev.hosts.map(h => h.user.id)
    : et.kind === "round_robin" ? [await pickHost(et, r.ev.hosts, free)]
    : [r.ev.hosts[0].user.id];
  const hostUsers = hostIds.map(id => r.ev.hosts.find(h => h.user.id === id)!.user);
  const uid = nanoid(12);
  const base = { eventTypeId: et.id, start: startDt.toJSDate(), end: startDt.plus({ minutes: et.durationMin }).toJSDate(), inviteeName: input.name, inviteeEmail: input.email,
    inviteeTz: input.tz, notes: input.notes ?? "", guests: input.guests ?? [], rescheduledFrom: input.rescheduleUid ?? null, answers };
  const rows = hostIds.map((hostId, i) => ({ ...base, uid: i === 0 ? uid : `${uid}-${i}`, hostId, groupUid: hostIds.length > 1 ? uid : null, seat: 0 })) as any[];

  if (oldGroup.length) await db.update(bookings).set({ status: "cancelled", cancelReason: "rescheduled" }).where(inArray(bookings.uid, oldGroup.map(b => b.uid)));
  const restore = async () => { if (oldGroup.length) await db.update(bookings).set({ status: "confirmed", cancelReason: null }).where(inArray(bookings.uid, oldGroup.map(b => b.uid))); };
  try {
    if (et.kind === "group") {
      let ok = false;
      for (let seat = 0; seat < et.seats && !ok; seat++) {
        try { await db.insert(bookings).values({ ...rows[0], seat }); rows[0].seat = seat; ok = true; } catch { /* seat taken, try next */ }
      }
      if (!ok) throw new Error("full");
    } else {
      await db.transaction(async (tx: any) => { for (const row of rows) await tx.insert(bookings).values(row); });
    }
  } catch { await restore(); throw new Error("slot_unavailable"); }

  for (const o of oldGroup) await removeEvent(o.externalCalendarId, o.externalEventId);
  // calendar write-back per host; a group session is written once (first seat)
  for (const row of rows) {
    if (et.kind === "group" && row.seat > 0) continue;
    const host = hostUsers.find(u => u.id === row.hostId);
    const w = await writeEvent(row.hostId, { uid: row.uid, title: et.kind === "group" ? et.title : `${et.title}: ${row.inviteeName}`, description: describe(row, et), location: et.location, start: row.start, end: row.end,
      organizer: { name: host.name ?? "", email: host.email ?? "" }, attendees: [{ name: row.inviteeName, email: row.inviteeEmail }, ...row.guests.map((g: string) => ({ name: g, email: g }))],
      wantsMeet: /google meet/i.test(et.location) });
    if (w) { Object.assign(row, { externalCalendarId: w.externalCalendarId, externalEventId: w.externalEventId, meetingUrl: w.meetingUrl ?? null });
      await db.update(bookings).set({ externalCalendarId: w.externalCalendarId, externalEventId: w.externalEventId, meetingUrl: w.meetingUrl ?? null }).where(eq(bookings.uid, row.uid)); }
  }
  const main = rows[0];
  if (!main.meetingUrl) main.meetingUrl = rows.find(x => x.meetingUrl)?.meetingUrl ?? null;
  await notify(input.rescheduleUid ? "rescheduled" : "confirmed", main, et, hostUsers);
  if (old) await onCancelled(old.uid, { rescheduled: true });
  await onBooked(main.uid);
  return main;
}

export async function getBooking(uid: string) {
  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.uid, uid));
  if (!b) return null;
  const [et] = await db.select().from(eventTypes).where(eq(eventTypes.id, b.eventTypeId));
  const group = b.groupUid ? await db.select().from(bookings).where(eq(bookings.groupUid, b.groupUid)) : [b];
  const hostUsers = await db.select().from(users).where(inArray(users.id, group.map((x: any) => x.hostId)));
  const [team] = et?.teamId ? await db.select().from(teams).where(eq(teams.id, et.teamId)) : [null];
  const [u] = hostUsers.filter((x: any) => x.id === b.hostId);
  return { booking: b, eventType: et, user: u, hosts: hostUsers, group, team };
}

export async function cancelBooking(uid: string, reason: string) {
  const db = await getDb();
  const g = await getBooking(uid);
  if (!g || g.booking.status !== "confirmed") return null;
  await db.update(bookings).set({ status: "cancelled", cancelReason: reason }).where(inArray(bookings.uid, g.group.map((x: any) => x.uid)));
  for (const row of g.group) {
    if (g.eventType.kind === "group") {
      // keep the host's calendar event while other attendees still hold seats
      const others = (await db.select().from(bookings).where(and(eq(bookings.eventTypeId, row.eventTypeId), eq(bookings.hostId, row.hostId), eq(bookings.start, row.start), eq(bookings.status, "confirmed"))));
      if (others.length) { if (row.externalEventId && !others.some((o: any) => o.externalEventId)) await db.update(bookings).set({ externalCalendarId: row.externalCalendarId, externalEventId: row.externalEventId }).where(eq(bookings.uid, others[0].uid)); continue; }
    }
    await removeEvent(row.externalCalendarId, row.externalEventId);
  }
  await notify("cancelled", g.booking, g.eventType, g.hosts);
  await onCancelled(uid, { rescheduled: false });
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
export function answersText(b: any, et: any) {
  const qs: Question[] = et.questions ?? [];
  const lines = qs.filter(q => b.answers?.[q.id]).map(q => `${q.label}: ${b.answers[q.id]}`);
  return lines.length ? `\n\n${lines.join("\n")}` : "";
}
function describe(b: any, et: any) { return `${b.notes ?? ""}${answersText(b, et)}`.trim(); }
