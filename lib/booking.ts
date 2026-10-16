import { BP } from "./basepath";
import { and, eq, gte, lte, inArray, isNull } from "drizzle-orm";
import { DateTime } from "luxon";
import { nanoid } from "nanoid";
import { getDb, schema } from "./db";
import { generateSlots, holidayDates } from "./slots";
import { externalBusy, writeEvent, removeEvent } from "./calendars";
import { buildIcs } from "./ics";
import { sendMail } from "./email";
import { onBooked, onCancelled } from "./workflows";
import type { Question } from "./db/schema";
import { confFor, meetingUrlFor } from "./conferencing";
import { HOLD_MIN } from "./payments";
import { confirmedReservations, reservationBusy } from "./booking-busy";
import { hostLimitCheck } from "./host-meeting-limits";
const { users, eventTypes, schedules, bookings, teams, eventTypeHosts } = schema;

export type Host = { user: any; schedule: any; priority: number };
export type Loaded = { eventType: any; ownerName: string; ownerUser: any | null; team: any | null; hosts: Host[]; limitsTimezone: string };

/** owner is a username, or "team:<slug>" for team event types. */
export async function loadEvent(owner: string, slug: string): Promise<Loaded | null> {
  const db = await getDb();
  let et: any, team: any = null, ownerUser: any = null;
  if (owner.startsWith("team:")) {
    [team] = await db.select().from(teams).where(eq(teams.slug, owner.slice(5)));
    if (!team) return null;
    [et] = await db.select().from(eventTypes).where(and(eq(eventTypes.teamId, team.id), eq(eventTypes.slug, slug), isNull(eventTypes.deletedAt)));
  } else {
    [ownerUser] = await db.select().from(users).where(eq(users.username, owner));
    if (!ownerUser) return null;
    [et] = await db.select().from(eventTypes).where(and(eq(eventTypes.userId, ownerUser.id), isNull(eventTypes.teamId), eq(eventTypes.slug, slug), isNull(eventTypes.deletedAt)));
  }
  if (!et || !et.active || et.kind === "managed" || et.kind === "poll" || (et.kind === "one_off" && et.usedAt)) return null;
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
  // Team-wide caps need a single calendar, even when hosts use different zones.
  let limitsTimezone = hosts[0].schedule.timezone;
  if (team) {
    const schedule = await defaultSchedule(et.userId);
    const [creator] = schedule ? [] : await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, et.userId));
    limitsTimezone = schedule?.timezone ?? creator?.timezone ?? "UTC";
  }
  return { eventType: et, ownerName: team?.name ?? ownerUser.name ?? owner, ownerUser, team, hosts, limitsTimezone };
}

