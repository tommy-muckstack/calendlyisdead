import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { lockContactOwner, type ContactDB } from "./contact-store";
import { CONTACT_LABELS, ContactFields, EMPTY_CONTACT, type ContactDraft } from "./contact-validation";
import { listContactFields } from "./contact-custom-fields";
import { normalizeFieldValue, type FieldValueType } from "./contact-field-validation";
import { csvLine, parseContactCSV } from "./contact-csv";
import { ExportRequest, ExportResult, ImportRequest, ImportResult, type ExportInput, type ImportInput, type TransferResult } from "./contact-transfer-validation";
import { linkContactMeetings } from "./contacts";
import { sendMail } from "./email";
import { BP } from "./basepath";
import { contactScopeQuery } from "./contact-query";
const { contacts: C, contactFieldValues: V, contactImports: I, contactExports: X } = schema;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const coreKeys = Object.keys(CONTACT_LABELS) as (keyof ContactDraft)[];
export class ContactTransferError extends Error { constructor(message: string, public status = 400) { super(message); } }
type Plan = { outcome: TransferResult["rows"][number]; fields: ContactDraft | null; values: Record<string, FieldValueType> };

export async function importContacts(userId: string, input: ImportInput): Promise<TransferResult> {
  const request = ImportRequest.parse(input), { preview: expected, ...payload } = request, requestHash = hash(payload);
  let csv: string[][]; try { csv = parseContactCSV(request.csv); } catch (error) { throw new ContactTransferError((error as Error).message); }
  if (csv[0].length !== request.mapping.length) throw new ContactTransferError("Map every CSV column or exclude it.");
  const db = await getDb(); return db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId);
    const [receipt] = await tx.select().from(I).where(and(eq(I.userId, userId), eq(I.id, request.id)));
    if (receipt) { if (receipt.requestHash !== requestHash) throw new ContactTransferError("This import was already completed with different settings. Start a new import.", 409); return ImportResult.parse(receipt.result); }
    const definitions = (await listContactFields(userId, tx)).filter(field => request.mapping.includes(field.id));
    if (request.mapping.some(key => key && !coreKeys.includes(key as keyof ContactDraft) && !definitions.some(field => field.id === key))) throw new ContactTransferError("A mapped field is no longer available. Review your mapping.", 409);
    const emails = csv.slice(1).map(row => row[request.mapping.indexOf("email")].trim().toLowerCase());
    const current: (typeof C.$inferSelect)[] = await tx.select().from(C).where(and(eq(C.userId, userId), isNull(C.deletedAt), inArray(C.email, emails))).orderBy(asc(C.id));
    const custom: (typeof V.$inferSelect)[] = current.length && definitions.length ? await tx.select().from(V).where(and(inArray(V.contactId, current.map(c => c.id)), inArray(V.fieldId, definitions.map(f => f.id)))) : [];
    const preview = hash({ requestHash, current: current.map(c => [c.id, c.version]), fields: definitions.map(f => [f.id, f.version]) });
    if (expected && expected !== preview) throw new ContactTransferError("Contacts or fields changed after your review. Review the import again before applying it.", 409);
    const seen = new Set<string>(), plans: Plan[] = [];
    for (const [index, row] of csv.slice(1).entries()) {
      const outcome: Plan["outcome"] = { row: index + 2, status: "skipped", contactId: null, issues: [] };
      const fields = { ...EMPTY_CONTACT }, values: Record<string, FieldValueType> = {};
      for (const key of coreKeys) { const column = request.mapping.indexOf(key); if (column >= 0) fields[key] = row[column]; }
      const parsed = ContactFields.safeParse(fields);
      if (!parsed.success) { outcome.issues = parsed.error.issues.map(issue => `${CONTACT_LABELS[issue.path[0] as keyof ContactDraft]}: ${issue.message}`); plans.push({ outcome, fields: null, values }); continue; }
      const existing = current.find(contact => contact.email === parsed.data.email);
      if (seen.has(parsed.data.email)) outcome.issues.push("Repeated email address in this file.");
      else if (existing && request.policy === "skip") outcome.issues.push("Existing contact skipped by your duplicate preference.");
      seen.add(parsed.data.email);
      if (outcome.issues.length) { plans.push({ outcome, fields: null, values }); continue; }
      const merged = { ...parsed.data };
      if (existing) for (const key of coreKeys) if (!request.mapping.includes(key) || (request.policy === "merge" && existing[key])) merged[key] = existing[key];
      for (const definition of definitions) {
        const raw = row[request.mapping.indexOf(definition.id)];
        try {
          const value = normalizeFieldValue(definition, definition.type === "multi_select" && raw.trim() ? JSON.parse(raw) : raw);
          const saved = existing ? custom.find(v => v.contactId === existing.id && v.fieldId === definition.id)?.value.data : null;
          if (!existing || request.policy === "overwrite" || saved == null) values[definition.id] = value;
        } catch { outcome.issues.push(`${definition.name}: invalid ${definition.type.replaceAll("_", " ")} value; field left unchanged.`); }
      }
      outcome.status = existing ? "updated" : "created"; outcome.contactId = existing?.id ?? null;
      if (existing && coreKeys.every(key => merged[key] === existing[key]) && Object.entries(values).every(([id, value]) => JSON.stringify(value) === JSON.stringify(custom.find(v => v.contactId === existing.id && v.fieldId === id)?.value.data ?? null))) outcome.status = "unchanged";
      plans.push({ outcome, fields: merged, values });
    }
    if (expected) {
      for (const plan of plans) {
        if (!plan.fields || plan.outcome.status === "unchanged") continue;
        const id = plan.outcome.contactId ?? randomUUID(); plan.outcome.contactId = id;
        if (plan.outcome.status === "created") await tx.insert(C).values({ ...plan.fields, id, userId, source: "import" });
        else await tx.update(C).set({ ...plan.fields, version: sql`${C.version} + 1`, updatedAt: new Date() }).where(and(eq(C.id, id), eq(C.userId, userId)));
        for (const [fieldId, value] of Object.entries(plan.values)) {
          if (value === null) await tx.delete(V).where(and(eq(V.contactId, id), eq(V.fieldId, fieldId)));
          else await tx.insert(V).values({ contactId: id, fieldId, value: { data: value } }).onConflictDoUpdate({ target: [V.contactId, V.fieldId], set: { value: { data: value } } });
        }
        await linkContactMeetings(tx, userId, id);
      }
    }
    const result: TransferResult = { id: request.id, preview, committed: !!expected, rows: plans.map(p => p.outcome) };
    if (expected) await tx.insert(I).values({ id: request.id, userId, requestHash, result });
    return result;
  });
}

