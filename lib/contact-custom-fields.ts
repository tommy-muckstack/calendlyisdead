import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { lockContactOwner, type ContactDB } from "./contact-store";
import { ContactFieldData, ContactFieldDraft, ContactValuesData, normalizeFieldValue, type ContactField, type FieldDraft, type FieldSource, type FieldValueType } from "./contact-field-validation";
const { contactFields: F, contactFieldValues: V, contacts: C, contactMeetings: CM, bookings: B, eventTypes: E, eventTypeHosts: H } = schema;
export class CustomFieldError extends Error { constructor(public code: string, public status = 409) { super(code); } }
export async function listContactFields(userId: string, db?: ContactDB): Promise<ContactField[]> {
  db ??= await getDb(); const rows = await db.select().from(F).where(and(eq(F.userId, userId), isNull(F.deletedAt))).orderBy(asc(F.name), asc(F.id));
  return rows.map(row => ContactFieldData.parse(row));
}
export async function contactFieldSources(userId: string, db?: ContactDB): Promise<FieldSource[]> {
  db ??= await getDb(); const rows = await db.select({ id: E.id, title: E.title, questions: E.questions }).from(E)
    .where(and(isNull(E.deletedAt), or(eq(E.userId, userId), sql`EXISTS (SELECT 1 FROM ${H} WHERE ${H.eventTypeId} = ${E.id} AND ${H.userId} = ${userId})`))).orderBy(E.title);
  return rows.filter(row => row.questions.length > 0).map(row => ({ id: row.id, title: row.title, questions: row.questions.map(question => ({ id: question.id, label: question.label })) }));
}
async function validateSource(db: ContactDB, userId: string, fields: FieldDraft) {
  if (fields.type !== "invitee_question") return;
  const source = (await contactFieldSources(userId, db)).find(event => event.id === fields.eventTypeId);
  if (!source?.questions.some(question => question.id === fields.questionId)) throw new CustomFieldError("invalid_source", 400);
}
const same = (a: FieldDraft, b: FieldDraft) => JSON.stringify(ContactFieldDraft.parse(a)) === JSON.stringify(ContactFieldDraft.parse(b));
async function writeValue(db: ContactDB, contactId: string, fieldId: string, value: FieldValueType) {
  if (value === null) await db.delete(V).where(and(eq(V.contactId, contactId), eq(V.fieldId, fieldId)));
  else await db.insert(V).values({ contactId, fieldId, value: { data: value } }).onConflictDoUpdate({ target: [V.contactId, V.fieldId], set: { value: { data: value } } });
}
async function populateQuestion(db: ContactDB, userId: string, field: ContactField) {
  if (field.type !== "invitee_question") return;
  const rows = await db.select({ contactId: C.id, answers: B.answers }).from(C).innerJoin(CM, eq(CM.contactId, C.id)).innerJoin(B, eq(B.uid, CM.bookingUid))
    .where(and(eq(C.userId, userId), isNull(C.deletedAt), eq(B.hostId, userId), eq(B.eventTypeId, field.eventTypeId)))
    .orderBy(desc(B.createdAt), desc(B.uid));
  const seen = new Set<string>();
  for (const row of rows as { contactId: string; answers: Record<string, string> }[]) {
    if (seen.has(row.contactId)) continue;
    const answer = row.answers[field.questionId]; if (!answer?.trim()) continue;
    const value = normalizeFieldValue(field, answer); seen.add(row.contactId);
    await writeValue(db, row.contactId, field.id, value);
    await db.update(C).set({ version: sql`${C.version} + 1`, updatedAt: new Date() }).where(eq(C.id, row.contactId));
  }
}
export async function createContactField(userId: string, id: string, input: FieldDraft) {
  const db = await getDb(), fields = ContactFieldDraft.parse(input);
  return db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId);
    const [retry] = await tx.select().from(F).where(eq(F.id, id));
    if (retry) { if (retry.userId !== userId || retry.deletedAt || !same(retry, fields)) throw new CustomFieldError("creation_conflict"); return ContactFieldData.parse(retry); }
    if ((await listContactFields(userId, tx)).length >= 10) throw new CustomFieldError("field_limit");
    await validateSource(tx, userId, fields);
    const [created] = await tx.insert(F).values({ ...fields, id, userId }).returning(); const result = ContactFieldData.parse(created);
    await populateQuestion(tx, userId, result); return result;
  });
}
export async function updateContactField(userId: string, id: string, version: number, input: FieldDraft) {
  const db = await getDb(), fields = ContactFieldDraft.parse(input);
  return db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId); const [current] = await tx.select().from(F).where(and(eq(F.userId, userId), eq(F.id, id), isNull(F.deletedAt)));
    if (!current) throw new CustomFieldError("not_found", 404);
    if (same(current, fields)) return ContactFieldData.parse(current);
    if (current.version !== version) throw new CustomFieldError("changed");
    const sourceChanged = current.type !== fields.type || current.eventTypeId !== fields.eventTypeId || current.questionId !== fields.questionId;
    if (sourceChanged) await validateSource(tx, userId, fields);
    const values = await tx.select({ contactId: V.contactId, value: V.value }).from(V).innerJoin(C, eq(C.id, V.contactId)).where(and(eq(V.fieldId, id), eq(C.userId, userId), isNull(C.deletedAt)));
    const normalized: { contactId: string; value: FieldValueType }[] = [];
    try { for (const row of values) normalized.push({ contactId: row.contactId, value: normalizeFieldValue(fields, row.value.data) }); }
    catch { throw new CustomFieldError("incompatible_values"); }
    for (const row of normalized) await writeValue(tx, row.contactId, id, row.value);
    const [updated] = await tx.update(F).set({ ...fields, version: version + 1 }).where(eq(F.id, id)).returning(); const result = ContactFieldData.parse(updated);
    if (sourceChanged) await populateQuestion(tx, userId, result); return result;
  });
}
export async function deleteContactField(userId: string, id: string, version: number) {
  const db = await getDb(); await db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId); const [current] = await tx.select().from(F).where(and(eq(F.userId, userId), eq(F.id, id)));
    if (!current) throw new CustomFieldError("not_found", 404); if (current.deletedAt) return;
    if (current.version !== version) throw new CustomFieldError("changed");
    await tx.update(F).set({ deletedAt: new Date(), version: version + 1 }).where(eq(F.id, id));
    await tx.delete(V).where(eq(V.fieldId, id));
  });
}
export async function contactCustomValues(userId: string, contactId: string, db?: ContactDB) {
  db ??= await getDb(); const [contact] = await db.select({ version: C.version }).from(C).where(and(eq(C.userId, userId), eq(C.id, contactId), isNull(C.deletedAt)));
  if (!contact) throw new CustomFieldError("not_found", 404);
  const fields = await listContactFields(userId, db);
  const values = fields.length ? await db.select({ id: V.fieldId, value: V.value }).from(V).where(and(eq(V.contactId, contactId), inArray(V.fieldId, fields.map(field => field.id)))) : [];
  return ContactValuesData.parse({ contactId, version: contact.version, fields, values: Object.fromEntries(values.map(row => [row.id, row.value.data])) });
}
export async function listContactCustomValues(userId: string, contactIds: string[]) {
  if (!contactIds.length) return {} as Record<string, Record<string, FieldValueType>>;
  const db = await getDb(), rows = await db.select({ contactId: V.contactId, fieldId: V.fieldId, value: V.value }).from(V)
    .innerJoin(C, eq(C.id, V.contactId)).innerJoin(F, eq(F.id, V.fieldId))
    .where(and(eq(C.userId, userId), eq(F.userId, userId), isNull(C.deletedAt), isNull(F.deletedAt), inArray(C.id, contactIds)));
  const values: Record<string, Record<string, FieldValueType>> = {};
  for (const row of rows) (values[row.contactId] ??= {})[row.fieldId] = row.value.data;
  return values;
}
export async function saveContactCustomValues(userId: string, contactId: string, version: number, input: Record<string, FieldValueType>, fieldVersions: Record<string, number>) {
  const db = await getDb(); return db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId); const current = await contactCustomValues(userId, contactId, tx), normalized: Record<string, FieldValueType> = {};
    for (const [id, value] of Object.entries(input)) {
      const field = current.fields.find(field => field.id === id); if (!field) throw new CustomFieldError("field_unavailable");
      if (fieldVersions[id] !== field.version) throw new CustomFieldError("changed");
      try { normalized[id] = normalizeFieldValue(field, value); } catch (error) { throw new CustomFieldError(error instanceof Error ? `${field.name}: ${error.message}` : "Invalid field value", 400); }
    }
    if (Object.entries(normalized).every(([id, value]) => JSON.stringify(current.values[id] ?? null) === JSON.stringify(value))) return current;
    if (current.version !== version) throw new CustomFieldError("changed");
    for (const [id, value] of Object.entries(normalized)) await writeValue(tx, contactId, id, value);
    await tx.update(C).set({ version: current.version + 1, updatedAt: new Date() }).where(eq(C.id, contactId));
    return contactCustomValues(userId, contactId, tx);
  });
}
// Caller holds the host lock as part of the booking transaction.
export async function captureContactAnswers(db: ContactDB, userId: string, contactId: string, eventTypeId: string, answers: Record<string, string>, historical = false) {
  const fields = (await listContactFields(userId, db)).filter(field => field.type === "invitee_question" && field.eventTypeId === eventTypeId);
  let changed = false;
  for (const field of fields) {
    const answer = answers[field.questionId]?.trim(); if (!answer) continue;
    const value = normalizeFieldValue(field, answer), [current] = await db.select().from(V).where(and(eq(V.contactId, contactId), eq(V.fieldId, field.id)));
    if (historical && current) continue;
    if (current?.value.data !== value) { await writeValue(db, contactId, field.id, value); changed = true; }
  }
  if (changed) await db.update(C).set({ version: sql`${C.version} + 1`, updatedAt: new Date() }).where(eq(C.id, contactId));
}
export function customFieldFailure(error: unknown) {
  if (error instanceof CustomFieldError) return { error: error.code, status: error.status };
  let detail = error;
  for (let i = 0; i < 5 && detail && typeof detail === "object"; i++) {
    const cause = detail as { code?: string; constraint?: string; constraint_name?: string; cause?: unknown };
    if (cause.code === "23505" && (cause.constraint ?? cause.constraint_name) === "contact_fields_owner_name") return { error: "name_in_use", status: 409 };
    detail = cause.cause;
  }
  return { error: "save_failed", status: 500 };
}