async function hostSlots(h: Host, et: any, from: string, to: string, tz: string, now: DateTime, exclude: Set<string>, limitsTimezone: string, transaction?: any) {
  const db = transaction ?? await getDb();
  const lo = DateTime.fromISO(from, { zone: tz }).minus({ days: 2 }).toJSDate();
  const hi = DateTime.fromISO(to, { zone: tz }).plus({ days: 2 }).toJSDate();
  const existing = (await confirmedReservations(db, h.user.id, lo, hi))
    .filter((b: any) => !exclude.has(b.uid));
  const isGroup = et.kind === "group";
  // Reservation rechecks use only local state under the host lock. Provider I/O
  // was checked in the preflight; never hold database locks during network I/O.
  const ext = transaction ? { busy: [], errors: [] } : await externalBusy(h.user.id, lo, hi);
  // a group session that already exists is shown on the host's external calendar too; don't let that hide its own open seats
  const ownStarts = new Set<string>(existing.filter((b: any) => b.eventTypeId === et.id).map((b: any) => b.start.toISOString()));
  const extBusy = isGroup ? ext.busy.filter(b => !ownStarts.has(new Date(b.start).toISOString())) : ext.busy;
  const busy = [...existing.map((b: any) => ({ ...reservationBusy(b),
    joinableAt: isGroup && b.eventTypeId === et.id ? b.start.toISOString() : undefined })), ...extBusy];
  const sessionBuffers = isGroup ? Object.fromEntries(existing.filter((b: any) => b.eventTypeId === et.id)
    .map((b: any) => [b.start.toISOString(), { beforeMin: b.bufferBeforeMin, afterMin: b.bufferAfterMin }])) : undefined;
  const first = DateTime.fromJSDate(lo, { zone: limitsTimezone }), last = DateTime.fromJSDate(hi, { zone: limitsTimezone });
  const limitLo = (et.maxPerMonth ? first.startOf("month") : first).startOf("week").toJSDate();
  const limitHi = (et.maxPerMonth ? last.endOf("month") : last).endOf("week").toJSDate();
  const limitRows = (et.maxPerDay || et.maxPerWeek || et.maxPerMonth)
    ? (await db.select().from(bookings).where(and(eq(bookings.eventTypeId, et.id), eq(bookings.status, "confirmed"), gte(bookings.start, limitLo), lte(bookings.start, limitHi))))
      .filter((b: typeof bookings.$inferSelect) => !exclude.has(b.uid)) : [];
  // One group session or collective meeting consumes one allowance. Independent
  // round-robin meetings at the same instant still consume separate allowances.
  const meetings = new Map<string, string>();
  for (const b of limitRows) meetings.set(isGroup ? b.start.toISOString() : b.groupUid ?? b.uid, b.start.toISOString());
  const forLimits = [...meetings.values()];
  const y0 = DateTime.fromJSDate(lo).year, y1 = DateTime.fromJSDate(hi).year;
  const sc = h.schedule;
  let slots = generateSlots({ schedule: { timezone: sc.timezone, weekly: sc.weekly, overrides: sc.overrides ?? {} },
    durationMin: et.durationMin, intervalMin: et.startIntervalMin, bufferBeforeMin: et.bufferBeforeMin, bufferAfterMin: et.bufferAfterMin, minNoticeMin: et.minNoticeMin,
    rangeDays: et.rangeDays, now, from, to, inviteeTz: tz, busy, blockedDates: holidayDates(sc.holidayCountry, y0, y1),
    limits: { perDay: et.maxPerDay, perWeek: et.maxPerWeek, perMonth: et.maxPerMonth }, limitsTimezone, existing: forLimits,
    joinableStarts: isGroup ? [...ownStarts] : [], sessionBuffers });
  const hostFull = await hostLimitCheck(db, h.user, lo, hi, exclude);
  for (const d of Object.keys(slots)) slots[d] = slots[d].filter(s => (isGroup && ownStarts.has(s)) || !hostFull(s));
  if (isGroup) {
    const taken = new Map<string, number>(), limits = new Map<string, number>();
    for (const b of existing) if (b.eventTypeId === et.id) {
      const start = b.start.toISOString();
      taken.set(start, (taken.get(start) ?? 0) + 1); limits.set(start, b.inviteeLimit);
    }
    slots = Object.fromEntries(Object.entries(slots).map(([d, ss]) => [d, ss.filter(s => (taken.get(s) ?? 0) < (limits.get(s) ?? et.seats))]).filter(([, ss]) => ss.length));
  }
  return { slots, errors: ext.errors };
}

/** Open slots for an event type plus, per slot, which hosts are free (needed for round robin). */
export async function availability(owner: string, slug: string, from: string, to: string, tz: string, now = DateTime.utc(), excludeUids: string[] = []) {
  return eventAvailability(owner, slug, { from, to }, tz, now, excludeUids);
}

// For a booking, determine its calendar day only after reading the event's zone.
async function eventAvailability(owner: string, slug: string, range: { from: string; to: string } | { start: DateTime }, tz: string, now: DateTime, excludeUids: string[]) {
  await expireUnpaid();
  const ev = await loadEvent(owner, slug);
  if (!ev) return null;
  const et = ev.eventType, exclude = new Set(excludeUids);
  tz = et.lockedTimezone ?? tz;
  const { from, to } = "start" in range ? { from: range.start.setZone(tz).toISODate()!, to: range.start.setZone(tz).toISODate()! } : range;
  const per = await Promise.all(ev.hosts.map(h => hostSlots(h, et, from, to, tz, now, exclude, ev.limitsTimezone)));
  const free = new Map<string, string[]>(); // slot -> host ids
  per.forEach((p, i) => { for (const ss of Object.values(p.slots)) for (const s of ss) free.set(s, [...(free.get(s) ?? []), ev.hosts[i].user.id]); });
  const need = et.kind === "collective" ? ev.hosts.length : 1;
  const slots: Record<string, string[]> = {};
  for (const [s, hs] of free) if (hs.length >= need) {
    const d = DateTime.fromISO(s).setZone(tz).toFormat("yyyy-MM-dd"); (slots[d] ??= []).push(s);
  }
  for (const d of Object.keys(slots)) slots[d].sort();
  return { ev, slots, free, timezone: tz, calendarErrors: per.flatMap(p => p.errors) };
}

/** Back-compat wrapper used by older callers. */
export async function slotsFor(owner: string, slug: string, from: string, to: string, tz: string, now = DateTime.utc(), excludeUid?: string) {
  return availability(owner, slug, from, to, tz, now, excludeUid ? [excludeUid] : []);
}

