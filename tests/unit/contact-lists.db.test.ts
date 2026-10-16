import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { ContactFilters, EMPTY_CONTACT } from "../../lib/contact-validation";
import { EMPTY_FIELD } from "../../lib/contact-field-validation";
import { EMPTY_RULES, ViewCondition, normalizeContactRules, type ContactCondition, type ContactRuleSet } from "../../lib/contact-view-validation";
import { MembershipRequest } from "../../lib/contact-list-validation";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user", email: "host@example.invalid" }) as { id: string; email: string } | null));
vi.mock("@/auth", () => ({ requireUser: auth })); vi.mock("../../lib/email", () => ({ sendMail: vi.fn(async () => false) }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), service: typeof import("../../lib/contact-lists"), contacts: typeof import("../../lib/contacts"), fields: typeof import("../../lib/contact-custom-fields"), transfer: typeof import("../../lib/contact-transfer");
let collection: typeof import("../../app/api/contacts/collections/route"), item: typeof import("../../app/api/contacts/collections/[id]/route"), members: typeof import("../../app/api/contacts/collections/[id]/members/route"), search: typeof import("../../app/api/contacts/route");
const user = "demo-user", now = new Date("2027-03-14T16:00:00Z");
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (method: string, body?: unknown) => new Request("http://localhost", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const condition = (field: string, operator: ContactCondition["operator"], value = "", extra = {}) => ViewCondition.parse({ field, operator, value, ...extra });
const rules = (...conditions: ContactCondition[]): ContactRuleSet => ({ match: "all", conditions });
const person = (extra = {}, owner = user) => contacts.createContact(owner, crypto.randomUUID(), { ...EMPTY_CONTACT, name: "Test", email: `${crypto.randomUUID()}@example.invalid`, ...extra });
const list = (extra = {}, owner = user) => service.createContactCollection(owner, { id: crypto.randomUUID(), name: "Prospects", kind: "list", rules: EMPTY_RULES, ...extra });
const find = (ruleSet: ContactRuleSet, extra = {}, date = now) => contacts.listContacts(user, ContactFilters.parse({ rules: ruleSet, ...extra }), date);
const add = (collectionId: string, ids: string[], version = 1, action: "add" | "remove" = "add") => service.changeContactListMembers(user, collectionId, { id: crypto.randomUUID(), version, action, ids });
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-lists-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  service = await import("../../lib/contact-lists"); contacts = await import("../../lib/contacts"); fields = await import("../../lib/contact-custom-fields"); transfer = await import("../../lib/contact-transfer");
  collection = await import("../../app/api/contacts/collections/route"); item = await import("../../app/api/contacts/collections/[id]/route"); members = await import("../../app/api/contacts/collections/[id]/members/route"); search = await import("../../app/api/contacts/route");
});
beforeEach(async () => {
  await db.delete(schema.contactMembershipReceipts); await db.delete(schema.contactCollections); await db.delete(schema.contacts); await db.delete(schema.contactFields); await db.delete(schema.bookings); await db.delete(schema.contactExports); await db.delete(schema.contactImports);
  await db.update(schema.users).set({ timezone: "America/New_York" }).where(eq(schema.users.id, user));
  await db.insert(schema.contactSettings).values({ userId: user, backfilledAt: now }).onConflictDoUpdate({ target: schema.contactSettings.userId, set: { backfilledAt: now } }); auth.mockResolvedValue({ id: user, email: "host@example.invalid" });
});
afterEach(() => vi.restoreAllMocks());
describe("private contact lists and views", () => {
  it("creates idempotently, distinguishes views and keeps ownership private", async () => {
    const created = await list(); expect(await service.createContactCollection(user, { id: created.id, name: created.name, kind: created.kind, rules: created.rules })).toEqual(created);
    await list({ name: "View", kind: "view", rules: rules(condition("company", "is", "ACME")) }); await list({}, "demo-mate");
    expect(await service.listContactCollections(user)).toHaveLength(2); await expect(service.getContactCollection("demo-mate", created.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.createContactCollection("demo-mate", { id: created.id, name: created.name, kind: created.kind, rules: created.rules })).rejects.toMatchObject({ status: 409 });
  });
  it("enforces unique names per owner and immutable collection kinds", async () => {
    const created = await list(); try { await list({ name: "pRoSpEcTs" }); expect.fail("duplicate accepted"); } catch (error) { expect(service.contactListFailure(error)).toEqual({ error: "You already have a list or view with this name.", status: 409 }); }
    await expect(service.updateContactCollection(user, created.id, { name: "View", kind: "view", rules: EMPTY_RULES, version: 1 })).rejects.toMatchObject({ status: 400 });
  });
  it("renames and saves filters with conflicts and exact retry confirmation", async () => {
    const created = await list({ kind: "view" }), input = { name: "VIPs", kind: "view" as const, rules: rules(condition("company", "is", "ACME")), version: 1 };
    const updated = await service.updateContactCollection(user, created.id, input); expect(updated.version).toBe(2); expect(await service.updateContactCollection(user, created.id, input)).toEqual(updated);
    await expect(service.updateContactCollection(user, created.id, { ...input, name: "Stale" })).rejects.toMatchObject({ status: 409 });
  });
  it("deduplicates membership, removes selected members and retains contact history on list deletion", async () => {
    const a = await person(), b = await person(), created = await list(); expect(await add(created.id, [a.id, b.id])).toMatchObject({ changedCount: 2, selectedCount: 2, version: 2 });
    expect(await add(created.id, [a.id], 2)).toMatchObject({ changedCount: 0, version: 2 }); expect(await add(created.id, [a.id], 2, "remove")).toMatchObject({ changedCount: 1, version: 3 });
    expect((await contacts.listContacts(user, ContactFilters.parse({ collection: created.id }))).rows.map(row => row.contact.id)).toEqual([b.id]);
    await db.insert(schema.contactNotes).values({ id: crypto.randomUUID(), userId: user, contactId: a.id, title: "Keep me" });
    await service.deleteContactCollection(user, created.id, 3); await service.deleteContactCollection(user, created.id, 3);
    expect(await service.listContactCollections(user)).toEqual([]); expect(await db.select().from(schema.contactListMembers)).toEqual([]); expect(await contacts.getContact(user, a.id)).not.toBeNull(); expect(await db.select().from(schema.contactNotes)).toHaveLength(1);
    await list(); await expect(service.createContactCollection(user, { id: created.id, name: created.name, kind: created.kind, rules: created.rules })).rejects.toMatchObject({ status: 409 });
  });
  it("rejects stale deletion and membership updates without partial changes", async () => {
    const a = await person(), created = await list(); await add(created.id, [a.id]); await expect(service.deleteContactCollection(user, created.id, 1)).rejects.toMatchObject({ status: 409 });
    await expect(add(created.id, [a.id], 1, "remove")).rejects.toMatchObject({ status: 409 }); expect(await db.select().from(schema.contactListMembers)).toHaveLength(1);
  });
  it("does not replay a delayed add after removal, even after the list is deleted", async () => {
    const a = await person(), created = await list(), input = { id: crypto.randomUUID(), version: 1, action: "add" as const, ids: [a.id] };
    const saved = await service.changeContactListMembers(user, created.id, input); await add(created.id, [a.id], 2, "remove");
    expect(await service.changeContactListMembers(user, created.id, input)).toEqual(saved); expect(await db.select().from(schema.contactListMembers)).toEqual([]);
    await service.deleteContactCollection(user, created.id, 3); expect(await service.changeContactListMembers(user, created.id, input)).toEqual(saved);
    await expect(service.changeContactListMembers(user, created.id, { ...input, action: "remove" })).rejects.toMatchObject({ status: 409 });
  });
  it("confirms concurrent retries once and rejects foreign/deleted contacts atomically", async () => {
    const a = await person(), foreign = await person({}, "demo-mate"), deleted = await person(), created = await list(); await contacts.deleteContact(user, deleted.id, 1);
    for (const id of [foreign.id, deleted.id]) await expect(add(created.id, [a.id, id])).rejects.toMatchObject({ status: 409 }); expect(await db.select().from(schema.contactListMembers)).toEqual([]);
    const input = { id: crypto.randomUUID(), version: 1, action: "add" as const, ids: [a.id] }, [first, second] = await Promise.all([service.changeContactListMembers(user, created.id, input), service.changeContactListMembers(user, created.id, input)]); expect(first).toEqual(second); expect(await db.select().from(schema.contactMembershipReceipts)).toHaveLength(1);
  });
  it("rolls back all membership changes if receipt storage fails", async () => {
    const a = await person(), created = await list(), transaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementation(async (callback: (tx: typeof db) => Promise<unknown>) => transaction(async (tx: typeof db) => {
      const insert = tx.insert.bind(tx); vi.spyOn(tx, "insert").mockImplementation(table => { if (table === schema.contactMembershipReceipts) throw new Error("receipt failed"); return insert(table); }); return callback(tx);
    }));
    await expect(add(created.id, [a.id])).rejects.toThrow("receipt failed"); expect(await db.select().from(schema.contactListMembers)).toEqual([]); expect((await service.getContactCollection(user, created.id)).version).toBe(1);
  });
  it("selects matching contacts across pages and keeps other lists isolated", async () => {
    const people = Array.from({ length: 30 }, (_, i) => ({ id: crypto.randomUUID(), userId: user, name: `Match ${i}`, email: `p${i}@example.invalid`, company: "Match" })); await db.insert(schema.contacts).values(people); await person({ company: "Other" }); await person({ company: "Match" }, "demo-mate");
    const created = await list(), source = await list({ name: "Matching", kind: "view", rules: rules(condition("company", "is", "Match")) });
    expect((await contacts.listContacts(user, ContactFilters.parse({ collection: source.id }))).rows).toHaveLength(25);
    expect(await service.changeContactListMembers(user, created.id, { id: crypto.randomUUID(), version: 1, action: "add", scope: { collectionId: source.id, collectionVersion: 1, q: "" } })).toMatchObject({ selectedCount: 30, changedCount: 30 });
    expect((await contacts.listContacts(user, ContactFilters.parse({ collection: created.id }))).total).toBe(30);
    await service.updateContactCollection(user, source.id, { name: "Matching", kind: "view", rules: EMPTY_RULES, version: 1 });
    await expect(service.changeContactListMembers(user, created.id, { id: crypto.randomUUID(), version: 2, action: "remove", scope: { collectionId: source.id, collectionVersion: 1, q: "" } })).rejects.toMatchObject({ status: 409 });
  });
  it("never widens a missing, foreign or invalid saved view to all contacts", async () => {
    await person(); const foreign = await list({}, "demo-mate");
    for (const id of [crypto.randomUUID(), foreign.id]) await expect(contacts.listContacts(user, ContactFilters.parse({ collection: id }))).rejects.toMatchObject({ status: 404 });
    const created = await list({ kind: "view" }); await expect(add(created.id, [(await person()).id])).rejects.toMatchObject({ status: 400 });
  });
});
describe("contact filter semantics", () => {
  it("combines all/any conditions without escaping owner or active-record scope", async () => {
    const a = await person({ name: "Alice", company: "ACME" }), b = await person({ name: "Bob", company: "ACME" }); await person({ name: "Alice", company: "Other" }, "demo-mate"); const deleted = await person({ name: "Alice", company: "Other" }); await contacts.deleteContact(user, deleted.id, 1);
    const both = rules(condition("name", "is", "ALICE"), condition("company", "contains", "acme")); expect((await find(both)).rows.map(row => row.contact.id)).toEqual([a.id]); expect((await find({ ...both, match: "any" })).total).toBe(2);
    expect((await find(EMPTY_RULES, { q: "Bob" })).rows.map(row => row.contact.id)).toEqual([b.id]);
  });
  it("treats percent, underscore, slash and SQL-looking text literally", async () => {
    const literal = "%_\\' OR true --"; const match = await person({ company: literal }); await person({ company: "Any text" });
    expect((await find(rules(condition("company", "contains", literal)))).rows.map(row => row.contact.id)).toEqual([match.id]);
    expect((await find(EMPTY_RULES, { q: literal })).total).toBe(1);
  });
  it.each(["phone", "company", "jobTitle", "city", "state", "country", "timezone"])("matches blank %s and literal values", async field => {
    const value = field === "timezone" ? "Europe/Paris" : "Example", match = await person({ [field]: value }); await person();
    expect((await find(rules(condition(field, "is", value)))).rows.map(row => row.contact.id)).toEqual([match.id]); expect((await find(rules(condition(field, "blank")))).total).toBe(1);
  });
  it("supports phone prefixes while preventing unsupported operator/field combinations", async () => {
    await person({ phone: "+44 123" }); await person({ phone: "+1 444" }); expect((await find(rules(condition("phone", "starts_with", "+44")))).total).toBe(1);
    for (const rule of [condition("company", "gt", "1"), condition("timezone", "contains", "Paris"), condition("createdAt", "blank"), condition("name", "is", "")]) await expect(find(rules(rule))).rejects.toMatchObject({ status: 400 });
  });
  it("records manual/import/booking provenance without guessing unknown legacy sources", async () => {
    const manual = await person(); await db.insert(schema.contacts).values({ id: crypto.randomUUID(), userId: user, name: "Legacy", email: "legacy@example.invalid" });
    const input = { id: crypto.randomUUID(), csv: "Name,Email\nImported,imported@example.invalid", mapping: ["name", "email"], policy: "merge" as const }, preview = await transfer.importContacts(user, input); await transfer.importContacts(user, { ...input, preview: preview.preview });
    const bookingId = crypto.randomUUID(); await db.insert(schema.bookings).values({ uid: bookingId, eventTypeId: "demo-30", hostId: user, inviteeName: "Booked", inviteeEmail: "booked@example.invalid", inviteeTz: "UTC", start: now, end: new Date(+now + 1800000) });
    const automatic = await import("../../lib/automatic-contacts"); await automatic.recordBookingContact(db, { hostId: user, uid: bookingId, eventTypeId: "demo-30", inviteeName: "Booked", inviteeEmail: "booked@example.invalid" });
    for (const source of ["manual", "import", "booking"]) expect((await find(rules(condition("source", "is", source)))).total).toBe(1);
    expect((await find(rules(condition("source", "blank")))).rows[0].contact.name).toBe("Legacy"); await contacts.updateContact(user, manual.id, 1, { ...manual, company: "Changed" }); expect((await contacts.getContact(user, manual.id))?.source).toBe("manual");
  });
  it("uses inclusive local dates over the spring DST boundary and reevaluates relative views", async () => {
    const dates = ["2027-03-14T04:59:59Z", "2027-03-14T05:00:00Z", "2027-03-15T03:59:59Z", "2027-03-15T04:00:00Z"];
    for (const [i, at] of dates.entries()) { const saved = await person({ name: `Date ${i}` }); await db.update(schema.contacts).set({ createdAt: new Date(at) }).where(eq(schema.contacts.id, saved.id)); }
    expect((await find(rules(condition("createdAt", "today")))).total).toBe(2); expect((await find(rules(condition("createdAt", "yesterday")))).total).toBe(1);
    expect((await find(rules(condition("createdAt", "between", "2027-03-14", { to: "2027-03-14" })))).total).toBe(2);
    expect((await find(rules(condition("createdAt", "before", "2027-03-14")))).total).toBe(1); expect((await find(rules(condition("createdAt", "after", "2027-03-14")))).total).toBe(1);
    const view = await list({ kind: "view", rules: rules(condition("createdAt", "today")) }); expect((await contacts.listContacts(user, ContactFilters.parse({ collection: view.id }), now)).total).toBe(2); expect((await contacts.listContacts(user, ContactFilters.parse({ collection: view.id }), new Date("2027-03-15T12:00:00Z"))).total).toBe(1);
    await db.update(schema.users).set({ timezone: "UTC" }).where(eq(schema.users.id, user)); expect((await contacts.listContacts(user, ContactFilters.parse({ collection: view.id }), now)).total).toBe(2);
  });
  it("uses calendar days for relative ranges and excludes blanks from not-within", async () => {
    const dateField = await fields.createContactField(user, crypto.randomUUID(), { ...EMPTY_FIELD, name: "Date", type: "date" });
    for (const value of ["2027-03-12", "2027-03-13", "2027-03-14", "2027-03-15"]) { const saved = await person(); await db.insert(schema.contactFieldValues).values({ contactId: saved.id, fieldId: dateField.id, value: { data: value } }); } await person();
    expect((await find(rules(condition(dateField.id, "within", "", { days: 2 })))).total).toBe(2); expect((await find(rules(condition(dateField.id, "not_within", "", { days: 2 })))).total).toBe(2);
    expect((await find(rules(condition(dateField.id, "within", "", { direction: "future", days: 2 })))).total).toBe(2); expect((await find(rules(condition(dateField.id, "blank")))).total).toBe(1);
  });
  it("compares exact custom decimals and typed tag/multi-select/text values", async () => {
    const personA = await person(), personB = await person();
    const defs = await Promise.all([fields.createContactField(user, crypto.randomUUID(), { ...EMPTY_FIELD, name: "Number", type: "number" }), fields.createContactField(user, crypto.randomUUID(), { ...EMPTY_FIELD, name: "Amount", type: "currency", currency: "USD" }), fields.createContactField(user, crypto.randomUUID(), { ...EMPTY_FIELD, name: "Stage", type: "tag", options: ["New", "Won"] }), fields.createContactField(user, crypto.randomUUID(), { ...EMPTY_FIELD, name: "Tags", type: "multi_select", options: ["Sales", "Help"] }), fields.createContactField(user, crypto.randomUUID(), { ...EMPTY_FIELD, name: "Text" })]);
    const values = ["999999999999999.000001", "12.99", "Won", ["Sales", "Help"], "prefix_%value"];
    await db.insert(schema.contactFieldValues).values(defs.map((field, i) => ({ contactId: personA.id, fieldId: field.id, value: { data: values[i] } })));
    for (const [i, operator, value] of [[0, "gt", "999999999999999"], [1, "lt", "13"], [2, "is", "Won"], [3, "contains", "Sales"], [4, "starts_with", "prefix_%"]] as const) expect((await find(rules(condition(defs[i].id, operator, value)))).rows.map(row => row.contact.id)).toEqual([personA.id]);
    expect((await find(rules(condition(defs[0].id, "is", "+999999999999999.000001")))).total).toBe(1); expect((await find(rules(condition(defs[3].id, "blank")))).rows[0].contact.id).toBe(personB.id);
  });
  it("matches multi-tag values and legacy single tags with the existing is condition", async () => {
    const legacy = await person(), multiple = await person(), empty = await person(), custom = await fields.createContactField(user, crypto.randomUUID(), { ...EMPTY_FIELD, name: "Tags", type: "tag", options: ["A", "B"] });
    await db.insert(schema.contactFieldValues).values([{ contactId: legacy.id, fieldId: custom.id, value: { data: "A" } }, { contactId: multiple.id, fieldId: custom.id, value: { data: ["A", "B"] } }]);
    expect((await find(rules(condition(custom.id, "is", "A")))).total).toBe(2); expect((await find(rules(condition(custom.id, "is", "B")))).rows.map(row => row.contact.id)).toEqual([multiple.id]); expect((await find(rules(condition(custom.id, "blank")))).rows.map(row => row.contact.id)).toEqual([empty.id]);
  });
  it("fails closed for removed, foreign and incompatible custom fields", async () => {
    const custom = await fields.createContactField(user, crypto.randomUUID(), { ...EMPTY_FIELD, name: "Field" }), foreign = await fields.createContactField("demo-mate", crypto.randomUUID(), { ...EMPTY_FIELD, name: "Foreign" }); await person();
    const saved = await list({ kind: "view", rules: rules(condition(custom.id, "contains", "a")) });
    await expect(find(rules(condition(foreign.id, "contains", "a")))).rejects.toMatchObject({ status: 400 }); await fields.updateContactField(user, custom.id, 1, { ...EMPTY_FIELD, name: "Field", type: "number" });
    await expect(contacts.listContacts(user, ContactFilters.parse({ collection: saved.id }))).rejects.toMatchObject({ status: 400 }); await fields.deleteContactField(user, custom.id, 2);
    await expect(contacts.listContacts(user, ContactFilters.parse({ collection: saved.id }))).rejects.toMatchObject({ status: 400 });
    expect((await contacts.listContacts(user, ContactFilters.parse({ collection: saved.id, rules: EMPTY_RULES }))).total).toBe(1);
  });
  it("uses only noncancelled hosted meetings and retains linked history after email changes", async () => {
    const saved = await person({ email: "history@example.invalid" });
    for (const [hostId, start, status] of [[user, "2027-03-12T14:00:00Z", "confirmed"], [user, "2027-03-13T14:00:00Z", "confirmed"], [user, "2027-03-15T14:00:00Z", "confirmed"], [user, "2027-03-14T18:00:00Z", "cancelled"], ["demo-mate", "2027-03-14T17:00:00Z", "confirmed"]]) {
      const uid = crypto.randomUUID(); await db.insert(schema.bookings).values({ uid, eventTypeId: "demo-30", hostId, start: new Date(start), end: new Date(Date.parse(start) + 1800000), inviteeName: saved.name, inviteeEmail: saved.email, inviteeTz: "UTC", status }); await db.insert(schema.contactMeetings).values({ contactId: saved.id, bookingUid: uid });
    }
    await contacts.updateContact(user, saved.id, 1, { ...saved, email: "changed@example.invalid" });
    expect((await find(rules(condition("firstMeeting", "is", "2027-03-12")))).total).toBe(1); expect((await find(rules(condition("lastMeeting", "yesterday")))).total).toBe(1); expect((await find(rules(condition("nextMeeting", "is", "2027-03-15")))).total).toBe(1); expect((await find(rules(condition("nextMeeting", "today")))).total).toBe(0);
  });
  it("validates real dates, ordered ranges, allowed fields and condition bounds", () => {
    for (const value of ["2027-02-29", "2027-13-01", "2027-00-01"]) expect(() => normalizeContactRules(rules(condition("createdAt", "is", value)), [])).toThrow();
    expect(() => normalizeContactRules(rules(condition("createdAt", "between", "2027-03-15", { to: "2027-03-14" })), [])).toThrow();
    for (const raw of [{ rules: "not-json" }, { rules: { match: "all", conditions: Array(21).fill(condition("name", "is", "a")) } }, { rules: { match: "all", conditions: [{ field: "userId", operator: "is", value: "other" }] } }]) expect(ContactFilters.safeParse(raw).success).toBe(false);
    expect(MembershipRequest.safeParse({ id: crypto.randomUUID(), version: 1, action: "add", ids: [], scope: { q: "" } }).success).toBe(false);
  });
  it("includes both repeated fall-back hours and excludes the next local day", async () => {
    for (const at of ["2027-11-07T05:30:00Z", "2027-11-07T06:30:00Z", "2027-11-08T05:00:00Z"]) { const saved = await person(); await db.update(schema.contacts).set({ createdAt: new Date(at) }).where(eq(schema.contacts.id, saved.id)); }
    expect((await find(rules(condition("createdAt", "today")), {}, new Date("2027-11-07T18:00:00Z"))).total).toBe(2);
  });
  it("matches blank meeting dates and removes contacts dynamically when view conditions stop matching", async () => {
    const saved = await person({ company: "ACME" }), view = await list({ kind: "view", rules: rules(condition("company", "is", "ACME"), condition("nextMeeting", "blank")) });
    expect((await contacts.listContacts(user, ContactFilters.parse({ collection: view.id }), now)).total).toBe(1);
    await contacts.updateContact(user, saved.id, 1, { ...saved, company: "Other" }); expect((await contacts.listContacts(user, ContactFilters.parse({ collection: view.id }), now)).total).toBe(0);
  });
});
describe("filtered export and authenticated routes", () => {
  it("exports a private collection snapshot and preserves the retry after membership changes", async () => {
    const a = await person({ name: "Included" }), b = await person({ name: "Excluded" }), created = await list(); await add(created.id, [a.id]);
    const input = { id: crypto.randomUUID(), all: true as const, scope: { collectionId: created.id, collectionVersion: 2, q: "" } }, owner = { id: user, email: "host@example.invalid" }, saved = await transfer.exportContacts(owner, input, now);
    expect(saved.count).toBe(1); const csv = await transfer.downloadContactExport(user, input.id, now); expect(csv).toContain(a.email); expect(csv).not.toContain(b.email);
    await add(created.id, [b.id], 2); expect(await transfer.exportContacts(owner, input, now)).toEqual(saved); await expect(transfer.exportContacts(owner, { ...input, id: crypto.randomUUID() }, now)).rejects.toMatchObject({ status: 409 });
  });
  it("checks auth, malformed requests, owner boundaries and no-store reads", async () => {
    auth.mockResolvedValue(null); expect((await collection.GET()).status).toBe(401); expect((await collection.POST(request("POST", {}))).status).toBe(401); expect((await item.GET(request("GET"), context(crypto.randomUUID()))).status).toBe(401); expect((await members.POST(request("POST", {}), context(crypto.randomUUID()))).status).toBe(401);
    auth.mockResolvedValue({ id: user, email: "host@example.invalid" }); expect((await collection.POST(request("POST", { kind: "list" }))).status).toBe(400);
    const foreign = await list({}, "demo-mate"); expect((await item.GET(request("GET"), context(foreign.id))).status).toBe(404); expect((await item.DELETE(request("DELETE", { version: 1 }), context(foreign.id))).status).toBe(404);
    const id = crypto.randomUUID(), response = await collection.POST(request("POST", { id, name: "Route list", kind: "list", rules: EMPTY_RULES })); expect(response.status).toBe(201); expect((await item.GET(request("GET"), context(id))).headers.get("cache-control")).toContain("no-store");
    const personA = await person(); expect((await members.POST(request("POST", { id: crypto.randomUUID(), version: 1, action: "add", ids: [personA.id] }), context(id))).status).toBe(200);
    const result = await search.GET(new NextRequest(`http://localhost/api/contacts?collection=${id}`)); expect(result.status).toBe(200); expect((await result.json()).total).toBe(1);
    const missing = await search.GET(new NextRequest(`http://localhost/api/contacts?collection=${foreign.id}`)); expect(missing.status).toBe(404);
  });
});
