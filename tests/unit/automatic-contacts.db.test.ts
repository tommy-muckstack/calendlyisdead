import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { EMPTY_CONTACT } from "../../lib/contact-validation";
import { DEFAULT_CONTACT_SETTINGS, contactExcluded, parseContactExclusions } from "../../lib/contact-settings-validation";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
const external = vi.hoisted(() => vi.fn(async () => ({ busy: [], errors: [] })));
const mail = vi.hoisted(() => vi.fn<(message: import("../../lib/email").Mail) => Promise<boolean>>().mockResolvedValue(true));
vi.mock("@/auth", () => ({ requireUser: auth }));
vi.mock("../../lib/calendars", () => ({ externalBusy: external, writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: mail }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema");
let booking: typeof import("../../lib/booking"), contacts: typeof import("../../lib/contacts"), automatic: typeof import("../../lib/automatic-contacts");
let preferences: typeof import("../../lib/contact-settings"), route: typeof import("../../app/api/settings/contacts/route"), polls: typeof import("../../lib/polls");
const at = (hour = 10) => DateTime.now().toUTC().plus({ weeks: 2 }).startOf("day").plus({ hours: hour }).toISO()!;
const edit = (body: unknown) => route.PATCH(new NextRequest("http://localhost/api/settings/contacts", { method: "PATCH", body: JSON.stringify(body) }));
const active = () => db.select().from(schema.contacts).where(isNull(schema.contacts.deletedAt));
const book = (slug = "personal", email = "invitee@example.invalid", hour = 10, extra = {}) => booking.createBooking({ username: ["rr", "collective"].includes(slug) ? "team:contacts" : "demo", slug,
  start: at(hour), name: "Invitee", email, tz: "UTC", ...extra });
const manual = (email = "invitee@example.invalid") => contacts.createContact("demo-user", crypto.randomUUID(), { ...EMPTY_CONTACT, name: "Saved name", email, company: "Saved company", phone: "123456789" });
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-auto-contacts-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  booking = await import("../../lib/booking"); contacts = await import("../../lib/contacts"); automatic = await import("../../lib/automatic-contacts");
  preferences = await import("../../lib/contact-settings"); route = await import("../../app/api/settings/contacts/route"); polls = await import("../../lib/polls");
  await db.update(schema.schedules).set({ timezone: "UTC", weekly: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(day => [day, [{ start: "00:00", end: "24:00" }]])) });
  await db.insert(schema.users).values({ id: "team-owner", name: "Owner", username: "owner", email: "owner@example.invalid" });
  await db.insert(schema.teams).values({ id: "contacts-team", slug: "contacts", name: "Contacts" });
});
beforeEach(async () => {
  await db.delete(schema.contactMeetings); await db.delete(schema.contacts); await db.delete(schema.contactSettings);
  await db.delete(schema.bookings); await db.delete(schema.pollVotes); await db.delete(schema.polls); await db.delete(schema.eventTypeHosts); await db.delete(schema.eventTypes);
  auth.mockResolvedValue({ id: "demo-user" }); external.mockReset(); external.mockResolvedValue({ busy: [], errors: [] }); mail.mockClear();
  for (const [id, kind] of [["personal", "one_on_one"], ["group", "group"], ["rr", "round_robin"], ["collective", "collective"], ["once", "one_off"]]) {
    const team = ["rr", "collective"].includes(id);
    await db.insert(schema.eventTypes).values({ id, slug: id, kind, userId: team ? "team-owner" : "demo-user", title: id, teamId: team ? "contacts-team" : null,
      minNoticeMin: 0, rangeDays: 730, seats: 3, durationMin: 30, questions: [{ id: "phone", label: "Phone", type: "phone", required: false }] });
    if (team) await db.insert(schema.eventTypeHosts).values(["demo-user", "demo-mate"].map(userId => ({ userId, eventTypeId: id })));
  }
});
afterEach(() => vi.restoreAllMocks());