/** Round robin: pick the host. even = fewest bookings of this type in the last 30 days and upcoming; priority = highest priority first, then even. */
export async function pickHost(et: any, hosts: Host[], candidates: string[], transaction?: any) {
  const db = transaction ?? await getDb();
  const since = DateTime.utc().minus({ days: 30 }).toJSDate();
  const rows = await db.select().from(bookings).where(and(eq(bookings.eventTypeId, et.id), eq(bookings.status, "confirmed"), gte(bookings.start, since)));
  const count = (id: string) => rows.filter((b: any) => b.hostId === id).length;
  const last = (id: string) => Math.max(0, ...rows.filter((b: any) => b.hostId === id).map((b: any) => +b.createdAt));
  const prio = (id: string) => hosts.find(h => h.user.id === id)?.priority ?? 2;
  return [...candidates].sort((a, b) =>
    (et.rrMode === "priority" ? prio(b) - prio(a) : 0) || count(a) - count(b) || last(a) - last(b) || a.localeCompare(b))[0];
}

export const baseUrl = () => process.env.APP_URL ?? process.env.AUTH_URL ?? `http://localhost:3000${BP}`;

export async function notify(kind: "confirmed" | "cancelled" | "rescheduled", b: any, et: any, hostUsers: any[]) {
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
  let old: any = null, oldGroup: any[] = [];
  if (input.rescheduleUid) {
    [old] = await db.select().from(bookings).where(eq(bookings.uid, input.rescheduleUid));
    if (!old || old.status !== "confirmed") throw new Error("not_found");
    oldGroup = old.groupUid ? await db.select().from(bookings).where(eq(bookings.groupUid, old.groupUid)) : [old];
  }
  const r = await eventAvailability(input.username, input.slug, { start: startDt }, input.tz, DateTime.utc(), oldGroup.map(b => b.uid));
  if (!r) throw new Error("not_found");
  const day = startDt.setZone(r.timezone).toISODate()!;
  if (!(r.slots[day] ?? []).includes(startIso)) throw new Error("slot_unavailable");
  const et = r.ev.eventType;
  // A deleted event's slug may now belong to a different template. A reschedule
  // token must never silently move its booking to that replacement event.
  if (old && old.eventTypeId !== et.id) throw new Error("not_found");
  const answers = validateAnswers(et.questions ?? [], input.answers ?? {});
  const free = r.free.get(startIso) ?? [];
  const uid = nanoid(12);
  const base = { eventTypeId: et.id, start: startDt.toJSDate(), end: startDt.plus({ minutes: et.durationMin }).toJSDate(), inviteeName: input.name, inviteeEmail: input.email,
    bufferBeforeMin: et.bufferBeforeMin, bufferAfterMin: et.bufferAfterMin,
    inviteeLimit: et.kind === "group" ? et.seats : 1,
    inviteeTz: r.timezone, notes: input.notes ?? "", guests: input.guests ?? [], rescheduledFrom: input.rescheduleUid ?? null, answers };
  let rows: any[] = [], hostUsers: any[] = [];
  try {
    await db.transaction(async (tx: any) => {
      const lockType = () => tx.select({ kind: eventTypes.kind, durationMin: eventTypes.durationMin, location: eventTypes.location,
        active: eventTypes.active, deletedAt: eventTypes.deletedAt, maxPerDay: eventTypes.maxPerDay,
        maxPerWeek: eventTypes.maxPerWeek, maxPerMonth: eventTypes.maxPerMonth, startIntervalMin: eventTypes.startIntervalMin, lockedTimezone: eventTypes.lockedTimezone }).from(eventTypes).where(eq(eventTypes.id, et.id)).for(et.teamId ? "update" : "share");
      // Serialize team-wide allowances even if membership changed between two
      // preflights. Team host editors also lock the event before touching hosts.
      let currentType = et.teamId ? (await lockType())[0] : undefined;
      // Lock hosts in a consistent order, including the old hosts of a move.
      // Read committed gives the following checks a fresh snapshot after waiting.
      const lockIds = [...new Set([...r.ev.hosts.map(h => h.user.id), ...oldGroup.map(b => b.hostId)])].sort();
      const currentHosts = await tx.select().from(users).where(inArray(users.id, lockIds)).orderBy(users.id).for("update");
      if (!et.teamId) currentType = (await lockType())[0];
      // A group template may have changed after the availability preflight but
      // before its first reservation. Never commit that stale session definition.
      if (!currentType || !currentType.active || currentType.deletedAt || ((et.kind === "group" || currentType.kind === "group") &&
        (currentType.kind !== et.kind || currentType.durationMin !== et.durationMin || currentType.location !== et.location))) {
        throw new Error("slot_unavailable");
      }
      if (et.kind === "one_off") {
        const consumed = await tx.update(eventTypes).set({ usedAt: new Date() })
          .where(and(eq(eventTypes.id, et.id), isNull(eventTypes.usedAt))).returning({ id: eventTypes.id });
        if (!consumed.length) throw new Error("slot_unavailable");
      }
      const eligible: string[] = [];
      const currentZone = currentType.lockedTimezone ?? input.tz, currentDay = startDt.setZone(currentZone).toISODate()!;
      base.inviteeTz = currentZone;
      for (const host of r.ev.hosts) {
        if (!free.includes(host.user.id)) continue;
        const currentHost = currentHosts.find((u: typeof users.$inferSelect) => u.id === host.user.id);
        if (!currentHost) continue;
        const fresh = await hostSlots({ ...host, user: currentHost }, { ...et, maxPerDay: currentType.maxPerDay, maxPerWeek: currentType.maxPerWeek,
          maxPerMonth: currentType.maxPerMonth, startIntervalMin: currentType.startIntervalMin }, currentDay, currentDay, currentZone, DateTime.utc(), new Set(oldGroup.map(b => b.uid)), r.ev.limitsTimezone, tx);
        if ((fresh.slots[currentDay] ?? []).includes(startIso)) eligible.push(host.user.id);
      }
      if (!eligible.length || (et.kind === "collective" && eligible.length !== r.ev.hosts.length)) throw new Error("slot_unavailable");
      const hostIds = et.kind === "collective" ? eligible
        : et.kind === "round_robin" ? [await pickHost(et, r.ev.hosts, eligible, tx)] : [eligible[0]];
      hostUsers = hostIds.map(id => r.ev.hosts.find(h => h.user.id === id)!.user);
      rows = hostIds.map((hostId, i) => ({ ...base, uid: i === 0 ? uid : `${uid}-${i}`, hostId, groupUid: hostIds.length > 1 ? uid : null, seat: 0 }));

      if (oldGroup.length) {
        const moved = await tx.update(bookings).set({ status: "cancelled", cancelReason: "rescheduled" })
          .where(and(inArray(bookings.uid, oldGroup.map(b => b.uid)), eq(bookings.status, "confirmed"))).returning({ uid: bookings.uid });
        if (moved.length !== oldGroup.length) throw new Error("slot_unavailable");
      }
      if (et.kind === "group") {
        // New seats share the session's original buffers even after its type is edited.
        const attendees = await tx.select({ bufferBeforeMin: bookings.bufferBeforeMin, bufferAfterMin: bookings.bufferAfterMin, inviteeLimit: bookings.inviteeLimit, seat: bookings.seat }).from(bookings)
          .where(and(eq(bookings.hostId, rows[0].hostId), eq(bookings.eventTypeId, et.id), eq(bookings.start, rows[0].start), eq(bookings.status, "confirmed")))
          .orderBy(bookings.createdAt, bookings.uid);
        if (attendees.length) {
          const { seat: _, ...session } = attendees[0]; Object.assign(rows[0], session);
        }
        if (attendees.length >= rows[0].inviteeLimit) throw new Error("slot_unavailable");
        const occupied = new Set(attendees.map((a: any) => a.seat));
        let seat = 0; while (occupied.has(seat)) seat++;
        const inserted = await tx.insert(bookings).values({ ...rows[0], seat }).onConflictDoNothing().returning({ uid: bookings.uid });
        if (!inserted.length) throw new Error("slot_unavailable");
        rows[0].seat = seat;
      } else {
        for (const row of rows) await tx.insert(bookings).values(row);
      }
    }, { isolationLevel: "read committed" });
  } catch { throw new Error("slot_unavailable"); }

  for (const o of oldGroup) await removeEvent(o.externalCalendarId, o.externalEventId);
  const paidBefore = oldGroup.find(o => o.paymentStatus === "paid");
  const price = et.priceCents ?? 0;
  if (paidBefore) { // a paid booking keeps its payment when rescheduled
    const pay = { paymentStatus: "paid", paymentRef: paidBefore.paymentRef, amountCents: paidBefore.amountCents };
    await db.update(bookings).set(pay).where(inArray(bookings.uid, rows.map(r => r.uid))); rows.forEach(r => Object.assign(r, pay));
  } else if (price > 0) {
    // hold the slot until paid; calendar write-back, emails and workflows wait for confirmPayment()
    const pay = { paymentStatus: "pending", amountCents: price };
    await db.update(bookings).set(pay).where(inArray(bookings.uid, rows.map(r => r.uid))); rows.forEach(r => Object.assign(r, pay));
    if (old) await onCancelled(old.uid, { rescheduled: true });
    return rows[0];
  }
  const main = await finalize(rows, et, hostUsers, !!input.rescheduleUid);
  if (old) await onCancelled(old.uid, { rescheduled: true });
  return main;
}

