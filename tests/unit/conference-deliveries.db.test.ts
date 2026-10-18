import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as S from "../../lib/db/schema";
import { processCalendarConferences } from "../../lib/calendar-conferences";
import { processConferenceDeliveries } from "../../lib/conference-deliveries";
import { bookingInvitation } from "../../lib/booking";
import { updateGoogleConferenceLocation } from "../../lib/calendars/google";

const harness = vi.hoisted(() => ({ db: undefined as Awaited<ReturnType<typeof import("../../lib/db").getDb>> }));
const effects = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn(), mail: vi.fn(), configured: vi.fn(), fetch: vi.fn() }));
vi.mock("../../lib/db", async () => ({ schema: await import("../../lib/db/schema"), getDb: async () => harness.db }));
vi.mock("../../lib/calendars", () => ({ readCalendarConference: effects.read, updateCalendarConferenceLocation: effects.update }));
vi.mock("../../lib/email", () => ({ sendMail: effects.mail, emailConfigured: effects.configured }));
const now = new Date("2030-11-01T12:00:00Z"), url = "https://meet.google.com/abc-defg-hij", step = 5 * 60_000;
const at = (offset = 0) => new Date(+now + offset);
const db = () => harness.db;
const deliveries = () => db().select().from(S.calendarConferenceDeliveries) as Promise<(typeof S.calendarConferenceDeliveries.$inferSelect)[]>;
const mails = async () => (await deliveries()).filter(d => d.payload.kind === "mail");
const calendars = async () => (await deliveries()).filter(d => d.payload.kind === "calendar");
const seed = async (overrides: Partial<typeof S.bookings.$inferInsert> = {}) => {
  const [row] = await db().insert(S.bookings).values({ uid: "booking", eventTypeId: "event", hostId: "host", start: at(3 * 86400000), end: at(3 * 86400000 + 1800000),
    inviteeName: "Invitee", inviteeEmail: "invitee@example.invalid", inviteeTz: "America/New_York", location: "Google Meet", conferenceRequestId: "conference", conferenceStatus: "pending",
    externalCalendarId: "calendar-host", externalEventId: "event-host", ...overrides }).returning();
  return row as typeof S.bookings.$inferSelect;
};
let client: PGlite;
beforeAll(async () => { client = new PGlite(); await client.exec(fs.readFileSync("lib/db/ddl.sql", "utf8")); harness.db = drizzle(client, { schema: S }); });
beforeEach(async () => {
  await client.exec("TRUNCATE users CASCADE");
  await db().insert(S.users).values(["host", "mate"].map(id => ({ id, name: id, email: `${id}@example.invalid` })));
  await db().insert(S.eventTypes).values({ id: "event", userId: "host", slug: "event", title: "Meeting QA" });
  await db().insert(S.calendarConferenceJobs).values({ id: "conference", hostId: "host", calendarId: "calendar-host", externalEventId: "event-host", nextAttemptAt: now });
  effects.read.mockReset().mockResolvedValue({ conferenceStatus: "ready", meetingUrl: url });
  effects.update.mockReset().mockResolvedValue("updated"); effects.mail.mockReset().mockResolvedValue(true); effects.configured.mockReset().mockReturnValue(true);
  effects.fetch.mockReset(); vi.stubGlobal("fetch", effects.fetch);
});
afterAll(async () => { await client.close(); vi.unstubAllGlobals(); });

