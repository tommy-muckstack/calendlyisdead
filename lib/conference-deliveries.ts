import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, lte } from "drizzle-orm";
import { getDb, schema } from "./db";
import { bookingInvitation } from "./booking";
import { emailConfigured, sendMail } from "./email";
import { updateCalendarConferenceLocation } from "./calendars";

const { calendarConferenceDeliveries: D, bookings: B, users: U, eventTypes: E } = schema;
type DB = Awaited<ReturnType<typeof getDb>>;
type Delivery = typeof D.$inferSelect;
type Booking = typeof B.$inferSelect;
const RETRY_MS = 5 * 60_000, MAX_ATTEMPTS = 8, MAIL_WINDOW_MS = 23 * 3600_000;
const key = (...parts: string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

/** Called in the same transaction that resolves the bookings, before any I/O. */
export async function enqueueConferenceDeliveries(tx: DB, conferenceId: string, rows: Booking[], now: Date) {
  for (const row of rows) {
    if (!row.meetingUrl) continue;
    if (row.externalCalendarId && row.externalEventId) await tx.insert(D).values({
      id: key(conferenceId, "calendar", row.externalCalendarId, row.externalEventId), conferenceId, bookingUid: row.uid,
      meetingUrl: row.meetingUrl, createdAt: now, nextAttemptAt: now,
      payload: { kind: "calendar", hostId: row.hostId, calendarId: row.externalCalendarId, externalEventId: row.externalEventId },
    }).onConflictDoNothing();
    // Collective rows represent one invitation, while each group seat has its own UID.
    if (row.groupUid && row.uid !== row.groupUid) continue;
    const [event] = await tx.select().from(E).where(eq(E.id, row.eventTypeId));
    const hosts = await tx.select().from(U).where(inArray(U.id, rows.filter(member =>
      row.groupUid ? member.groupUid === row.groupUid : member.uid === row.uid).map(member => member.hostId)));
    if (!event || !hosts.length) continue;
    // Keep the invitation's organizer stable, independent of database row ordering.
    hosts.sort((a, b) => a.id === row.hostId ? -1 : b.id === row.hostId ? 1 : a.id.localeCompare(b.id));
    const { recipients, ...mail } = bookingInvitation("conference_ready", row, event, hosts);
    for (const to of recipients) await tx.insert(D).values({
      id: key(conferenceId, "mail", row.uid, to), conferenceId, bookingUid: row.uid, meetingUrl: row.meetingUrl,
      payload: { kind: "mail", mail: { ...mail, to } }, createdAt: now, nextAttemptAt: now,
    }).onConflictDoNothing();
  }
}

async function eligible(db: DB, delivery: Delivery, now: Date) {
  const p = delivery.payload;
  // A group cancellation can transfer the calendar event to another live seat.
  const target = p.kind === "mail" ? eq(B.uid, delivery.bookingUid) : and(eq(B.hostId, p.hostId), eq(B.externalCalendarId, p.calendarId), eq(B.externalEventId, p.externalEventId));
  const rows = await db.select({ uid: B.uid }).from(B).where(and(target, eq(B.conferenceRequestId, delivery.conferenceId),
    eq(B.meetingUrl, delivery.meetingUrl), eq(B.status, "confirmed"), inArray(B.paymentStatus, ["none", "paid"]), gt(B.end, now))).limit(1);
  return rows.length > 0;
}

async function claim(id: string, now: Date): Promise<Delivery | null> {
  const db = await getDb();
  return db.transaction(async (tx: DB) => {
    const [row]: Delivery[] = await tx.select().from(D).where(eq(D.id, id)).for("update");
    if (!row || !["pending", "sending"].includes(row.status) || +row.nextAttemptAt > +now) return null;
    let terminal: string | null = null;
    if (!await eligible(tx, row, now)) terminal = "cancelled";
    else if (row.attempts >= MAX_ATTEMPTS || (row.payload.kind === "mail" && +now - +row.createdAt >= MAIL_WINDOW_MS)) terminal = "failed";
    if (terminal) { await tx.update(D).set({ status: terminal }).where(eq(D.id, id)); return null; }
    const [claimed]: Delivery[] = await tx.update(D).set({ status: "sending", attempts: row.attempts + 1, nextAttemptAt: new Date(+now + RETRY_MS) }).where(eq(D.id, id)).returning();
    return claimed;
  });
}

/** Retry independent effects, preserving the exact mail payload and provider key. */
export async function processConferenceDeliveries(now = new Date()) {
  if (!Number.isFinite(+now)) throw new Error("invalid_time");
  const db = await getDb(), began = Date.now();
  const due: { id: string }[] = await db.select({ id: D.id }).from(D).where(and(inArray(D.status, ["pending", "sending"]), lte(D.nextAttemptAt, now)))
    .orderBy(asc(D.nextAttemptAt), asc(D.id)).limit(40);
  const counts = { sent: 0, local: 0, updated: 0, pending: 0, cancelled: 0, failed: 0 };
  for (const { id } of due) {
    if (Date.now() - began >= 20_000) break;
    const delivery = await claim(id, now); if (!delivery) continue;
    let status: keyof typeof counts = "pending";
    try {
      if (!await eligible(db, delivery, now)) status = "cancelled";
      else if (delivery.payload.kind === "mail") {
        const configured = emailConfigured();
        const sent = await sendMail({ ...delivery.payload.mail, idempotencyKey: `conference-ready/${delivery.id}` });
        status = configured ? sent ? "sent" : "pending" : "local";
      } else {
        const p = delivery.payload;
        status = await updateCalendarConferenceLocation(p.hostId, p.calendarId, p.externalEventId, delivery.meetingUrl);
      }
    } catch { /* Uncertain requests retain their immutable payload and bounded retry. */ }
    if (status === "pending" && delivery.attempts >= MAX_ATTEMPTS) status = "failed";
    const settled = await db.update(D).set({ status }).where(and(eq(D.id, id), eq(D.status, "sending"), eq(D.attempts, delivery.attempts))).returning({ id: D.id });
    if (settled.length) counts[status]++;
  }
  return counts;
}