/** Calendar write-back, conferencing link, notifications and workflows for freshly confirmed rows. */
export async function finalize(rows: any[], et: any, hostUsers: any[], rescheduled: boolean) {
  const db = await getDb();
  // a group session is written once (first seat)
  for (const row of rows) {
    if (et.kind === "group" && row.seat > 0) continue;
    const host = hostUsers.find(u => u.id === row.hostId);
    const w = await writeEvent(row.hostId, { uid: row.uid, title: et.kind === "group" ? et.title : `${et.title}: ${row.inviteeName}`, description: describe(row, et), location: et.location, start: row.start, end: row.end,
      organizer: { name: host.name ?? "", email: host.email ?? "" }, attendees: [{ name: row.inviteeName, email: row.inviteeEmail }, ...row.guests.map((g: string) => ({ name: g, email: g }))],
      wantsMeet: confFor(et.location) === "meet" });
    if (w) { Object.assign(row, { externalCalendarId: w.externalCalendarId, externalEventId: w.externalEventId, meetingUrl: w.meetingUrl ?? null });
      await db.update(bookings).set({ externalCalendarId: w.externalCalendarId, externalEventId: w.externalEventId }).where(eq(bookings.uid, row.uid)); }
  }
  const main = rows[0];
  const fromCal = rows.find(x => x.meetingUrl)?.meetingUrl ?? null;
  // a group seat reuses the session's existing link
  const [sibling] = et.kind === "group" ? (await db.select().from(bookings).where(and(eq(bookings.eventTypeId, et.id), eq(bookings.start, main.start), eq(bookings.status, "confirmed")))).filter((b: any) => b.meetingUrl && b.uid !== main.uid) : [];
  main.meetingUrl = sibling?.meetingUrl ?? await meetingUrlFor(et.location, main.uid, { topic: et.title, start: main.start, durationMin: et.durationMin }, fromCal);
  if (main.meetingUrl) await db.update(bookings).set({ meetingUrl: main.meetingUrl }).where(inArray(bookings.uid, rows.map(r => r.uid)));
  await notify(rescheduled ? "rescheduled" : "confirmed", main, et, hostUsers);
  await onBooked(main.uid);
  return main;
}

