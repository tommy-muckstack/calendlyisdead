import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { lockContactOwner, type ContactDB } from "./contact-store";
import { availableAutomationEvents, ContactAutomationError, contactAutomationEvent } from "./contact-automation-store";
import { ChangeOpportunityAutomation, OpportunityAutomationData, OpportunityAutomationFields, sameOpportunityAutomation, renderOpportunityName, type OpportunityAutomationDraft } from "./opportunity-automation-validation";
import { EMPTY_OPPORTUNITY } from "./opportunity-validation";
import type { z } from "zod";
const { opportunityAutomations: A, opportunities: O, opportunityMoves: M, opportunityBookings: L, eventTypes: E, users: U, contacts: C, bookings: B } = schema;
const owned = (userId: string, id: string) => and(eq(A.userId, userId), eq(A.id, id));
const active = (userId: string, id: string) => and(owned(userId, id), isNull(A.deletedAt));
async function view(db: ContactDB, userId: string, row: typeof A.$inferSelect) {
  const [event] = await db.select({ title: E.title }).from(E).where(and(eq(E.id, row.eventTypeId), availableAutomationEvents(userId)));
  return OpportunityAutomationData.parse({ ...row, eventTitle: event?.title ?? null });
}
export async function getOpportunityAutomation(userId: string, id: string, db?: ContactDB) {
  db ??= await getDb(); const [row] = await db.select().from(A).where(active(userId, id)); if (!row) throw new ContactAutomationError("This automation is no longer available.", 404); return view(db, userId, row);
}
export async function listOpportunityAutomations(userId: string, filters: { eventId?: string; page: number; q: string }) {
  const db = await getDb(); if (filters.eventId) await contactAutomationEvent(db, userId, filters.eventId);
  const pattern = `%${filters.q.replace(/[\\%_]/g, char => `\\${char}`)}%`, where = and(eq(A.userId, userId), isNull(A.deletedAt), filters.eventId ? eq(A.eventTypeId, filters.eventId) : undefined, filters.q ? sql`${A.name} ILIKE ${pattern}` : undefined);
  const [rows, count, events, owners] = await Promise.all([db.select().from(A).where(where).orderBy(asc(A.name), asc(A.id)).limit(25).offset((filters.page - 1) * 25), db.select({ total: sql<number>`count(*)::int` }).from(A).where(where), db.select({ id: E.id, title: E.title }).from(E).where(availableAutomationEvents(userId)).orderBy(asc(E.title), asc(E.id)), db.select({ name: U.name }).from(U).where(eq(U.id, userId))]);
  return { rows: rows.map(row => OpportunityAutomationData.parse({ ...row, eventTitle: events.find(event => event.id === row.eventTypeId)?.title ?? null })), total: Number(count[0].total), page: filters.page, events, hostName: owners[0]?.name ?? "" };
}
export async function createOpportunityAutomation(userId: string, id: string, input: OpportunityAutomationDraft) {
  const fields = OpportunityAutomationFields.parse(input), db = await getDb();
  return db.transaction(async (tx: ContactDB) => {
    await contactAutomationEvent(tx, userId, fields.eventTypeId, true); await lockContactOwner(tx, userId);
    const [current] = await tx.select().from(A).where(eq(A.id, id));
    if (current) { if (current.userId !== userId || current.deletedAt || !sameOpportunityAutomation(current, fields)) throw new ContactAutomationError("This creation request was already used. Reload automations before trying again."); return view(tx, userId, current); }
    const [saved] = await tx.insert(A).values({ ...fields, id, userId }).onConflictDoNothing().returning(); if (!saved) throw new ContactAutomationError("This creation request was already used. Reload automations before trying again."); return view(tx, userId, saved);
  });
}
export async function changeOpportunityAutomation(userId: string, id: string, input: z.infer<typeof ChangeOpportunityAutomation>) {
  input = ChangeOpportunityAutomation.parse(input);
  const db = await getDb(); return db.transaction(async (tx: ContactDB) => {
    // Event access is checked before the owner lock for reservation lock order.
    // Pausing an unavailable event must remain possible from Opportunities.
    if (input.action === "save") await contactAutomationEvent(tx, userId, input.eventTypeId, true);
    await lockContactOwner(tx, userId); const [current] = await tx.select().from(A).where(active(userId, id)); if (!current) throw new ContactAutomationError("This automation is no longer available.", 404);
    const fields = OpportunityAutomationFields.parse(input.action === "save" ? input : { ...current, enabled: input.enabled });
    if (input.action === "toggle" && input.enabled) await contactAutomationEvent(tx, userId, current.eventTypeId);
    if (sameOpportunityAutomation(current, fields)) return view(tx, userId, current);
    if (current.version !== input.version) throw new ContactAutomationError("This automation changed elsewhere. Reload before saving.");
    const [saved] = await tx.update(A).set({ ...fields, version: current.version + 1 }).where(owned(userId, id)).returning(); return view(tx, userId, saved);
  });
}
export async function deleteOpportunityAutomation(userId: string, id: string, version: number) {
  const db = await getDb(); await db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId); const [current] = await tx.select().from(A).where(owned(userId, id)); if (!current) throw new ContactAutomationError("This automation is no longer available.", 404);
    if (current.deletedAt && current.version === version + 1) return;
    if (current.deletedAt || current.version !== version) throw new ContactAutomationError("This automation changed elsewhere. Reload before deleting.");
    await tx.update(A).set({ enabled: false, deletedAt: new Date(), version: version + 1 }).where(owned(userId, id));
  });
}
// Called only after the shared receipt claim, inside the reservation transaction.
export async function applyOpportunityAutomations(db: ContactDB, booking: { hostId: string; uid: string; eventTypeId: string }, contactId: string) {
  const [reservation] = await db.select({ booking: B, title: E.title, hostName: U.name }).from(B).innerJoin(E, eq(E.id, B.eventTypeId)).innerJoin(U, eq(U.id, B.hostId))
    .where(and(eq(B.uid, booking.uid), eq(B.hostId, booking.hostId), eq(B.eventTypeId, booking.eventTypeId), eq(B.status, "confirmed"), isNull(B.rescheduledFrom), availableAutomationEvents(booking.hostId)));
  const [contact] = await db.select({ id: C.id }).from(C).where(and(eq(C.id, contactId), eq(C.userId, booking.hostId), isNull(C.deletedAt))); if (!reservation || !contact) return;
  const rows = await db.select().from(A).where(and(eq(A.userId, booking.hostId), eq(A.eventTypeId, booking.eventTypeId), eq(A.enabled, true), isNull(A.deletedAt))).orderBy(asc(A.id));
  for (const row of rows) {
    const parsed = OpportunityAutomationFields.safeParse(row); if (!parsed.success) continue;
    const id = crypto.randomUUID(), now = new Date(), name = renderOpportunityName(parsed.data.opportunityName, { hostName: reservation.hostName ?? "", inviteeName: reservation.booking.inviteeName, meetingName: reservation.title });
    await db.insert(O).values({ ...EMPTY_OPPORTUNITY, id, userId: booking.hostId, name, contactId, stage: parsed.data.stage, createdAt: now, updatedAt: now });
    await db.insert(M).values({ id: crypto.randomUUID(), opportunityId: id, from: null, to: parsed.data.stage, at: now, revision: 1 });
    await db.insert(L).values({ opportunityId: id, userId: booking.hostId, bookingUid: booking.uid, originalBookingUid: booking.uid, automationId: row.id, automationName: row.name, eventTitle: reservation.title });
  }
}