describe("automatic contact preferences", () => {
  it("defaults on, persists normalized exclusions and limits reads to the current account", async () => {
    expect(await (await route.GET()).json()).toEqual(DEFAULT_CONTACT_SETTINGS);
    const response = await edit({ ...DEFAULT_CONTACT_SETTINGS, bookingEnabled: false, exclusions: [" EXAMPLE.INVALID ", "person@Other.Invalid", "example.invalid"] });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ bookingEnabled: false, exclusions: ["example.invalid", "person@other.invalid"], version: 2 });
    auth.mockResolvedValue({ id: "demo-mate" }); expect(await (await route.GET()).json()).toEqual(DEFAULT_CONTACT_SETTINGS);
  });
  it("rejects unauthenticated access and owner injection", async () => {
    expect((await edit({ ...DEFAULT_CONTACT_SETTINGS, userId: "demo-mate" })).status).toBe(400);
    auth.mockResolvedValue(null); expect((await route.GET()).status).toBe(401); expect((await edit(DEFAULT_CONTACT_SETTINGS)).status).toBe(401);
  });
  it.each([{ bookingEnabled: "false" }, { exclusions: "company.com" }, { exclusions: ["https://company.com"] }, { exclusions: ["@company.com"] }, { exclusions: ["*.company.com"] }, { exclusions: ["bad..company.com"] }, { exclusions: ["x".repeat(255)] }, { exclusions: Array.from({ length: 101 }, (_, i) => `${i}@example.invalid`) }, { version: 0 }])("rejects invalid settings %j without saving", async fields => {
    expect((await edit({ ...DEFAULT_CONTACT_SETTINGS, ...fields })).status).toBe(400); expect(await preferences.readContactSettings("demo-user")).toEqual(DEFAULT_CONTACT_SETTINGS);
  });
  it("rejects malformed JSON and returns honest database failures", async () => {
    expect((await route.PATCH(new NextRequest("http://localhost", { method: "PATCH", body: "{" }))).status).toBe(400);
    vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("private details")); const response = await edit({ ...DEFAULT_CONTACT_SETTINGS, bookingEnabled: false });
    expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: "save_failed" }); expect(await preferences.readContactSettings("demo-user")).toEqual(DEFAULT_CONTACT_SETTINGS);
  });
  it("prevents stale overwrites while confirming identical retries and permitting an explicit clear", async () => {
    const value = { ...DEFAULT_CONTACT_SETTINGS, exclusions: ["company.com"] };
    expect((await edit(value)).status).toBe(200); expect((await edit(value)).status).toBe(200);
    expect((await edit({ ...DEFAULT_CONTACT_SETTINGS, bookingEnabled: false })).status).toBe(409);
    expect((await edit({ ...DEFAULT_CONTACT_SETTINGS, version: 2 })).status).toBe(200);
  });
  it("serializes competing preference saves", async () => {
    const results = await Promise.all([edit({ ...DEFAULT_CONTACT_SETTINGS, bookingEnabled: false }), edit({ ...DEFAULT_CONTACT_SETTINGS, exclusions: ["company.com"] })]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]); expect((await preferences.readContactSettings("demo-user")).version).toBe(2);
  });
  it("parses comma/space lists and matches addresses/domains without substring collisions", () => {
    expect(parseContactExclusions("a.com, b.com\nuser@c.com  ")).toEqual(["a.com", "b.com", "user@c.com"]);
    expect(contactExcluded(" Person@Sub.Company.com ", ["company.com"])).toBe(true);
    expect(contactExcluded("person@notcompany.com", ["company.com"])).toBe(false);
    expect(contactExcluded("person@company.com.evil.invalid", ["company.com"])).toBe(false);
    expect(contactExcluded("Person@company.com", ["person@company.com"])).toBe(true);
    expect(contactExcluded("another@company.com", ["person@company.com"])).toBe(false);
  });
});

