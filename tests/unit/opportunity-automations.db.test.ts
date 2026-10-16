import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { NextRequest } from "next/server";
import { EMPTY_CONTACT } from "../../lib/contact-validation";
import { DEFAULT_CONTACT_SETTINGS } from "../../lib/contact-settings-validation";
import { EMPTY_OPPORTUNITY_AUTOMATION, OpportunityAutomationFields, renderOpportunityName, type OpportunityAutomationDraft } from "../../lib/opportunity-automation-validation";
import { OpportunityFields } from "../../lib/opportunity-validation";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
const external = vi.hoisted(() => vi.fn(async () => ({ busy: [], errors: [] })));
const mail = vi.hoisted(() => vi.fn<(mail: import("../../lib/email").Mail) => Promise<boolean>>(async () => false));
vi.mock("@/auth", () => ({ requireUser: auth })); vi.mock("../../lib/email", () => ({ sendMail: mail }));
vi.mock("../../lib/calendars", () => ({ externalBusy: external, writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} })); vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), service: typeof import("../../lib/opportunity-automations"), opportunities: typeof import("../../lib/opportunities"), contacts: typeof import("../../lib/contacts"), booking: typeof import("../../lib/booking"), automatic: typeof import("../../lib/automatic-contacts"), preferences: typeof import("../../lib/contact-settings");
let collection: typeof import("../../app/api/opportunity-automations/route"), item: typeof import("../../app/api/opportunity-automations/[id]/route");
const user = "demo-user", mate = "demo-mate", email = "invitee@example.invalid";
const at = (hour = 10) => DateTime.now().toUTC().plus({ weeks: 2 }).startOf("day").plus({ hours: hour }).toISO()!;
const book = (slug = "personal", address = email, hour = 10, extra: Record<string, unknown> = {}) => booking.createBooking({ username: ["rr", "collective"].includes(slug) ? "team:auto-lists" : "demo", slug, start: at(hour), name: "Alex Example", email: address, tz: "UTC", answers: { purpose: "Consulting" }, ...extra });
const draft = (extra: Partial<OpportunityAutomationDraft> = {}) => ({ ...EMPTY_OPPORTUNITY_AUTOMATION, eventTypeId: "personal", name: "New sales lead", opportunityName: "{{invitee_full_name}} - {{meeting_name}}", ...extra });
const save = (extra: Partial<OpportunityAutomationDraft> = {}, owner = user, id = crypto.randomUUID()) => service.createOpportunityAutomation(owner, id, draft(extra));
const deals = (owner = user) => opportunities.listOpportunities(owner, { page: 1, q: "" });
const list = (owner = user, q = "", page = 1, eventId?: string) => service.listOpportunityAutomations(owner, { q, page, eventId });
const request = (method: string, body?: unknown, query = "") => new NextRequest(`http://localhost/api/opportunity-automations${query}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-opportunity-auto-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  service = await import("../../lib/opportunity-automations"); opportunities = await import("../../lib/opportunities"); contacts = await import("../../lib/contacts"); booking = await import("../../lib/booking"); automatic = await import("../../lib/automatic-contacts"); preferences = await import("../../lib/contact-settings"); collection = await import("../../app/api/opportunity-automations/route"); item = await import("../../app/api/opportunity-automations/[id]/route");
  await db.update(schema.schedules).set({ timezone: "UTC", weekly: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(day => [day, [{ start: "00:00", end: "24:00" }]])) });
  await db.insert(schema.users).values({ id: "team-owner", name: "Owner", email: "owner@example.invalid", username: "owner" }); await db.insert(schema.teams).values({ id: "automation-team", slug: "auto-lists", name: "Automations" });
});
beforeEach(async () => {
  for (const table of [schema.opportunityAutomations, schema.opportunities, schema.opportunityDeletions, schema.bookings, schema.contacts, schema.contactCollections, schema.contactFields, schema.contactSettings, schema.eventTypeHosts, schema.eventTypes]) await db.delete(table);
  for (const [id, kind] of [["personal", "one_on_one"], ["other", "one_on_one"], ["group", "group"], ["rr", "round_robin"], ["collective", "collective"], ["once", "one_off"], ["template", "managed"], ["assigned", "one_on_one"]]) {
    const team = ["rr", "collective", "template"].includes(id);
    await db.insert(schema.eventTypes).values({ id, slug: id, kind, title: id, userId: team ? "team-owner" : user, teamId: team ? "automation-team" : null, managedParentId: id === "assigned" ? "template" : null, minNoticeMin: 0, rangeDays: 730, durationMin: 30, seats: 3, questions: [{ id: "purpose", label: "Purpose?", type: "text", required: false }] });
    if (["rr", "collective"].includes(id)) await db.insert(schema.eventTypeHosts).values([user, mate].map(userId => ({ userId, eventTypeId: id })));
  }
  auth.mockResolvedValue({ id: user }); mail.mockClear(); external.mockReset(); external.mockResolvedValue({ busy: [], errors: [] });
});
afterEach(() => vi.restoreAllMocks());
describe("named opportunity automation configuration", () => {
  it("scopes available events and configurations to actual hosts", async () => {
    await save({ eventTypeId: "collective" }, mate); expect((await list()).rows).toEqual([]); expect((await list()).events.map(event => event.id)).not.toContain("template");
    for (const [owner, eventTypeId] of [[mate, "personal"], ["team-owner", "collective"], [user, "template"]]) await expect(save({ eventTypeId }, owner)).rejects.toMatchObject({ status: 404 });
    expect((await list(mate)).events.map(event => event.id)).toEqual(["collective", "rr"]);
  });
  it("supports multiple named configurations per event and exact creation retries", async () => {
    const id = crypto.randomUUID(), first = await save({}, user, id); expect(await save({}, user, id)).toEqual(first); await save({ name: "Second lead", stage: "proposal_sent" }); expect((await list()).total).toBe(2);
    await expect(save({ name: "Changed" }, user, id)).rejects.toMatchObject({ status: 409 }); await expect(save({ eventTypeId: "collective" }, mate, id)).rejects.toMatchObject({ status: 409 });
  });
  it("keeps literal search and pagination without a record cap", async () => {
    await save({ name: "100% _lead_" }); for (let index = 0; index < 26; index++) await save({ name: `Lead ${index}` });
    expect((await list(user, "% _")).total).toBe(1); expect((await list()).rows).toHaveLength(25); expect((await list(user, "", 2)).rows).toHaveLength(2); expect((await list(user, "", 1, "other")).total).toBe(0);
  });
  it("saves event, stage and name changes, rejects stale overwrites, and accepts exact retries", async () => {
    const own = await save(), changed = { ...draft({ eventTypeId: "other", stage: "intro_scheduled", name: "Updated", opportunityName: "{{my_name}}" }), action: "save" as const, version: 1 };
    const next = await service.changeOpportunityAutomation(user, own.id, changed); expect(next).toMatchObject({ name: "Updated", eventTypeId: "other", stage: "intro_scheduled", opportunityName: "{{my_name}}", version: 2 }); expect(await service.changeOpportunityAutomation(user, own.id, changed)).toEqual(next);
    await expect(service.changeOpportunityAutomation(user, own.id, { action: "toggle", enabled: false, version: 1 })).rejects.toMatchObject({ status: 409 }); await expect(service.deleteOpportunityAutomation(user, own.id, 1)).rejects.toMatchObject({ status: 409 });
    for (const action of [() => service.getOpportunityAutomation(mate, own.id), () => service.changeOpportunityAutomation(mate, own.id, { action: "toggle", enabled: false, version: 2 }), () => service.deleteOpportunityAutomation(mate, own.id, 2)]) await expect(action()).rejects.toMatchObject({ status: 404 });
  });
  it("keeps broken configurations visible and allows pause, repair and deletion", async () => {
    const own = await save(); await db.delete(schema.eventTypes).where(eq(schema.eventTypes.id, "personal")); expect((await list()).rows[0].eventTitle).toBeNull();
    await service.changeOpportunityAutomation(user, own.id, { action: "toggle", enabled: false, version: 1 }); await expect(service.changeOpportunityAutomation(user, own.id, { action: "toggle", enabled: true, version: 2 })).rejects.toMatchObject({ status: 404 });
    await service.changeOpportunityAutomation(user, own.id, { ...draft({ eventTypeId: "other" }), action: "save", version: 2 }); await service.deleteOpportunityAutomation(user, own.id, 3); await service.deleteOpportunityAutomation(user, own.id, 3); expect((await list()).total).toBe(0); await expect(save({}, user, own.id)).rejects.toBeTruthy();
  });
  it("does not expose or apply an event reassigned away from the owner", async () => {
    const own = await save({ eventTypeId: "collective" }); await db.delete(schema.eventTypeHosts).where(and(eq(schema.eventTypeHosts.eventTypeId, "collective"), eq(schema.eventTypeHosts.userId, user))); expect((await service.getOpportunityAutomation(user, own.id)).eventTitle).toBeNull(); await book("collective"); expect((await deals()).total).toBe(0); await service.changeOpportunityAutomation(user, own.id, { action: "toggle", enabled: false, version: 1 });
  });
});
describe("dynamic opportunity names", () => {
  it("expands all five variables once and normalizes whitespace", () => { expect(renderOpportunityName("{{my_name}} | {{invitee_full_name}} | {{invitee_first_name}} | {{invitee_last_name}} | {{meeting_name}}", { hostName: "Host", inviteeName: " Alex   van Example ", meetingName: "Intro {{my_name}}" })).toBe("Host | Alex van Example | Alex | van Example | Intro {{my_name}}"); });
  it("handles mononyms, blank expansion and Unicode-safe clipping", () => { expect(renderOpportunityName("{{invitee_last_name}}", { hostName: "", inviteeName: "Alex", meetingName: "Intro" })).toBe("Alex"); expect(renderOpportunityName("{{meeting_name}}", { hostName: "", inviteeName: "", meetingName: "" })).toBe("Opportunity"); const name = renderOpportunityName("{{invitee_full_name}}", { hostName: "", inviteeName: "x".repeat(199) + "😀", meetingName: "" }); expect(name).toBe("x".repeat(199)); });
  it.each(["{{unknown}}", "{{invitee_full_name", "invitee_name}}", "{{ my_name }}", "", "x".repeat(201)])("rejects invalid templates %s", opportunityName => { expect(OpportunityAutomationFields.safeParse(draft({ opportunityName })).success).toBe(false); });
});
describe("transactional booking-to-opportunity creation", () => {
  it("links the persisted invitee, actual host, selected stage and complete booking detail", async () => {
    const config = await save({ stage: "intro_scheduled", opportunityName: "{{my_name}} · {{invitee_first_name}} {{invitee_last_name}} · {{meeting_name}}" }), reservation = await book(), [row] = (await deals()).rows, [host] = await db.select().from(schema.users).where(eq(schema.users.id, user));
    const detail = await opportunities.getOpportunity(user, row.opportunity.id); expect(detail.opportunity).toMatchObject({ name: `${host.name} · Alex Example · personal`, stage: "intro_scheduled", version: 1 }); expect(detail.contact).toMatchObject({ name: "Alex Example", email }); expect(detail.booking).toMatchObject({ bookingUid: reservation.uid, eventTitle: "personal", automationName: config.name, inviteeName: "Alex Example", status: "confirmed" }); expect(detail.history).toHaveLength(1); expect((await booking.getBooking(reservation.uid)).booking.answers).toEqual({ purpose: "Consulting" });
  });
  it("creates one opportunity per enabled automation and per independent booking", async () => { await save(); await save({ stage: "proposal_sent" }); await save({ enabled: false }); await book(); await book("personal", email, 11); expect((await deals()).total).toBe(4); expect(await db.select().from(schema.contacts)).toHaveLength(1); });
  it("applies changes only to future bookings and retains prior names/stages after pause and deletion", async () => {
    const own = await save(); await book(); await service.changeOpportunityAutomation(user, own.id, { ...draft({ name: "New version", stage: "completed", opportunityName: "New {{invitee_full_name}}" }), action: "save", version: 1 }); await book("personal", email, 11); await service.changeOpportunityAutomation(user, own.id, { action: "toggle", enabled: false, version: 2 }); await book("personal", email, 12); await service.deleteOpportunityAutomation(user, own.id, 3); await book("personal", email, 13);
    const rows = (await deals()).rows; expect(rows).toHaveLength(2); expect(rows.map(row => row.opportunity.name).sort()).toEqual(["Alex Example - personal", "New Alex Example"]); const old = rows.find(row => row.opportunity.stage === "new_lead")!; expect((await opportunities.getOpportunity(user, old.opportunity.id)).booking?.automationName).toBe("New sales lead");
  });
  it("does not backfill earlier bookings or resurrect a deleted opportunity on replay", async () => {
    const old = await book(); await save(); await automatic.syncHistoricalContacts(user); const [persisted] = await db.select().from(schema.bookings).where(eq(schema.bookings.uid, old.uid)); await db.transaction((tx: typeof db) => automatic.recordBookingContact(tx, persisted)); expect((await deals()).total).toBe(0);
    const fresh = await book("personal", email, 11), [deal] = (await deals()).rows; await opportunities.deleteOpportunity(user, deal.opportunity.id, 1); const [current] = await db.select().from(schema.bookings).where(eq(schema.bookings.uid, fresh.uid)); await db.transaction((tx: typeof db) => automatic.recordBookingContact(tx, current)); expect((await deals()).total).toBe(0); expect(await db.select().from(schema.opportunityBookings)).toHaveLength(0);
  });
  it("uses persisted invitee values rather than a supplied retry payload", async () => {
    const reservation = await book(); await save(); await db.delete(schema.contactListAutomationRuns); const [persisted] = await db.select().from(schema.bookings).where(eq(schema.bookings.uid, reservation.uid)); await db.transaction((tx: typeof db) => automatic.recordBookingContact(tx, { ...persisted, inviteeName: "Forged" })); expect((await deals()).rows[0].opportunity.name).toBe("Alex Example - personal");
  });
  it("preserves contact opt-outs/exclusions/deletion while applying to an existing contact", async () => {
    await save(); const person = await contacts.createContact(user, crypto.randomUUID(), { ...EMPTY_CONTACT, name: "Existing", email }); await preferences.saveContactSettings(user, { ...DEFAULT_CONTACT_SETTINGS, bookingEnabled: false }); await book(); await book("personal", "absent@example.invalid", 11); await contacts.deleteContact(user, person.id, 1); await book("personal", email, 12); expect((await deals()).total).toBe(1);
    await preferences.saveContactSettings(user, { ...DEFAULT_CONTACT_SETTINGS, exclusions: ["excluded.invalid"], version: 2 }); await book("personal", "new@excluded.invalid", 13); expect((await deals()).total).toBe(1);
  });
  it("relinks a reschedule without changing manual edits or creating another opportunity", async () => {
    await save(); const old = await book(), [deal] = (await deals()).rows; await opportunities.changeOpportunity(user, deal.opportunity.id, { ...OpportunityFields.parse(deal.opportunity), name: "Reviewed", stage: "completed", action: "edit", version: 1 }); const next = await book("personal", email, 11, { rescheduleUid: old.uid }), detail = await opportunities.getOpportunity(user, deal.opportunity.id); expect((await deals()).total).toBe(1); expect(detail.opportunity).toMatchObject({ name: "Reviewed", stage: "completed", version: 2 }); expect(detail.booking?.bookingUid).toBe(next.uid); expect((await db.select().from(schema.opportunityBookings))[0].originalBookingUid).toBe(old.uid);
    await booking.cancelBooking(next.uid, "Test cancellation"); expect((await opportunities.getOpportunity(user, deal.opportunity.id)).booking?.status).toBe("cancelled"); expect((await deals()).total).toBe(1);
  });
  it("relinks every collective host's private opportunity using the shared anchor", async () => {
    for (const owner of [user, mate]) await save({ eventTypeId: "collective" }, owner); const old = await book("collective"), next = await book("collective", email, 11, { rescheduleUid: old.uid });
    for (const owner of [user, mate]) { const own = await deals(owner); expect(own.total).toBe(1); const detail = await opportunities.getOpportunity(owner, own.rows[0].opportunity.id), [linked] = await db.select().from(schema.bookings).where(eq(schema.bookings.uid, detail.booking!.bookingUid!)); expect(linked.hostId).toBe(owner); expect(linked.groupUid).toBe(next.uid); }
  });
  it("creates round-robin opportunities only for the chosen host and never transfers their private link", async () => {
    for (const owner of [user, mate]) await save({ eventTypeId: "rr" }, owner); const old = await book("rr"), [persisted] = await db.select().from(schema.bookings).where(eq(schema.bookings.uid, old.uid)), other = persisted.hostId === user ? mate : user; expect((await deals(persisted.hostId)).total).toBe(1); expect((await deals(other)).total).toBe(0);
    await db.delete(schema.eventTypeHosts).where(and(eq(schema.eventTypeHosts.eventTypeId, "rr"), eq(schema.eventTypeHosts.userId, persisted.hostId))); await book("rr", email, 11, { rescheduleUid: old.uid }); const [deal] = (await deals(persisted.hostId)).rows; expect((await opportunities.getOpportunity(persisted.hostId, deal.opportunity.id)).booking?.bookingUid).toBe(old.uid); expect((await deals(other)).total).toBe(0);
  });
  it("handles group invitees, one-off events and assigned managed copies", async () => {
    for (const eventTypeId of ["group", "once", "assigned"]) await save({ eventTypeId }); await book("group"); await book("group", "second@example.invalid"); await book("once", email, 11); await book("assigned", email, 12); expect((await deals()).total).toBe(4);
  });
  it("keeps booking origin private and safe after physical booking deletion", async () => {
    await save(); const reservation = await book(), [deal] = (await deals()).rows; await expect(opportunities.getOpportunity(mate, deal.opportunity.id)).rejects.toMatchObject({ status: 404 });
    await db.update(schema.bookings).set({ hostId: mate }).where(eq(schema.bookings.uid, reservation.uid)); expect((await opportunities.getOpportunity(user, deal.opportunity.id)).booking?.bookingUid).toBeNull(); await db.delete(schema.bookings); expect((await opportunities.getOpportunity(user, deal.opportunity.id)).booking).toMatchObject({ bookingUid: null, eventTitle: "personal" }); expect((await deals()).total).toBe(1);
  });
  it("rolls back all opportunity writes, contacts, reservation and receipt on storage failure", async () => {
    await save(); const transact = db.transaction.bind(db); vi.spyOn(db, "transaction").mockImplementationOnce((callback: (tx: typeof db) => Promise<unknown>) => transact(async (tx: typeof db) => { const insert = tx.insert.bind(tx); tx.insert = (table: unknown) => { if (table === schema.opportunityBookings) throw new Error("link storage failed"); return insert(table); }; return callback(tx); }));
    await expect(book()).rejects.toThrow("slot_unavailable"); for (const table of [schema.bookings, schema.contacts, schema.opportunities, schema.opportunityMoves, schema.opportunityBookings, schema.contactListAutomationRuns]) expect(await db.select().from(table)).toEqual([]); expect(mail).not.toHaveBeenCalled();
  });
  it("runs alongside list, fixed-value and question automations with one receipt", async () => {
    const { createContactCollection } = await import("../../lib/contact-lists"), { EMPTY_RULES } = await import("../../lib/contact-view-validation"), { createContactField, contactCustomValues } = await import("../../lib/contact-custom-fields"), { EMPTY_FIELD } = await import("../../lib/contact-field-validation");
    const target = await createContactCollection(user, { id: crypto.randomUUID(), name: "Prospects", kind: "list", rules: EMPTY_RULES }), fixed = await createContactField(user, crypto.randomUUID(), { ...EMPTY_FIELD, name: "Source", type: "text" });
    await (await import("../../lib/contact-automations")).changeContactAutomation(user, "personal", { action: "save", listIds: [target.id], enabled: true, version: 0 });
    await (await import("../../lib/contact-field-automations")).changeContactFieldAutomation(user, "personal", { action: "save", actions: [{ fieldId: fixed.id, type: "text", value: "Booked" }], fieldVersions: { [fixed.id]: 1 }, enabled: true, version: 0 });
    const mapping = await (await import("../../lib/contact-question-automations")).changeContactQuestionAutomation(user, "personal", { action: "save", fieldId: crypto.randomUUID(), questionId: "purpose", enabled: true, version: 0 });
    await save(); await book(); const [deal] = (await deals()).rows, values = await contactCustomValues(user, deal.contact!.id); expect(values.values).toMatchObject({ [fixed.id]: "Booked", [mapping.field!.id]: "Consulting" }); expect(await db.select().from(schema.contactListMembers)).toHaveLength(1); expect(await db.select().from(schema.contactListAutomationRuns)).toHaveLength(1);
  });
  it("rejects duplicate concurrent reservations without creating extra opportunities", async () => { await save(); const results = await Promise.allSettled([book(), book()]); expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1); expect((await deals()).total).toBe(1); });
  it("ignores malformed legacy templates without breaking a reservation", async () => { const own = await save(); await db.update(schema.opportunityAutomations).set({ opportunityName: "{{unknown}}" }).where(eq(schema.opportunityAutomations.id, own.id)); await book(); expect((await deals()).total).toBe(0); expect(await db.select().from(schema.bookings)).toHaveLength(1); });
});
describe("opportunity automation API", () => {
  it("requires authentication on every method", async () => { auth.mockResolvedValue(null); expect((await collection.GET(request("GET"))).status).toBe(401); expect((await collection.POST(request("POST", {}))).status).toBe(401); for (const method of ["GET", "PATCH", "DELETE"] as const) expect((await item[method](request(method, method === "GET" ? undefined : {}), context("unknown"))).status).toBe(401); });
  it("validates strict payloads, filters, malformed and oversized bodies", async () => {
    for (const patch of [{ userId: mate }, { opportunityName: "{{unknown}}" }, { eventTypeId: "" }, { enabled: "true" }, { stage: "custom" }]) expect((await collection.POST(request("POST", { ...draft(), id: crypto.randomUUID(), ...patch }))).status).toBe(400);
    expect((await collection.GET(request("GET", undefined, "?page=0"))).status).toBe(400); expect((await collection.POST(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400); expect((await collection.POST(new Request("http://localhost", { method: "POST", body: "x".repeat(10001) }))).status).toBe(413);
  });
  it("returns private responses, version conflicts and idempotent deletion", async () => {
    const id = crypto.randomUUID(); expect((await collection.POST(request("POST", { ...draft(), id }))).status).toBe(201); expect((await item.GET(request("GET"), context(id))).headers.get("cache-control")).toContain("no-store"); expect((await collection.GET(request("GET"))).headers.get("cache-control")).toContain("no-store");
    expect((await item.PATCH(request("PATCH", { action: "toggle", enabled: false, version: 1 }), context(id))).status).toBe(200); expect((await item.DELETE(request("DELETE", { version: 1 }), context(id))).status).toBe(409); for (let n = 0; n < 2; n++) expect((await item.DELETE(request("DELETE", { version: 2 }), context(id))).status).toBe(204); expect((await item.GET(request("GET"), context(id))).status).toBe(404); expect((await collection.POST(request("POST", { ...draft(), id }))).status).toBe(409);
  });
  it("does not leak private storage failures", async () => { vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("private database")); const response = await collection.POST(request("POST", { ...draft(), id: crypto.randomUUID() })); expect(response.status).toBe(500); expect(await response.text()).not.toContain("private database"); });
});
