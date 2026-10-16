import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { DateTime } from "luxon";
import { EMPTY_FIELD, type FieldValueType } from "../../lib/contact-field-validation";
import { EMPTY_RULES } from "../../lib/contact-view-validation";
import { EMPTY_CONTACT } from "../../lib/contact-validation";
import { DEFAULT_CONTACT_SETTINGS } from "../../lib/contact-settings-validation";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
const external = vi.hoisted(() => vi.fn(async () => ({ busy: [], errors: [] })));
const mail = vi.hoisted(() => vi.fn<(mail: import("../../lib/email").Mail) => Promise<boolean>>(async () => false));
vi.mock("@/auth", () => ({ requireUser: auth })); vi.mock("../../lib/email", () => ({ sendMail: mail }));
vi.mock("../../lib/calendars", () => ({ externalBusy: external, writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} })); vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), service: typeof import("../../lib/contact-question-automations"), listService: typeof import("../../lib/contact-automations"), fields: typeof import("../../lib/contact-custom-fields"), lists: typeof import("../../lib/contact-lists"), contacts: typeof import("../../lib/contacts"), booking: typeof import("../../lib/booking"), automatic: typeof import("../../lib/automatic-contacts"), preferences: typeof import("../../lib/contact-settings");
let route: typeof import("../../app/api/event-types/[id]/contact-automations/questions/route");
const user = "demo-user", email = "invitee@example.invalid";
const at = (hour = 10) => DateTime.now().toUTC().plus({ weeks: 2 }).startOf("day").plus({ hours: hour }).toISO()!;
const book = (slug = "personal", address = email, hour = 10, extra = { answers: { purpose: "Answer", notes: "Notes answer" } } as Record<string, unknown>) => booking.createBooking({ username: ["rr", "collective"].includes(slug) ? "team:auto-lists" : "demo", slug, start: at(hour), name: "Invitee", email: address, tz: "UTC", ...extra });
const list = (name = "Prospects", owner = user, kind: "list" | "view" = "list") => lists.createContactCollection(owner, { id: crypto.randomUUID(), name, kind, rules: EMPTY_RULES });
const field = (name = "Source", type: "text" | "number" | "tag" = "text", owner = user) => fields.createContactField(owner, crypto.randomUUID(), { ...EMPTY_FIELD, name, type, options: type === "tag" ? ["Old", "New", "Other"] : [] });
const payload = (questionId = "purpose", version = 0, fieldId = crypto.randomUUID()) => ({ action: "save" as const, questionId, version, fieldId, enabled: true });
const save = (input = payload(), event = "personal", owner = user) => service.changeContactQuestionAutomation(owner, event, input);
const values = async (address = email, owner = user) => { const [contact] = await db.select().from(schema.contacts).where(and(eq(schema.contacts.email, address), eq(schema.contacts.userId, owner), isNull(schema.contacts.deletedAt))); return fields.contactCustomValues(owner, contact.id); };
const manual = async (id: string, value: Record<string, FieldValueType>, owner = user) => { const current = await fields.contactCustomValues(owner, id); return fields.saveContactCustomValues(owner, id, current.version, value, Object.fromEntries(current.fields.map(field => [field.id, field.version]))); };
const members = (id: string) => db.select().from(schema.contactListMembers).where(eq(schema.contactListMembers.collectionId, id));
const person = (address = email, owner = user) => contacts.createContact(owner, crypto.randomUUID(), { ...EMPTY_CONTACT, name: "Manual", email: address });
const context = (id = "personal") => ({ params: Promise.resolve({ id }) });
const request = (method: string, body?: unknown) => new Request("http://localhost", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-field-auto-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  service = await import("../../lib/contact-question-automations"); listService = await import("../../lib/contact-automations"); fields = await import("../../lib/contact-custom-fields"); lists = await import("../../lib/contact-lists"); contacts = await import("../../lib/contacts"); booking = await import("../../lib/booking"); automatic = await import("../../lib/automatic-contacts"); preferences = await import("../../lib/contact-settings"); route = await import("../../app/api/event-types/[id]/contact-automations/questions/route");
  await db.update(schema.schedules).set({ timezone: "UTC", weekly: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(day => [day, [{ start: "00:00", end: "24:00" }]])) });
  await db.insert(schema.users).values({ id: "team-owner", name: "Owner", email: "owner@example.invalid", username: "owner" }); await db.insert(schema.teams).values({ id: "automation-team", slug: "auto-lists", name: "Automations" });
});
beforeEach(async () => {
  await db.delete(schema.bookings); await db.delete(schema.contacts); await db.delete(schema.contactCollections); await db.delete(schema.contactFields); await db.delete(schema.contactSettings); await db.delete(schema.eventTypeHosts); await db.delete(schema.eventTypes);
  for (const [id, kind] of [["personal", "one_on_one"], ["other", "one_on_one"], ["group", "group"], ["rr", "round_robin"], ["collective", "collective"], ["once", "one_off"], ["template", "managed"], ["assigned", "one_on_one"]]) {
    const team = ["rr", "collective", "template"].includes(id);
    await db.insert(schema.eventTypes).values({ id, slug: id, kind, title: id, userId: team ? "team-owner" : user, teamId: team ? "automation-team" : null, managedParentId: id === "assigned" ? "template" : null, minNoticeMin: 0, rangeDays: 730, durationMin: 30, seats: 3, questions: [{ id: "purpose", label: "Purpose?", type: "text", required: false }, { id: "notes", label: "Notes?", type: "text", required: false }] });
    if (["rr", "collective"].includes(id)) await db.insert(schema.eventTypeHosts).values([user, "demo-mate"].map(userId => ({ userId, eventTypeId: id })));
  }
  auth.mockResolvedValue({ id: user }); mail.mockClear(); external.mockReset(); external.mockResolvedValue({ busy: [], errors: [] });
});
afterEach(() => vi.restoreAllMocks());
describe("question mapping configuration", () => {
  it("requires host access and never exposes another host's fields", async () => {
    await field("Private", "text", "demo-mate"); expect(await service.readContactQuestionAutomation(user, "personal")).toMatchObject({ field: null, fieldCount: 0, automation: { configured: false, version: 0 } });
    for (const [owner, event] of [["demo-mate", "personal"], ["team-owner", "collective"], [user, "template"]]) await expect(service.readContactQuestionAutomation(owner, event)).rejects.toMatchObject({ status: 404 });
    await save(payload(), "collective"); expect((await service.readContactQuestionAutomation("demo-mate", "collective")).field).toBeNull();
  });
  it("creates a named new field and accepts only an exact creation retry", async () => {
    const input = payload(), first = await save(input); expect(first.field).toMatchObject({ id: input.fieldId, name: "personal - Purpose?", type: "invitee_question", eventTypeId: "personal", questionId: "purpose" });
    expect(await save(input)).toEqual(first); expect((await fields.listContactFields(user))).toHaveLength(1); await expect(save(payload())).rejects.toMatchObject({ status: 409 });
  });
  it("never maps to existing, foreign or deleted fields", async () => {
    for (const owner of [user, "demo-mate"]) { const existing = await field(`Field ${owner}`, "text", owner); await expect(save(payload("purpose", 0, existing.id))).rejects.toMatchObject({ status: 409 }); await fields.deleteContactField(owner, existing.id, 1); await expect(save(payload("purpose", 0, existing.id))).rejects.toMatchObject({ status: 409 }); }
    expect(await db.select().from(schema.contactQuestionAutomations)).toEqual([]);
  });
  it("keeps the ten-field bound and disambiguates generated names", async () => {
    await field("personal - Purpose?"); const mapping = await save(); expect(mapping.field?.name).toBe("personal - Purpose? (2)");
    for (let index = 0; index < 8; index++) await field(`Extra ${index}`);
    await expect(save(payload("notes", 1))).rejects.toMatchObject({ status: 409 }); expect((await service.readContactQuestionAutomation(user, "personal")).field?.id).toBe(mapping.field?.id);
  });
  it("keeps fields and values when replacing, pausing or deleting a mapping", async () => {
    const old = await save(); await book(); const replacement = await save(payload("notes", 1)); expect((await values()).values[old.field!.id]).toBe("Answer"); expect((await values()).values[replacement.field!.id]).toBeUndefined();
    await book("personal", email, 11); expect((await values()).values[replacement.field!.id]).toBe("Notes answer");
    await service.changeContactQuestionAutomation(user, "personal", { action: "toggle", enabled: false, version: 2 }); await book("personal", email, 12, { answers: { notes: "Paused" } }); expect((await values()).values[replacement.field!.id]).toBe("Notes answer");
    await service.deleteContactQuestionAutomation(user, "personal", 3); await service.deleteContactQuestionAutomation(user, "personal", 3); expect((await fields.listContactFields(user))).toHaveLength(2); expect((await values()).values[replacement.field!.id]).toBe("Notes answer");
    await expect(save(payload("purpose", 0))).rejects.toMatchObject({ status: 409 }); expect((await save(payload("purpose", 4))).automation.version).toBe(5);
  });
  it("rejects stale edits and toggles without overwriting newer settings", async () => {
    await save(); await service.changeContactQuestionAutomation(user, "personal", { action: "toggle", enabled: false, version: 1 });
    await expect(save(payload("notes", 1))).rejects.toMatchObject({ status: 409 }); await expect(service.changeContactQuestionAutomation(user, "personal", { action: "toggle", enabled: true, version: 1 })).rejects.toMatchObject({ status: 409 }); await expect(service.deleteContactQuestionAutomation(user, "personal", 1)).rejects.toMatchObject({ status: 409 });
  });
  it("supports creation from Contacts, prevents duplicate mappings and locks source changes", async () => {
    const definition = { ...EMPTY_FIELD, name: "My answers", type: "invitee_question" as const, eventTypeId: "personal", questionId: "purpose" }, id = crypto.randomUUID(); await fields.createContactField(user, id, definition);
    expect((await service.readContactQuestionAutomation(user, "personal")).automation).toMatchObject({ fieldId: id, enabled: true }); await fields.createContactField(user, id, definition);
    await expect(fields.createContactField(user, crypto.randomUUID(), { ...definition, name: "Another" })).rejects.toMatchObject({ status: 409 }); expect((await fields.listContactFields(user))).toHaveLength(1);
    for (const patch of [{ questionId: "notes" }, { eventTypeId: "other" }, { ...EMPTY_FIELD, name: "Plain" }]) await expect(fields.updateContactField(user, id, 1, { ...definition, ...patch })).rejects.toMatchObject({ code: "mapping_new_field_required" });
    const ordinary = await field(); await expect(fields.updateContactField(user, ordinary.id, 1, definition)).rejects.toMatchObject({ code: "mapping_new_field_required" });
    await fields.updateContactField(user, id, 1, { ...definition, name: "Renamed" }); expect((await service.readContactQuestionAutomation(user, "personal")).field?.name).toBe("Renamed");
  });
  it("allows broken mappings to pause, delete and create a replacement", async () => {
    const mapping = await save(); await fields.deleteContactField(user, mapping.field!.id, 1);
    await expect(service.changeContactQuestionAutomation(user, "personal", { action: "toggle", enabled: true, version: 1 })).rejects.toMatchObject({ status: 409 });
    await service.changeContactQuestionAutomation(user, "personal", { action: "toggle", enabled: false, version: 1 }); const replacement = await save(payload("purpose", 2)); expect(replacement.field?.id).not.toBe(mapping.field?.id);
    await db.update(schema.eventTypes).set({ questions: [] }).where(eq(schema.eventTypes.id, "personal")); await book(); expect((await values()).values).toEqual({});
    await service.changeContactQuestionAutomation(user, "personal", { action: "toggle", enabled: false, version: 3 }); await service.deleteContactQuestionAutomation(user, "personal", 4);
  });
  it("resolves ambiguous legacy mappings without modifying retained definitions", async () => {
    await db.insert(schema.contactQuestionAutomations).values({ userId: user, eventTypeId: "personal", legacyConflict: true, enabled: false });
    await expect(service.changeContactQuestionAutomation(user, "personal", { action: "toggle", enabled: true, version: 1 })).rejects.toMatchObject({ status: 409 }); const result = await save(payload("notes", 1)); expect(result.automation).toMatchObject({ configured: true, legacyConflict: false, questionId: "notes", enabled: true });
  });
});
describe("future booking answers", () => {
  it("does not backfill old answers and protects manual edits from booking replay", async () => {
    const old = await book(), mapping = await save(); expect((await values()).values).toEqual({}); const current = await values(); await manual(current.contactId, { [mapping.field!.id]: "Manual" });
    const [persisted] = await db.select().from(schema.bookings).where(eq(schema.bookings.uid, old.uid)); await db.transaction((tx: typeof db) => automatic.recordBookingContact(tx, { ...persisted, answers: { purpose: "Forged replay" } })); expect((await values()).values[mapping.field!.id]).toBe("Manual");
    await book("personal", email, 11); expect((await values()).values[mapping.field!.id]).toBe("Answer"); await book("personal", email, 12, { answers: { purpose: "  " } }); expect((await values()).values[mapping.field!.id]).toBe("Answer");
  });
  it("reads persisted answers rather than a supplied replay payload", async () => {
    const mapping = await save(), reservation = await book(); await db.delete(schema.contactListAutomationRuns); const [persisted] = await db.select().from(schema.bookings).where(eq(schema.bookings.uid, reservation.uid));
    await db.transaction((tx: typeof db) => automatic.recordBookingContact(tx, { ...persisted, answers: { purpose: "Forged" } })); expect((await values()).values[mapping.field!.id]).toBe("Answer");
  });
  it("does not update fields during historical import or rescheduling", async () => {
    const mapping = await save(), reservation = await book(); const current = await values(); await manual(current.contactId, { [mapping.field!.id]: "Manual" });
    await automatic.syncHistoricalContacts(user); await book("personal", email, 11, { rescheduleUid: reservation.uid, answers: { purpose: "Rescheduled" } }); expect((await values()).values[mapping.field!.id]).toBe("Manual");
    await db.delete(schema.contacts); await db.delete(schema.contactSettings); await automatic.syncHistoricalContacts(user); expect((await values()).values).toEqual({});
  });
  it("updates each actual collective host's private mapping", async () => {
    const own = await save(payload(), "collective"), other = await save(payload("notes"), "collective", "demo-mate"); await book("collective"); expect((await values()).values[own.field!.id]).toBe("Answer"); expect((await values(email, "demo-mate")).values[other.field!.id]).toBe("Notes answer");
  });
  it("works with list and fixed field actions in one reservation", async () => {
    const mapping = await save(), target = await list(), fixed = await field(); const staticService = await import("../../lib/contact-field-automations");
    await staticService.changeContactFieldAutomation(user, "personal", { action: "save", actions: [{ fieldId: fixed.id, type: "text", value: "Fixed" }], fieldVersions: { [fixed.id]: 1 }, enabled: true, version: 0 }); await listService.changeContactAutomation(user, "personal", { action: "save", listIds: [target.id], enabled: true, version: 0 }); await book();
    expect((await values()).values).toMatchObject({ [mapping.field!.id]: "Answer", [fixed.id]: "Fixed" }); expect(await members(target.id)).toHaveLength(1); expect(await db.select().from(schema.contactListAutomationRuns)).toHaveLength(1);
  });
  it("keeps existing contact opt-out semantics and does not recreate deleted contacts", async () => {
    const mapping = await save(), existing = await person(); await preferences.saveContactSettings(user, { ...DEFAULT_CONTACT_SETTINGS, bookingEnabled: false });
    await book(); expect((await values()).values[mapping.field!.id]).toBe("Answer"); await book("personal", "absent@example.invalid", 11); expect(await db.select().from(schema.contacts)).toHaveLength(1); await db.update(schema.contacts).set({ deletedAt: new Date() }).where(eq(schema.contacts.id, existing.id)); await book("personal", email, 12); expect(await db.select().from(schema.contacts)).toHaveLength(1);
  });
  it("rolls back booking, contact values, receipt and other actions on failure", async () => {
    await save(); const target = await list(); await listService.changeContactAutomation(user, "personal", { action: "save", listIds: [target.id], enabled: true, version: 0 });
    const transact = db.transaction.bind(db); vi.spyOn(db, "transaction").mockImplementationOnce((callback: (tx: typeof db) => Promise<unknown>) => transact(async (tx: typeof db) => { const update = tx.update.bind(tx); tx.update = (table: unknown) => { if (table === schema.contactCollections) throw new Error("list failed"); return update(table); }; return callback(tx); }));
    await expect(book()).rejects.toThrow("slot_unavailable"); for (const table of [schema.bookings, schema.contacts, schema.contactFieldValues, schema.contactListAutomationRuns]) expect(await db.select().from(table)).toEqual([]); expect(mail).not.toHaveBeenCalled();
  });
});
describe("question mapping HTTP API", () => {
  it("requires authentication and current host access", async () => { auth.mockResolvedValue(null); for (const method of ["GET", "PATCH", "DELETE"] as const) expect((await route[method](request(method, method === "GET" ? undefined : {}), context())).status).toBe(401); auth.mockResolvedValue({ id: "demo-mate" }); expect((await route.GET(request("GET"), context())).status).toBe(404); });
  it.each([{ action: "save", fieldId: "bad", questionId: "purpose", version: 0, enabled: true }, { action: "toggle", enabled: true, version: 0 }, { action: "toggle", enabled: "true", version: 1 }, { action: "toggle", enabled: true, version: 1, userId: "foreign" }])("rejects malformed requests %j", async input => { expect((await route.PATCH(request("PATCH", input), context())).status).toBe(400); });
  it("handles private reads, malformed/oversize bodies and deletion", async () => { expect((await route.PATCH(request("PATCH", payload()), context())).status).toBe(200); expect((await route.GET(request("GET"), context())).headers.get("cache-control")).toContain("no-store"); expect((await route.PATCH(new Request("http://localhost", { method: "PATCH", body: "{" }), context())).status).toBe(400); expect((await route.PATCH(new Request("http://localhost", { method: "PATCH", body: "x".repeat(50001) }), context())).status).toBe(413); expect((await route.DELETE(request("DELETE", { version: 1 }), context())).status).toBe(204); });
  it("does not expose storage errors", async () => { vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("private database")); const response = await route.PATCH(request("PATCH", payload()), context()); expect(response.status).toBe(500); expect(await response.text()).not.toContain("private database"); });
});
