import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EMPTY_CONTACT } from "../../lib/contact-validation";
import { EMPTY_FIELD } from "../../lib/contact-field-validation";
import { parseContactCSV } from "../../lib/contact-csv";
import type { ImportInput } from "../../lib/contact-transfer-validation";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user", email: "host@example.invalid" }) as { id: string; email: string } | null));
const mail = vi.hoisted(() => vi.fn<(message: { to: string; subject: string; text: string }) => Promise<boolean>>(async () => false));
vi.mock("@/auth", () => ({ requireUser: auth })); vi.mock("../../lib/email", () => ({ sendMail: mail }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), transfer: typeof import("../../lib/contact-transfer"), contacts: typeof import("../../lib/contacts"), fields: typeof import("../../lib/contact-custom-fields");
let importer: typeof import("../../app/api/contacts/import/route"), exporter: typeof import("../../app/api/contacts/exports/route"), download: typeof import("../../app/api/contacts/exports/[id]/route");
const user = { id: "demo-user", email: "host@example.invalid" };
const payload = (extra = {}): ImportInput => ({ id: crypto.randomUUID(), csv: "Name,Email,Company\nQA,qa@example.invalid,Imported", mapping: ["name", "email", "company"], policy: "merge", ...extra });
const person = (extra = {}, owner = user.id) => contacts.createContact(owner, crypto.randomUUID(), { ...EMPTY_CONTACT, name: "Existing", email: "qa@example.invalid", ...extra });
const request = (body: unknown) => new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
const importAll = async (input = payload()) => { const preview = await transfer.importContacts(user.id, input); return transfer.importContacts(user.id, { ...input, preview: preview.preview }); };
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-csv-")), "db")); vi.stubEnv("APP_URL", "https://example.invalid/calendlyisdead");
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  transfer = await import("../../lib/contact-transfer"); contacts = await import("../../lib/contacts"); fields = await import("../../lib/contact-custom-fields");
  importer = await import("../../app/api/contacts/import/route"); exporter = await import("../../app/api/contacts/exports/route"); download = await import("../../app/api/contacts/exports/[id]/route");
});
beforeEach(async () => {
  await db.delete(schema.contactImports); await db.delete(schema.contactExports); await db.delete(schema.contactFieldValues); await db.delete(schema.contactFields); await db.delete(schema.contacts);
  auth.mockResolvedValue(user); mail.mockClear(); mail.mockResolvedValue(false);
});
afterEach(() => vi.restoreAllMocks());
describe("CSV imports", () => {
  it("previews without writes and confirms once despite concurrent retries and later edits", async () => {
    const input = payload(), preview = await transfer.importContacts(user.id, input); expect(preview.committed).toBe(false); expect(await db.select().from(schema.contacts)).toEqual([]);
    const [a, b] = await Promise.all([transfer.importContacts(user.id, { ...input, preview: preview.preview }), transfer.importContacts(user.id, { ...input, preview: preview.preview })]); expect(a).toEqual(b); expect(a.committed).toBe(true);
    const id = a.rows[0].contactId!; await contacts.updateContact(user.id, id, 1, { ...EMPTY_CONTACT, name: "Edited later", email: "qa@example.invalid" });
    expect(await transfer.importContacts(user.id, { ...input, preview: preview.preview })).toEqual(a); expect((await contacts.getContact(user.id, id))?.name).toBe("Edited later"); expect(await db.select().from(schema.contacts)).toHaveLength(1);
    await expect(transfer.importContacts(user.id, { ...input, policy: "overwrite", preview: preview.preview })).rejects.toMatchObject({ status: 409 });
  });
  it.each(["merge", "overwrite", "skip"] as const)("implements %s duplicates without changing unmapped data", async policy => {
    const current = await person({ phone: "123", company: "Saved" }), result = await importAll(payload({ policy })), saved = await contacts.getContact(user.id, current.id);
    expect(saved).toMatchObject({ phone: "123", name: policy === "overwrite" ? "QA" : "Existing", company: policy === "overwrite" ? "Imported" : "Saved" });
    expect(result.rows[0].status).toBe(policy === "skip" ? "skipped" : policy === "merge" ? "unchanged" : "updated");
  });
  it("fills blanks on merge and clears mapped blanks on overwrite", async () => {
    const current = await person(); await importAll(); expect((await contacts.getContact(user.id, current.id))?.company).toBe("Imported");
    await importAll(payload({ csv: "Name,Email,Company\nQA,qa@example.invalid,", policy: "overwrite" })); expect((await contacts.getContact(user.id, current.id))?.company).toBe("");
  });
  it("skips malformed records and repeated case-insensitive emails with row-specific reasons", async () => {
    const result = await importAll(payload({ csv: "Name,Email,Company\nQA,QA@EXAMPLE.INVALID,A\nDuplicate,qa@example.invalid,B\nBad,broken,C\n,missing@example.invalid,D\nGood,good@example.invalid,E" }));
    expect(result.rows.map(row => row.status)).toEqual(["created", "skipped", "skipped", "skipped", "created"]); expect(result.rows[1].issues[0]).toContain("Repeated"); expect(result.rows[2].issues[0]).toContain("Email address"); expect(await db.select().from(schema.contacts)).toHaveLength(2);
  });
  it("requires another review when an existing contact changes or a new duplicate appears", async () => {
    const input = payload(), preview = await transfer.importContacts(user.id, input), current = await person();
    await expect(transfer.importContacts(user.id, { ...input, preview: preview.preview })).rejects.toMatchObject({ status: 409 });
    const again = await transfer.importContacts(user.id, input); await contacts.updateContact(user.id, current.id, 1, { ...current, company: "Changed" });
    await expect(transfer.importContacts(user.id, { ...input, preview: again.preview })).rejects.toMatchObject({ status: 409 }); expect(await db.select().from(schema.contactImports)).toEqual([]);
  });
  it("does not cross owners and allows explicit re-creation after deletion", async () => {
    const other = await person({}, "demo-mate"), own = await person(); await contacts.deleteContact(user.id, own.id, 1);
    const result = await importAll(); expect(result.rows[0].contactId).not.toBe(own.id); expect((await contacts.getContact("demo-mate", other.id))?.name).toBe("Existing");
  });
  it("imports typed custom values and reports invalid cells while retaining valid contact fields", async () => {
    const number = await fields.createContactField(user.id, crypto.randomUUID(), { ...EMPTY_FIELD, name: "Budget", type: "number" }), tag = await fields.createContactField(user.id, crypto.randomUUID(), { ...EMPTY_FIELD, name: "Tier", type: "tag", options: ["A"] });
    const result = await importAll(payload({ csv: "Name,Email,Budget,Tier\nQA,qa@example.invalid,123456789012345.123456,Wrong", mapping: ["name", "email", number.id, tag.id] }));
    expect(result.rows[0].status).toBe("created"); expect(result.rows[0].issues).toHaveLength(1); expect((await fields.contactCustomValues(user.id, result.rows[0].contactId!)).values).toEqual({ [number.id]: "123456789012345.123456" });
  });
  it("preserves custom values on merge, replaces on overwrite and clears explicit blanks", async () => {
    const current = await person(), field = await fields.createContactField(user.id, crypto.randomUUID(), { ...EMPTY_FIELD, name: "Text" }); await fields.saveContactCustomValues(user.id, current.id, 1, { [field.id]: "Saved" }, { [field.id]: 1 });
    const input = payload({ csv: "Name,Email,Text\nQA,qa@example.invalid,New", mapping: ["name", "email", field.id] }); await importAll(input); expect((await fields.contactCustomValues(user.id, current.id)).values[field.id]).toBe("Saved");
    await importAll({ ...input, id: crypto.randomUUID(), policy: "overwrite" }); expect((await fields.contactCustomValues(user.id, current.id)).values[field.id]).toBe("New");
    await importAll({ ...input, id: crypto.randomUUID(), policy: "overwrite", csv: "Name,Email,Text\nQA,qa@example.invalid," }); expect((await fields.contactCustomValues(user.id, current.id)).values).toEqual({});
  });
  it("rejects foreign, deleted and changed field definitions without partial writes", async () => {
    const other = await fields.createContactField("demo-mate", crypto.randomUUID(), { ...EMPTY_FIELD, name: "Foreign" });
    await expect(importAll(payload({ mapping: ["name", "email", other.id] }))).rejects.toMatchObject({ status: 409 });
    const field = await fields.createContactField(user.id, crypto.randomUUID(), { ...EMPTY_FIELD, name: "Text" }), input = payload({ mapping: ["name", "email", field.id] }), preview = await transfer.importContacts(user.id, input);
    await fields.updateContactField(user.id, field.id, 1, { ...EMPTY_FIELD, name: "Renamed" }); await expect(transfer.importContacts(user.id, { ...input, preview: preview.preview })).rejects.toMatchObject({ status: 409 });
    await fields.deleteContactField(user.id, field.id, 2); await expect(importAll(input)).rejects.toMatchObject({ status: 409 }); expect(await db.select().from(schema.contacts)).toEqual([]);
  });
  it("rolls back contact writes if saving the import receipt fails", async () => {
    const input = payload(), preview = await transfer.importContacts(user.id, input); const original = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementationOnce((run: (tx: typeof db) => Promise<unknown>) => original(async (tx: typeof db) => { const insert = tx.insert.bind(tx); tx.insert = (table: unknown) => { if (table === schema.contactImports) throw new Error("storage failure"); return insert(table); }; return run(tx); }));
    await expect(transfer.importContacts(user.id, { ...input, preview: preview.preview })).rejects.toThrow("storage failure"); expect(await db.select().from(schema.contacts)).toEqual([]);
  });
});
describe("CSV exports and transfer routes", () => {
  it("exports all owned active records across pages, quoted custom values and no private data", async () => {
    for (let i = 0; i < 27; i++) await person({ name: `Person ${i}`, email: `person${i}@example.invalid` });
    await person({}, "demo-mate"); const deleted = await person({ email: "deleted@example.invalid" }); await contacts.deleteContact(user.id, deleted.id, 1);
    const result = await transfer.exportContacts(user, { id: crypto.randomUUID(), all: true }); expect(result.count).toBe(27); expect(result.email).toBe("unavailable"); const csv = await transfer.downloadContactExport(user.id, result.id); expect(parseContactCSV(csv)).toHaveLength(28); expect(csv).not.toContain("qa@example.invalid"); expect(csv).not.toContain("deleted@example.invalid"); expect(csv).not.toContain("demo-user");
    expect(mail).toHaveBeenCalledOnce(); expect(mail.mock.calls[0][0]).toMatchObject({ to: user.email, text: expect.stringContaining(`https://example.invalid/calendlyisdead/api/contacts/exports/${result.id}`) });
  });
  it("exports only selected contacts, escapes formulas and snapshots custom fields", async () => {
    const selected = await person({ name: '=HYPERLINK("https://example.invalid")' }); await person({ email: "excluded@example.invalid" });
    const field = await fields.createContactField(user.id, crypto.randomUUID(), { ...EMPTY_FIELD, name: "Topics", type: "multi_select", options: ["A", "B"] });
    await fields.saveContactCustomValues(user.id, selected.id, 1, { [field.id]: ["A", "B"] }, { [field.id]: 1 });
    const result = await transfer.exportContacts(user, { id: crypto.randomUUID(), ids: [selected.id] }), csv = await transfer.downloadContactExport(user.id, result.id), parsed = parseContactCSV(csv);
    expect(parsed[1][0]).toBe(`'${selected.name}`); expect(parsed[1].at(-1)).toBe('["A","B"]'); expect(csv).not.toContain("excluded@example.invalid");
    await contacts.deleteContact(user.id, selected.id, 2); await fields.deleteContactField(user.id, field.id, 1); expect(await transfer.downloadContactExport(user.id, result.id)).toBe(csv);
  });
  it("reuses exports without duplicate email and reports provider delivery", async () => {
    await person(); mail.mockResolvedValue(true); const input = { id: crypto.randomUUID(), all: true as const }, first = await transfer.exportContacts(user, input);
    expect(first.email).toBe("sent"); expect(await transfer.exportContacts(user, input)).toEqual(first); expect(mail).toHaveBeenCalledOnce();
    await expect(transfer.exportContacts(user, { id: input.id, ids: [crypto.randomUUID()] })).rejects.toMatchObject({ status: 409 });
  });
  it("requires ownership and expires downloads at exactly 24 hours", async () => {
    await person(); const now = new Date("2026-01-01T00:00:00Z"), result = await transfer.exportContacts(user, { id: crypto.randomUUID(), all: true }, now);
    await expect(transfer.downloadContactExport("demo-mate", result.id, now)).rejects.toMatchObject({ status: 404 });
    expect(await transfer.downloadContactExport(user.id, result.id, new Date("2026-01-01T23:59:59.999Z"))).toContain("Existing");
    await expect(transfer.downloadContactExport(user.id, result.id, new Date("2026-01-02T00:00:00Z"))).rejects.toMatchObject({ status: 410 }); expect(await db.select().from(schema.contactExports)).toEqual([]);
  });
  it("rejects foreign, missing and deleted selections instead of exporting a partial set", async () => {
    const own = await person(), other = await person({}, "demo-mate");
    for (const id of [other.id, crypto.randomUUID()]) await expect(transfer.exportContacts(user, { id: crypto.randomUUID(), ids: [own.id, id] })).rejects.toMatchObject({ status: 409 });
    await contacts.deleteContact(user.id, own.id, 1); await expect(transfer.exportContacts(user, { id: crypto.randomUUID(), ids: [own.id] })).rejects.toMatchObject({ status: 409 }); expect(mail).not.toHaveBeenCalled();
  });
  it("authenticates every endpoint and rejects invalid or oversized bodies", async () => {
    const context = { params: Promise.resolve({ id: crypto.randomUUID() }) };
    auth.mockResolvedValue(null); expect((await importer.POST(request(payload()))).status).toBe(401); expect((await exporter.POST(request({ id: crypto.randomUUID(), all: true }))).status).toBe(401); expect((await download.GET(new Request("http://localhost"), context)).status).toBe(401);
    auth.mockResolvedValue(user); expect((await importer.POST(request({ ...payload(), userId: "demo-mate" }))).status).toBe(400); expect((await importer.POST(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await exporter.POST(new Request("http://localhost", { method: "POST", body: "x".repeat(50001) }))).status).toBe(413);
    expect((await download.GET(new Request("http://localhost"), { params: Promise.resolve({ id: "bad" }) })).status).toBe(404);
  });
  it("serves private attachments and never leaks internal failures", async () => {
    await person(); const exported = await exporter.POST(request({ id: crypto.randomUUID(), all: true })); expect(exported.status).toBe(200); const data = await exported.json();
    const response = await download.GET(new Request("http://localhost"), { params: Promise.resolve({ id: data.id }) }); expect(response.status).toBe(200); expect(response.headers.get("content-disposition")).toContain("attachment"); expect(response.headers.get("cache-control")).toBe("private, no-store");
    vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("secret connection")); const failed = await importer.POST(request(payload())); expect(failed.status).toBe(500); expect(await failed.text()).not.toContain("secret");
  });
});
