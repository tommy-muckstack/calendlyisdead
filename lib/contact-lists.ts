import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { lockContactOwner, type ContactDB } from "./contact-store";
import { listContactFields } from "./contact-custom-fields";
import { normalizeContactRules } from "./contact-view-validation";
import { CollectionData, CollectionFields, CreateCollection, UpdateCollection, MembershipRequest, MembershipResult, type ContactCollection, type MembershipInput } from "./contact-list-validation";
import { ContactListError, contactScopeQuery, readContactCollection } from "./contact-query";
const { contactCollections: L, contactListMembers: M, contactMembershipReceipts: R, contacts: C } = schema;
const owned = (userId: string, id: string) => and(eq(L.userId, userId), eq(L.id, id));
const same = (left: Pick<ContactCollection, "name" | "kind" | "rules">, right: Pick<ContactCollection, "name" | "kind" | "rules">) => left.name === right.name && left.kind === right.kind && JSON.stringify(left.rules) === JSON.stringify(right.rules);
async function normalized(db: ContactDB, userId: string, input: unknown) {
  const fields = CollectionFields.parse(input);
  try { return { ...fields, rules: normalizeContactRules(fields.rules, await listContactFields(userId, db)) }; }
  catch (error) { throw new ContactListError((error as Error).message, 400); }
}
export async function listContactCollections(userId: string) {
  const db = await getDb(), rows = await db.select().from(L).where(and(eq(L.userId, userId), isNull(L.deletedAt))).orderBy(asc(sql`lower(${L.name})`), asc(L.id));
  return rows.map(row => CollectionData.parse(row));
}
export async function getContactCollection(userId: string, id: string) { return readContactCollection(await getDb(), userId, id); }
export async function createContactCollection(userId: string, input: ReturnType<typeof CreateCollection.parse>) {
  const request = CreateCollection.parse(input), db = await getDb();
  return db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId); const { id, ...rest } = request, fields = await normalized(tx, userId, rest);
    const [existing] = await tx.select().from(L).where(eq(L.id, id));
    if (existing) {
      if (existing.userId !== userId || existing.deletedAt || !same(CollectionData.parse(existing), fields)) throw new ContactListError("This creation could not be confirmed. Close this editor and refresh the lists.");
      return CollectionData.parse(existing);
    }
    const [created] = await tx.insert(L).values({ ...fields, id, userId }).returning(); return CollectionData.parse(created);
  });
}
export async function updateContactCollection(userId: string, id: string, input: ReturnType<typeof UpdateCollection.parse>) {
  const request = UpdateCollection.parse(input), db = await getDb();
  return db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId); const current = await readContactCollection(tx, userId, id);
    const { version, ...rest } = request, fields = await normalized(tx, userId, rest);
    if (current.kind !== fields.kind) throw new ContactListError("A list cannot become a view, or a view become a list.", 400);
    if (same(current, fields)) return current;
    if (current.version !== version) throw new ContactListError("This list or view changed. Reload it before saving.");
    const [saved] = await tx.update(L).set({ ...fields, version: current.version + 1 }).where(owned(userId, id)).returning(); return CollectionData.parse(saved);
  });
}
export async function deleteContactCollection(userId: string, id: string, version: number) {
  const db = await getDb(); await db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId); const [current] = await tx.select().from(L).where(owned(userId, id));
    if (!current) throw new ContactListError("This list or view is no longer available.", 404);
    if (current.deletedAt && current.version === version + 1) return;
    if (current.deletedAt || current.version !== version) throw new ContactListError("This list or view changed. Reload it before deleting.");
    await tx.delete(M).where(eq(M.collectionId, id));
    await tx.update(L).set({ deletedAt: new Date(), version: version + 1 }).where(owned(userId, id));
  });
}
export async function changeContactListMembers(userId: string, collectionId: string, input: MembershipInput, now = new Date()) {
  const request = MembershipRequest.parse(input), db = await getDb();
  const requestHash = createHash("sha256").update(JSON.stringify({ collectionId, ...request, ids: request.ids ? [...request.ids].sort() : undefined })).digest("hex");
  return db.transaction(async (tx: ContactDB) => {
    await lockContactOwner(tx, userId);
    const [prior] = await tx.select().from(R).where(and(eq(R.userId, userId), eq(R.id, request.id)));
    if (prior) {
      if (prior.requestHash !== requestHash) throw new ContactListError("This selection was already used for a different change. Start a new selection.");
      return MembershipResult.parse(prior.result);
    }
    const target = await readContactCollection(tx, userId, collectionId);
    if (target.kind !== "list") throw new ContactListError("Saved views update from their filters. Choose a manual list.", 400);
    if (target.version !== request.version) throw new ContactListError("This list changed. Reload it before changing its members.");
    const where = request.ids ? and(eq(C.userId, userId), isNull(C.deletedAt), inArray(C.id, request.ids)) : (await contactScopeQuery(tx, userId, request.scope!, now)).where;
    const rows: { id: string }[] = await tx.select({ id: C.id }).from(C).where(where).orderBy(asc(C.id)).limit(20001);
    if (request.ids && rows.length !== request.ids.length) throw new ContactListError("Some selected contacts are no longer available. Refresh your selection.");
    if (!rows.length) throw new ContactListError("There are no matching contacts. Refresh your selection.");
    if (rows.length > 20000) throw new ContactListError("Select up to 20,000 contacts at a time.", 400);
    let changedCount = 0;
    // Bound parameter counts for large selections; the owner transaction keeps batches atomic.
    for (let offset = 0; offset < rows.length; offset += 500) {
      const ids = rows.slice(offset, offset + 500).map(row => row.id);
      const changed = request.action === "add" ? await tx.insert(M).values(ids.map(contactId => ({ collectionId, contactId }))).onConflictDoNothing().returning({ id: M.contactId })
        : await tx.delete(M).where(and(eq(M.collectionId, collectionId), inArray(M.contactId, ids))).returning({ id: M.contactId });
      changedCount += changed.length;
    }
    const version = target.version + (changedCount ? 1 : 0);
    if (changedCount) await tx.update(L).set({ version }).where(owned(userId, collectionId));
    const result = MembershipResult.parse({ id: request.id, collectionId, action: request.action, selectedCount: rows.length, changedCount, version });
    await tx.insert(R).values({ userId, id: request.id, requestHash, result }); return result;
  });
}
export function contactListFailure(error: unknown) {
  if (error instanceof ContactListError) return { error: error.message, status: error.status };
  let cause = error;
  for (let i = 0; i < 5 && cause && typeof cause === "object"; i++) {
    const detail = cause as { code?: string; constraint?: string; constraint_name?: string; cause?: unknown };
    if (detail.code === "23505" && (detail.constraint ?? detail.constraint_name) === "contact_collections_owner_name") return { error: "You already have a list or view with this name.", status: 409 };
    cause = detail.cause;
  }
  return { error: "The change could not be confirmed. Try again.", status: 500 };
}
