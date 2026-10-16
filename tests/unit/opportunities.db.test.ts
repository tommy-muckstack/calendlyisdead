import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { EMPTY_OPPORTUNITY, OpportunityFields, type OpportunityDraft } from "../../lib/opportunity-validation";
import { EMPTY_CONTACT } from "../../lib/contact-validation";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
vi.mock("@/auth", () => ({ requireUser: auth }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), service: typeof import("../../lib/opportunities"), contacts: typeof import("../../lib/contacts");
let collection: typeof import("../../app/api/opportunities/route"), item: typeof import("../../app/api/opportunities/[id]/route"), choices: typeof import("../../app/api/opportunities/contact-options/route");
const owner = "demo-user", foreign = "demo-mate";
const request = (method: string, body?: unknown, query = "") => new NextRequest(`http://localhost/api/opportunities${query}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const person = (user = owner, name = "Client") => contacts.createContact(user, crypto.randomUUID(), { ...EMPTY_CONTACT, name, email: `${crypto.randomUUID()}@example.invalid` });
const draft = async (extra: Partial<OpportunityDraft> = {}, user = owner) => ({ ...EMPTY_OPPORTUNITY, name: "Consulting", contactId: (await person(user)).id, ...extra });
const create = async (extra: Partial<OpportunityDraft> = {}, user = owner) => service.createOpportunity(user, crypto.randomUUID(), await draft(extra, user));
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-opportunities-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema; service = await import("../../lib/opportunities"); contacts = await import("../../lib/contacts"); collection = await import("../../app/api/opportunities/route"); item = await import("../../app/api/opportunities/[id]/route"); choices = await import("../../app/api/opportunities/contact-options/route");
});
beforeEach(async () => { await db.delete(schema.opportunities); await db.delete(schema.opportunityDeletions); await db.delete(schema.contacts); auth.mockResolvedValue({ id: owner }); });
afterEach(() => vi.restoreAllMocks());
describe("opportunity records and privacy", () => {
  it("creates all supported fields with exact amounts and an initial stage history", async () => {
    const result = await create({ amount: "+123456789012345.123456", closeDate: "2028-02-29", source: "Referral", notes: "Line 1\nLine 2", currency: "EUR", stage: "proposal_sent" });
    expect(result.opportunity).toMatchObject({ amount: "123456789012345.123456", closeDate: "2028-02-29", source: "Referral", notes: "Line 1\nLine 2", currency: "EUR", stage: "proposal_sent", version: 1 }); expect(result.contact?.name).toBe("Client"); expect(result.history).toHaveLength(1); expect(result.history[0]).toMatchObject({ from: null, to: "proposal_sent" });
  });
  it("allows multiple opportunities for one contact without an account cap", async () => {
    const contact = await person(); for (let index = 0; index < 28; index++) await service.createOpportunity(owner, crypto.randomUUID(), { ...EMPTY_OPPORTUNITY, contactId: contact.id, name: `Deal ${index}` });
    const first = await service.listOpportunities(owner, { q: "", page: 1 }), second = await service.listOpportunities(owner, { q: "", page: 2 }); expect(first.total).toBe(28); expect(first.rows).toHaveLength(25); expect(second.rows).toHaveLength(3); expect(new Set([...first.rows, ...second.rows].map(row => row.opportunity.id)).size).toBe(28);
  });
  it("rejects foreign or unavailable contacts and leaves no partial record", async () => {
    const other = await person(foreign), deleted = await person(); await contacts.deleteContact(owner, deleted.id, 1);
    for (const contactId of [other.id, deleted.id, crypto.randomUUID(), null]) await expect(service.createOpportunity(owner, crypto.randomUUID(), { ...EMPTY_OPPORTUNITY, name: "Invalid", contactId })).rejects.toBeTruthy();
    expect(await db.select().from(schema.opportunities)).toEqual([]); expect(await db.select().from(schema.opportunityMoves)).toEqual([]);
  });
  it("scopes reads, edits, moves and deletion to their owner", async () => {
    const own = await create(); await create({}, foreign); expect((await service.listOpportunities(owner, { q: "", page: 1 })).total).toBe(1);
    await expect(service.getOpportunity(foreign, own.opportunity.id)).rejects.toMatchObject({ status: 404 }); await expect(service.changeOpportunity(foreign, own.opportunity.id, { action: "move", stage: "completed", version: 1 })).rejects.toMatchObject({ status: 404 }); await expect(service.deleteOpportunity(foreign, own.opportunity.id, 1)).rejects.toMatchObject({ status: 404 });
  });
  it("does not leak a corrupt cross-owner contact association", async () => {
    const own = await create(), secret = await person(foreign, "Secret client"); await db.update(schema.opportunities).set({ contactId: secret.id }).where(eq(schema.opportunities.id, own.opportunity.id));
    expect((await service.getOpportunity(owner, own.opportunity.id)).contact).toBeNull(); expect((await service.listOpportunities(owner, { q: "Secret client", page: 1 })).total).toBe(0);
  });
  it("retains opportunities when a contact is deleted and allows replacement", async () => {
    const own = await create(); await contacts.deleteContact(owner, own.contact!.id, 1); expect((await service.getOpportunity(owner, own.opportunity.id)).contact).toBeNull();
    const moved = await service.changeOpportunity(owner, own.opportunity.id, { action: "move", stage: "completed", version: 1 }); expect(moved.opportunity.stage).toBe("completed"); const replacement = await person(owner, "Replacement");
    const edited = await service.changeOpportunity(owner, own.opportunity.id, { ...OpportunityFields.parse(moved.opportunity), contactId: replacement.id, action: "edit", version: 2 }); expect(edited.contact?.name).toBe("Replacement");
    await db.delete(schema.contacts).where(eq(schema.contacts.id, replacement.id)); expect((await service.getOpportunity(owner, own.opportunity.id)).opportunity.contactId).toBeNull(); expect((await service.changeOpportunity(owner, own.opportunity.id, { action: "move", stage: "check_later", version: 3 })).opportunity.stage).toBe("check_later");
  });
  it("searches names and contacts literally and filters by stage/contact", async () => {
    const one = await create({ name: "100% _consulting_", stage: "completed" }), two = await create({ name: "1000 consulting" });
    expect((await service.listOpportunities(owner, { q: "% _", page: 1 })).rows.map(row => row.opportunity.id)).toEqual([one.opportunity.id]); expect((await service.listOpportunities(owner, { q: "", stage: "completed", page: 1 })).total).toBe(1); expect((await service.listOpportunities(owner, { q: "Client", contactId: two.contact!.id, page: 1 })).total).toBe(1);
  });
  it("scopes contact choices and paginates literal search without importing history", async () => {
    await person(foreign, "Hidden"); await person(owner, "100% Client"); await person(owner, "1000 Client"); const result = await service.opportunityContacts(owner, "%", 1); expect(result.rows).toHaveLength(1); expect(result.rows[0].name).toBe("100% Client"); expect((await service.opportunityContacts(owner, "Hidden", 1)).total).toBe(0); expect(await db.select().from(schema.contactSettings)).toEqual([]);
  });
});
describe("stage history, retries and permanent deletion", () => {
  it("confirms exact creation retries and rejects changed/foreign reuse", async () => {
    const fields = await draft(), id = crypto.randomUUID(), first = await service.createOpportunity(owner, id, fields); expect(await service.createOpportunity(owner, id, fields)).toEqual(first); await expect(service.createOpportunity(owner, id, { ...fields, name: "Changed" })).rejects.toMatchObject({ status: 409 }); await expect(service.createOpportunity(foreign, id, await draft({}, foreign))).rejects.toMatchObject({ status: 409 }); expect(first.historyTotal).toBe(1);
  });
  it("records every stage change including moves back and keeps Completed visible", async () => {
    const own = await create(), id = own.opportunity.id; let version = 1;
    for (const stage of ["intro_scheduled", "proposal_sent", "completed", "check_later", "new_lead"] as const) { const next = await service.changeOpportunity(owner, id, { action: "move", stage, version }); expect(next.opportunity.version).toBe(++version); }
    await db.update(schema.opportunityMoves).set({ at: new Date("2026-10-16T10:00:00Z") });
    const result = await service.getOpportunity(owner, id); expect(result.history.map(move => move.to)).toEqual(["new_lead", "check_later", "completed", "proposal_sent", "intro_scheduled", "new_lead"]); expect(result.historyTotal).toBe(6); expect(result.history.some(move => move.to === "completed")).toBe(true); expect((await service.listOpportunities(owner, { q: "", page: 1 })).total).toBe(1);
  });
  it("does not duplicate history for exact retries or field-only changes", async () => {
    const own = await create(), id = own.opportunity.id, patch = { action: "move" as const, stage: "completed" as const, version: 1 }; await service.changeOpportunity(owner, id, patch); await service.changeOpportunity(owner, id, patch);
    const result = await service.changeOpportunity(owner, id, { ...OpportunityFields.parse(own.opportunity), stage: "completed", notes: "Edited", action: "edit", version: 2 }); expect(result.historyTotal).toBe(2); expect(result.opportunity.version).toBe(3);
  });
  it("rejects stale edits, competing stage moves and stale deletion", async () => {
    const own = await create(), id = own.opportunity.id; const results = await Promise.allSettled([service.changeOpportunity(owner, id, { action: "move", stage: "completed", version: 1 }), service.changeOpportunity(owner, id, { action: "move", stage: "check_later", version: 1 })]); expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    await expect(service.changeOpportunity(owner, id, { ...OpportunityFields.parse(own.opportunity), name: "Stale", action: "edit", version: 1 })).rejects.toMatchObject({ status: 409 }); await expect(service.deleteOpportunity(owner, id, 1)).rejects.toMatchObject({ status: 409 }); expect((await service.getOpportunity(owner, id)).historyTotal).toBe(2);
  });
  it("permanently removes opportunity details/history, retains contacts and confirms deletion retries", async () => {
    const own = await create({ notes: "Private note" }); await service.deleteOpportunity(owner, own.opportunity.id, 1); await service.deleteOpportunity(owner, own.opportunity.id, 1);
    expect(await db.select().from(schema.opportunities)).toEqual([]); expect(await db.select().from(schema.opportunityMoves)).toEqual([]); expect(await contacts.getContact(owner, own.contact!.id)).not.toBeNull(); expect(await db.select().from(schema.opportunityDeletions)).toEqual([{ id: own.opportunity.id, userId: owner, version: 1 }]);
    await expect(service.createOpportunity(owner, own.opportunity.id, OpportunityFields.parse(own.opportunity))).rejects.toMatchObject({ status: 409 }); await expect(service.deleteOpportunity(foreign, own.opportunity.id, 1)).rejects.toMatchObject({ status: 404 });
  });
  it("rolls back opportunity creation when its history cannot be recorded", async () => {
    const fields = await draft(), original = db.transaction.bind(db); vi.spyOn(db, "transaction").mockImplementationOnce((callback: (tx: typeof db) => Promise<unknown>) => original(async (tx: typeof db) => { const insert = tx.insert.bind(tx); tx.insert = (table: unknown) => { if (table === schema.opportunityMoves) throw new Error("history unavailable"); return insert(table); }; return callback(tx); })); await expect(service.createOpportunity(owner, crypto.randomUUID(), fields)).rejects.toThrow("history unavailable"); expect(await db.select().from(schema.opportunities)).toEqual([]);
  });
  it("paginates long move history without losing entries", async () => {
    const own = await create(); for (let index = 0; index < 51; index++) await service.changeOpportunity(owner, own.opportunity.id, { action: "move", stage: index % 2 ? "new_lead" : "completed", version: index + 1 }); const a = await service.getOpportunity(owner, own.opportunity.id), b = await service.getOpportunity(owner, own.opportunity.id, 2); expect(a.historyTotal).toBe(52); expect(a.history).toHaveLength(50); expect(b.history).toHaveLength(2); expect(new Set([...a.history, ...b.history].map(move => move.id)).size).toBe(52);
  });
});
describe("opportunity API validation", () => {
  it.each([{ amount: "-1" }, { amount: "1e9" }, { amount: "1234567890123456" }, { amount: "1.0000001" }, { closeDate: "2026-02-29" }, { closeDate: "2026-13-01" }, { currency: "BAD" }, { name: " " }, { stage: "invented" }, { notes: "x".repeat(10001) }, { contactId: null }])("rejects invalid fields without writes", async patch => { const fields = await draft(), response = await collection.POST(request("POST", { ...fields, ...patch, id: crypto.randomUUID() })); expect(response.status).toBe(400); expect(await db.select().from(schema.opportunities)).toEqual([]); });
  it("requires auth for every endpoint and rejects foreign IDs", async () => {
    const own = await create(); auth.mockResolvedValue(null); for (const method of ["GET", "PATCH", "DELETE"] as const) expect((await item[method](request(method), context(own.opportunity.id))).status).toBe(401); expect((await collection.GET(request("GET"))).status).toBe(401); expect((await collection.POST(request("POST"))).status).toBe(401); expect((await choices.GET(request("GET"))).status).toBe(401); auth.mockResolvedValue({ id: foreign }); expect((await item.GET(request("GET"), context(own.opportunity.id))).status).toBe(404);
  });
  it("returns private responses, bounds request bodies and rejects unsupported actions", async () => {
    const fields = await draft(), result = await collection.POST(request("POST", { ...fields, id: crypto.randomUUID() })); expect(result.status).toBe(201); expect(result.headers.get("cache-control")).toContain("no-store"); const id = (await result.json()).opportunity.id;
    for (const patch of [{ action: "move", stage: "completed", version: 0 }, { action: "move", stage: "completed", version: 1, userId: foreign }, { action: "edit", version: 1 }, { action: "reorder", version: 1 }]) expect((await item.PATCH(request("PATCH", patch), context(id))).status).toBe(400);
    expect((await collection.GET(request("GET", undefined, "?stage=bad"))).status).toBe(400); expect((await item.GET(request("GET", undefined, "?historyPage=0"), context(id))).status).toBe(400); expect((await choices.GET(request("GET", undefined, "?page=0"))).status).toBe(400);
    expect((await collection.POST(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400); expect((await collection.POST(new Request("http://localhost", { method: "POST", body: "x".repeat(50001) }))).status).toBe(413); expect((await item.DELETE(request("DELETE", { version: 1 }), context(id))).status).toBe(204);
  });
  it("hides database error details", async () => { const fields = await draft(); vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("secret database")); const response = await collection.POST(request("POST", { ...fields, id: crypto.randomUUID() })); expect(response.status).toBe(500); expect(await response.text()).not.toContain("secret database"); });
});
