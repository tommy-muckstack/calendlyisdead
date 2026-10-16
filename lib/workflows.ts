import { BP } from "./basepath";
import { and, eq, lte } from "drizzle-orm";
import { DateTime } from "luxon";
import { getDb, schema } from "./db";
import { sendMail } from "./email";
import { sendSms } from "./sms";
const { workflows, scheduledMessages: sm, bookings, eventTypes, users } = schema;
const appUrl = () => process.env.APP_URL ?? process.env.AUTH_URL ?? `http://localhost:3000${BP}`;

export const TEMPLATE_VARS = ["invitee.name", "invitee.first_name", "invitee.email", "event.name", "event.date", "event.time", "event.duration", "event.location",
  "host.name", "host.email", "meeting_url", "reschedule_url", "cancel_url", "invitee.timezone", "answers.<question id>"];

export function render(tpl: string, ctx: { booking: any; eventType: any; host: any }) {
  const { booking: b, eventType: et, host } = ctx;
  const s = DateTime.fromJSDate(new Date(b.start)).setZone(b.inviteeTz);
  const vars: Record<string, string> = {
    "invitee.name": b.inviteeName, "invitee.first_name": String(b.inviteeName).split(/\s+/)[0], "invitee.email": b.inviteeEmail, "invitee.timezone": b.inviteeTz,
    "event.name": et.title, "event.date": s.toFormat("cccc, LLLL d"), "event.time": s.toFormat("h:mm a ZZZZ"), "event.duration": `${et.durationMin} min`,
    "event.location": b.meetingUrl || b.location || "", "meeting_url": b.meetingUrl || "", "host.name": host?.name ?? "", "host.email": host?.email ?? "",
    "reschedule_url": `${appUrl()}/booking/${b.uid}/reschedule`, "cancel_url": `${appUrl()}/booking/${b.uid}/cancel`,
  };
  return tpl.replace(/\{\{\s*([a-z_.0-9-]+)\s*\}\}/gi, (m, k: string) => k.startsWith("answers.") ? (b.answers?.[k.slice(8)] ?? "") : (vars[k] ?? m));
}

/** Phone for SMS to invitees: the first phone-type answer. */
function inviteePhone(b: any, et: any) {
  const q = (et.questions ?? []).find((x: any) => x.type === "phone");
  return q ? b.answers?.[q.id] : undefined;
}

async function workflowsFor(et: any) {
  const db = await getDb();
  const owner = et.userId;
  const ws = await db.select().from(workflows).where(and(eq(workflows.userId, owner), eq(workflows.active, true)));
  return ws.filter((w: any) => !w.eventTypeIds?.length || w.eventTypeIds.includes(et.id));
}

export async function onBooked(uid: string, now = new Date()) {
  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.uid, uid)); if (!b) return;
  const [et] = await db.select().from(eventTypes).where(eq(eventTypes.id, b.eventTypeId));
  for (const w of await workflowsFor(et)) {
    let sendAt: Date | null = null;
    if (w.trigger === "on_booked") sendAt = now;
    if (w.trigger === "before_start") { sendAt = new Date(+b.start - w.offsetMin * 60_000); if (sendAt < now) sendAt = +b.start > +now ? now : null; }
    if (w.trigger === "after_end") sendAt = new Date(+b.end + w.offsetMin * 60_000);
    if (sendAt) await db.insert(sm).values({ id: crypto.randomUUID(), workflowId: w.id, bookingUid: uid, sendAt }).onConflictDoNothing();
  }
  await processDue(now);
}

export async function onCancelled(uid: string, o: { rescheduled: boolean }, now = new Date()) {
  const db = await getDb();
  await db.update(sm).set({ status: "cancelled" }).where(and(eq(sm.bookingUid, uid), eq(sm.status, "pending")));
  if (o.rescheduled) return;
  const [b] = await db.select().from(bookings).where(eq(bookings.uid, uid)); if (!b) return;
  const [et] = await db.select().from(eventTypes).where(eq(eventTypes.id, b.eventTypeId));
  for (const w of (await workflowsFor(et)).filter((w: any) => w.trigger === "on_cancelled"))
    await db.insert(sm).values({ id: crypto.randomUUID(), workflowId: w.id, bookingUid: uid, sendAt: now }).onConflictDoNothing();
  await processDue(now);
}

/** Send everything due. Called by the cron route and right after bookings. Safe to run concurrently: each row is claimed before sending. */
export async function processDue(now = new Date()) {
  const db = await getDb();
  const due = await db.select().from(sm).where(and(eq(sm.status, "pending"), lte(sm.sendAt, now)));
  let sent = 0, failed = 0, skipped = 0;
  for (const m of due) {
    const claimed = await db.update(sm).set({ status: "sending" }).where(and(eq(sm.id, m.id), eq(sm.status, "pending"))).returning();
    if (!claimed.length) continue;
    try {
      const [w] = await db.select().from(workflows).where(eq(workflows.id, m.workflowId));
      const [b] = await db.select().from(bookings).where(eq(bookings.uid, m.bookingUid));
      if (!w || !b || (b.status !== "confirmed" && w.trigger !== "on_cancelled")) { await db.update(sm).set({ status: "cancelled" }).where(eq(sm.id, m.id)); skipped++; continue; }
      const [et] = await db.select().from(eventTypes).where(eq(eventTypes.id, b.eventTypeId));
      const [host] = await db.select().from(users).where(eq(users.id, b.hostId));
      const ctx = { booking: b, eventType: et, host };
      const body = render(w.body, ctx);
      if (w.channel === "sms") {
        const to = w.recipient === "host" ? undefined : inviteePhone(b, et);
        if (!to) { await db.update(sm).set({ status: "skipped", error: "no phone number" }).where(eq(sm.id, m.id)); skipped++; continue; }
        await sendSms(to, body);
      } else {
        await sendMail({ to: w.recipient === "host" ? host.email : b.inviteeEmail, subject: render(w.subject, ctx), text: body });
      }
      await db.update(sm).set({ status: "sent", sentAt: new Date() }).where(eq(sm.id, m.id)); sent++;
    } catch (e: any) { await db.update(sm).set({ status: "failed", error: String(e.message).slice(0, 500) }).where(eq(sm.id, m.id)); failed++; }
  }
  return { sent, failed, skipped };
}
