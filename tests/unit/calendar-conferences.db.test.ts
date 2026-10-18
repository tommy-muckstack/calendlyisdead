import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import * as S from "../../lib/db/schema";

const harness = vi.hoisted(() => ({ db: undefined as Awaited<ReturnType<typeof import("../../lib/db").getDb>> }));
const effects = vi.hoisted(() => ({ write: vi.fn<typeof import("../../lib/calendars").writeEvent>(), read: vi.fn<typeof import("../../lib/calendars").readCalendarConference>(), mail: vi.fn<typeof import("../../lib/email").sendMail>(async () => false), room: vi.fn(async () => "http://local.invalid/meet/demo-room"), remove: vi.fn(async () => {}) }));
vi.mock("../../lib/db", async () => ({ schema: await import("../../lib/db/schema"), getDb: async () => harness.db }));
vi.mock("../../lib/calendars", () => ({ externalBusy: async () => ({ busy: [], errors: [] }), writeEvent: effects.write, readCalendarConference: effects.read, removeEvent: effects.remove }));
vi.mock("../../lib/conferencing", () => ({ confFor: (value: string) => value === "Google Meet" ? "meet" : value === "Zoom" ? "zoom" : null, meetingUrlFor: effects.room }));
vi.mock("../../lib/email", () => ({ sendMail: effects.mail }));
let client: PGlite, booking: typeof import("../../lib/booking"), conferences: typeof import("../../lib/calendar-conferences");
const day = DateTime.utc().plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!, start = `${day}T11:00:00.000Z`;
const readyUrl = "https://meet.google.com/abc-defg-hij", step = 5 * 60000;
const reserve = (email = "invitee@example.invalid", extra = {}) => booking.createBooking({ username: "host", slug: "meet", start, name: "Invitee", email, tz: "UTC", ...extra });
const stored = async (uid: string) => (await booking.getBooking(uid))!.booking;
const jobs = async () => await harness.db.select().from(S.calendarConferenceJobs) as typeof S.calendarConferenceJobs.$inferSelect[];
const tick = (offset = 0) => new Date(Date.now() + 2000 + offset);
const pendingWrite = { externalCalendarId: "google-calendar", externalEventId: "google-event", conferenceStatus: "pending" as const };
beforeAll(async () => {
  client = new PGlite(); await client.exec(fs.readFileSync("lib/db/ddl.sql", "utf8")); harness.db = drizzle(client, { schema: S });
  booking = await import("../../lib/booking"); conferences = await import("../../lib/calendar-conferences");
});
beforeEach(async () => {
  await client.exec("TRUNCATE users CASCADE;");
  await harness.db.insert(S.users).values({ id: "host", username: "host", name: "Host", email: "host@example.invalid", timezone: "UTC" });
  await harness.db.insert(S.schedules).values({ id: "schedule", userId: "host", timezone: "UTC", weekly: Object.fromEntries([1,2,3,4,5,6,7].map(day => [day, [{ start: "09:00", end: "17:00" }]])) });
  await harness.db.insert(S.eventTypes).values({ id: "meet", userId: "host", scheduleId: "schedule", slug: "meet", title: "Meet QA", location: "Google Meet", minNoticeMin: 0, seats: 3 });
  effects.write.mockReset().mockResolvedValue(pendingWrite); effects.read.mockReset().mockResolvedValue({ conferenceStatus: "ready", meetingUrl: readyUrl }); effects.mail.mockClear(); effects.room.mockClear(); effects.remove.mockClear();
});
afterAll(async () => { await client?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("durable pending Google conference reads", () => {
  it("keeps the booked event and visible pending state without a demo URL", async () => {
    const b = await reserve(); expect(b.meetingUrl).toBeNull(); expect(b.conferenceStatus).toBe("pending"); expect(effects.room).not.toHaveBeenCalled();
    expect((await jobs())[0]).toMatchObject({ id: b.uid, calendarId: "google-calendar", externalEventId: "google-event", attempts: 0, status: "pending" });
    expect(effects.mail.mock.calls[0][0].text).toContain("Google Meet is preparing"); expect(effects.mail.mock.calls[0][0].text).not.toContain("demo-room");
    const page = await (await import("../../app/booking/[uid]/page")).default({ params: Promise.resolve({ uid: b.uid }), searchParams: Promise.resolve({}) });
    expect(renderToStaticMarkup(page)).toContain("Google Meet is preparing");
    expect(await conferences.processCalendarConferences(tick())).toMatchObject({ ready: 1 }); expect((await stored(b.uid)).meetingUrl).toBe(readyUrl);
    expect(effects.read).toHaveBeenCalledWith("host", "google-calendar", "google-event"); expect(effects.write).toHaveBeenCalledOnce();
    await conferences.processCalendarConferences(tick(step)); expect(effects.read).toHaveBeenCalledOnce();
    await booking.cancelBooking(b.uid, "QA"); expect(effects.mail.mock.calls.at(-1)![0].ics).toContain(`LOCATION:${readyUrl}`);
  });
  it("retains an immediate real link without scheduling a polling job", async () => {
    effects.write.mockResolvedValue({ ...pendingWrite, conferenceStatus: "ready", meetingUrl: readyUrl }); const b = await reserve();
    expect(b.meetingUrl).toBe(readyUrl); expect(b.conferenceStatus).toBe("ready"); expect(await jobs()).toEqual([]); expect(effects.room).not.toHaveBeenCalled();
  });
  it("shows a real provider failure instead of a fabricated room", async () => {
    effects.write.mockResolvedValue({ externalCalendarId: "google-calendar", externalEventId: undefined, conferenceStatus: "failed", meetingUrl: undefined }); const b = await reserve();
    expect(b.meetingUrl).toBeNull(); expect((await stored(b.uid)).conferenceStatus).toBe("failed"); expect(await jobs()).toEqual([]); expect(effects.room).not.toHaveBeenCalled();
    expect(effects.mail.mock.calls[0][0].text).toContain("Contact your host");
  });
  it("keeps existing keyless and non-Meet conferencing behavior", async () => {
    effects.write.mockResolvedValue(null); expect((await reserve()).meetingUrl).toContain("demo-room");
    await harness.db.update(S.eventTypes).set({ location: "Zoom" }).where(eq(S.eventTypes.id, "meet"));
    effects.write.mockResolvedValue({ externalCalendarId: "google-calendar", externalEventId: "event", meetingUrl: readyUrl });
    expect((await reserve("zoom@example.invalid", { start: `${day}T12:00:00.000Z` })).meetingUrl).toContain("demo-room");
    expect(effects.room).toHaveBeenCalledTimes(2);
  });
  it("retries pending and transient reads without creating another meeting", async () => {
    const b = await reserve(); effects.read.mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce({ conferenceStatus: "pending" }).mockResolvedValueOnce({ conferenceStatus: "ready", meetingUrl: readyUrl });
    expect(await conferences.processCalendarConferences(tick())).toMatchObject({ pending: 1 });
    expect(await conferences.processCalendarConferences(tick(1000))).toMatchObject({ checked: 0 });
    await conferences.processCalendarConferences(tick(step)); await conferences.processCalendarConferences(tick(2*step));
    expect((await stored(b.uid)).meetingUrl).toBe(readyUrl); expect(effects.write).toHaveBeenCalledOnce(); expect((await jobs())[0].attempts).toBe(3);
  });
  it("bounds repeated pending reads and retains a useful failure state", async () => {
    const b = await reserve(); effects.read.mockResolvedValue({ conferenceStatus: "pending" });
    for (let i=0;i<13;i++) await conferences.processCalendarConferences(tick(i*step));
    expect(effects.read).toHaveBeenCalledTimes(12); expect((await jobs())[0].status).toBe("failed"); expect((await stored(b.uid)).conferenceStatus).toBe("failed");
  });
  it("re-finalizing a known pending or failed event never inserts another provider event", async () => {
    const b = await reserve(); let group = (await booking.getBooking(b.uid))!;
    await booking.finalize(group.group, group.eventType, group.hosts, false); expect(effects.write).toHaveBeenCalledOnce();
    effects.read.mockResolvedValue({ conferenceStatus: "failed" }); await conferences.processCalendarConferences(tick()); group = (await booking.getBooking(b.uid))!;
    await booking.finalize(group.group, group.eventType, group.hosts, false); expect(effects.write).toHaveBeenCalledOnce(); expect((await stored(b.uid)).conferenceStatus).toBe("failed");
  });
  it("does not poll cancelled reservations or reveal a cancelled meeting's late link", async () => {
    const b = await reserve(); await booking.cancelBooking(b.uid, "QA"); await conferences.processCalendarConferences(tick());
    expect(effects.read).not.toHaveBeenCalled(); expect((await jobs())[0].status).toBe("cancelled"); expect((await stored(b.uid)).meetingUrl).toBeNull();
  });
  it("discards an in-flight result after cancellation", async () => {
    const b = await reserve(); let done!: (value: { conferenceStatus: "ready"; meetingUrl: string }) => void;
    effects.read.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const processing = conferences.processCalendarConferences(tick()); await vi.waitFor(() => expect(effects.read).toHaveBeenCalledOnce());
    await booking.cancelBooking(b.uid, "QA"); done({ conferenceStatus: "ready", meetingUrl: readyUrl }); await processing;
    expect((await stored(b.uid)).meetingUrl).toBeNull(); expect((await jobs())[0].status).toBe("cancelled");
  });
  it("keeps a replacement reservation separate from the cancelled job", async () => {
    const old = await reserve(); const moved = await reserve("invitee@example.invalid", { rescheduleUid: old.uid });
    expect(moved.conferenceRequestId).not.toBe(old.conferenceRequestId); await conferences.processCalendarConferences(tick());
    expect((await stored(old.uid)).meetingUrl).toBeNull(); expect((await stored(moved.uid)).meetingUrl).toBe(readyUrl); expect(effects.read).toHaveBeenCalledOnce();
  });
  it("updates remaining group attendees when the initial attendee cancels and seat zero is reused", async () => {
    await harness.db.update(S.eventTypes).set({ kind: "group" }).where(eq(S.eventTypes.id, "meet"));
    const first = await reserve(), second = await reserve("second@example.invalid"); await booking.cancelBooking(first.uid, "QA"); const third = await reserve("third@example.invalid");
    expect(third.seat).toBe(0); expect(third.conferenceRequestId).toBe(first.uid); expect(effects.write).toHaveBeenCalledOnce();
    await conferences.processCalendarConferences(tick()); expect((await stored(second.uid)).meetingUrl).toBe(readyUrl); expect((await stored(third.uid)).meetingUrl).toBe(readyUrl); expect((await stored(first.uid)).meetingUrl).toBeNull();
  });
  it("a new group session cannot receive the cancelled session's conference", async () => {
    await harness.db.update(S.eventTypes).set({ kind: "group" }).where(eq(S.eventTypes.id, "meet"));
    const old = await reserve(); await booking.cancelBooking(old.uid, "QA"); const fresh = await reserve("fresh@example.invalid");
    expect(fresh.conferenceRequestId).not.toBe(old.conferenceRequestId); await conferences.processCalendarConferences(tick()); expect(effects.read).toHaveBeenCalledOnce(); expect((await stored(old.uid)).meetingUrl).toBeNull();
  });
  it("does not invent a link when a group attendee joins before the first provider request finishes", async () => {
    await harness.db.update(S.eventTypes).set({ kind: "group" }).where(eq(S.eventTypes.id, "meet")); let done!: (value: typeof pendingWrite) => void;
    effects.write.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const firstRequest = reserve(); await vi.waitFor(() => expect(effects.write).toHaveBeenCalledOnce());
    const second = await reserve("second@example.invalid"); expect(second.meetingUrl).toBeNull(); expect(effects.room).not.toHaveBeenCalled();
    done(pendingWrite); const first = await firstRequest; await conferences.processCalendarConferences(tick());
    expect((await stored(first.uid)).meetingUrl).toBe(readyUrl); expect((await stored(second.uid)).meetingUrl).toBe(readyUrl); expect(effects.write).toHaveBeenCalledOnce();
  });
  it("later group attendees inherit the resolved conference without another provider event", async () => {
    await harness.db.update(S.eventTypes).set({ kind: "group" }).where(eq(S.eventTypes.id, "meet")); await reserve(); await conferences.processCalendarConferences(tick());
    expect((await reserve("later@example.invalid")).meetingUrl).toBe(readyUrl); expect(effects.write).toHaveBeenCalledOnce();
  });
  it("gives pre-feature and poll-style rows a request identity when finalized", async () => {
    const [row] = await harness.db.insert(S.bookings).values({ uid: "legacy", eventTypeId: "meet", hostId: "host", start: new Date(start), end: new Date(+new Date(start)+1800000), location: "Google Meet", inviteeName: "Invitee", inviteeEmail: "invitee@example.invalid", inviteeTz: "UTC" }).returning();
    const [event] = await harness.db.select().from(S.eventTypes); const hosts = await harness.db.select().from(S.users);
    await booking.finalize([row], event, hosts, false); expect((await jobs())[0].id).toBe("legacy"); await conferences.processCalendarConferences(tick()); expect((await stored("legacy")).meetingUrl).toBe(readyUrl);
  });
  it("updates both Collective host rows using the selected pending provider event", async () => {
    await harness.db.insert(S.users).values({ id: "mate", username: "mate", name: "Mate", email: "mate@example.invalid" });
    await harness.db.update(S.eventTypes).set({ kind: "collective" }).where(eq(S.eventTypes.id, "meet"));
    const rows = await harness.db.insert(S.bookings).values(["host", "mate"].map((hostId, i) => ({ uid: `collective-${i}`, groupUid: "collective-0", hostId, eventTypeId: "meet", start: new Date(start), end: new Date(+new Date(start)+1800000), location: "Google Meet", inviteeName: "Invitee", inviteeEmail: "invitee@example.invalid", inviteeTz: "UTC" }))).returning();
    const [event] = await harness.db.select().from(S.eventTypes); const hosts = await harness.db.select().from(S.users);
    await booking.finalize(rows, event, hosts, false); expect(await jobs()).toHaveLength(1); await conferences.processCalendarConferences(tick());
    expect((await stored("collective-0")).meetingUrl).toBe(readyUrl); expect((await stored("collective-1")).meetingUrl).toBe(readyUrl);
  });
  it("keeps unpaid holds out of a group's resolved link update", async () => {
    await harness.db.update(S.eventTypes).set({ kind: "group" }).where(eq(S.eventTypes.id, "meet")); const first = await reserve();
    const second = await reserve("unpaid@example.invalid"); await harness.db.update(S.bookings).set({ paymentStatus: "pending" }).where(eq(S.bookings.uid, second.uid));
    await conferences.processCalendarConferences(tick()); expect((await stored(first.uid)).meetingUrl).toBe(readyUrl); expect((await stored(second.uid)).meetingUrl).toBeNull();
  });
  it("retains a resolved session link for later finalization after its original attendee cancels", async () => {
    await harness.db.update(S.eventTypes).set({ kind: "group" }).where(eq(S.eventTypes.id, "meet")); const first = await reserve(), second = await reserve("pending@example.invalid");
    await harness.db.update(S.bookings).set({ paymentStatus: "pending" }).where(eq(S.bookings.uid, second.uid)); await booking.cancelBooking(first.uid, "QA");
    await conferences.processCalendarConferences(tick()); expect((await stored(second.uid)).meetingUrl).toBeNull(); expect((await jobs())[0].meetingUrl).toBe(readyUrl);
    await harness.db.update(S.bookings).set({ paymentStatus: "paid" }).where(eq(S.bookings.uid, second.uid));
    const group = (await booking.getBooking(second.uid))!; await booking.finalize(group.group, group.eventType, group.hosts, false);
    expect((await stored(second.uid)).meetingUrl).toBe(readyUrl); expect(effects.write).toHaveBeenCalledOnce();
  });
  it("retains an immediately ready session link after its original attendee cancels", async () => {
    effects.write.mockResolvedValue({ ...pendingWrite, conferenceStatus: "ready", meetingUrl: readyUrl });
    await harness.db.update(S.eventTypes).set({ kind: "group" }).where(eq(S.eventTypes.id, "meet")); const first = await reserve();
    await harness.db.update(S.eventTypes).set({ priceCents: 100 }).where(eq(S.eventTypes.id, "meet")); const second = await reserve("pending@example.invalid");
    expect((await stored(second.uid)).paymentStatus).toBe("pending"); expect((await stored(second.uid)).meetingUrl).toBeNull(); await booking.cancelBooking(first.uid, "QA");
    await harness.db.update(S.bookings).set({ paymentStatus: "paid" }).where(eq(S.bookings.uid, second.uid));
    const group = (await booking.getBooking(second.uid))!; await booking.finalize(group.group, group.eventType, group.hosts, false);
    expect((await stored(second.uid)).meetingUrl).toBe(readyUrl); expect(effects.write).toHaveBeenCalledOnce();
  });
  it("ends pending work for past meetings without leaving a perpetual preparing state", async () => {
    const b = await reserve(); await conferences.processCalendarConferences(new Date(+new Date(start)+3600000));
    expect(effects.read).not.toHaveBeenCalled(); expect((await stored(b.uid)).conferenceStatus).toBe("failed"); expect((await jobs())[0].status).toBe("failed");
  });
  it("enforces calendar ownership and provider identity when reading a conference", async () => {
    const actual = await vi.importActual<typeof import("../../lib/calendars")>("../../lib/calendars"); const { seal } = await import("../../lib/crypto");
    await harness.db.insert(S.calendarConnections).values({ id: "conn", userId: "host", provider: "google", accountEmail: "host@example.invalid", secret: seal({ access_token: "synthetic" }) });
    await harness.db.insert(S.userCalendars).values({ id: "cal", userId: "host", connectionId: "conn", externalId: "provider-cal", name: "QA", canWrite: true });
    const fetch = vi.fn(async () => Response.json({ hangoutLink: readyUrl })); vi.stubGlobal("fetch", fetch);
    expect(await actual.readCalendarConference("another", "cal", "event")).toEqual({ conferenceStatus: "failed" }); expect(fetch).not.toHaveBeenCalled();
    expect(await actual.readCalendarConference("host", "cal", "event")).toEqual({ conferenceStatus: "ready", meetingUrl: readyUrl });
    await harness.db.delete(S.calendarConnections); expect(await actual.readCalendarConference("host", "cal", "event")).toEqual({ conferenceStatus: "failed" }); expect(fetch).toHaveBeenCalledOnce(); vi.unstubAllGlobals();
  });
  it("leases a read once across concurrent schedulers", async () => {
    await reserve(); await Promise.all([conferences.processCalendarConferences(tick()), conferences.processCalendarConferences(tick())]); expect(effects.read).toHaveBeenCalledOnce();
  });
  it("rejects stale responses from an expired read lease", async () => {
    const b = await reserve(); let done!: (value: { conferenceStatus: "ready"; meetingUrl: string }) => void;
    effects.read.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const old = conferences.processCalendarConferences(tick()); await vi.waitFor(() => expect(effects.read).toHaveBeenCalledOnce());
    await conferences.processCalendarConferences(tick(step)); done({ conferenceStatus: "ready", meetingUrl: "https://meet.google.com/stale" }); await old;
    expect((await stored(b.uid)).meetingUrl).toBe(readyUrl);
  });
  it("does not replace an existing supplied or resolved meeting link", async () => {
    const b = await reserve(); await harness.db.update(S.bookings).set({ meetingUrl: "https://example.invalid/existing", conferenceStatus: "ready" }).where(eq(S.bookings.uid, b.uid));
    await conferences.processCalendarConferences(tick()); expect((await stored(b.uid)).meetingUrl).toBe("https://example.invalid/existing");
  });
  it("replaying the schema preserves a pending request", async () => {
    const b = await reserve(); const before = await jobs(); await client.exec(fs.readFileSync("lib/db/ddl.sql", "utf8")); expect(await jobs()).toEqual(before); expect((await stored(b.uid)).conferenceRequestId).toBe(b.uid);
  });
  it("keeps the scheduler behind its existing cron authorization", async () => {
    vi.stubEnv("CRON_SECRET", "local-conference-qa"); const route = (await import("../../app/api/cron/workflows/route")).GET;
    expect((await route(new NextRequest("http://localhost/api/cron/workflows"))).status).toBe(401); expect(effects.read).not.toHaveBeenCalled(); vi.unstubAllEnvs();
  });
});
