import { and, asc, desc, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { getDb, schema } from "./db";
import { lockContactOwner, type ContactDB } from "./contact-store";
import { NoteData, NoteFields, type ContactNote, type NoteDraft } from "./contact-note-validation";
import { linkContactMeetings } from "./contacts";
import { meetingZone } from "./meetings";
const { contactNotes: N, contacts: C } = schema;
export class ContactNoteError extends Error { constructor(public code: string, public status = 409) { super(code); } }
const owner = (userId: string, contactId: string) => and(eq(C.userId, userId), eq(C.id, contactId), isNull(C.deletedAt));
export const noteData = (note: typeof N.$inferSelect): ContactNote => NoteData.parse({ ...note, createdAt: new Date(note.createdAt).toISOString(), updatedAt: new Date(note.updatedAt).toISOString(), completedAt: note.completedAt ? new Date(note.completedAt).toISOString() : null });
const same = (a: NoteDraft, b: NoteDraft) => a.title === b.title && a.body === b.body && a.reminderDate === b.reminderDate;
async function requireContact(db: ContactDB, userId: string, contactId: string) { if (!(await db.select({ id: C.id }).from(C).where(owner(userId, contactId))).length) throw new ContactNoteError("not_found", 404); }
export async function getContactNote(userId: string, contactId: string, id: string, db?: ContactDB) {
  db ??= await getDb(); const [row] = await db.select({ note: N }).from(N).innerJoin(C, eq(C.id, N.contactId)).where(and(owner(userId, contactId), eq(N.userId, userId), eq(N.id, id), isNull(N.deletedAt)));
  if (!row) throw new ContactNoteError("not_found", 404); return noteData(row.note);
}
export async function createContactNote(userId: string, contactId: string, id: string, input: NoteDraft, now = new Date()) {
  const fields = NoteFields.parse(input), db = await getDb(); return db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId); await requireContact(tx, userId, contactId);
    const [prior] = await tx.select().from(N).where(eq(N.id, id));
    if (prior) { if (prior.userId !== userId || prior.contactId !== contactId || prior.deletedAt || !same(prior, fields)) throw new ContactNoteError("creation_conflict"); return noteData(prior); }
    const [created] = await tx.insert(N).values({ ...fields, id, userId, contactId, createdAt: now, updatedAt: now }).returning(); return noteData(created);
  });
}
export async function editContactNote(userId: string, contactId: string, id: string, version: number, input: NoteDraft, now = new Date()) {
  const fields = NoteFields.parse(input), db = await getDb(); return db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId); const current = await getContactNote(userId, contactId, id, tx);
    if (same(current, fields)) return current;
    if (current.version !== version) throw new ContactNoteError("changed");
    const [saved] = await tx.update(N).set({ ...fields, version: current.version + 1, updatedAt: now,
      completedAt: fields.reminderDate === current.reminderDate && current.completedAt ? new Date(current.completedAt) : null }).where(eq(N.id, id)).returning(); return noteData(saved);
  });
}
export async function completeContactReminder(userId: string, contactId: string, id: string, version: number, now = new Date()) {
  const db = await getDb(); return db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId); const current = await getContactNote(userId, contactId, id, tx);
    if (current.completedAt) return current;
    if (current.version !== version) throw new ContactNoteError("changed");
    if (!current.reminderDate) throw new ContactNoteError("no_reminder", 400);
    const [saved] = await tx.update(N).set({ completedAt: now, version: current.version + 1, updatedAt: now }).where(eq(N.id, id)).returning(); return noteData(saved);
  });
}
export async function deleteContactNote(userId: string, contactId: string, id: string, version: number, now = new Date()) {
  const db = await getDb(); await db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId); await requireContact(tx, userId, contactId);
    const [current] = await tx.select().from(N).where(and(eq(N.userId, userId), eq(N.contactId, contactId), eq(N.id, id)));
    if (!current) throw new ContactNoteError("not_found", 404); if (current.deletedAt) return;
    if (current.version !== version) throw new ContactNoteError("changed");
    // Keep only a tombstone so a delayed create cannot resurrect deleted text.
    await tx.update(N).set({ title: "", body: "", reminderDate: null, completedAt: null, deletedAt: now, updatedAt: now, version: current.version + 1 }).where(eq(N.id, id));
  });
}
export type ContactTimelineItem = { kind: "note"; note: ContactNote } | { kind: "meeting"; meeting: { uid: string; title: string; start: string; end: string; status: string; inviteeEmail: string } };
function resultRows<T>(result: T[] | { rows: T[] }) { return Array.isArray(result) ? result : result.rows; }
export async function contactTimeline(userId: string, contactId: string, tab: "all" | "notes" | "meetings", page = 1) {
  const db = await getDb(); await requireContact(db, userId, contactId); if (tab !== "notes") await linkContactMeetings(db, userId, contactId);
  const query = sql`SELECT 'note' AS kind, n.id, n."updatedAt" AS at, to_jsonb(n) - 'userId' - 'deletedAt' AS data
    FROM contact_notes n JOIN contacts c ON c.id = n."contactId"
    WHERE n."userId" = ${userId} AND c."userId" = ${userId} AND c.id = ${contactId} AND n."deletedAt" IS NULL AND c."deletedAt" IS NULL AND ${tab} != 'meetings'
    UNION ALL
    SELECT 'meeting' AS kind, b.uid AS id, b.start AS at, jsonb_build_object('uid', b.uid, 'title', e.title, 'start', b.start, 'end', b."end", 'status', b.status, 'inviteeEmail', coalesce(cm."inviteeEmail", b."inviteeEmail")) AS data
    FROM contact_meetings cm JOIN contacts c ON c.id = cm."contactId" JOIN bookings b ON b.uid = cm."bookingUid" JOIN event_types e ON e.id = b."eventTypeId"
    WHERE c."userId" = ${userId} AND c.id = ${contactId} AND c."deletedAt" IS NULL AND b."hostId" = ${userId} AND ${tab} != 'notes'`;
  const [data, total] = await Promise.all([db.execute(sql`SELECT * FROM (${query}) items ORDER BY at DESC, kind, id LIMIT 25 OFFSET ${(page - 1) * 25}`), db.execute(sql`SELECT count(*)::int AS total FROM (${query}) items`)]);
  const rows = resultRows<{ kind: "note"; data: typeof N.$inferSelect } | { kind: "meeting"; data: Extract<ContactTimelineItem, { kind: "meeting" }>["meeting"] }>(data);
  return { total: resultRows<{ total: number }>(total)[0].total, rows: rows.map(row => row.kind === "note" ? { kind: "note" as const, note: noteData(row.data) } : { kind: "meeting" as const, meeting: { ...row.data, start: new Date(row.data.start).toISOString(), end: new Date(row.data.end).toISOString() } }) };
}
export async function listContactReminders(userId: string, timezone: string, bucket: "due" | "upcoming" | "all", page = 1, now = new Date()) {
  const db = await getDb(), today = DateTime.fromJSDate(now).setZone(meetingZone(timezone)).toISODate()!;
  const where = and(eq(N.userId, userId), eq(C.userId, userId), isNull(N.deletedAt), isNull(C.deletedAt), isNull(N.completedAt), isNotNull(N.reminderDate), bucket === "due" ? lte(N.reminderDate, today) : bucket === "upcoming" ? gt(N.reminderDate, today) : undefined);
  const [rows, count] = await Promise.all([db.select({ note: N, name: C.name }).from(N).innerJoin(C, eq(C.id, N.contactId)).where(where).orderBy(asc(N.reminderDate), desc(N.updatedAt), asc(N.id)).limit(25).offset((page - 1) * 25), db.select({ total: sql<number>`count(*)::int` }).from(N).innerJoin(C, eq(C.id, N.contactId)).where(where)]);
  return { today, total: Number(count[0].total), rows: (rows as { note: typeof N.$inferSelect; name: string }[]).map(row => ({ name: row.name, note: noteData(row.note) })) };
}
