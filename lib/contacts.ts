import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { ContactData, ContactFields, type ContactDraft, type ContactFilter } from "./contact-validation";
import { lockContactOwner } from "./contact-store";
import { syncHistoricalContacts } from "./automatic-contacts";

const C = schema.contacts, CM = schema.contactMeetings, B = schema.bookings, E = schema.eventTypes;
type DB = Awaited<ReturnType<typeof getDb>>;
export class ContactError extends Error {
  constructor(public code: "not_found" | "email_in_use" | "changed" | "creation_conflict", public status: number) { super(code); }
}
const owned = (userId: string, id: string) => and(eq(C.userId, userId), eq(C.id, id));

// Keep durable history when a contact's email changes. Only the actual host's
// booking rows may be linked; a team owner is not implicitly a meeting host.
export async function linkContactMeetings(db: DB, userId: string, id: string | null = null) {
  await db.execute(sql`INSERT INTO contact_meetings ("contactId", "bookingUid", "inviteeEmail")
    SELECT c.id, b.uid, b."inviteeEmail" FROM contacts c JOIN bookings b ON lower(btrim(b."inviteeEmail")) = c.email
    WHERE c."userId" = ${userId} AND b."hostId" = ${userId} AND c."deletedAt" IS NULL
      AND (${id}::text IS NULL OR c.id = ${id})
    ON CONFLICT DO NOTHING`);
}
const sameFields = (left: ContactDraft, right: ContactDraft) =>
  Object.keys(ContactFields.shape).every(key => left[key as keyof ContactDraft] === right[key as keyof ContactDraft]);

export async function createContact(userId: string, id: string, input: ContactDraft) {
  const db = await getDb(), fields = ContactFields.parse(input);
  return db.transaction(async (tx: DB) => {
    await lockContactOwner(tx, userId);
    const inserted = await tx.insert(C).values({ ...fields, id, userId }).onConflictDoNothing().returning();
    const existing = inserted[0] ?? (await tx.select().from(C).where(owned(userId, id)))[0];
    if (!existing) throw new ContactError("email_in_use", 409);
    if (existing.deletedAt || !sameFields(existing, fields)) throw new ContactError("creation_conflict", 409);
    await linkContactMeetings(tx, userId, id);
    return ContactData.parse(existing);
  });
}

export async function updateContact(userId: string, id: string, version: number, input: ContactDraft) {
  const db = await getDb(), fields = ContactFields.parse(input);
  return db.transaction(async (tx: DB) => {
    await lockContactOwner(tx, userId);
    const [current] = await tx.select().from(C).where(owned(userId, id)).for("update");
    if (!current || current.deletedAt) throw new ContactError("not_found", 404);
    // A retry after a lost response can confirm the exact already-saved values.
    if (sameFields(current, fields)) return ContactData.parse(current);
    if (current.version !== version) throw new ContactError("changed", 409);
    const [duplicate] = await tx.select({ id: C.id }).from(C).where(and(eq(C.userId, userId), eq(C.email, fields.email), isNull(C.deletedAt)));
    if (duplicate && duplicate.id !== id) throw new ContactError("email_in_use", 409);
    await linkContactMeetings(tx, userId, id);
    const [saved] = await tx.update(C).set({ ...fields, version: current.version + 1, updatedAt: new Date() }).where(owned(userId, id)).returning();
    await linkContactMeetings(tx, userId, id);
    return ContactData.parse(saved);
  });
}

export async function deleteContact(userId: string, id: string, version: number) {
  const db = await getDb();
  await db.transaction(async (tx: DB) => {
    await lockContactOwner(tx, userId);
    const [current] = await tx.select().from(C).where(owned(userId, id)).for("update");
    if (!current) throw new ContactError("not_found", 404);
    if (current.deletedAt) return;
    if (current.version !== version) throw new ContactError("changed", 409);
    await tx.update(C).set({ deletedAt: new Date(), version: current.version + 1 }).where(owned(userId, id));
  });
}

