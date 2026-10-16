import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { lockContactOwner, type ContactDB } from "./contact-store";
import { CollectionData } from "./contact-list-validation";
import { ChangeListAutomation, ContactListAutomation, emptyListAutomation, type ListAutomationChange } from "./contact-automation-validation";
import { ContactAutomationError, contactAutomationEvent, availableAutomationEvents } from "./contact-automation-store";
import { applyContactFieldAutomation } from "./contact-field-automations";
const { eventTypes: E, contactListAutomations: A, contactListAutomationRuns: R, contactCollections: L, contactListMembers: M, contacts: C, bookings: B } = schema;
export { ContactAutomationError } from "./contact-automation-store";
const owned = (userId: string, eventTypeId: string) => and(eq(A.userId, userId), eq(A.eventTypeId, eventTypeId));
export async function contactAutomationEvents(userId: string) {
  const db = await getDb(); return db.select({ id: E.id, title: E.title, kind: E.kind }).from(E).where(availableAutomationEvents(userId)).orderBy(asc(E.title), asc(E.id));
}
async function read(db: ContactDB, userId: string, eventTypeId: string) {
  const [row] = await db.select().from(A).where(owned(userId, eventTypeId));
  return row ? ContactListAutomation.parse({ eventTypeId, configured: !row.deletedAt, enabled: row.deletedAt ? false : row.enabled, listIds: row.deletedAt ? [] : row.listIds, version: row.version }) : emptyListAutomation(eventTypeId);
}
async function choices(db: ContactDB, userId: string) {
  const rows = await db.select().from(L).where(and(eq(L.userId, userId), eq(L.kind, "list"), isNull(L.deletedAt))).orderBy(asc(L.name), asc(L.id)); return rows.map(row => CollectionData.parse(row));
}
export async function readContactAutomation(userId: string, eventTypeId: string) {
  const db = await getDb(), event = await contactAutomationEvent(db, userId, eventTypeId);
  return { automation: await read(db, userId, eventTypeId), lists: await choices(db, userId), eventTitle: event.title };
}
export async function changeContactAutomation(userId: string, eventTypeId: string, input: ListAutomationChange) {
  const request = ChangeListAutomation.parse(input), db = await getDb();
  return db.transaction(async (tx: ContactDB) => {
    // Team reservations lock the event before hosts. Acquire the FK-compatible
    // event lock first to avoid the inverse order on first configuration insert.
    const event = await contactAutomationEvent(tx, userId, eventTypeId, true); await lockContactOwner(tx, userId); const current = await read(tx, userId, eventTypeId);
    if (request.action === "toggle" && !current.configured) throw new ContactAutomationError("This automation was removed. Reload it before making changes.");
    const listIds = request.action === "save" ? [...request.listIds].sort() : [...current.listIds].sort(), lists = await choices(tx, userId);
    // Turning an existing automation off must remain possible after a target
    // list is deleted. Saving new destinations or enabling requires valid lists.
    if ((request.action === "save" || request.enabled) && listIds.some(id => !lists.some(list => list.id === id))) throw new ContactAutomationError("A selected list is no longer available. Reload the lists and choose its replacement.");
    const equal = current.configured && current.enabled === request.enabled && JSON.stringify([...current.listIds].sort()) === JSON.stringify(listIds);
    if (equal) return { automation: current, lists, eventTitle: event.title };
    if (request.version !== current.version) throw new ContactAutomationError("This automation changed elsewhere. Reload the saved settings before changing it.");
    const saved = { userId, eventTypeId, listIds, enabled: request.enabled, version: current.version + 1, deletedAt: null };
    await tx.insert(A).values(saved).onConflictDoUpdate({ target: [A.userId, A.eventTypeId], set: saved });
    return { automation: ContactListAutomation.parse({ ...saved, configured: true }), lists, eventTitle: event.title };
  });
}
export async function deleteContactAutomation(userId: string, eventTypeId: string, version: number) {
  const db = await getDb(); await db.transaction(async (tx: ContactDB) => {
    await contactAutomationEvent(tx, userId, eventTypeId, true); await lockContactOwner(tx, userId); const current = await read(tx, userId, eventTypeId);
    if (!current.configured && current.version === version + 1) return;
    if (!current.configured || current.version !== version) throw new ContactAutomationError("This automation changed elsewhere. Reload it before deleting.");
    await tx.update(A).set({ enabled: false, listIds: [], deletedAt: new Date(), version: version + 1 }).where(owned(userId, eventTypeId));
  });
}
/** Reservation transaction already holds this host's lock. Claim every newly
 * created booking/contact pair, even with no enabled automation, so a later
 * retry cannot apply settings added after that booking or undo manual removal. */
export async function runContactAutomations(db: ContactDB, booking: { hostId: string; uid: string; eventTypeId: string; inviteeEmail: string }, contactId: string) {
  const [contact] = await db.select({ id: C.id }).from(C).where(and(eq(C.id, contactId), eq(C.userId, booking.hostId), isNull(C.deletedAt)));
  if (!contact) return;
  const [reservation] = await db.select({ uid: B.uid }).from(B).where(and(eq(B.uid, booking.uid), eq(B.hostId, booking.hostId), eq(B.eventTypeId, booking.eventTypeId), eq(B.status, "confirmed"), isNull(B.rescheduledFrom)));
  if (!reservation) return;
  const claimed = await db.insert(R).values({ userId: booking.hostId, bookingUid: booking.uid, inviteeEmail: booking.inviteeEmail.trim().toLowerCase() }).onConflictDoNothing().returning({ uid: R.bookingUid }); if (!claimed.length) return;
  await applyContactFieldAutomation(db, booking, contactId);
  const [automation] = await db.select().from(A).where(and(owned(booking.hostId, booking.eventTypeId), eq(A.enabled, true), isNull(A.deletedAt)));
  if (!automation?.listIds.length) return;
  const targets = await db.select({ id: L.id }).from(L).where(and(eq(L.userId, booking.hostId), eq(L.kind, "list"), isNull(L.deletedAt), inArray(L.id, automation.listIds)));
  if (!targets.length) return;
  const added: { id: string }[] = await db.insert(M).values(targets.map(target => ({ collectionId: target.id, contactId }))).onConflictDoNothing().returning({ id: M.collectionId });
  if (added.length) await db.update(L).set({ version: sql`${L.version} + 1` }).where(and(eq(L.userId, booking.hostId), inArray(L.id, added.map(list => list.id))));
}