describe("booking contact creation and deletion", () => {
  it.each(["personal", "group", "once"])("creates a %s contact with phone and a durable history link", async slug => {
    const result = await book(slug, "INVITEE@EXAMPLE.INVALID", 10, { answers: { phone: "+1 555 0100" } });
    const rows = await active(); expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ userId: "demo-user", name: "Invitee", email: "invitee@example.invalid", phone: "+1 555 0100" });
    expect((await contacts.contactHistory("demo-user", rows[0].id)).rows.map(row => row.uid)).toEqual([result.uid]);
    expect(mail).toHaveBeenCalled(); expect(mail.mock.calls[0][0]).toHaveProperty("ics");
  });
  it("creates collective contacts for each assigned host, excluding a nonparticipating owner", async () => {
    await book("collective"); const rows = await active(); expect(rows.map(row => row.userId).sort()).toEqual(["demo-mate", "demo-user"]);
    for (const row of rows) expect((await contacts.contactHistory(row.userId, row.id)).total).toBe(1);
  });
  it("creates round-robin contacts only for the host selected for each booking", async () => {
    const first = await book("rr"), second = await book("rr", "second@example.invalid", 11);
    expect(first.hostId).not.toBe(second.hostId); const rows = await active();
    expect(rows.find(row => row.email === "invitee@example.invalid")?.userId).toBe(first.hostId); expect(rows.find(row => row.email === "second@example.invalid")?.userId).toBe(second.hostId);
    expect(rows).toHaveLength(2);
  });
  it("preserves existing fields and updates history even when creation is disabled", async () => {
    const contact = await manual(); await preferences.saveContactSettings("demo-user", { ...DEFAULT_CONTACT_SETTINGS, bookingEnabled: false });
    await book("personal", "INVITEE@EXAMPLE.INVALID", 10, { name: "New booking name", answers: { phone: "+1 555 9999" } });
    expect(await contacts.getContact("demo-user", contact.id)).toMatchObject({ name: "Saved name", company: "Saved company", phone: "123456789", version: 1 });
    expect((await contacts.contactHistory("demo-user", contact.id)).total).toBe(1); await book("personal", "new@example.invalid", 11); expect(await active()).toHaveLength(1);
  });
  it("honors host-specific exclusions in collective bookings and allows manual excluded contacts", async () => {
    await preferences.saveContactSettings("demo-user", { ...DEFAULT_CONTACT_SETTINGS, exclusions: ["example.invalid"] }); await book("collective");
    expect((await active()).map(row => row.userId)).toEqual(["demo-mate"]); const contact = await manual(); expect((await contacts.contactHistory("demo-user", contact.id)).total).toBe(1);
  });
  it("prevents automatic recreation after deletion but links a manually recreated record", async () => {
    await book(); const [contact] = await active(); await contacts.deleteContact("demo-user", contact.id, contact.version);
    await book("personal", "invitee@example.invalid", 11); expect(await active()).toEqual([]);
    const replacement = await manual(); await book("personal", "invitee@example.invalid", 12);
    expect(await active()).toHaveLength(1); expect((await contacts.contactHistory("demo-user", replacement.id)).total).toBe(3); expect(await contacts.getContact("demo-user", contact.id)).toBeNull();
  });
  it("leaves a deleted contact deleted when a booking and deletion compete", async () => {
    const contact = await manual(); await Promise.all([book(), contacts.deleteContact("demo-user", contact.id, contact.version)]);
    expect(await active()).toEqual([]); expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
  it("rereads settings changed during the availability preflight", async () => {
    external.mockImplementationOnce(async () => { await preferences.saveContactSettings("demo-user", { ...DEFAULT_CONTACT_SETTINGS, bookingEnabled: false }); return { busy: [], errors: [] }; });
    await book(); expect(await active()).toEqual([]); expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
  it("does not create contacts for failed reservations and deduplicates simultaneous group bookings", async () => {
    await book(); await expect(book("personal", "failed@example.invalid")).rejects.toThrow("slot_unavailable");
    expect((await active()).map(row => row.email)).toEqual(["invitee@example.invalid"]);
    await Promise.all([book("group", "group@example.invalid", 12), book("group", "GROUP@EXAMPLE.INVALID", 12)]);
    const group = (await active()).find(row => row.email === "group@example.invalid")!; expect((await contacts.contactHistory("demo-user", group.id)).total).toBe(2);
  });
  it("retains one contact and both history entries after rescheduling and cancellation", async () => {
    const first = await book(), moved = await book("personal", "invitee@example.invalid", 11, { rescheduleUid: first.uid }); await booking.cancelBooking(moved.uid, "Local QA");
    const [contact] = await active(); expect(await active()).toHaveLength(1); expect((await contacts.contactHistory("demo-user", contact.id)).rows.map(row => row.status)).toEqual(["cancelled", "cancelled"]);
  });
  it("creates contacts for selected poll voters, not nonattendees or ordinary booking guests", async () => {
    const id = await polls.createPoll("demo-user", { title: "Poll", durationMin: 30, options: [at(10), at(11)] });
    await polls.vote(id, { name: "First", email: "first@example.invalid", picks: [at(10)] }); await polls.vote(id, { name: "Second", email: "second@example.invalid", picks: [at(10)] });
    await polls.vote(id, { name: "Not attending", email: "absent@example.invalid", picks: [at(11)] }); const uid = await polls.bookPoll("demo-user", id, at(10));
    expect((await active()).map(row => row.email).sort()).toEqual(["first@example.invalid", "second@example.invalid"]);
    for (const row of await active()) expect((await contacts.contactHistory("demo-user", row.id)).rows[0]).toMatchObject({ uid, inviteeEmail: row.email });
    await book("personal", "another@example.invalid", 12, { guests: ["guest@example.invalid"] }); expect((await active()).some(row => row.email === "guest@example.invalid")).toBe(false);
  });
});

describe("pre-feature contact history backfill", () => {
  const legacy = (uid: string, email: string, day: number, createdAt = "2025-01-01T00:00:00Z") => ({ uid, hostId: "demo-user", eventTypeId: "personal", start: new Date(Date.UTC(2030, 0, day)), end: new Date(Date.UTC(2030, 0, day, 1)),
    inviteeName: "Legacy invitee", inviteeEmail: email, inviteeTz: "UTC", createdAt: new Date(createdAt) });
  it("backfills all batches since 2024 once, skipping invalid/older records", async () => {
    await db.insert(schema.bookings).values([...Array.from({ length: 205 }, (_, i) => legacy(`legacy-${String(i).padStart(3, "0")}`, `legacy-${i}@example.invalid`, i + 1)),
      legacy("older", "older@example.invalid", 300, "2023-12-31T23:59:59Z"), legacy("invalid", "bad email", 301)]);
    await automatic.syncHistoricalContacts("demo-user"); expect(await active()).toHaveLength(205);
    await automatic.syncHistoricalContacts("demo-user"); expect(await active()).toHaveLength(205);
    expect((await db.select().from(schema.contactSettings))[0].backfilledAt).toBeInstanceOf(Date);
  });
  it("respects exclusions and deleted contacts during historical import", async () => {
    const contact = await manual(); await contacts.deleteContact("demo-user", contact.id, 1);
    await preferences.saveContactSettings("demo-user", { ...DEFAULT_CONTACT_SETTINGS, exclusions: ["blocked.invalid"] });
    await db.insert(schema.bookings).values([legacy("deleted", "invitee@example.invalid", 1), legacy("excluded", "qa@blocked.invalid", 2), legacy("allowed", "allowed@example.invalid", 3)]);
    await automatic.syncHistoricalContacts("demo-user"); expect((await active()).map(row => row.email)).toEqual(["allowed@example.invalid"]);
  });
  it("backfills selected poll attendees and preserves each attendee's history after an email edit", async () => {
    const id = await polls.createPoll("demo-user", { title: "Historical poll", durationMin: 30, options: [at(10), at(11)] });
    for (const [name, picks] of [["first", [at(10)]], ["second", [at(10)]], ["absent", [at(11)]]] as [string, string[]][]) await polls.vote(id, { name, email: `${name}@example.invalid`, picks });
    const uid = await polls.bookPoll("demo-user", id, at(10)); await db.delete(schema.contactMeetings); await db.delete(schema.contacts);
    await automatic.syncHistoricalContacts("demo-user"); const rows = await active(); expect(rows.map(row => row.email).sort()).toEqual(["first@example.invalid", "second@example.invalid"]);
    const second = rows.find(row => row.email === "second@example.invalid")!;
    await contacts.updateContact("demo-user", second.id, second.version, { ...second, email: "changed@example.invalid" });
    expect((await contacts.contactHistory("demo-user", second.id)).rows[0]).toMatchObject({ uid, inviteeEmail: "second@example.invalid" });
  });
  it("does not retroactively import skipped history after creation is re-enabled", async () => {
    await preferences.saveContactSettings("demo-user", { ...DEFAULT_CONTACT_SETTINGS, bookingEnabled: false }); await db.insert(schema.bookings).values(legacy("disabled", "skipped@example.invalid", 1));
    await automatic.syncHistoricalContacts("demo-user"); expect(await active()).toEqual([]);
    await preferences.saveContactSettings("demo-user", { ...DEFAULT_CONTACT_SETTINGS, version: 2 }); await automatic.syncHistoricalContacts("demo-user"); expect(await active()).toEqual([]);
    await book(); expect(await active()).toHaveLength(1);
  });
  it("rolls back contact and history changes with the reservation transaction", async () => {
    await expect(db.transaction(async (tx: typeof db) => { const row = legacy("rollback", "rollback@example.invalid", 1); await tx.insert(schema.bookings).values(row); await automatic.recordBookingContact(tx, row); throw new Error("rollback"); })).rejects.toThrow("rollback");
    expect(await active()).toEqual([]); expect(await db.select().from(schema.bookings)).toEqual([]); expect(await db.select().from(schema.contactMeetings)).toEqual([]);
  });
});
