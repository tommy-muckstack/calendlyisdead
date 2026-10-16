import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { lockContactOwner, type ContactDB } from "./contact-store";
import { ContactAutomationError, contactAutomationEvent } from "./contact-automation-store";
import { ContactFieldData, EMPTY_FIELD, normalizeFieldValue, type ContactField } from "./contact-field-validation";
import { ChangeQuestionAutomation, QuestionAutomation, mappedFieldName, questionMappingProblem, type QuestionAutomationChange } from "./contact-question-automation-validation";
const { contactQuestionAutomations: A, contactFields: F, contactFieldValues: V, contacts: C, eventTypes: E } = schema;
const owned = (userId: string, eventTypeId: string) => and(eq(A.userId, userId), eq(A.eventTypeId, eventTypeId));
async function read(db: ContactDB, userId: string, eventTypeId: string) {
  const [row] = await db.select().from(A).where(owned(userId, eventTypeId));
  return QuestionAutomation.parse({ eventTypeId, configured: !!row && !row.deletedAt, fieldId: row?.deletedAt ? null : row?.fieldId ?? null, questionId: row?.deletedAt ? null : row?.questionId ?? null, enabled: !!row && !row.deletedAt && row.enabled, legacyConflict: !!row && !row.deletedAt && row.legacyConflict, version: row?.version ?? 0 });
}
async function state(db: ContactDB, userId: string, eventTypeId: string) {
  const event = await contactAutomationEvent(db, userId, eventTypeId), automation = await read(db, userId, eventTypeId);
  const fields = await db.select().from(F).where(and(eq(F.userId, userId), isNull(F.deletedAt)));
  const field = fields.find(field => field.id === automation.fieldId);
  return { automation, field: field ? ContactFieldData.parse(field) : null, eventTitle: event.title, questions: event.questions.map(question => ({ id: question.id, label: question.label })), fieldCount: fields.length };
}
export async function readContactQuestionAutomation(userId: string, eventTypeId: string) { return state(await getDb(), userId, eventTypeId); }
// Generic Contacts field creation uses the same one-mapping-per-event rule.
// Caller holds event then owner locks, and inserted this new field in its transaction.
export async function attachQuestionField(db: ContactDB, userId: string, field: ContactField) {
  const current = await read(db, userId, field.eventTypeId!);
  if (current.configured) throw new ContactAutomationError("This event already has a question mapping. Manage it in Contact automations.");
  const saved = { userId, eventTypeId: field.eventTypeId!, fieldId: field.id, questionId: field.questionId, enabled: true, legacyConflict: false, version: current.version + 1, deletedAt: null };
  await db.insert(A).values(saved).onConflictDoUpdate({ target: [A.userId, A.eventTypeId], set: saved });
}
export async function changeContactQuestionAutomation(userId: string, eventTypeId: string, input: QuestionAutomationChange) {
  const request = ChangeQuestionAutomation.parse(input), db = await getDb();
  return db.transaction(async (tx: ContactDB) => {
    const event = await contactAutomationEvent(tx, userId, eventTypeId, true); await lockContactOwner(tx, userId);
    const before = await state(tx, userId, eventTypeId), current = before.automation;
    if (request.action === "toggle" && !current.configured) throw new ContactAutomationError("This automation was removed. Reload before changing it.");
    const questionId = request.action === "save" ? request.questionId : current.questionId, fieldId = request.action === "save" ? request.fieldId : current.fieldId;
    const question = event.questions.find(question => question.id === questionId);
    if ((request.action === "save" || request.enabled) && !question) throw new ContactAutomationError("That question is no longer available. Reload and choose another question.");
    const reuse = current.configured && !current.legacyConflict && current.fieldId === fieldId && current.questionId === questionId && !!before.field && !questionMappingProblem(before);
    if (request.action === "toggle" && request.enabled && !reuse) throw new ContactAutomationError("Repair the question mapping before enabling it.");
    if (current.configured && !current.legacyConflict && current.enabled === request.enabled && current.fieldId === fieldId && current.questionId === questionId && (request.action === "toggle" || reuse)) return before;
    if (current.version !== request.version) throw new ContactAutomationError("This automation changed elsewhere. Reload before saving.");
    if (request.action === "save" && !reuse) {
      const [existing] = await tx.select({ id: F.id }).from(F).where(eq(F.id, request.fieldId));
      if (existing) throw new ContactAutomationError("A question mapping must create a new field. Reload and try again.");
      const fields = await tx.select({ name: F.name }).from(F).where(and(eq(F.userId, userId), isNull(F.deletedAt)));
      if (fields.length >= 10) throw new ContactAutomationError("All 10 custom field slots are in use. Delete an unused field in Contacts before creating this mapping.");
      const base = mappedFieldName(event.title, question!.label); let name = base, suffix = 2;
      while (fields.some(field => field.name.toLowerCase() === name.toLowerCase())) { const end = ` (${suffix++})`; name = base.slice(0, 100 - end.length) + end; }
      await tx.insert(F).values({ ...EMPTY_FIELD, id: request.fieldId, userId, name, type: "invitee_question", eventTypeId, questionId });
    }
    const saved = { userId, eventTypeId, fieldId, questionId, enabled: request.enabled, legacyConflict: request.action === "toggle" ? current.legacyConflict : false, version: current.version + 1, deletedAt: null };
    await tx.insert(A).values(saved).onConflictDoUpdate({ target: [A.userId, A.eventTypeId], set: saved });
    return state(tx, userId, eventTypeId);
  });
}
export async function deleteContactQuestionAutomation(userId: string, eventTypeId: string, version: number) {
  const db = await getDb(); await db.transaction(async (tx: ContactDB) => {
    await contactAutomationEvent(tx, userId, eventTypeId, true); await lockContactOwner(tx, userId); const current = await read(tx, userId, eventTypeId);
    if (!current.configured && current.version === version + 1) return;
    if (!current.configured || current.version !== version) throw new ContactAutomationError("This automation changed elsewhere. Reload before deleting.");
    await tx.update(A).set({ enabled: false, deletedAt: new Date(), version: version + 1 }).where(owned(userId, eventTypeId));
  });
}
// Only the shared receipt claimant calls this, using persisted booking answers.
export async function applyContactQuestionAutomation(db: ContactDB, booking: { hostId: string; eventTypeId: string; answers: Record<string, string> }, contactId: string) {
  const [row] = await db.select({ automation: A, field: F, questions: E.questions }).from(A).innerJoin(F, eq(F.id, A.fieldId)).innerJoin(E, eq(E.id, A.eventTypeId))
    .where(and(owned(booking.hostId, booking.eventTypeId), eq(A.enabled, true), eq(A.legacyConflict, false), isNull(A.deletedAt), eq(F.userId, booking.hostId), isNull(F.deletedAt), isNull(E.deletedAt)));
  if (!row || row.field.type !== "invitee_question" || row.field.eventTypeId !== booking.eventTypeId || row.field.questionId !== row.automation.questionId || !row.questions.some(question => question.id === row.automation.questionId)) return;
  const answer = booking.answers[row.automation.questionId!]?.trim(); if (!answer) return;
  // Ignore invalid legacy answers instead of breaking an otherwise valid booking.
  let value; try { value = normalizeFieldValue(ContactFieldData.parse(row.field), answer); } catch { return; }
  const [contact] = await db.select({ id: C.id }).from(C).where(and(eq(C.id, contactId), eq(C.userId, booking.hostId), isNull(C.deletedAt))); if (!contact) return;
  const [current] = await db.select().from(V).where(and(eq(V.contactId, contactId), eq(V.fieldId, row.field.id))); if (current?.value.data === value) return;
  await db.insert(V).values({ contactId, fieldId: row.field.id, value: { data: value! } }).onConflictDoUpdate({ target: [V.contactId, V.fieldId], set: { value: { data: value! } } });
  await db.update(C).set({ version: sql`${C.version} + 1`, updatedAt: new Date() }).where(eq(C.id, contactId));
}
