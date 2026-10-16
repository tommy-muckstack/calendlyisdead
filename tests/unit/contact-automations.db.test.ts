import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { DateTime } from "luxon";
import { EMPTY_RULES } from "../../lib/contact-view-validation";
import { EMPTY_CONTACT } from "../../lib/contact-validation";
import { DEFAULT_CONTACT_SETTINGS } from "../../lib/contact-settings-validation";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
const external = vi.hoisted(() => vi.fn(async () => ({ busy: [], errors: [] })));
const mail = vi.hoisted(() => vi.fn<(mail: import("../../lib/email").Mail) => Promise<boolean>>(async () => false));
vi.mock("@/auth", () => ({ requireUser: auth })); vi.mock("../../lib/email", () => ({ sendMail: mail }));
vi.mock("../../lib/calendars", () => ({ externalBusy: external, writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} })); vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), service: typeof import("../../lib/contact-automations"), lists: typeof import("../../lib/contact-lists"), contacts: typeof import("../../lib/contacts"), booking: typeof import("../../lib/booking"), automatic: typeof import("../../lib/automatic-contacts"), preferences: typeof import("../../lib/contact-settings");
let route: typeof import("../../app/api/event-types/[id]/contact-automations/lists/route");
const user = "demo-user", email = "invitee@example.invalid";
const at = (hour = 10) => DateTime.now().toUTC().plus({ weeks: 2 }).startOf("day").plus({ hours: hour }).toISO()!;
const book = (slug = "personal", address = email, hour = 10, extra = {}) => booking.createBooking({ username: ["rr", "collective"].includes(slug) ? "team:auto-lists" : "demo", slug, start: at(hour), name: "Invitee", email: address, tz: "UTC", ...extra });
const list = (name = "Prospects", owner = user, kind: "list" | "view" = "list") => lists.createContactCollection(owner, { id: crypto.randomUUID(), name, kind, rules: EMPTY_RULES });
const save = (ids: string[], event = "personal", enabled = true, version = 0, owner = user) => service.changeContactAutomation(owner, event, { action: "save", listIds: ids, enabled, version });
const members = (id: string) => db.select().from(schema.contactListMembers).where(eq(schema.contactListMembers.collectionId, id));
const person = (address = email, owner = user) => contacts.createContact(owner, crypto.randomUUID(), { ...EMPTY_CONTACT, name: "Manual", email: address });
const context = (id = "personal") => ({ params: Promise.resolve({ id }) });
const request = (method: string, body?: unknown) => new Request("http://localhost", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-contact-auto-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  service = await import("../../lib/contact-automations"); lists = await import("../../lib/contact-lists"); contacts = await import("../../lib/contacts"); booking = await import("../../lib/booking"); automatic = await import("../../lib/automatic-contacts"); preferences = await import("../../lib/contact-settings"); route = await import("../../app/api/event-types/[id]/contact-automations/lists/route");
  await db.update(schema.schedules).set({ timezone: "UTC", weekly: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(day => [day, [{ start: "00:00", end: "24:00" }]])) });
  await db.insert(schema.users).values({ id: "team-owner", name: "Owner", email: "owner@example.invalid", username: "owner" }); await db.insert(schema.teams).values({ id: "automation-team", slug: "auto-lists", name: "Automations" });
});
beforeEach(async () => {
  await db.delete(schema.bookings); await db.delete(schema.contacts); await db.delete(schema.contactCollections); await db.delete(schema.contactSettings); await db.delete(schema.eventTypeHosts); await db.delete(schema.eventTypes);
  for (const [id, kind] of [["personal", "one_on_one"], ["other", "one_on_one"], ["group", "group"], ["rr", "round_robin"], ["collective", "collective"], ["once", "one_off"], ["template", "managed"], ["assigned", "one_on_one"]]) {
    const team = ["rr", "collective", "template"].includes(id);
    await db.insert(schema.eventTypes).values({ id, slug: id, kind, title: id, userId: team ? "team-owner" : user, teamId: team ? "automation-team" : null, managedParentId: id === "assigned" ? "template" : null, minNoticeMin: 0, rangeDays: 730, durationMin: 30, seats: 3 });
    if (["rr", "collective"].includes(id)) await db.insert(schema.eventTypeHosts).values([user, "demo-mate"].map(userId => ({ userId, eventTypeId: id })));
  }
  auth.mockResolvedValue({ id: user }); mail.mockClear(); external.mockReset(); external.mockResolvedValue({ busy: [], errors: [] });
});
afterEach(() => vi.restoreAllMocks());
describe("contact automation settings", () => {
  it("defaults unconfigured and exposes only the current host's events and manual lists", async () => {
    const own = await list(); await list("View", user, "view"); await list("Private", "demo-mate");
    const state = await service.readContactAutomation(user, "personal"); expect(state.automation).toEqual({ eventTypeId: "personal", configured: false, enabled: false, listIds: [], version: 0 }); expect(state.lists.map(list => list.id)).toEqual([own.id]);
    expect((await service.contactAutomationEvents(user)).map(event => event.id).sort()).toEqual(["assigned", "collective", "group", "once", "other", "personal", "rr"]);
    await expect(service.readContactAutomation("demo-mate", "personal")).rejects.toMatchObject({ status: 404 }); await expect(service.readContactAutomation("team-owner", "collective")).rejects.toMatchObject({ status: 404 });
  });
  it("saves multiple destinations, confirms exact retries and rejects stale settings", async () => {
    const a = await list(), b = await list("Second"), first = await save([b.id, a.id]); expect(first.automation).toMatchObject({ configured: true, enabled: true, version: 1 });
    expect(await save([a.id, b.id])).toEqual(first); const second = await save([a.id], "personal", true, 1); expect(second.automation.version).toBe(2);
    await expect(save([b.id], "personal", true, 1)).rejects.toMatchObject({ status: 409 }); expect((await service.readContactAutomation(user, "personal")).automation.listIds).toEqual([a.id]);
  });
  it("rejects foreign, deleted and view destinations even when initially paused", async () => {
    const foreign = await list("Foreign", "demo-mate"), view = await list("View", user, "view"), gone = await list(); await lists.deleteContactCollection(user, gone.id, 1);
    for (const id of [foreign.id, view.id, gone.id, crypto.randomUUID()]) await expect(save([id], "personal", false)).rejects.toMatchObject({ status: 409 }); expect(await db.select().from(schema.contactListAutomations)).toEqual([]);
  });
  it("pauses broken configurations but requires repair before enabling", async () => {
    const target = await list(); await save([target.id]); await lists.deleteContactCollection(user, target.id, 1);
    const paused = await service.changeContactAutomation(user, "personal", { action: "toggle", enabled: false, version: 1 }); expect(paused.automation).toMatchObject({ enabled: false, version: 2 }); expect(paused.lists).toEqual([]);
    await expect(service.changeContactAutomation(user, "personal", { action: "toggle", enabled: true, version: 2 })).rejects.toMatchObject({ status: 409 });
    const replacement = await list("Replacement"); expect((await save([replacement.id], "personal", true, 2)).automation.version).toBe(3);
  });
  it("retains memberships on deletion, rejects old resurrection and supports explicit recreation", async () => {
    const target = await list(); await save([target.id]); await book(); expect(await members(target.id)).toHaveLength(1);
    await service.deleteContactAutomation(user, "personal", 1); await service.deleteContactAutomation(user, "personal", 1); const removed = await service.readContactAutomation(user, "personal"); expect(removed.automation).toMatchObject({ configured: false, enabled: false, version: 2, listIds: [] }); expect(await members(target.id)).toHaveLength(1);
    await expect(save([target.id])).rejects.toMatchObject({ status: 409 }); await expect(service.changeContactAutomation(user, "personal", { action: "toggle", enabled: true, version: 1 })).rejects.toMatchObject({ status: 409 });
    expect((await save([target.id], "personal", true, 2)).automation.version).toBe(3);
  });
  it("serializes competing saves and guards stale toggles/deletions", async () => {
    const target = await list(); await save([target.id], "personal", false); const second = await list("Second");
    const results = await Promise.allSettled([save([target.id, second.id], "personal", false, 1), service.changeContactAutomation(user, "personal", { action: "toggle", enabled: true, version: 1 })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1); expect((await service.readContactAutomation(user, "personal")).automation.version).toBe(2);
    await expect(service.deleteContactAutomation(user, "personal", 1)).rejects.toMatchObject({ status: 409 });
  });
  it("removes deleted/reassigned events from access and rejects managed templates", async () => {
    const target = await list(); await save([target.id], "collective"); await db.delete(schema.eventTypeHosts).where(and(eq(schema.eventTypeHosts.eventTypeId, "collective"), eq(schema.eventTypeHosts.userId, user)));
    await expect(service.readContactAutomation(user, "collective")).rejects.toMatchObject({ status: 404 }); await expect(save([target.id], "template")).rejects.toMatchObject({ status: 404 });
    await db.update(schema.eventTypes).set({ deletedAt: new Date() }).where(eq(schema.eventTypes.id, "personal")); await expect(save([target.id])).rejects.toMatchObject({ status: 404 });
  });
});
describe("booking-triggered membership", () => {
  it.each(["personal", "group", "once", "assigned"])("assigns a new %s booking to every selected list without changing confirmation/ICS", async event => {
    const a = await list(), b = await list("Second"); await save([a.id, b.id], event); const booked = await book(event);
    const [contact] = await db.select().from(schema.contacts); expect(contact).toMatchObject({ email, source: "booking" }); expect((await members(a.id))[0].contactId).toBe(contact.id); expect((await members(b.id))[0].contactId).toBe(contact.id); expect((await lists.getContactCollection(user, a.id)).version).toBe(2);
    expect((await db.select().from(schema.contactListAutomationRuns))[0].bookingUid).toBe(booked.uid); expect(mail).toHaveBeenCalled(); expect(mail.mock.calls[0][0].ics).toContain("BEGIN:VCALENDAR");
  });
  it("only runs for the configured event and enabled state", async () => {
    const target = await list(); await save([target.id], "personal", false); await book(); await save([target.id], "personal", true, 1); await book("other", "other@example.invalid", 11); expect(await members(target.id)).toEqual([]);
    await book("personal", "enabled@example.invalid", 12); expect(await members(target.id)).toHaveLength(1); await service.changeContactAutomation(user, "personal", { action: "toggle", enabled: false, version: 2 }); await book("personal", "paused@example.invalid", 13); expect(await members(target.id)).toHaveLength(1);
  });
  it("never backfills past bookings or applies new settings on a repeated old callback", async () => {
    const first = await book(), target = await list(); await save([target.id]); await automatic.recordBookingContact(db, first); expect(await members(target.id)).toEqual([]);
    await book("personal", "new@example.invalid", 11); expect(await members(target.id)).toHaveLength(1);
    const [second] = await db.select().from(schema.bookings).where(eq(schema.bookings.inviteeEmail, "new@example.invalid")), other = await list("Other"); await save([other.id], "personal", true, 1); await automatic.recordBookingContact(db, second); expect(await members(other.id)).toEqual([]); expect(await members(target.id)).toHaveLength(1);
  });
  it("does not add historical contacts when the first Contacts visit imports legacy bookings", async () => {
    const target = await list(); await save([target.id]); await db.insert(schema.bookings).values({ uid: "legacy", hostId: user, eventTypeId: "personal", start: new Date(at()), end: new Date(at(11)), inviteeName: "Legacy", inviteeEmail: email, inviteeTz: "UTC", createdAt: new Date("2025-01-01T00:00:00Z") });
    await automatic.syncHistoricalContacts(user); expect(await db.select().from(schema.contacts)).toHaveLength(1); expect(await members(target.id)).toEqual([]); expect(await db.select().from(schema.contactListAutomationRuns)).toEqual([]);
  });
  it("deduplicates existing/manual membership and preserves manual removal on retries", async () => {
    const target = await list(), contact = await person(); await lists.changeContactListMembers(user, target.id, { id: crypto.randomUUID(), action: "add", version: 1, ids: [contact.id] }); await save([target.id]);
    const first = await book(); expect(await members(target.id)).toHaveLength(1); expect((await lists.getContactCollection(user, target.id)).version).toBe(2);
    await lists.changeContactListMembers(user, target.id, { id: crypto.randomUUID(), action: "remove", version: 2, ids: [contact.id] }); await automatic.recordBookingContact(db, first); expect(await members(target.id)).toEqual([]);
    await book("personal", email, 11); expect(await members(target.id)).toHaveLength(1);
  });
  it("does not restore membership when a meeting is rescheduled or removed when cancelled", async () => {
    const target = await list(); await save([target.id]); const first = await book(), [member] = await members(target.id); await lists.changeContactListMembers(user, target.id, { id: crypto.randomUUID(), version: 2, action: "remove", ids: [member.contactId] });
    const moved = await book("personal", email, 11, { rescheduleUid: first.uid }); expect(await members(target.id)).toEqual([]); await automatic.recordBookingContact(db, moved); expect(await members(target.id)).toEqual([]);
    const second = await book("personal", "second@example.invalid", 12); await booking.cancelBooking(second.uid, "QA"); expect(await members(target.id)).toHaveLength(1);
  });
  it("respects creation opt-out, exclusions and deletion while still organizing existing contacts", async () => {
    const target = await list(); await save([target.id]); const existing = await person("existing@example.invalid"), deleted = await person(); await contacts.deleteContact(user, deleted.id, 1);
    await preferences.saveContactSettings(user, { ...DEFAULT_CONTACT_SETTINGS, bookingEnabled: false, exclusions: ["example.invalid"] });
    await book(); await book("personal", "new@example.invalid", 11); await book("personal", existing.email, 12); expect((await members(target.id)).map(row => row.contactId)).toEqual([existing.id]);
  });
  it("uses only the actual collective hosts' own configurations and lists", async () => {
    const a = await list(), b = await list("Mate list", "demo-mate"); await save([a.id], "collective"); await save([b.id], "collective", true, 0, "demo-mate"); await book("collective");
    const rows = await db.select().from(schema.contacts); expect(rows).toHaveLength(2); expect((await members(a.id))[0].contactId).toBe(rows.find(row => row.userId === user)!.id); expect((await members(b.id))[0].contactId).toBe(rows.find(row => row.userId === "demo-mate")!.id);
  });
  it("runs only for the selected round-robin host", async () => {
    const a = await list(), b = await list("Mate list", "demo-mate"); await save([a.id], "rr"); await save([b.id], "rr", true, 0, "demo-mate"); const first = await book("rr");
    expect(await members(first.hostId === user ? a.id : b.id)).toHaveLength(1); expect(await members(first.hostId === user ? b.id : a.id)).toEqual([]); const second = await book("rr", "second@example.invalid", 11); expect(first.hostId).not.toBe(second.hostId); expect(await members(a.id)).toHaveLength(1); expect(await members(b.id)).toHaveLength(1);
  });
  it("handles simultaneous group invitees once per contact and leaves guests out", async () => {
    const target = await list(); await save([target.id], "group"); await Promise.all([book("group", email, 10, { guests: ["guest@example.invalid"] }), book("group", email.toUpperCase(), 10)]);
    expect(await members(target.id)).toHaveLength(1); expect(await db.select().from(schema.contactListAutomationRuns)).toHaveLength(2); expect((await db.select().from(schema.contacts).where(isNull(schema.contacts.deletedAt))).map(row => row.email)).toEqual([email]);
  });
  it("skips deleted lists without failing reservations or resurrecting them", async () => {
    const a = await list(), b = await list("Second"); await save([a.id, b.id]); await lists.deleteContactCollection(user, a.id, 1); await book(); expect(await members(a.id)).toEqual([]); expect(await members(b.id)).toHaveLength(1);
    await lists.deleteContactCollection(user, b.id, 2); await book("personal", "second@example.invalid", 11); expect(await members(b.id)).toEqual([]); expect(await db.select().from(schema.bookings)).toHaveLength(2);
  });
  it("rereads settings changed during availability preflight", async () => {
    const target = await list(); await save([target.id]); external.mockImplementationOnce(async () => { await service.changeContactAutomation(user, "personal", { action: "toggle", enabled: false, version: 1 }); return { busy: [], errors: [] }; }); await book(); expect(await members(target.id)).toEqual([]);
  });
  it("rolls back bookings, contacts, receipts and membership together on a storage failure", async () => {
    const target = await list(); await save([target.id]); const transaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementationOnce((run: (tx: typeof db) => Promise<unknown>) => transaction(async (tx: typeof db) => {
      const update = tx.update.bind(tx); tx.update = (table: unknown) => { if (table === schema.contactCollections) throw new Error("storage failure"); return update(table); }; return run(tx);
    }));
    await expect(book()).rejects.toThrow("slot_unavailable"); expect(await db.select().from(schema.bookings)).toEqual([]); expect(await db.select().from(schema.contacts)).toEqual([]); expect(await members(target.id)).toEqual([]); expect(await db.select().from(schema.contactListAutomationRuns)).toEqual([]); expect(mail).not.toHaveBeenCalled();
  });
  it("keeps failed/conflicting reservations from adding contacts", async () => {
    const target = await list(); await save([target.id]); await book(); await expect(book("personal", "conflict@example.invalid")).rejects.toThrow("slot_unavailable"); expect(await members(target.id)).toHaveLength(1); expect(await db.select().from(schema.contactListAutomationRuns)).toHaveLength(1);
  });
  it("rejects forged host/contact combinations at the automation runner", async () => {
    const target = await list(); await save([target.id]); const saved = await person(), foreign = await person("private@example.invalid", "demo-mate");
    await db.insert(schema.bookings).values({ uid: "foreign", hostId: "demo-mate", eventTypeId: "personal", start: new Date(at()), end: new Date(at(11)), inviteeName: "Foreign", inviteeEmail: email, inviteeTz: "UTC" });
    await service.runContactListAutomation(db, { hostId: user, uid: "foreign", eventTypeId: "personal", inviteeEmail: email }, saved.id); await service.runContactListAutomation(db, { hostId: "demo-mate", uid: "foreign", eventTypeId: "personal", inviteeEmail: email }, saved.id); await service.runContactListAutomation(db, { hostId: user, uid: "foreign", eventTypeId: "personal", inviteeEmail: email }, foreign.id); expect(await members(target.id)).toEqual([]); expect(await db.select().from(schema.contactListAutomationRuns)).toEqual([]);
  });
});
describe("automation API", () => {
  it("requires authentication for reads and writes", async () => {
    auth.mockResolvedValue(null); expect((await route.GET(request("GET"), context())).status).toBe(401); expect((await route.PATCH(request("PATCH", {}), context())).status).toBe(401); expect((await route.DELETE(request("DELETE", {}), context())).status).toBe(401);
  });
  it.each([{ action: "save", listIds: [], enabled: true, version: 0 }, { action: "save", listIds: ["not-id"], enabled: true, version: 0 }, { action: "toggle", enabled: "true", version: 1 }, { action: "toggle", enabled: true, version: 0 }, { action: "toggle", enabled: true, version: 1, userId: "other" }])("rejects invalid input without writes: %j", async input => { expect((await route.PATCH(request("PATCH", input), context())).status).toBe(400); expect(await db.select().from(schema.contactListAutomations)).toEqual([]); });
  it("supports the lifecycle with private reads and preserves configured state after malformed requests", async () => {
    const target = await list(), response = await route.PATCH(request("PATCH", { action: "save", listIds: [target.id], enabled: true, version: 0 }), context()); expect(response.status).toBe(200); expect((await response.json()).automation.enabled).toBe(true);
    expect((await route.GET(request("GET"), context())).headers.get("cache-control")).toContain("no-store"); expect((await route.PATCH(new Request("http://localhost", { method: "PATCH", body: "{" }), context())).status).toBe(400); expect((await route.PATCH(new Request("http://localhost", { method: "PATCH", body: "x".repeat(20001) }), context())).status).toBe(413);
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await route.GET(request("GET"), context())).status).toBe(404); auth.mockResolvedValue({ id: user }); expect((await route.DELETE(request("DELETE", { version: 1 }), context())).status).toBe(204);
  });
  it("returns a safe error when storage fails", async () => {
    const target = await list(); vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("private database error")); const response = await route.PATCH(request("PATCH", { action: "save", listIds: [target.id], enabled: true, version: 0 }), context()); expect(response.status).toBe(500); expect(await response.text()).not.toContain("private database");
  });
});
