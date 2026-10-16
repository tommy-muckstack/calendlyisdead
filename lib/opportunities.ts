import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { lockContactOwner, type ContactDB } from "./contact-store";
import { ChangeOpportunity, OpportunityData, OpportunityDetail, OpportunityFields, OpportunityList, sameOpportunity, type OpportunityDraft } from "./opportunity-validation";
import type { z } from "zod";
import type { OpportunityFilters } from "./opportunity-validation";
const { opportunities: O, opportunityMoves: M, opportunityDeletions: D, contacts: C } = schema;
export class OpportunityError extends Error { constructor(message: string, public status = 409) { super(message); } }
const owned = (userId: string, id: string) => and(eq(O.userId, userId), eq(O.id, id));
const data = (row: typeof O.$inferSelect) => OpportunityData.parse({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
const contactJoin = (userId: string) => and(eq(C.id, O.contactId), eq(C.userId, userId), isNull(C.deletedAt));
const select = { opportunity: O, contact: { id: C.id, name: C.name, email: C.email } };
async function validateContact(db: ContactDB, userId: string, contactId: string | null, previous?: string | null) {
  if (!contactId) { if (previous === null) return; throw new OpportunityError("Choose a contact.", 400); }
  const [contact] = await db.select({ id: C.id, deletedAt: C.deletedAt }).from(C).where(and(eq(C.id, contactId), eq(C.userId, userId)));
  if (!contact || (contact.deletedAt && contactId !== previous)) throw new OpportunityError("That contact is no longer available. Choose another contact.");
}
async function moveRecord(db: ContactDB, opportunityId: string, from: string | null, to: string, at: Date, revision: number) { await db.insert(M).values({ id: crypto.randomUUID(), opportunityId, from, to, at, revision }); }
export async function getOpportunity(userId: string, id: string, historyPage = 1, db?: ContactDB) {
  db ??= await getDb(); const [row] = await db.select(select).from(O).leftJoin(C, contactJoin(userId)).where(owned(userId, id));
  if (!row) throw new OpportunityError("This opportunity is no longer available.", 404);
  const [moves, count] = await Promise.all([db.select().from(M).where(eq(M.opportunityId, id)).orderBy(desc(M.revision), desc(M.at), asc(M.id)).limit(50).offset((historyPage - 1) * 50), db.select({ total: sql<number>`count(*)::int` }).from(M).where(eq(M.opportunityId, id))]);
  return OpportunityDetail.parse({ opportunity: data(row.opportunity), contact: row.contact, history: moves.map(move => ({ id: move.id, from: move.from, to: move.to, at: move.at.toISOString() })), historyTotal: Number(count[0].total) });
}
export async function listOpportunities(userId: string, filters: z.infer<typeof OpportunityFilters>, db?: ContactDB) {
  db ??= await getDb(); const query = `%${filters.q.replace(/[\\%_]/g, char => `\\${char}`)}%`;
  const where = and(eq(O.userId, userId), filters.stage ? eq(O.stage, filters.stage) : undefined, filters.contactId ? eq(O.contactId, filters.contactId) : undefined, filters.q ? or(sql`${O.name} ILIKE ${query}`, sql`${C.name} ILIKE ${query}`, sql`${C.email} ILIKE ${query}`) : undefined);
  const [rows, count] = await Promise.all([db.select(select).from(O).leftJoin(C, contactJoin(userId)).where(where).orderBy(desc(O.updatedAt), asc(O.id)).limit(25).offset((filters.page - 1) * 25), db.select({ total: sql<number>`count(*)::int` }).from(O).leftJoin(C, contactJoin(userId)).where(where)]);
  return OpportunityList.parse({ rows: rows.map(row => ({ opportunity: data(row.opportunity), contact: row.contact })), total: Number(count[0].total), page: filters.page, stage: filters.stage ?? null });
}
export async function createOpportunity(userId: string, id: string, input: OpportunityDraft) {
  const fields = OpportunityFields.parse(input), db = await getDb();
  return db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId);
    const [current] = await tx.select().from(O).where(eq(O.id, id)), [deleted] = await tx.select({ id: D.id }).from(D).where(eq(D.id, id));
    if (deleted || (current && (current.userId !== userId || !sameOpportunity(current, fields)))) throw new OpportunityError("This creation request was already used. Reload Opportunities before trying again.");
    if (current) return getOpportunity(userId, id, 1, tx);
    await validateContact(tx, userId, fields.contactId); const now = new Date();
    const inserted = await tx.insert(O).values({ ...fields, id, userId, createdAt: now, updatedAt: now }).onConflictDoNothing().returning({ id: O.id });
    if (!inserted.length) throw new OpportunityError("This creation request was already used. Reload Opportunities before trying again.");
    await moveRecord(tx, id, null, fields.stage, now, 1); return getOpportunity(userId, id, 1, tx);
  });
}
export async function changeOpportunity(userId: string, id: string, input: z.infer<typeof ChangeOpportunity>) {
  const change = ChangeOpportunity.parse(input), db = await getDb();
  return db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId); const [current] = await tx.select().from(O).where(owned(userId, id)); if (!current) throw new OpportunityError("This opportunity is no longer available.", 404);
    const fields = OpportunityFields.parse(change.action === "edit" ? change : { ...current, stage: change.stage });
    if (sameOpportunity(current, fields)) return getOpportunity(userId, id, 1, tx);
    if (current.version !== change.version) throw new OpportunityError("This opportunity changed elsewhere. Reload it before saving.");
    await validateContact(tx, userId, fields.contactId, current.contactId); const now = new Date();
    await tx.update(O).set({ ...fields, version: current.version + 1, updatedAt: now }).where(owned(userId, id));
    if (current.stage !== fields.stage) await moveRecord(tx, id, current.stage, fields.stage, now, current.version + 1);
    return getOpportunity(userId, id, 1, tx);
  });
}
export async function deleteOpportunity(userId: string, id: string, version: number) {
  const db = await getDb(); await db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId); const [current] = await tx.select().from(O).where(owned(userId, id));
    if (!current) { const [receipt] = await tx.select().from(D).where(and(eq(D.id, id), eq(D.userId, userId), eq(D.version, version))); if (receipt) return; throw new OpportunityError("This opportunity is no longer available.", 404); }
    if (current.version !== version) throw new OpportunityError("This opportunity changed elsewhere. Reload it before deleting.");
    await tx.insert(D).values({ id, userId, version }); await tx.delete(O).where(owned(userId, id));
  });
}
export async function opportunityContacts(userId: string, q: string, page: number) {
  const db = await getDb(), query = `%${q.trim().replace(/[\\%_]/g, char => `\\${char}`)}%`, where = and(eq(C.userId, userId), isNull(C.deletedAt), q.trim() ? or(sql`${C.name} ILIKE ${query}`, sql`${C.email} ILIKE ${query}`) : undefined);
  const [rows, count] = await Promise.all([db.select({ id: C.id, name: C.name, email: C.email }).from(C).where(where).orderBy(asc(C.name), asc(C.id)).limit(25).offset((page - 1) * 25), db.select({ total: sql<number>`count(*)::int` }).from(C).where(where)]);
  return { rows, total: Number(count[0].total), page };
}
