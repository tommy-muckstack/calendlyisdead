import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { DateTime } from "luxon";
import { EMPTY_FIELD, type ContactField, type FieldValueType } from "../../lib/contact-field-validation";
import type { ContactFieldAction } from "../../lib/contact-field-automation-validation";
import { EMPTY_RULES } from "../../lib/contact-view-validation";
import { EMPTY_CONTACT } from "../../lib/contact-validation";
import { DEFAULT_CONTACT_SETTINGS } from "../../lib/contact-settings-validation";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
const external = vi.hoisted(() => vi.fn(async () => ({ busy: [], errors: [] })));
const mail = vi.hoisted(() => vi.fn<(mail: import("../../lib/email").Mail) => Promise<boolean>>(async () => false));
vi.mock("@/auth", () => ({ requireUser: auth })); vi.mock("../../lib/email", () => ({ sendMail: mail }));
vi.mock("../../lib/calendars", () => ({ externalBusy: external, writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} })); vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), service: typeof import("../../lib/contact-field-automations"), listService: typeof import("../../lib/contact-automations"), fields: typeof import("../../lib/contact-custom-fields"), lists: typeof import("../../lib/contact-lists"), contacts: typeof import("../../lib/contacts"), booking: typeof import("../../lib/booking"), automatic: typeof import("../../lib/automatic-contacts"), preferences: typeof import("../../lib/contact-settings");
let route: typeof import("../../app/api/event-types/[id]/contact-automations/fields/route");
const user = "demo-user", email = "invitee@example.invalid";
const at = (hour = 10) => DateTime.now().toUTC().plus({ weeks: 2 }).startOf("day").plus({ hours: hour }).toISO()!;
const book = (slug = "personal", address = email, hour = 10, extra = {}) => booking.createBooking({ username: ["rr", "collective"].includes(slug) ? "team:auto-lists" : "demo", slug, start: at(hour), name: "Invitee", email: address, tz: "UTC", ...extra });
const list = (name = "Prospects", owner = user, kind: "list" | "view" = "list") => lists.createContactCollection(owner, { id: crypto.randomUUID(), name, kind, rules: EMPTY_RULES });
const field = (name = "Source", type: "text" | "number" | "tag" = "text", owner = user) => fields.createContactField(owner, crypto.randomUUID(), { ...EMPTY_FIELD, name, type, options: type === "tag" ? ["Old", "New", "Other"] : [] });
const action = (field: ContactField, value: FieldValueType = "New"): ContactFieldAction => ({ fieldId: field.id, type: field.type as ContactFieldAction["type"], value: value as string | string[] });
const save = async (actions: ContactFieldAction[], event = "personal", enabled = true, version = 0, owner = user) => service.changeContactFieldAutomation(owner, event, { action: "save", actions, enabled, version, fieldVersions: Object.fromEntries((await fields.listContactFields(owner)).filter(field => actions.some(row => row.fieldId === field.id)).map(field => [field.id, field.version])) });
const values = async (address = email, owner = user) => { const [contact] = await db.select().from(schema.contacts).where(and(eq(schema.contacts.email, address), eq(schema.contacts.userId, owner), isNull(schema.contacts.deletedAt))); return fields.contactCustomValues(owner, contact.id); };
const manual = async (id: string, value: Record<string, FieldValueType>, owner = user) => { const current = await fields.contactCustomValues(owner, id); return fields.saveContactCustomValues(owner, id, current.version, value, Object.fromEntries(current.fields.map(field => [field.id, field.version]))); };
const members = (id: string) => db.select().from(schema.contactListMembers).where(eq(schema.contactListMembers.collectionId, id));
const person = (address = email, owner = user) => contacts.createContact(owner, crypto.randomUUID(), { ...EMPTY_CONTACT, name: "Manual", email: address });
const context = (id = "personal") => ({ params: Promise.resolve({ id }) });
const request = (method: string, body?: unknown) => new Request("http://localhost", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-field-auto-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  service = await import("../../lib/contact-field-automations"); listService = await import("../../lib/contact-automations"); fields = await import("../../lib/contact-custom-fields"); lists = await import("../../lib/contact-lists"); contacts = await import("../../lib/contacts"); booking = await import("../../lib/booking"); automatic = await import("../../lib/automatic-contacts"); preferences = await import("../../lib/contact-settings"); route = await import("../../app/api/event-types/[id]/contact-automations/fields/route");
  await db.update(schema.schedules).set({ timezone: "UTC", weekly: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(day => [day, [{ start: "00:00", end: "24:00" }]])) });
  await db.insert(schema.users).values({ id: "team-owner", name: "Owner", email: "owner@example.invalid", username: "owner" }); await db.insert(schema.teams).values({ id: "automation-team", slug: "auto-lists", name: "Automations" });
});
beforeEach(async () => {
  await db.delete(schema.bookings); await db.delete(schema.contacts); await db.delete(schema.contactCollections); await db.delete(schema.contactFields); await db.delete(schema.contactSettings); await db.delete(schema.eventTypeHosts); await db.delete(schema.eventTypes);
  for (const [id, kind] of [["personal", "one_on_one"], ["other", "one_on_one"], ["group", "group"], ["rr", "round_robin"], ["collective", "collective"], ["once", "one_off"], ["template", "managed"], ["assigned", "one_on_one"]]) {
    const team = ["rr", "collective", "template"].includes(id);
    await db.insert(schema.eventTypes).values({ id, slug: id, kind, title: id, userId: team ? "team-owner" : user, teamId: team ? "automation-team" : null, managedParentId: id === "assigned" ? "template" : null, minNoticeMin: 0, rangeDays: 730, durationMin: 30, seats: 3 });
    if (["rr", "collective"].includes(id)) await db.insert(schema.eventTypeHosts).values([user, "demo-mate"].map(userId => ({ userId, eventTypeId: id })));
  }
  auth.mockResolvedValue({ id: user }); mail.mockClear(); external.mockReset(); external.mockResolvedValue({ busy: [], errors: [] });
});
afterEach(() => vi.restoreAllMocks());
describe("field automation configuration", () => {
  it("defaults empty and scopes definitions and events to the current host", async () => {
    const own = await field(); await field("Private", "text", "demo-mate"); const state = await service.readContactFieldAutomation(user, "personal"); expect(state.automation).toMatchObject({ configured: false, enabled: false, version: 0, actions: [] }); expect(state.fields.map(field => field.id)).toEqual([own.id]);
    await expect(service.readContactFieldAutomation("demo-mate", "personal")).rejects.toMatchObject({ status: 404 }); await expect(service.readContactFieldAutomation("team-owner", "collective")).rejects.toMatchObject({ status: 404 }); await expect(save([action(own)], "template")).rejects.toMatchObject({ status: 404 });
  });
  it("normalizes text, exact decimals and tag sets with idempotent saves", async () => {
    const text = await field(), number = await field("Budget", "number"), tags = await field("Tags", "tag"); const actions = [action(text, "  Website  "), action(number, "+123456789012345.123456"), action(tags, ["Other", "New", "New"])];
    const result = await save(actions); expect(result.automation.actions.find(row => row.fieldId === number.id)?.value).toBe("123456789012345.123456"); expect(result.automation.actions.find(row => row.fieldId === tags.id)?.value).toEqual(["New", "Other"]); expect(await save([...actions].reverse())).toEqual(result);
  });
  it("rejects unavailable fields, incorrect types and stale definitions", async () => {
    const own = await field(), foreign = await field("Private", "text", "demo-mate"); await expect(save([action(foreign)])).rejects.toBeTruthy(); await expect(save([{ ...action(own), type: "number" }])).rejects.toMatchObject({ status: 409 });
    const payload = { action: "save" as const, actions: [action(own)], enabled: true, version: 0, fieldVersions: { [own.id]: 1 } }; await fields.updateContactField(user, own.id, 1, { ...EMPTY_FIELD, name: "Renamed" }); await expect(service.changeContactFieldAutomation(user, "personal", payload)).rejects.toMatchObject({ status: 409 });
    await fields.deleteContactField(user, own.id, 2); await expect(save([action(own)])).rejects.toBeTruthy(); expect(await db.select().from(schema.contactFieldAutomations)).toEqual([]);
  });
  it.each(["date", "currency", "multi_select", "invitee_question"] as const)("does not reinterpret unsupported %s fields", async type => {
    const custom = await fields.createContactField(user, crypto.randomUUID(), { ...EMPTY_FIELD, name: type, type: type === "invitee_question" ? "text" : type, currency: type === "currency" ? "USD" : "", options: type === "multi_select" ? ["A"] : [] });
    if (type === "invitee_question") await db.update(schema.contactFields).set({ type, eventTypeId: "personal", questionId: "question" }).where(eq(schema.contactFields.id, custom.id));
    await expect(save([{ fieldId: custom.id, type: "text", value: "A" }])).rejects.toMatchObject({ status: 409 });
  });
  it("pauses unavailable targets but requires repair before enabling", async () => {
    const own = await field(); await save([action(own)]); await fields.deleteContactField(user, own.id, 1); expect((await service.changeContactFieldAutomation(user, "personal", { action: "toggle", enabled: false, version: 1 })).automation.enabled).toBe(false);
    await expect(service.changeContactFieldAutomation(user, "personal", { action: "toggle", enabled: true, version: 2 })).rejects.toMatchObject({ status: 409 }); const next = await field(); expect((await save([action(next)], "personal", true, 2)).automation.version).toBe(3);
  });
  it("preserves values on deletion and rejects stale resurrection or competing changes", async () => {
    const own = await field(); await save([action(own)]); await book(); await service.deleteContactFieldAutomation(user, "personal", 1); await service.deleteContactFieldAutomation(user, "personal", 1); expect((await values()).values[own.id]).toBe("New");
    await expect(save([action(own)])).rejects.toMatchObject({ status: 409 }); await expect(service.changeContactFieldAutomation(user, "personal", { action: "toggle", enabled: true, version: 1 })).rejects.toMatchObject({ status: 409 }); await save([action(own)], "personal", false, 2);
    const competing = await Promise.allSettled([save([action(own, "A")], "personal", true, 3), save([action(own, "B")], "personal", true, 3)]); expect(competing.filter(result => result.status === "fulfilled")).toHaveLength(1); await expect(service.deleteContactFieldAutomation(user, "personal", 3)).rejects.toMatchObject({ status: 409 });
  });
});
describe("booking field updates", () => {
  it.each(["personal", "group", "once", "assigned"])("applies %s bookings with overwrite/append semantics and retained ICS", async event => {
    const text = await field(), number = await field("Budget", "number"), tags = await field("Tags", "tag"), existing = await person(); await manual(existing.id, { [text.id]: "Old", [number.id]: "1", [tags.id]: ["Old"] });
    await save([action(text, "Website"), action(number, "123456789012345.123456"), action(tags, ["New", "Other"])], event); const booked = await book(event), result = await values(); expect(result.values).toEqual({ [text.id]: "Website", [number.id]: "123456789012345.123456", [tags.id]: ["Old", "New", "Other"] }); expect(result.version).toBe(3); expect(mail.mock.calls.some(([mail]) => mail.ics?.includes(`UID:${booked.uid}`))).toBe(true);
  });
  it("normalizes legacy single tags and does not increment the contact for identical later values", async () => {
    const tags = await field("Tags", "tag"), existing = await person(); await db.insert(schema.contactFieldValues).values({ contactId: existing.id, fieldId: tags.id, value: { data: "Old" } }); await save([action(tags, ["New"])]); await book(); const first = await values(); expect(first.values[tags.id]).toEqual(["Old", "New"]); await book("personal", email, 11); expect((await values()).version).toBe(first.version);
  });
  it("combines independent list and field actions in the same booking receipt", async () => {
    const custom = await field(), target = await list(); await save([action(custom)]); await listService.changeContactAutomation(user, "personal", { action: "save", listIds: [target.id], enabled: true, version: 0 }); await book(); const result = await values(); expect((await members(target.id))[0].contactId).toBe(result.contactId); expect(result.values[custom.id]).toBe("New"); expect(await db.select().from(schema.contactListAutomationRuns)).toHaveLength(1);
  });
  it("never applies later settings to old receipts or historical imports", async () => {
    const first = await book(), custom = await field(); await save([action(custom)]); await automatic.recordBookingContact(db, first); expect((await values()).values).toEqual({}); await automatic.recordBookingContact(db, first, [], true); expect((await values()).values).toEqual({});
    await book("personal", email, 11); expect((await values()).values[custom.id]).toBe("New"); await save([action(custom, "Later")], "personal", true, 1); expect((await values()).values[custom.id]).toBe("New");
  });
  it("keeps manual edits through retries, rescheduling, cancellation and pausing", async () => {
    const custom = await field(), tags = await field("Tags", "tag"); await save([action(custom), action(tags, ["New"])]); const first = await book(), result = await values(); await manual(result.contactId, { [custom.id]: "Manual", [tags.id]: null });
    await automatic.recordBookingContact(db, first); const moved = await book("personal", email, 11, { rescheduleUid: first.uid }); await booking.cancelBooking(moved.uid, "QA"); expect((await values()).values).toEqual({ [custom.id]: "Manual" }); await service.changeContactFieldAutomation(user, "personal", { action: "toggle", enabled: false, version: 1 }); await book("personal", email, 12); expect((await values()).values).toEqual({ [custom.id]: "Manual" });
    await service.changeContactFieldAutomation(user, "personal", { action: "toggle", enabled: true, version: 2 }); await book("personal", email, 13); expect((await values()).values).toEqual({ [custom.id]: "New", [tags.id]: ["New"] });
  });
  it("updates existing contacts even with creation disabled, but honors excluded/deleted new contacts", async () => {
    const custom = await field(); await save([action(custom)]); const existing = await person(); await preferences.saveContactSettings(user, { ...DEFAULT_CONTACT_SETTINGS, bookingEnabled: false }); await book(); expect((await values()).values[custom.id]).toBe("New"); await book("personal", "disabled@example.invalid", 11); expect(await db.select().from(schema.contacts).where(isNull(schema.contacts.deletedAt))).toHaveLength(1);
    await preferences.saveContactSettings(user, { ...DEFAULT_CONTACT_SETTINGS, exclusions: ["blocked.invalid"], version: 2 }); await book("personal", "qa@blocked.invalid", 12); await contacts.deleteContact(user, existing.id, (await values()).version); await book("personal", email, 13); expect(await db.select().from(schema.contacts).where(isNull(schema.contacts.deletedAt))).toEqual([]);
  });
  it("uses only participating collective and round-robin hosts' private configurations", async () => {
    const own = await field(), mate = await field("Private", "text", "demo-mate"); await save([action(own, "Host")], "collective"); await save([action(mate, "Mate")], "collective", true, 0, "demo-mate"); await book("collective"); expect((await values()).values).toEqual({ [own.id]: "Host" }); expect((await values(email, "demo-mate")).values).toEqual({ [mate.id]: "Mate" });
    await save([action(own, "RR")], "rr"); await save([action(mate, "RR mate")], "rr", true, 0, "demo-mate"); const picked = await book("rr", "rr@example.invalid", 11); expect((await values("rr@example.invalid", picked.hostId)).values).toEqual(picked.hostId === user ? { [own.id]: "RR" } : { [mate.id]: "RR mate" });
  });
  it("skips deleted, changed-type and removed-option actions while applying valid fields", async () => {
    const gone = await field("Gone"), changed = await field("Changed"), tags = await field("Tags", "tag"), valid = await field(); await save([action(gone), action(changed), action(tags, ["New"]), action(valid)]);
    await fields.deleteContactField(user, gone.id, 1); await fields.updateContactField(user, changed.id, 1, { ...EMPTY_FIELD, name: "Changed", type: "number" }); await fields.updateContactField(user, tags.id, 1, { ...EMPTY_FIELD, name: "Tags", type: "tag", options: ["Old"] }); await book(); expect((await values()).values).toEqual({ [valid.id]: "New" });
    await expect(service.changeContactFieldAutomation(user, "personal", { action: "toggle", enabled: true, version: 1 })).rejects.toMatchObject({ status: 409 });
  });
  it("continues after a rename without interpreting a stale field type", async () => {
    const custom = await field(); await save([action(custom)]); await fields.updateContactField(user, custom.id, 1, { ...EMPTY_FIELD, name: "Renamed" }); await book(); expect((await values()).values[custom.id]).toBe("New");
  });
  it("rolls back reservation, values, contact and receipts on a storage error", async () => {
    const custom = await field(); await save([action(custom)]); const transact = db.transaction.bind(db); vi.spyOn(db, "transaction").mockImplementationOnce((callback: (tx: typeof db) => Promise<unknown>) => transact(async (tx: typeof db) => { const insert = tx.insert.bind(tx); tx.insert = (table: unknown) => { if (table === schema.contactFieldValues) throw new Error("storage failed"); return insert(table); }; return callback(tx); }));
    await expect(book()).rejects.toThrow("slot_unavailable"); expect(await db.select().from(schema.bookings)).toEqual([]); expect(await db.select().from(schema.contacts)).toEqual([]); expect(await db.select().from(schema.contactListAutomationRuns)).toEqual([]); expect(mail).not.toHaveBeenCalled();
  });
  it("rolls field writes back if a later list action fails", async () => {
    const custom = await field(), target = await list(), existing = await person(); await manual(existing.id, { [custom.id]: "Before" }); await save([action(custom)]); await listService.changeContactAutomation(user, "personal", { action: "save", listIds: [target.id], enabled: true, version: 0 });
    const transact = db.transaction.bind(db); vi.spyOn(db, "transaction").mockImplementationOnce((callback: (tx: typeof db) => Promise<unknown>) => transact(async (tx: typeof db) => { const update = tx.update.bind(tx); tx.update = (table: unknown) => { if (table === schema.contactCollections) throw new Error("list write failed"); return update(table); }; return callback(tx); }));
    await expect(book()).rejects.toThrow("slot_unavailable"); expect((await values()).values[custom.id]).toBe("Before"); expect((await values()).version).toBe(2); expect(await members(target.id)).toEqual([]); expect(await db.select().from(schema.bookings)).toEqual([]); expect(await db.select().from(schema.contactListAutomationRuns)).toEqual([]); expect(mail).not.toHaveBeenCalled();
  });
  it("serializes simultaneous group bookings and retains every appended tag", async () => {
    const tags = await field("Tags", "tag"); await save([action(tags, ["New"])], "group"); await save([action(tags, ["Other"])], "other"); await Promise.all([book("group", email), book("group", email)]); await book("other", email, 11); expect((await values()).values[tags.id]).toEqual(["New", "Other"]);
  });
});
describe("field automation HTTP API", () => {
  it("requires auth and prevents access after host removal", async () => { auth.mockResolvedValue(null); expect((await route.GET(request("GET"), context())).status).toBe(401); expect((await route.PATCH(request("PATCH", {}), context())).status).toBe(401); expect((await route.DELETE(request("DELETE", {}), context())).status).toBe(401); auth.mockResolvedValue({ id: user }); await db.delete(schema.eventTypeHosts).where(eq(schema.eventTypeHosts.userId, user)); expect((await route.GET(request("GET"), context("collective"))).status).toBe(404); });
  it.each([{ action: "save", actions: [], fieldVersions: {}, enabled: true, version: 0 }, { action: "toggle", enabled: "true", version: 1 }, { action: "toggle", enabled: true, version: 0 }, { action: "toggle", enabled: true, version: 1, userId: "other" }])("rejects malformed requests %j", async input => { expect((await route.PATCH(request("PATCH", input), context())).status).toBe(400); expect(await db.select().from(schema.contactFieldAutomations)).toEqual([]); });
  it("rejects duplicate fields, missing definition revisions and invalid values", async () => {
    const custom = await field("Number", "number"); const input = { action: "save", actions: [action(custom, "2")], fieldVersions: { [custom.id]: 1 }, version: 0, enabled: true };
    expect((await route.PATCH(request("PATCH", { ...input, actions: [action(custom, "2"), action(custom, "3")] }), context())).status).toBe(400); expect((await route.PATCH(request("PATCH", { ...input, fieldVersions: {} }), context())).status).toBe(400);
    for (const value of ["", "1e4", "NaN", "1234567890123456", "1.0000001"]) expect((await route.PATCH(request("PATCH", { ...input, actions: [action(custom, value)] }), context())).status).toBe(409);
  });
  it("supports private reads, saved lifecycle and bounded malformed-body errors", async () => {
    const custom = await field(); const response = await route.PATCH(request("PATCH", { action: "save", actions: [action(custom)], fieldVersions: { [custom.id]: 1 }, enabled: true, version: 0 }), context()); expect(response.status).toBe(200);
    expect((await route.GET(request("GET"), context())).headers.get("cache-control")).toContain("no-store"); expect((await route.PATCH(new Request("http://localhost", { method: "PATCH", body: "{" }), context())).status).toBe(400); expect((await route.PATCH(new Request("http://localhost", { method: "PATCH", body: "x".repeat(50001) }), context())).status).toBe(413); expect((await route.DELETE(request("DELETE", { version: 1 }), context())).status).toBe(204);
  });
  it("does not leak private database errors", async () => { const custom = await field(); vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("private database")); const response = await route.PATCH(request("PATCH", { action: "save", actions: [action(custom)], fieldVersions: { [custom.id]: 1 }, enabled: true, version: 0 }), context()); expect(response.status).toBe(500); expect(await response.text()).not.toContain("private database"); });
});
