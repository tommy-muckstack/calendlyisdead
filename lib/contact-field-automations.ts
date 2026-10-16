import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { lockContactOwner, type ContactDB } from "./contact-store";
import { ContactAutomationError, contactAutomationEvent } from "./contact-automation-store";
import { listContactFields } from "./contact-custom-fields";
import { normalizeFieldValue, type FieldValueType } from "./contact-field-validation";
import { ChangeFieldAutomation, ContactFieldAutomation, emptyFieldAutomation, normalizeFieldAction, orderedFieldActions, sameFieldActions, type ContactFieldAction, type FieldAutomationChange } from "./contact-field-automation-validation";
const { contactFieldAutomations: A, contactFieldValues: V, contacts: C } = schema;
const owned = (userId: string, eventTypeId: string) => and(eq(A.userId, userId), eq(A.eventTypeId, eventTypeId));
async function read(db: ContactDB, userId: string, eventTypeId: string) {
  const [row] = await db.select().from(A).where(owned(userId, eventTypeId));
  return row ? ContactFieldAutomation.parse({ eventTypeId, configured: !row.deletedAt, enabled: row.deletedAt ? false : row.enabled, actions: row.deletedAt ? [] : row.actions, version: row.version }) : emptyFieldAutomation(eventTypeId);
}
export async function readContactFieldAutomation(userId: string, eventTypeId: string) {
  const db = await getDb(), event = await contactAutomationEvent(db, userId, eventTypeId);
  return { automation: await read(db, userId, eventTypeId), fields: await listContactFields(userId, db), eventTitle: event.title };
}
export async function changeContactFieldAutomation(userId: string, eventTypeId: string, input: FieldAutomationChange) {
  const request = ChangeFieldAutomation.parse(input), db = await getDb();
  return db.transaction(async (tx: ContactDB) => {
    const event = await contactAutomationEvent(tx, userId, eventTypeId, true); await lockContactOwner(tx, userId);
    const current = await read(tx, userId, eventTypeId), fields = await listContactFields(userId, tx);
    if (request.action === "toggle" && !current.configured) throw new ContactAutomationError("This automation was removed. Reload it before making changes.");
    let actions = request.action === "save" ? request.actions : current.actions;
    if (request.action === "save" || request.enabled) {
      try { actions = actions.map(row => normalizeFieldAction(row, fields)); } catch (error) { throw new ContactAutomationError((error as Error).message); }
      if (request.action === "save" && actions.some(row => fields.find(field => field.id === row.fieldId)?.version !== request.fieldVersions[row.fieldId])) throw new ContactAutomationError("A selected field changed. Reload the field definitions before saving.");
    }
    actions = orderedFieldActions(actions);
    if (current.configured && current.enabled === request.enabled && sameFieldActions(current.actions, actions)) return { automation: current, fields, eventTitle: event.title };
    if (current.version !== request.version) throw new ContactAutomationError("This automation changed elsewhere. Reload the saved settings before changing it.");
    const saved = { userId, eventTypeId, actions, enabled: request.enabled, version: current.version + 1, deletedAt: null };
    await tx.insert(A).values(saved).onConflictDoUpdate({ target: [A.userId, A.eventTypeId], set: saved });
    return { automation: ContactFieldAutomation.parse({ ...saved, configured: true }), fields, eventTitle: event.title };
  });
}
export async function deleteContactFieldAutomation(userId: string, eventTypeId: string, version: number) {
  const db = await getDb(); await db.transaction(async (tx: ContactDB) => {
    await contactAutomationEvent(tx, userId, eventTypeId, true); await lockContactOwner(tx, userId); const current = await read(tx, userId, eventTypeId);
    if (!current.configured && current.version === version + 1) return;
    if (!current.configured || current.version !== version) throw new ContactAutomationError("This automation changed elsewhere. Reload it before deleting.");
    await tx.update(A).set({ actions: [], enabled: false, version: version + 1, deletedAt: new Date() }).where(owned(userId, eventTypeId));
  });
}
/** Called only after the shared booking receipt is claimed under the host lock.
 * Field deletion/type changes skip affected actions; storage errors roll back
 * the reservation and all contact automations together. */
export async function applyContactFieldAutomation(db: ContactDB, booking: { hostId: string; eventTypeId: string }, contactId: string) {
  const [automation] = await db.select().from(A).where(and(owned(booking.hostId, booking.eventTypeId), eq(A.enabled, true), isNull(A.deletedAt)));
  if (!automation?.actions.length) return;
  const fields = await listContactFields(booking.hostId, db), valid: ContactFieldAction[] = [];
  for (const action of automation.actions) { try { valid.push(normalizeFieldAction(action, fields)); } catch { /* Unavailable targets must not prevent booking. */ } }
  if (!valid.length) return;
  const existing = await db.select().from(V).where(and(eq(V.contactId, contactId), inArray(V.fieldId, valid.map(row => row.fieldId)))); let changed = false;
  for (const action of valid) {
    const current: FieldValueType = existing.find(row => row.fieldId === action.fieldId)?.value.data ?? null;
    let value = action.value;
    if (action.type === "tag") {
      const previous = Array.isArray(current) ? current : typeof current === "string" ? [current] : [];
      value = normalizeFieldValue(fields.find(field => field.id === action.fieldId)!, [...new Set([...previous, ...(action.value as string[])])]) as string[];
    }
    if (JSON.stringify(current) === JSON.stringify(value)) continue;
    await db.insert(V).values({ contactId, fieldId: action.fieldId, value: { data: value } }).onConflictDoUpdate({ target: [V.contactId, V.fieldId], set: { value: { data: value } } }); changed = true;
  }
  if (changed) await db.update(C).set({ version: sql`${C.version} + 1`, updatedAt: new Date() }).where(and(eq(C.id, contactId), eq(C.userId, booking.hostId)));
}