describe("late conference delivery", () => {
  it("atomically queues one update per recipient and calendar, with the original UID and times", async () => {
    const row = await seed({ guests: ["guest@example.invalid", "INVITEE@example.invalid", "host@example.invalid"] });
    await processCalendarConferences(now);
    expect(await calendars()).toHaveLength(1); expect(await mails()).toHaveLength(3);
    const first = (await mails())[0].payload; if (first.kind !== "mail") throw new Error("mail expected");
    expect(first.mail.ics).toContain(`UID:${row.uid}@calendlyisdead`); expect(first.mail.ics).toContain("SEQUENCE:2"); expect(first.mail.ics).toContain(`LOCATION:${url}`);
    expect(first.mail.text).toContain("7:00 AM EST"); expect(first.mail.text).not.toContain("preparing");
    expect(await processConferenceDeliveries(now)).toMatchObject({ sent: 3, updated: 1 });
    expect(effects.update).toHaveBeenCalledWith("host", "calendar-host", "event-host", url);
    await processCalendarConferences(at(step)); await processConferenceDeliveries(at(step)); expect(effects.mail).toHaveBeenCalledTimes(3); expect(effects.update).toHaveBeenCalledOnce();
  });
  it("rolls back resolution if delivery persistence fails", async () => {
    await seed(); await client.exec("ALTER TABLE calendar_conference_deliveries ADD CONSTRAINT reject_qa CHECK (false)");
    try { await expect(processCalendarConferences(now)).rejects.toThrow(); }
    finally { await client.exec("ALTER TABLE calendar_conference_deliveries DROP CONSTRAINT reject_qa"); }
    expect((await db().select().from(S.bookings))[0].meetingUrl).toBeNull(); expect(await deliveries()).toEqual([]);
    expect((await db().select().from(S.calendarConferenceJobs))[0].status).toBe("reading");
    await processCalendarConferences(at(step)); expect(await deliveries()).toHaveLength(3);
  });
  it("retries only failed recipients with byte-identical content and the same key", async () => {
    await seed(); await processCalendarConferences(now);
    effects.mail.mockImplementation(async mail => mail.to !== "invitee@example.invalid");
    expect(await processConferenceDeliveries(now)).toMatchObject({ sent: 1, pending: 1, updated: 1 });
    const original = effects.mail.mock.calls.find(([mail]) => mail.to === "invitee@example.invalid")![0];
    await db().update(S.eventTypes).set({ title: "Changed after attempt" });
    effects.mail.mockResolvedValue(true); await processConferenceDeliveries(at(step - 1)); expect(effects.mail).toHaveBeenCalledTimes(2);
    await processConferenceDeliveries(at(step)); expect(effects.mail.mock.calls.at(-1)![0]).toEqual(original); expect(effects.update).toHaveBeenCalledOnce();
  });
  it("concurrent workers cannot claim the same deliveries", async () => {
    await seed(); await processCalendarConferences(now);
    await Promise.all([processConferenceDeliveries(now), processConferenceDeliveries(now)]);
    expect(effects.mail).toHaveBeenCalledTimes(2); expect(effects.update).toHaveBeenCalledOnce();
  });
  it("recovers a crashed lease without accepting its stale completion", async () => {
    await seed({ externalCalendarId: null, externalEventId: null, guests: [], inviteeEmail: "host@example.invalid" }); await processCalendarConferences(now);
    let done!: (sent: boolean) => void; effects.mail.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const old = processConferenceDeliveries(now); await vi.waitFor(() => expect(effects.mail).toHaveBeenCalledOnce());
    await processConferenceDeliveries(at(step)); done(false); await old;
    expect((await mails())[0]).toMatchObject({ status: "sent", attempts: 2 }); expect(effects.mail.mock.calls[0][0]).toEqual(effects.mail.mock.calls[1][0]);
  });
  it("stops uncertain mail before provider idempotency expires and bounds calendar retries", async () => {
    await seed(); await processCalendarConferences(now); effects.mail.mockRejectedValue(new Error("unknown delivery")); effects.update.mockRejectedValue(new Error("offline"));
    await processConferenceDeliveries(now); await processConferenceDeliveries(at(23 * 3600000)); expect(effects.mail).toHaveBeenCalledTimes(2);
    expect((await mails()).every(d => d.status === "failed")).toBe(true);
    for (let i = 1; i <= 8; i++) await processConferenceDeliveries(at(23 * 3600000 + i * step));
    expect(effects.update).toHaveBeenCalledTimes(8); expect((await calendars())[0].status).toBe("failed");
  });
  it("records local outbox delivery once when no mail provider is configured", async () => {
    await seed(); await processCalendarConferences(now); effects.configured.mockReturnValue(false); effects.mail.mockResolvedValue(false);
    expect(await processConferenceDeliveries(now)).toMatchObject({ local: 2 }); await processConferenceDeliveries(at(step)); expect(effects.mail).toHaveBeenCalledTimes(2);
  });
  it("skips cancelled, expired, payment-held and replaced-link bookings", async () => {
    await seed(); await processCalendarConferences(now); await db().update(S.bookings).set({ status: "cancelled" });
    await processConferenceDeliveries(now); expect(effects.mail).not.toHaveBeenCalled(); expect(effects.update).not.toHaveBeenCalled();
    for (const change of [{ status: "confirmed", end: now }, { end: at(86400000), paymentStatus: "pending" }, { paymentStatus: "none", meetingUrl: "https://meet.google.com/new-room" }]) {
      await db().update(S.bookings).set(change); await db().update(S.calendarConferenceDeliveries).set({ status: "pending" }); await processConferenceDeliveries(now);
      expect(effects.mail).not.toHaveBeenCalled(); expect(effects.update).not.toHaveBeenCalled();
    }
  });
  it("does not enqueue a follow-up for an already resolved or held booking", async () => {
    await seed({ meetingUrl: url, conferenceStatus: "ready" }); await seed({ uid: "held", seat: 1, externalEventId: null, paymentStatus: "pending" });
    await processCalendarConferences(now); expect(await deliveries()).toEqual([]);
  });
  it("keeps rescheduled reservations separate and cancellation sequences higher", async () => {
    const row = await seed(); await processCalendarConferences(now); await db().update(S.bookings).set({ status: "cancelled" });
    await seed({ uid: "replacement", conferenceRequestId: "new-conference", rescheduledFrom: row.uid }); await processConferenceDeliveries(now);
    expect(effects.mail).not.toHaveBeenCalled(); expect(effects.update).not.toHaveBeenCalled();
    const [event] = await db().select().from(S.eventTypes); const hosts = await db().select().from(S.users).where(eq(S.users.id, "host"));
    expect(bookingInvitation("cancelled", row, event, hosts).ics).toContain("SEQUENCE:3");
  });
  it("updates both Collective calendar copies but sends one invitation per recipient", async () => {
    await seed({ groupUid: "booking" }); await seed({ uid: "booking-1", groupUid: "booking", hostId: "mate", externalCalendarId: "calendar-mate", externalEventId: "event-mate" });
    await processCalendarConferences(now); expect(await calendars()).toHaveLength(2); expect(await mails()).toHaveLength(3);
    await processConferenceDeliveries(now); expect(effects.update).toHaveBeenCalledTimes(2); expect(effects.mail.mock.calls.filter(([mail]) => mail.to === "invitee@example.invalid")).toHaveLength(1);
    expect(effects.mail.mock.calls.every(([mail]) => mail.ics.includes("UID:booking@calendlyisdead"))).toBe(true);
  });
  it("retains a group calendar update after transfer and keeps attendee messages separate", async () => {
    await seed({ guests: ["first-guest@example.invalid"] }); await seed({ uid: "second", seat: 1, inviteeEmail: "second@example.invalid", guests: ["second-guest@example.invalid"], externalCalendarId: null, externalEventId: null });
    await processCalendarConferences(now); await db().update(S.bookings).set({ status: "cancelled" }).where(eq(S.bookings.uid, "booking"));
    await db().update(S.bookings).set({ externalCalendarId: "calendar-host", externalEventId: "event-host" }).where(eq(S.bookings.uid, "second"));
    await processConferenceDeliveries(now); expect(effects.update).toHaveBeenCalledOnce(); expect(effects.mail).toHaveBeenCalledTimes(3);
    expect(effects.mail.mock.calls.every(([mail]) => !mail.text.includes("first-guest") && mail.ics.includes("UID:second@calendlyisdead"))).toBe(true);
  });
  it("replaying the DDL retains queued receipts and immutable content", async () => {
    await seed(); await processCalendarConferences(now); const before = await deliveries(); await client.exec(fs.readFileSync("lib/db/ddl.sql", "utf8")); expect(await deliveries()).toEqual(before);
  });
});

