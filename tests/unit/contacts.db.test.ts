import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { ContactFields, ContactFilters, EMPTY_CONTACT } from "../../lib/contact-validation";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user", timezone: "UTC" }) as { id: string; timezone: string } | null));
vi.mock("@/auth", () => ({ requireUser: auth }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema");
let service: typeof import("../../lib/contacts"), collection: typeof import("../../app/api/contacts/route"), item: typeof import("../../app/api/contacts/[id]/route");
const fields = { ...EMPTY_CONTACT, name: "Contact QA", email: "contact@example.invalid" };
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (method: string, body?: unknown, url = "http://localhost/api/contacts") => new NextRequest(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const create = (extra = {}, id = crypto.randomUUID()) => collection.POST(request("POST", { ...fields, ...extra, id }));
const update = (id: string, version = 1, extra = {}) => item.PATCH(request("PATCH", { ...fields, version, ...extra }), context(id));
const remove = (id: string, version = 1) => item.DELETE(request("DELETE", { version }), context(id));
const filters = (extra = {}) => ContactFilters.parse(extra), now = new Date("2027-01-10T12:00:00Z");
const booking = async (uid: string, hostId = "demo-user", email = fields.email, start = "2027-01-11T12:00:00Z", status = "confirmed") => {
  await db.insert(schema.bookings).values({ uid, eventTypeId: "demo-30", hostId, inviteeName: fields.name, inviteeEmail: email, inviteeTz: "UTC",
    start: new Date(start), end: new Date(Date.parse(start) + 1800000), status });
};
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-contacts-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  service = await import("../../lib/contacts"); collection = await import("../../app/api/contacts/route"); item = await import("../../app/api/contacts/[id]/route");
});
beforeEach(async () => { auth.mockResolvedValue({ id: "demo-user", timezone: "UTC" }); await db.delete(schema.contacts); await db.delete(schema.bookings); });
afterEach(() => vi.restoreAllMocks());

describe("contact records and host-only meeting history", () => {
  it("creates the documented contact fields and normalizes email without exposing owner metadata", async () => {
    const response = await create({ name: "  Contact QA ", email: " CONTACT@Example.Invalid ", phone: "+1 555 0100", jobTitle: "Engineer", company: "Example", linkedIn: "https://www.linkedin.com/in/example", timezone: "Asia/Tokyo", country: "Japan", city: "Tokyo", state: "Tokyo" });
    expect(response.status).toBe(201); const body = await response.json(); expect(body).toMatchObject({ name: fields.name, email: fields.email, version: 1, timezone: "Asia/Tokyo", city: "Tokyo", phone: "+1 555 0100", company: "Example" });
    expect(body).not.toHaveProperty("userId"); expect(body).not.toHaveProperty("deletedAt");
    expect((await item.GET(request("GET"), context(body.id))).status).toBe(200);
  });
  it("confirms a repeated create request without inserting a second record", async () => {
    const id = crypto.randomUUID(); const responses = await Promise.all([create({}, id), create({}, id)]); expect(responses.map(r => r.status)).toEqual([201, 201]);
    expect((await service.listContacts("demo-user", filters())).total).toBe(1);
    expect((await create({ name: "Different draft" }, id)).status).toBe(409); expect((await service.getContact("demo-user", id))?.name).toBe(fields.name);
  });
  it("prevents case-insensitive duplicates within an account while permitting separate hosts' contacts", async () => {
    const results = await Promise.all([create(), create({ email: "CONTACT@example.invalid" })]); expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    auth.mockResolvedValue({ id: "demo-mate", timezone: "UTC" }); expect((await create()).status).toBe(201);
    expect((await service.listContacts("demo-user", filters())).total).toBe(1); expect((await service.listContacts("demo-mate", filters())).total).toBe(1);
  });
  it("requires authentication on all routes", async () => {
    auth.mockResolvedValue(null); const id = crypto.randomUUID();
    expect((await create()).status).toBe(401); expect((await collection.GET(request("GET"))).status).toBe(401);
    expect((await item.GET(request("GET"), context(id))).status).toBe(401); expect((await update(id)).status).toBe(401); expect((await remove(id)).status).toBe(401);
  });
  it("does not allow another host to read, edit, delete or enumerate a contact", async () => {
    const contact = await (await create()).json(); auth.mockResolvedValue({ id: "demo-mate", timezone: "UTC" });
    expect((await item.GET(request("GET"), context(contact.id))).status).toBe(404); expect((await update(contact.id)).status).toBe(404); expect((await remove(contact.id)).status).toBe(404);
    expect((await (await collection.GET(request("GET"))).json()).total).toBe(0);
    expect((await service.getContact("demo-user", contact.id))?.name).toBe(fields.name);
  });
  it.each([
    { name: " " }, { email: "not an email" }, { phone: "x".repeat(61) }, { jobTitle: "x".repeat(151) },
    { company: "x".repeat(151) }, { linkedIn: "javascript:alert(1)" }, { linkedIn: "file:///tmp/file" },
    { timezone: "Moon/Base" }, { country: "x".repeat(101) }, { state: "x".repeat(151) }, { city: "x".repeat(151) },
    { userId: "demo-mate" }, { deletedAt: new Date().toISOString() },
  ])("rejects invalid or unauthorized fields %j", async data => {
    expect((await create(data)).status).toBe(400); expect(await db.select().from(schema.contacts)).toEqual([]);
  });
  it("rejects malformed JSON and invalid list parameters", async () => {
    expect((await collection.POST(new NextRequest("http://localhost", { method: "POST", body: "{" }))).status).toBe(400);
    for (const query of ["page=0", "page=1.5", "page=no", "sort=owner", `q=${"x".repeat(201)}`]) expect((await collection.GET(request("GET", undefined, `http://localhost/api/contacts?${query}`))).status).toBe(400);
  });
  it("preserves linked history when name or email changes and adds new matching bookings", async () => {
    await booking("old", "demo-user", " CONTACT@example.invalid "); const contact = await (await create()).json();
    await booking("also-old", "demo-user", fields.email, "2027-01-11T13:00:00Z"); const next = await update(contact.id, 1, { name: "Updated", email: "new@example.invalid" }); expect(next.status).toBe(200);
    await booking("new", "demo-user", "new@example.invalid", "2027-01-11T14:00:00Z"); await booking("after-address-change", "demo-user", fields.email, "2027-01-11T15:00:00Z");
    expect((await service.contactHistory("demo-user", contact.id)).rows.map(row => row.uid).sort()).toEqual(["also-old", "new", "old"]);
    expect((await db.select().from(schema.bookings).where(eq(schema.bookings.uid, "old")))[0].inviteeEmail).toBe(" CONTACT@example.invalid ");
  });
  it("only shows meetings hosted by the contact owner, including collective meetings", async () => {
    await booking("own"); await booking("other", "demo-mate"); const contact = await (await create()).json();
    expect((await service.contactHistory("demo-user", contact.id)).rows.map(row => row.uid)).toEqual(["own"]);
    expect((await service.contactHistory("demo-mate", contact.id)).total).toBe(0);
    // Even a corrupt link cannot bypass the host filter.
    await db.insert(schema.contactMeetings).values({ contactId: contact.id, bookingUid: "other" });
    expect((await service.contactHistory("demo-user", contact.id)).rows.map(row => row.uid)).toEqual(["own"]);
  });
  it("keeps cancelled meetings in history but excludes them from next/last summaries", async () => {
    await booking("past", "demo-user", fields.email, "2027-01-09T12:00:00Z"); await booking("next"); await booking("cancelled", "demo-user", fields.email, "2027-01-10T15:00:00Z", "cancelled");
    const contact = await (await create()).json(); const list = await service.listContacts("demo-user", filters(), now);
    expect(list.rows[0]).toMatchObject({ nextMeeting: "2027-01-11T12:00:00.000Z", lastMeeting: "2027-01-09T12:00:00.000Z" });
    expect((await service.contactHistory("demo-user", contact.id)).rows.map(row => row.uid)).toEqual(["next", "cancelled", "past"]);
  });
  it("does not lose changes when a stale editor saves and confirms exact retry values", async () => {
    const contact = await (await create()).json(); expect((await update(contact.id, 1, { name: "New" })).status).toBe(200);
    expect((await update(contact.id, 1, { name: "Stale" })).status).toBe(409); expect((await update(contact.id, 1, { name: "New" })).status).toBe(200);
    expect((await service.getContact("demo-user", contact.id))?.version).toBe(2); expect((await remove(contact.id, 1)).status).toBe(409);
  });
  it("serializes simultaneous edits and prevents concurrent email collisions", async () => {
    const first = await (await create()).json(), second = await (await create({ email: "second@example.invalid" })).json();
    const saves = await Promise.all([update(first.id, 1, { name: "A" }), update(first.id, 1, { name: "B" })]); expect(saves.map(r => r.status).sort()).toEqual([200, 409]);
    const version = (await service.getContact("demo-user", first.id))!.version;
    const results = await Promise.all([update(first.id, version, { email: "shared@example.invalid" }), update(second.id, 1, { email: "shared@example.invalid" })]); expect(results.map(r => r.status).sort()).toEqual([200, 409]);
  });
  it("deletes without deleting meetings, supports an exact delete retry and allows manual recreation", async () => {
    await booking("retained"); const contact = await (await create()).json(); expect((await remove(contact.id)).status).toBe(204); expect((await remove(contact.id)).status).toBe(204);
    await booking("later", "demo-user", fields.email, "2027-01-12T12:00:00Z"); expect((await service.listContacts("demo-user", filters())).total).toBe(0); expect(await service.getContact("demo-user", contact.id)).toBeNull();
    expect((await service.contactHistory("demo-user", contact.id)).rows).toEqual([]); expect(await db.select().from(schema.bookings)).toHaveLength(2);
    const replacement = await (await create()).json(); expect(replacement.id).not.toBe(contact.id); expect((await service.contactHistory("demo-user", replacement.id)).total).toBe(2);
    expect((await create({}, contact.id)).status).toBe(409);
  });
  it("preserves the last saved record after a failed transaction", async () => {
    const contact = await (await create()).json(); vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("offline"));
    expect((await update(contact.id, 1, { name: "Unsaved" })).status).toBe(500); expect((await service.getContact("demo-user", contact.id))?.name).toBe(fields.name);
  });
  it("searches literal special characters and paginates deterministically without another host's records", async () => {
    for (let i = 0; i < 27; i++) await create({ name: `Name ${String(i).padStart(2, "0")}`, email: `qa-${i}@example.invalid`, company: i === 0 ? "100%_literal" : "Company" });
    const first = await service.listContacts("demo-user", filters()); const second = await service.listContacts("demo-user", filters({ page: 2 }));
    expect(first.total).toBe(27); expect(first.rows).toHaveLength(25); expect(second.rows).toHaveLength(2); expect(new Set([...first.rows, ...second.rows].map(row => row.contact.id)).size).toBe(27);
    expect((await service.listContacts("demo-user", filters({ q: "%_literal" }))).total).toBe(1); expect((await service.listContacts("demo-user", filters({ q: "NAME 00" }))).total).toBe(1);
  });
  it("paginates linked meeting history without duplicates", async () => {
    const contact = await (await create()).json(); for (let i = 0; i < 26; i++) await booking(`meeting-${i}`, "demo-user", fields.email, new Date(Date.UTC(2027, 1, i + 1, 12)).toISOString());
    const first = await service.contactHistory("demo-user", contact.id), second = await service.contactHistory("demo-user", contact.id, 2);
    expect(first.total).toBe(26); expect(first.rows).toHaveLength(25); expect(second.rows).toHaveLength(1);
    expect(new Set([...first.rows, ...second.rows].map(row => row.uid)).size).toBe(26);
  });
  it("updates recently-edited ordering using saved values", async () => {
    const first = await (await create({ name: "Zed" })).json(); await create({ name: "Alice", email: "alice@example.invalid" });
    await update(first.id, 1, { name: "Zed updated" });
    expect((await service.listContacts("demo-user", filters({ sort: "updated" }))).rows[0].contact.id).toBe(first.id);
    expect(ContactFields.parse({ ...fields, email: "CONTACT@EXAMPLE.INVALID" }).email).toBe(fields.email);
  });
  it("also enforces case-insensitive uniqueness at the database boundary", async () => {
    await create(); await expect(db.insert(schema.contacts).values({ ...fields, id: crypto.randomUUID(), userId: "demo-user", email: fields.email.toUpperCase() })).rejects.toThrow();
  });
  it("maps both supported PostgreSQL driver's unique errors without exposing database details", () => {
    for (const name of ["constraint", "constraint_name"]) expect(service.contactFailure({ cause: { code: "23505", [name]: "contacts_active_owner_email" } })).toEqual({ error: "email_in_use", status: 409 });
    expect(service.contactFailure(new Error("private database details"))).toEqual({ error: "save_failed", status: 500 });
  });
});