/** Release slots held by bookings that were never paid. */
export async function expireUnpaid(now = new Date()) {
  const db = await getDb();
  const cutoff = new Date(now.getTime() - HOLD_MIN * 60_000);
  const r = await db.update(bookings).set({ status: "cancelled", cancelReason: "payment_expired" })
    .where(and(eq(bookings.paymentStatus, "pending"), eq(bookings.status, "confirmed"), lte(bookings.createdAt, cutoff))).returning();
  return r.length;
}

/** Called from the Stripe webhook (or the demo checkout). Idempotent. */
export async function confirmPayment(uid: string, ref: string) {
  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.uid, uid));
  if (!b) return { error: "not_found" as const };
  if (b.paymentStatus === "paid") return { ok: true, already: true };
  if (b.status !== "confirmed") { console.warn(`[payments] ${uid} paid after its hold expired; refund ${ref} manually`); return { error: "expired" as const }; }
  const rows = b.groupUid ? await db.select().from(bookings).where(eq(bookings.groupUid, b.groupUid)) : [b];
  await db.update(bookings).set({ paymentStatus: "paid", paymentRef: ref }).where(inArray(bookings.uid, rows.map((r: any) => r.uid)));
  const [et] = await db.select().from(eventTypes).where(eq(eventTypes.id, b.eventTypeId));
  const hostUsers = await db.select().from(users).where(inArray(users.id, rows.map((r: any) => r.hostId)));
  rows.sort((x: any, y: any) => (x.uid === uid ? -1 : y.uid === uid ? 1 : 0));
  await finalize(rows.map((r: any) => ({ ...r, paymentStatus: "paid", paymentRef: ref })), et, hostUsers, !!b.rescheduledFrom);
  return { ok: true };
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
  if (g.booking.paymentStatus !== "pending") await notify("cancelled", g.booking, g.eventType, g.hosts);
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
