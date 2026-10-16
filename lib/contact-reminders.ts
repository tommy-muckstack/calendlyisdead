import { and, asc, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { getDb, schema } from "./db";
import { lockContactOwner, type ContactDB } from "./contact-store";
import { meetingZone } from "./meetings";
import { emailConfigured, sendMail } from "./email";
import { BP } from "./basepath";
const { contactNotes: N, contacts: C, users: U, contactReminderDigests: D } = schema;
type Summary = { id: string; contactId: string; title: string; body: string; reminderDate: string; name: string };
const base = () => (process.env.APP_URL ?? process.env.AUTH_URL ?? `http://localhost:3000${BP}`).replace(/\/$/, "");
export const noteLink = (contactId: string, id: string) => `/app/contacts/${contactId}?tab=notes&note=${id}#note-${id}`;
export function reminderDay(timezone: string, now: Date) { const local = DateTime.fromJSDate(now).setZone(meetingZone(timezone)); return local.isValid && local.hour >= 5 ? local.toISODate() : null; }
function section(title: string, rows: Summary[], limit: number) {
  return `${title}\n${rows.length ? rows.slice(0, limit).map(note => `${note.reminderDate} · ${note.name}: ${note.title || note.body.slice(0, 160)}\n${base()}${noteLink(note.contactId, note.id)}`).join("\n\n") : "None"}${rows.length > limit ? "\nMore reminders are available on your Reminders page." : ""}`;
}
async function claimDigest(userId: string, now: Date) {
  const db = await getDb(); return db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId); const [user] = await tx.select().from(U).where(eq(U.id, userId));
    const day = reminderDay(user.timezone, now); if (!day || !user.email) return null;
    const [prior] = await tx.select().from(D).where(and(eq(D.userId, userId), eq(D.day, day)));
    if (prior) {
      // A provider may have accepted an uncertain request. Reuse the immutable
      // payload/key, and stop before its 24-hour idempotency window can expire.
      if (!["sending", "failed"].includes(prior.status) || prior.attempts >= 3 || +now - +prior.attemptedAt < 15 * 60000 || +now - +prior.createdAt >= 23 * 3600000) return null;
    }
    const where = and(eq(N.userId, userId), eq(C.userId, userId), isNull(N.deletedAt), isNull(C.deletedAt), isNull(N.completedAt), isNotNull(N.reminderDate));
    const select = { id: N.id, contactId: N.contactId, title: N.title, body: N.body, reminderDate: N.reminderDate, name: C.name };
    const due: Summary[] = await tx.select(select).from(N).innerJoin(C, eq(C.id, N.contactId)).where(and(where, lte(N.reminderDate, day))).orderBy(asc(N.reminderDate), asc(N.id)).limit(101);
    if (!due.length) { if (prior) await tx.update(D).set({ status: "cancelled" }).where(eq(D.id, prior.id)); return null; }
    const upcoming: Summary[] = await tx.select(select).from(N).innerJoin(C, eq(C.id, N.contactId)).where(and(where, gt(N.reminderDate, day))).orderBy(asc(N.reminderDate), asc(N.id)).limit(11);
    const body = `Your contact reminders for ${day} (${meetingZone(user.timezone)})\n\n${section("Due today and overdue", due, 100)}\n\n${section("Upcoming", upcoming, 10)}\n\nAll reminders: ${base()}/app/contacts/reminders\n\nMark reminders complete from the note to remove them from future summaries.`;
    if (prior) {
      // Do not retry an outdated summary after a note, recipient or zone changes.
      if (prior.body !== body || prior.to !== user.email) { await tx.update(D).set({ status: "cancelled" }).where(eq(D.id, prior.id)); return null; }
      const [retry] = await tx.update(D).set({ status: "sending", attempts: prior.attempts + 1, attemptedAt: now }).where(eq(D.id, prior.id)).returning(); return retry as typeof D.$inferSelect;
    }
    const [created] = await tx.insert(D).values({ id: crypto.randomUUID(), userId, day, timezone: meetingZone(user.timezone), to: user.email, subject: `Your contact reminders · ${day}`, body, status: "sending", createdAt: now, attemptedAt: now }).returning(); return created as typeof D.$inferSelect;
  });
}
export async function processContactReminders(now = new Date()) {
  if (!Number.isFinite(+now)) throw new Error("invalid_time");
  const db = await getDb(); let cursor = "", sent = 0, local = 0, failed = 0;
  // Keyset pagination avoids repeatedly processing only the first batch of users.
  while (true) {
    const owners: { id: string }[] = await db.select({ id: U.id }).from(U).where(and(gt(U.id, cursor), sql`EXISTS (SELECT 1 FROM ${N} n JOIN ${C} c ON c.id = n."contactId" WHERE n."userId" = ${U.id} AND c."userId" = ${U.id} AND n."reminderDate" IS NOT NULL AND n."completedAt" IS NULL AND n."deletedAt" IS NULL AND c."deletedAt" IS NULL)`)).orderBy(asc(U.id)).limit(200);
    if (!owners.length) break;
    for (const owner of owners) {
      const digest = await claimDigest(owner.id, now); if (!digest) continue;
      const configured = emailConfigured(); let delivered = false;
      try { delivered = await sendMail({ to: digest.to, subject: digest.subject, text: digest.body, idempotencyKey: `contact-reminders/${digest.id}` }); } catch { /* An interrupted adapter is an uncertain delivery, eligible for bounded retry. */ }
      const status = !configured ? "local" : delivered ? "sent" : "failed";
      await db.update(D).set({ status }).where(and(eq(D.id, digest.id), eq(D.attempts, digest.attempts), eq(D.status, "sending")));
      if (status === "sent") sent++; else if (status === "local") local++; else failed++;
    }
    cursor = owners[owners.length - 1].id;
  }
  return { sent, local, failed };
}
