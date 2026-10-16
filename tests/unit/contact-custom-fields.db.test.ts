import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { EMPTY_FIELD, normalizeFieldValue, type FieldDraft, type FieldValueType } from "../../lib/contact-field-validation";
import { EMPTY_CONTACT } from "../../lib/contact-validation";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
vi.mock("@/auth", () => ({ requireUser: auth }));
vi.mock("../../lib/calendars", () => ({ externalBusy: async () => ({ busy: [], errors: [] }), writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: async () => true }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), service: typeof import("../../lib/contact-custom-fields");
let contacts: typeof import("../../lib/contacts"), booking: typeof import("../../lib/booking"), automatic: typeof import("../../lib/automatic-contacts");
let collection: typeof import("../../app/api/contact-fields/route"), item: typeof import("../../app/api/contact-fields/[id]/route"), values: typeof import("../../app/api/contacts/[id]/custom-fields/route");
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (method: string, body?: unknown) => new NextRequest("http://localhost/api/contact-fields", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const create = (extra = {}, id = crypto.randomUUID()) => collection.POST(request("POST", { ...EMPTY_FIELD, name: "Custom", ...extra, id }));
const edit = (id: string, version: number, extra = {}) => item.PATCH(request("PATCH", { ...EMPTY_FIELD, name: "Custom", ...extra, version }), context(id));
const remove = (id: string, version = 1) => item.DELETE(request("DELETE", { version }), context(id));
const contact = (user = "demo-user") => contacts.createContact(user, crypto.randomUUID(), { ...EMPTY_CONTACT, name: "Contact QA", email: "qa@example.invalid" });
const loadValues = (id: string) => service.contactCustomValues("demo-user", id);
async function save(id: string, input: Record<string, FieldValueType>, version?: number, fieldVersions?: Record<string, number>) {
  const current = await loadValues(id);
  return values.PATCH(request("PATCH", { version: version ?? current.version, values: input, fieldVersions: fieldVersions ?? Object.fromEntries(current.fields.map(field => [field.id, field.version])) }), context(id));
}
const at = (hour: number) => DateTime.now().toUTC().plus({ weeks: 2 }).startOf("day").plus({ hours: hour }).toISO()!;
const book = (hour: number, answer?: string, extra = {}) => booking.createBooking({ username: "demo", slug: "form", name: "Contact QA", email: "qa@example.invalid", tz: "UTC", start: at(hour), answers: answer ? { purpose: answer } : {}, ...extra });
const linked = { type: "invitee_question", eventTypeId: "form", questionId: "purpose" };
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-contact-fields-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  service = await import("../../lib/contact-custom-fields"); contacts = await import("../../lib/contacts"); booking = await import("../../lib/booking"); automatic = await import("../../lib/automatic-contacts");
  collection = await import("../../app/api/contact-fields/route"); item = await import("../../app/api/contact-fields/[id]/route"); values = await import("../../app/api/contacts/[id]/custom-fields/route");
  await db.update(schema.schedules).set({ timezone: "UTC", weekly: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(day => [day, [{ start: "00:00", end: "24:00" }]])) });
});
beforeEach(async () => {
  await db.delete(schema.contactFieldValues); await db.delete(schema.contactFields); await db.delete(schema.contacts); await db.delete(schema.contactSettings); await db.delete(schema.bookings); await db.delete(schema.eventTypeHosts); await db.delete(schema.eventTypes);
  auth.mockResolvedValue({ id: "demo-user" });
  for (const [id, userId] of [["form", "demo-user"], ["other", "demo-mate"]]) await db.insert(schema.eventTypes).values({ id, userId, slug: id, title: id, minNoticeMin: 0, rangeDays: 60, questions: [{ id: "purpose", label: "Purpose", type: "text", required: false }] });
});
afterEach(() => vi.restoreAllMocks());
describe("contact custom field definitions", () => {
  it.each([{}, { type: "number" }, { type: "currency", currency: "EUR" }, { type: "tag", options: ["A", "B"] }, { type: "date" }, { type: "multi_select", options: ["A", "B"] }, linked])("creates and reads field %j without exposing ownership data", async extra => {
    const response = await create(extra); expect(response.status).toBe(201); const field = await response.json(); expect(field).toMatchObject({ ...extra, name: "Custom", version: 1 }); expect(field).not.toHaveProperty("userId");
    expect((await item.GET(request("GET"), context(field.id))).status).toBe(200);
  });
  it.each([{ name: " " }, { name: "x".repeat(101) }, { type: "code" }, { type: "currency", currency: "ZZZ" }, { type: "tag", options: [] }, { type: "tag", options: ["One", "one"] }, { type: "multi_select", options: [""] }, { type: "invitee_question", eventTypeId: null }, { eventTypeId: "form" }, { userId: "demo-mate" }])("rejects invalid configuration %j", async extra => {
    expect((await create(extra)).status).toBe(400); expect(await service.listContactFields("demo-user")).toEqual([]);
  });
  it("requires authentication and does not expose another owner's fields or values", async () => {
    const field = await (await create()).json(), person = await contact(); auth.mockResolvedValue({ id: "demo-mate" });
    expect((await (await collection.GET()).json()).fields).toEqual([]); expect((await item.GET(request("GET"), context(field.id))).status).toBe(404);
    expect((await edit(field.id, 1)).status).toBe(404); expect((await remove(field.id)).status).toBe(404); expect((await values.GET(request("GET"), context(person.id))).status).toBe(404);
    expect((await values.PATCH(request("PATCH", { version: 1, values: { [field.id]: "x" }, fieldVersions: { [field.id]: 1 } }), context(person.id))).status).toBe(404);
    auth.mockResolvedValue(null); expect((await collection.GET()).status).toBe(401); expect((await create()).status).toBe(401); expect((await item.GET(request("GET"), context(field.id))).status).toBe(401); expect((await edit(field.id, 1)).status).toBe(401); expect((await remove(field.id)).status).toBe(401); expect((await values.GET(request("GET"), context(person.id))).status).toBe(401);
  });
  it("limits question sources to owned or assigned event types", async () => {
    expect((await service.contactFieldSources("demo-user")).map(source => source.id)).toEqual(["form"]);
    expect((await create({ ...linked, eventTypeId: "other" })).status).toBe(400); expect((await create({ ...linked, questionId: "missing" })).status).toBe(400);
    await db.insert(schema.eventTypeHosts).values({ eventTypeId: "other", userId: "demo-user" }); expect((await create({ ...linked, eventTypeId: "other" })).status).toBe(201);
  });
  it("enforces the ten-field limit under competing creates while accepting identical retries", async () => {
    for (let i = 0; i < 9; i++) expect((await create({ name: `Field ${i}` })).status).toBe(201);
    const id = crypto.randomUUID(), results = await Promise.all([create({ name: "Tenth" }, id), create({ name: "Eleventh" })]); expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const fields = await service.listContactFields("demo-user"), last = fields.find(field => field.name === "Tenth") ?? fields.find(field => field.name === "Eleventh")!;
    expect((await create({ name: last.name }, last.id)).status).toBe(201); expect(fields).toHaveLength(10);
    expect((await remove(last.id)).status).toBe(204); expect((await create({ name: "Replacement" })).status).toBe(201);
  });
  it("rejects duplicate names per account and protects idempotency IDs", async () => {
    const field = await (await create()).json(); expect((await create({ name: "CUSTOM" })).status).toBe(409); expect((await create({ name: "Changed" }, field.id)).status).toBe(409);
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await create()).status).toBe(201); expect((await create({}, field.id)).status).toBe(409);
  });
  it("rejects stale definition edits/deletes and confirms exact save retries", async () => {
    const field = await (await create()).json(); expect((await edit(field.id, 1, { name: "Renamed" })).status).toBe(200); expect((await edit(field.id, 1, { name: "Renamed" })).status).toBe(200);
    expect((await edit(field.id, 1, { name: "Stale" })).status).toBe(409); expect((await remove(field.id, 1)).status).toBe(409);
  });
  it("keeps compatible values on type changes and rejects destructive conversions or option removal", async () => {
    const person = await contact(), field = await (await create()).json(); expect((await save(person.id, { [field.id]: "001.200" })).status).toBe(200);
    expect((await edit(field.id, 1, { type: "number" })).status).toBe(200); expect((await loadValues(person.id)).values[field.id]).toBe("1.2");
    expect((await edit(field.id, 2, { type: "date" })).status).toBe(409); expect((await service.listContactFields("demo-user"))[0].type).toBe("number");
    const tag = await (await create({ name: "Tag", type: "tag", options: ["A", "B"] })).json(); await save(person.id, { [tag.id]: "A" }); expect((await edit(tag.id, 1, { name: "Tag", type: "tag", options: ["B"] })).status).toBe(409);
  });
  it("deletes a field and its values without deleting contacts or meetings and supports retry", async () => {
    const meeting = await book(10), people = await db.select().from(schema.contacts), field = await (await create()).json(); await save(people[0].id, { [field.id]: "Saved" });
    expect((await remove(field.id)).status).toBe(204); expect((await remove(field.id)).status).toBe(204); expect((await loadValues(people[0].id)).values).toEqual({});
    expect((await db.select().from(schema.bookings))[0].uid).toBe(meeting.uid); expect(await contacts.getContact("demo-user", people[0].id)).not.toBeNull(); expect((await create({}, field.id)).status).toBe(409);
  });
  it("does not let a deleted contact's hidden values prevent changing a field type", async () => {
    const person = await contact(), field = await (await create()).json(); await save(person.id, { [field.id]: "Not a date" }); await contacts.deleteContact("demo-user", person.id, 2);
    expect((await edit(field.id, 1, { type: "date" })).status).toBe(200); const replacement = await contact(); expect((await loadValues(replacement.id)).values).toEqual({});
  });
  it("returns honest persistence failures and rejects malformed JSON", async () => {
    expect((await collection.POST(new NextRequest("http://localhost", { method: "POST", body: "{" }))).status).toBe(400);
    vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("private details")); const response = await create(); expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: "save_failed" }); expect(await service.listContactFields("demo-user")).toEqual([]);
  });
});
describe("typed custom values and concurrency", () => {
  it.each([
    [{ type: "text" }, "  Notes  ", "Notes"], [{ type: "number" }, "-000.500", "-0.5"], [{ type: "currency", currency: "USD" }, "00012.3400", "12.34"],
    [{ type: "text" }, "true", "true"], [{ type: "text" }, "null", "null"], [{ type: "text" }, "42", "42"], [{ type: "number" }, "123456789012345.123456", "123456789012345.123456"],
    [{ type: "date" }, "2028-02-29", "2028-02-29"], [{ type: "tag", options: ["A", "B"] }, "B", ["B"]], [{ type: "tag", options: ["A", "B"] }, ["B", "A", "A"], ["A", "B"]], [{ type: "multi_select", options: ["A", "B"] }, ["B", "A", "A"], ["A", "B"]],
  ] as [Partial<FieldDraft>, FieldValueType, FieldValueType][])("validates, persists and clears %j", async (extra, input, expected) => {
    const person = await contact(), field = await (await create(extra)).json(); const response = await save(person.id, { [field.id]: input }); expect(response.status).toBe(200); expect((await response.json()).values[field.id]).toEqual(expected);
    expect((await service.listContactCustomValues("demo-user", [person.id]))[person.id][field.id]).toEqual(expected);
    expect((await save(person.id, { [field.id]: null })).status).toBe(200); expect((await loadValues(person.id)).values).toEqual({});
  });
  it.each([["number", "NaN"], ["number", "1e3"], ["number", "1234567890123456"], ["number", "1.1234567"], ["date", "2026-02-29"], ["date", "2026-13-01"]])("rejects invalid %s values without changing saved data", async (type, value) => {
    const person = await contact(), field = await (await create({ type })).json(); expect((await save(person.id, { [field.id]: value })).status).toBe(400); expect((await loadValues(person.id)).values).toEqual({});
  });
  it("rejects undeclared options, foreign field IDs and malformed value maps", async () => {
    const person = await contact(), field = await (await create({ type: "multi_select", options: ["A"] })).json(); expect((await save(person.id, { [field.id]: ["B"] })).status).toBe(400);
    auth.mockResolvedValue({ id: "demo-mate" }); const foreign = await (await create()).json(); auth.mockResolvedValue({ id: "demo-user" }); expect((await save(person.id, { [foreign.id]: "Private" })).status).toBe(409);
    for (const input of [{}, { nope: "x" }, { [field.id]: 42 }]) expect((await values.PATCH(request("PATCH", { version: 1, values: input, fieldVersions: {} }), context(person.id))).status).toBe(400);
  });
  it("rejects stale contact or field versions but accepts an exact lost-response retry", async () => {
    const person = await contact(), field = await (await create()).json(); expect((await save(person.id, { [field.id]: "Saved" }, 1)).status).toBe(200); expect((await save(person.id, { [field.id]: "Saved" }, 1)).status).toBe(200);
    expect((await save(person.id, { [field.id]: "Stale" }, 1)).status).toBe(409); await edit(field.id, 1, { name: "Renamed" });
    expect((await save(person.id, { [field.id]: "New" }, 2, { [field.id]: 1 })).status).toBe(409);
  });
  it("serializes competing value saves and prevents corrupt cross-owner values from leaking in the table", async () => {
    const person = await contact(), field = await (await create()).json(); const results = await Promise.all([save(person.id, { [field.id]: "A" }, 1), save(person.id, { [field.id]: "B" }, 1)]); expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const foreignPerson = await contact("demo-mate"); await db.insert(schema.contactFieldValues).values({ contactId: foreignPerson.id, fieldId: field.id, value: { data: "Private" } });
    expect(await service.listContactCustomValues("demo-user", [foreignPerson.id])).toEqual({}); expect((await service.contactCustomValues("demo-mate", foreignPerson.id)).values).toEqual({});
  });
});
describe("mapped booking answers", () => {
  it("fills the latest existing answer, updates from later bookings and preserves values for absent answers", async () => {
    const first = await book(10, "Old"), second = await book(11, "Recent"); await db.update(schema.bookings).set({ createdAt: new Date("2025-01-01") }).where(eq(schema.bookings.uid, first.uid)); await db.update(schema.bookings).set({ createdAt: new Date("2025-01-02") }).where(eq(schema.bookings.uid, second.uid));
    const [person] = await db.select().from(schema.contacts), field = await (await create(linked)).json(); expect((await loadValues(person.id)).values[field.id]).toBe("Recent");
    await book(12, "Newest"); expect((await loadValues(person.id)).values[field.id]).toBe("Newest"); await book(13); expect((await loadValues(person.id)).values[field.id]).toBe("Newest");
    await save(person.id, { [field.id]: "Manual" }); await automatic.syncHistoricalContacts("demo-user"); expect((await loadValues(person.id)).values[field.id]).toBe("Manual");
  });
  it("keeps question mappings scoped to their selected event and assigned hosts", async () => {
    const field = await (await create(linked)).json(); await book(10, "Own"); await booking.createBooking({ username: "sam", slug: "other", name: "Contact QA", email: "qa@example.invalid", tz: "UTC", start: at(11), answers: { purpose: "Foreign" } });
    const rows = await db.select().from(schema.contacts), own = rows.find(row => row.userId === "demo-user")!, foreign = rows.find(row => row.userId === "demo-mate")!;
    expect((await loadValues(own.id)).values[field.id]).toBe("Own"); expect((await service.contactCustomValues("demo-mate", foreign.id)).values).toEqual({});
  });
  it("backfills newest answers in chronological order and retains manual values", async () => {
    const field = await (await create(linked)).json(); await book(10, "Old"); const newest = await book(11, "New"); await db.update(schema.bookings).set({ createdAt: new Date("2025-01-01") }); await db.update(schema.bookings).set({ createdAt: new Date("2025-01-02") }).where(eq(schema.bookings.uid, newest.uid));
    await db.delete(schema.contacts); await automatic.syncHistoricalContacts("demo-user"); const [person] = await db.select().from(schema.contacts);
    expect((await loadValues(person.id)).values[field.id]).toBe("New");
  });
  it("retains values and permits renaming a mapping after its source is deleted", async () => {
    await book(10, "Retained"); const field = await (await create(linked)).json(); await db.update(schema.eventTypes).set({ deletedAt: new Date() }).where(eq(schema.eventTypes.id, "form"));
    expect((await edit(field.id, 1, { ...linked, name: "Renamed" })).status).toBe(200); const [person] = await db.select().from(schema.contacts); expect((await loadValues(person.id)).values[field.id]).toBe("Retained");
  });
  it("rolls back mapped values with a failed booking transaction", async () => {
    const person = await contact(), field = await (await create(linked)).json();
    await expect(db.transaction(async (tx: typeof db) => { await service.captureContactAnswers(tx, "demo-user", person.id, "form", { purpose: "Uncommitted" }); throw new Error("rollback"); })).rejects.toThrow("rollback");
    expect((await loadValues(person.id)).values[field.id]).toBeUndefined(); expect(normalizeFieldValue({ ...EMPTY_FIELD, type: "number" }, "-0.000")).toBe("0");
  });
});