export const contactExportPath = (id: string) => `${BP}/api/contacts/exports/${id}`;
export async function exportContacts(user: { id: string; email: string }, input: ExportInput, now = new Date()) {
  const request = ExportRequest.parse(input), requestHash = hash({ ...request, ids: request.ids ? [...new Set(request.ids)].sort() : undefined }), db = await getDb();
  const snapshot = await db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, user.id);
    const [prior] = await tx.select().from(X).where(and(eq(X.userId, user.id), eq(X.id, request.id)));
    if (prior) {
      if (prior.requestHash !== requestHash) throw new ContactTransferError("This export has a different selection. Start a new export.", 409);
      if (prior.expiresAt <= now) throw new ContactTransferError("This export expired. Start a new export.", 410);
      return { row: prior as typeof X.$inferSelect, created: false };
    }
    await tx.delete(X).where(and(eq(X.userId, user.id), lte(X.expiresAt, now)));
    const scope = request.scope ? (await contactScopeQuery(tx, user.id, request.scope, now)).where : undefined;
    const rows: (typeof C.$inferSelect)[] = await tx.select().from(C).where(and(eq(C.userId, user.id), isNull(C.deletedAt), request.ids ? inArray(C.id, request.ids) : undefined, scope)).orderBy(asc(sql`lower(${C.name})`), asc(C.id)).limit(20001);
    if (request.ids && rows.length !== new Set(request.ids).size) throw new ContactTransferError("Some selected contacts are no longer available. Refresh your selection.", 409);
    if (!rows.length) throw new ContactTransferError("There are no contacts to export.");
    if (rows.length > 20000) throw new ContactTransferError("Export up to 20,000 contacts at a time.");
    const definitions = await listContactFields(user.id, tx);
    // Join ownership on both sides, even for legacy or inconsistent rows.
    const values: (typeof V.$inferSelect)[] = definitions.length ? await tx.select({ contactId: V.contactId, fieldId: V.fieldId, value: V.value }).from(V).innerJoin(C, eq(C.id, V.contactId))
      .where(and(eq(C.userId, user.id), isNull(C.deletedAt), inArray(V.fieldId, definitions.map(f => f.id)), request.ids ? inArray(C.id, request.ids) : undefined)) : [];
    const lookup = new Map(values.map(v => [`${v.contactId}:${v.fieldId}`, v.value.data]));
    let csv = "\uFEFF" + csvLine([...coreKeys.map(key => CONTACT_LABELS[key]), ...definitions.map(field => field.name)]), bytes = Buffer.byteLength(csv);
    for (const contact of rows) {
      const line = csvLine([...coreKeys.map(key => contact[key]), ...definitions.map(field => { const value = lookup.get(`${contact.id}:${field.id}`); return Array.isArray(value) ? JSON.stringify(value) : value ?? ""; })]);
      bytes += Buffer.byteLength(line); if (bytes > 25 * 1024 * 1024) throw new ContactTransferError("This export exceeds 25 MB. Select fewer contacts."); csv += line;
    }
    const [row] = await tx.insert(X).values({ userId: user.id, id: request.id, requestHash, csv, count: rows.length, expiresAt: new Date(now.getTime() + 86400000) }).returning();
    return { row: row as typeof X.$inferSelect, created: true };
  });
  if (snapshot.created) {
    const base = process.env.APP_URL || `http://localhost:3000${BP}`, link = `${base.replace(/\/$/, "")}/api/contacts/exports/${request.id}`;
    const sent = await sendMail({ to: user.email, subject: "Your contact export is ready", text: `Download your ${snapshot.row.count} contacts: ${link}\n\nSign in to your account to download. This link expires at ${snapshot.row.expiresAt.toISOString()} (24 hours).` });
    snapshot.row.email = sent ? "sent" : "unavailable";
    await db.update(X).set({ email: snapshot.row.email }).where(and(eq(X.userId, user.id), eq(X.id, request.id)));
  }
  return ExportResult.parse({ id: snapshot.row.id, count: snapshot.row.count, expiresAt: snapshot.row.expiresAt.toISOString(), email: snapshot.row.email });
}
export async function downloadContactExport(userId: string, id: string, now = new Date()) {
  const db = await getDb(), [row] = await db.select().from(X).where(and(eq(X.userId, userId), eq(X.id, id)));
  if (!row) throw new ContactTransferError("Export not found.", 404);
  if (row.expiresAt <= now) { await db.delete(X).where(and(eq(X.userId, userId), eq(X.id, id))); throw new ContactTransferError("This export expired. Create a new one from Contacts.", 410); }
  return row.csv as string;
}