describe("Google copy updates", () => {
  const tokens = { access_token: "synthetic-offline-token" };
  it("patches only location with an etag and no provider email", async () => {
    effects.fetch.mockResolvedValueOnce(Response.json({ status: "confirmed", etag: '"revision"', location: "Google Meet" })).mockResolvedValueOnce(Response.json({ id: "event" }));
    expect(await updateGoogleConferenceLocation(tokens, "calendar/a", "event/a", url)).toBe("updated");
    const [target, request] = effects.fetch.mock.calls[1]; expect(target).toContain("calendar%2Fa/events/event%2Fa?sendUpdates=none");
    expect(request.method).toBe("PATCH"); expect(request.headers["If-Match"]).toBe('"revision"'); expect(JSON.parse(request.body)).toEqual({ location: url });
  });
  it("does not recreate deleted events or patch an already applied link", async () => {
    for (const response of [new Response(null, { status: 404 }), new Response(null, { status: 410 }), Response.json({ status: "cancelled" }), Response.json({ location: url })]) {
      effects.fetch.mockClear().mockResolvedValueOnce(response); await updateGoogleConferenceLocation(tokens, "calendar", "event", url); expect(effects.fetch).toHaveBeenCalledOnce();
    }
  });
  it("retries version conflicts and refuses an unversioned write", async () => {
    effects.fetch.mockResolvedValueOnce(Response.json({ etag: "revision" })).mockResolvedValueOnce(new Response(null, { status: 412 }));
    await expect(updateGoogleConferenceLocation(tokens, "calendar", "event", url)).rejects.toMatchObject({ status: 412 });
    effects.fetch.mockClear().mockResolvedValueOnce(Response.json({ status: "confirmed" }));
    await expect(updateGoogleConferenceLocation(tokens, "calendar", "event", url)).rejects.toMatchObject({ status: 502 }); expect(effects.fetch).toHaveBeenCalledOnce();
  });
  it("validates the resolved URL before provider I/O", async () => {
    await expect(updateGoogleConferenceLocation(tokens, "calendar", "event", "https://example.invalid/room")).rejects.toThrow("invalid_meeting_url"); expect(effects.fetch).not.toHaveBeenCalled();
  });
  it("treats deletion between GET and PATCH as terminal", async () => {
    effects.fetch.mockResolvedValueOnce(Response.json({ etag: "revision" })).mockResolvedValueOnce(new Response(null, { status: 410 }));
    expect(await updateGoogleConferenceLocation(tokens, "calendar", "event", url)).toBe("cancelled");
  });
  it("uses the saved destination and enforces both calendar and connection ownership", async () => {
    const actual = await vi.importActual<typeof import("../../lib/calendars")>("../../lib/calendars"), { seal } = await import("../../lib/crypto");
    await db().insert(S.calendarConnections).values({ id: "connection", userId: "host", provider: "google", accountEmail: "host@example.invalid", secret: seal(tokens) });
    await db().insert(S.userCalendars).values({ id: "saved-calendar", connectionId: "connection", userId: "host", externalId: "saved-provider-calendar", name: "Calendar", canWrite: true });
    await db().update(S.users).set({ addToCalendarId: "changed-destination" }).where(eq(S.users.id, "host"));
    effects.fetch.mockResolvedValueOnce(Response.json({ location: url }));
    expect(await actual.updateCalendarConferenceLocation("host", "saved-calendar", "saved-event", url)).toBe("updated");
    expect(effects.fetch.mock.calls[0][0]).toContain("saved-provider-calendar/events/saved-event"); effects.fetch.mockClear();
    expect(await actual.updateCalendarConferenceLocation("mate", "saved-calendar", "saved-event", url)).toBe("cancelled");
    await db().update(S.calendarConnections).set({ userId: "mate" }); expect(await actual.updateCalendarConferenceLocation("host", "saved-calendar", "saved-event", url)).toBe("cancelled");
    await db().update(S.calendarConnections).set({ userId: "host", provider: "microsoft" }); expect(await actual.updateCalendarConferenceLocation("host", "saved-calendar", "saved-event", url)).toBe("cancelled");
    await db().update(S.calendarConnections).set({ provider: "google" }); await db().update(S.userCalendars).set({ canWrite: false });
    expect(await actual.updateCalendarConferenceLocation("host", "saved-calendar", "saved-event", url)).toBe("cancelled"); expect(effects.fetch).not.toHaveBeenCalled();
  });
});