export async function getContact(userId: string, id: string) {
  const db = await getDb();
  const [contact] = await db.select().from(C).where(and(owned(userId, id), isNull(C.deletedAt)));
  return contact ? ContactData.parse(contact) : null;
}

export async function listContacts(userId: string, filters: ContactFilter, now = new Date()) {
  await syncHistoricalContacts(userId);
  const db = await getDb(); await linkContactMeetings(db, userId);
  const pattern = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
  const where = and(eq(C.userId, userId), isNull(C.deletedAt), filters.q ? or(ilike(C.name, pattern), ilike(C.email, pattern), ilike(C.company, pattern), ilike(C.phone, pattern)) : undefined);
  const dates = (direction: "next" | "last") => sql<string | null>`(SELECT ${direction === "next" ? sql`min(b.start)` : sql`max(b.start)`}
    FROM contact_meetings cm JOIN bookings b ON b.uid = cm."bookingUid"
    WHERE cm."contactId" = ${C.id} AND b."hostId" = ${userId} AND b.status != 'cancelled'
      AND ${direction === "next" ? sql`b.start >= ${now}` : sql`b.start < ${now}`})`;
  const [rows, counts] = await Promise.all([
    db.select({ contact: C, nextMeeting: dates("next"), lastMeeting: dates("last") }).from(C).where(where)
      .orderBy(filters.sort === "updated" ? desc(C.updatedAt) : asc(sql`lower(${C.name})`), asc(C.id)).limit(25).offset((filters.page - 1) * 25),
    db.select({ total: sql<number>`count(*)::int` }).from(C).where(where),
  ]);
  return { rows: rows.map((row: { contact: typeof C.$inferSelect; nextMeeting: string | null; lastMeeting: string | null }) => ({
    contact: ContactData.parse(row.contact), nextMeeting: row.nextMeeting ? new Date(row.nextMeeting).toISOString() : null,
    lastMeeting: row.lastMeeting ? new Date(row.lastMeeting).toISOString() : null,
  })), total: Number(counts[0].total) };
}

export async function contactHistory(userId: string, id: string, page = 1) {
  const db = await getDb(); await linkContactMeetings(db, userId, id);
  const where = and(owned(userId, id), isNull(C.deletedAt), eq(B.hostId, userId));
  const [rows, counts] = await Promise.all([
    db.select({ uid: B.uid, title: E.title, start: B.start, end: B.end, status: B.status, inviteeEmail: sql<string>`coalesce(${CM.inviteeEmail}, ${B.inviteeEmail})` }).from(C)
      .innerJoin(CM, eq(CM.contactId, C.id)).innerJoin(B, eq(B.uid, CM.bookingUid)).innerJoin(E, eq(E.id, B.eventTypeId))
      .where(where).orderBy(desc(B.start), asc(B.uid)).limit(25).offset((page - 1) * 25),
    db.select({ total: sql<number>`count(*)::int` }).from(C).innerJoin(CM, eq(CM.contactId, C.id)).innerJoin(B, eq(B.uid, CM.bookingUid)).where(where),
  ]);
  return { rows: rows as { uid: string; title: string; start: Date; end: Date; status: string; inviteeEmail: string }[], total: Number(counts[0].total) };
}

export function contactFailure(error: unknown) {
  if (error instanceof ContactError) return { error: error.code, status: error.status };
  let cause = error;
  for (let i = 0; i < 5 && cause && typeof cause === "object"; i++) {
    const detail = cause as { code?: string; constraint?: string; constraint_name?: string; cause?: unknown };
    if (detail.code === "23505" && (detail.constraint ?? detail.constraint_name) === "contacts_active_owner_email") return { error: "email_in_use", status: 409 };
    cause = detail.cause;
  }
  return { error: "save_failed", status: 500 };
}
