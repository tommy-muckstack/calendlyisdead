import { and, asc, eq, gt, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { ContactFields, EMPTY_CONTACT } from "./contact-validation";
import { contactExcluded } from "./contact-settings-validation";
import { readContactSettings } from "./contact-settings";
import { lockContactOwner, type ContactDB } from "./contact-store";
import type { Question } from "./db/schema";
const { contacts: C, contactMeetings: CM, bookings: B, contactSettings: S } = schema;
export type BookingContact = { hostId: string; uid: string; inviteeName: string; inviteeEmail: string; answers?: Record<string, string> };

// Called inside the reservation transaction after its host locks. Existing
// contact fields are never overwritten by an invitee's subsequent booking.
export async function recordBookingContact(db: ContactDB, booking: BookingContact, questions: Question[] = []) {
  const phone = questions.filter(question => question.type === "phone").map(question => booking.answers?.[question.id]?.trim()).find(Boolean) ?? "";
  const parsed = ContactFields.safeParse({ ...EMPTY_CONTACT, name: booking.inviteeName, email: booking.inviteeEmail, phone });
  if (!parsed.success) return; // Invalid legacy data must not break a reservation.
  const fields = parsed.data, owner = eq(C.userId, booking.hostId), email = sql`lower(${C.email}) = ${fields.email}`;
  let [contact] = await db.select({ id: C.id }).from(C).where(and(owner, email, isNull(C.deletedAt)));
  if (!contact) {
    const preferences = await readContactSettings(booking.hostId, db);
    if (!preferences.bookingEnabled || contactExcluded(fields.email, preferences.exclusions)) return;
    const [deleted] = await db.select({ id: C.id }).from(C).where(and(owner, email, isNotNull(C.deletedAt))).limit(1);
    if (deleted) return;
    [contact] = await db.insert(C).values({ ...fields, id: crypto.randomUUID(), userId: booking.hostId }).returning({ id: C.id });
  }
  await db.insert(CM).values({ contactId: contact.id, bookingUid: booking.uid, inviteeEmail: booking.inviteeEmail }).onConflictDoNothing();
}

// One-time migration of pre-feature booking history, bounded to 200 rows per
// query. The checkpoint and records commit together; a failed run can retry.
export async function syncHistoricalContacts(userId: string) {
  const db = await getDb();
  const [ready] = await db.select({ at: S.backfilledAt }).from(S).where(eq(S.userId, userId));
  if (ready?.at) return;
  await db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId);
    const [current] = await tx.select().from(S).where(eq(S.userId, userId)); if (current?.backfilledAt) return;
    if ((await readContactSettings(userId, tx)).bookingEnabled) {
      let cursor = "";
      for (;;) {
        const rows = await tx.select({ booking: B, questions: schema.eventTypes.questions, kind: schema.eventTypes.kind }).from(B)
          .innerJoin(schema.eventTypes, eq(schema.eventTypes.id, B.eventTypeId))
          .where(and(eq(B.hostId, userId), gte(B.createdAt, new Date("2024-01-01T00:00:00Z")), cursor ? gt(B.uid, cursor) : undefined)).orderBy(asc(B.uid)).limit(200);
        if (!rows.length) break;
        for (const row of rows as { booking: typeof B.$inferSelect; questions: Question[]; kind: string }[]) {
          await recordBookingContact(tx, row.booking, row.questions);
          if (row.kind === "poll") {
            const [poll] = await tx.select().from(schema.polls).where(and(eq(schema.polls.userId, userId), eq(schema.polls.bookingUid, row.booking.uid)));
            if (poll?.chosen) {
              const votes = await tx.select().from(schema.pollVotes).where(eq(schema.pollVotes.pollId, poll.id));
              for (const voter of votes as (typeof schema.pollVotes.$inferSelect)[]) if (voter.picks.includes(poll.chosen)) {
                await recordBookingContact(tx, { ...row.booking, inviteeName: voter.name, inviteeEmail: voter.email });
              }
            }
          }
        }
        cursor = rows[rows.length - 1].booking.uid;
      }
    }
    await tx.insert(S).values({ userId, backfilledAt: new Date() }).onConflictDoUpdate({ target: S.userId, set: { backfilledAt: new Date() } });
  });
}
