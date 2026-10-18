import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import fs from "node:fs";
import { DateTime } from "luxon";
import * as S from "../../lib/db/schema";
import { googleMeetHostsReady } from "../../lib/google-meet-setup";
import { LocationOptionsSchema, publicLocations, resolveLocation } from "../../lib/event-locations";
import { initialEventFields } from "../../lib/event-creation-validation";
const harness = vi.hoisted(() => ({ db: undefined as ReturnType<typeof drizzle<typeof S>> | undefined }));
const effects = vi.hoisted(() => ({ write: vi.fn(), read: vi.fn(), room: vi.fn(), mail: vi.fn(), remove: vi.fn() }));
vi.mock("../../lib/db", async () => ({ schema: await import("../../lib/db/schema"), getDb: async () => harness.db }));
vi.mock("@/auth", () => ({ requireUser: async () => ({ id: "host" }) }));
vi.mock("../../lib/calendars", () => ({ externalBusy: async () => ({ busy: [], errors: [] }), writeEvent: effects.write, readCalendarConference: effects.read, removeEvent: effects.remove }));
vi.mock("../../lib/conferencing", () => ({ confFor: (location: string) => location === "Google Meet" ? "meet" : null, meetingUrlFor: effects.room }));
vi.mock("../../lib/email", () => ({ sendMail: effects.mail }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
const automatic = { id: "auto-meet", kind: "google_meet" as const }, url = "https://meet.google.com/abc-defg-hij";
const day = DateTime.utc().plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!, at = (hour = 11) => `${day}T${hour}:00:00.000Z`;
let client: PGlite, booking: typeof import("../../lib/booking"), post: typeof import("../../app/api/event-types/route").POST, patch: typeof import("../../app/api/event-types/[id]/route").PATCH;
const db = () => harness.db!;
const book = (extra = {}) => booking.createBooking({ username: "host", slug: "meet", start: at(), name: "Invitee", email: "invitee@example.invalid", tz: "UTC", ...extra });
const edit = (body: unknown, id = "meet") => patch(new NextRequest("http://local.invalid", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const draft = (kind: "one_on_one" | "collective" | "round_robin" = "one_on_one") => ({ draftId: crypto.randomUUID(), autoSlug: true, settings: { ...initialEventFields(kind, kind === "one_on_one" ? "host-schedule" : null), title: "Auto Meet", slug: "automatic", minNoticeMin: 0, locations: [automatic] },
  ...(kind === "one_on_one" ? {} : { shared: { workspaceId: "workspace", hosts: ["host", "other"].map(id => ({ membershipId: id + "-member", scheduleId: null, priority: 1 })), distribution: "availability", reschedule: "reassign" } }) });
const create = (body: unknown) => post(new Request("http://local.invalid", { method: "POST", body: JSON.stringify(body) }));
beforeAll(async () => {
  client = new PGlite(); await client.exec(fs.readFileSync("lib/db/ddl.sql", "utf8")); harness.db = drizzle(client, { schema: S });
  booking = await import("../../lib/booking"); post = (await import("../../app/api/event-types/route")).POST; patch = (await import("../../app/api/event-types/[id]/route")).PATCH;
});
beforeEach(async () => {
  await client.exec("TRUNCATE users CASCADE; TRUNCATE workspaces CASCADE;");
  for (const id of ["host", "other"]) {
    await db().insert(S.users).values({ id, email: id + "@example.invalid", username: id, name: id, timezone: "UTC" });
    await db().insert(S.schedules).values({ id: id + "-schedule", userId: id, timezone: "UTC", isDefault: true, weekly: Object.fromEntries([1,2,3,4,5,6,7].map(day => [day, [{ start: "09:00", end: "17:00" }]])) });
    await db().insert(S.calendarConnections).values({ id: id + "-connection", userId: id, provider: "google", accountEmail: id + "@example.invalid", secret: "unused-test-secret", status: "ok" });
    await db().insert(S.userCalendars).values({ id: id + "-calendar", userId: id, connectionId: id + "-connection", externalId: "synthetic", name: "Calendar", canWrite: true });
    await db().update(S.users).set({ addToCalendarId: id + "-calendar" }).where(eq(S.users.id, id));
  }
  await db().insert(S.workspaces).values({ id: "workspace", name: "Workspace" });
  await db().insert(S.workspaceMembers).values(["host", "other"].map(id => ({ id: id + "-member", workspaceId: "workspace", userId: id, role: id === "host" ? "owner" as const : "user" as const })));
  await db().insert(S.eventTypes).values({ id: "meet", userId: "host", scheduleId: "host-schedule", slug: "meet", title: "Automatic Meet", location: "Google Meet", locations: [automatic], minNoticeMin: 0 });
  effects.write.mockReset().mockImplementation(async (hostId: string, event: { uid: string; wantsMeet?: boolean }) => ({ externalCalendarId: hostId + "-calendar", externalEventId: event.uid, ...(event.wantsMeet ? { conferenceStatus: "ready", meetingUrl: url } : {}) }));
  effects.read.mockReset().mockResolvedValue({ conferenceStatus: "ready", meetingUrl: url }); effects.room.mockReset(); effects.mail.mockReset().mockResolvedValue({ sent: false }); effects.remove.mockReset();
});
afterAll(async () => { await client?.close(); });

describe("automatic Meet configuration", () => {
  it("stores an explicit automatic choice without a supplied URL or provider payload", () => {
    expect(LocationOptionsSchema.parse([automatic])).toEqual([automatic]);
    expect(LocationOptionsSchema.safeParse([{ ...automatic, url, accountId: "private" }]).success).toBe(false);
    expect(publicLocations([automatic])![0]).toMatchObject({ label: "Google Meet", input: null, description: "Details will be provided after booking." });
    expect(resolveLocation({ location: "", locations: [automatic] })).toMatchObject({ location: "Google Meet", locationChoice: { kind: "google_meet", meetingUrl: null } });
  });
  it("requires a selected writable healthy Google destination for every host", async () => {
    expect(await googleMeetHostsReady(db(), ["host", "other"])).toBe(true);
    for (const status of ["reauth", "error"]) { await db().update(S.calendarConnections).set({ status }).where(eq(S.calendarConnections.userId, "other")); expect(await googleMeetHostsReady(db(), ["host", "other"])).toBe(false); }
    await db().update(S.calendarConnections).set({ status: "ok", provider: "microsoft" }).where(eq(S.calendarConnections.userId, "other")); expect(await googleMeetHostsReady(db(), ["other"])).toBe(false);
    await db().update(S.userCalendars).set({ canWrite: false }).where(eq(S.userCalendars.userId, "host")); expect(await googleMeetHostsReady(db(), ["host"])).toBe(false);
  });
  it("rejects another user's calendar even if a stale destination points at it", async () => {
    await db().update(S.users).set({ addToCalendarId: "other-calendar" }).where(eq(S.users.id, "host")); expect(await googleMeetHostsReady(db(), ["host"])).toBe(false);
    const real = await vi.importActual<typeof import("../../lib/calendars")>("../../lib/calendars"); expect(await real.writeEvent("host", { uid: "unused", title: "QA", description: "", location: "Google Meet", start: new Date(at()), end: new Date(at(12)), organizer: { name: "Host", email: "host@example.invalid" }, attendees: [], wantsMeet: true })).toBeNull();
  });
  it("never sends a Meet creation request to a non-Google calendar", async () => {
    await db().update(S.calendarConnections).set({ provider: "microsoft" }).where(eq(S.calendarConnections.userId, "host"));
    const real = await vi.importActual<typeof import("../../lib/calendars")>("../../lib/calendars");
    expect(await real.writeEvent("host", { uid: "unused", title: "QA", description: "", location: "Google Meet", start: new Date(at()), end: new Date(at(12)), organizer: { name: "Host", email: "host@example.invalid" }, attendees: [], wantsMeet: true })).toMatchObject({ conferenceStatus: "failed", externalEventId: undefined });
  });
  it("rejects unconfigured creation atomically, then allows the same draft after setup", async () => {
    const input = draft(); await db().update(S.users).set({ addToCalendarId: null }).where(eq(S.users.id, "host"));
    const response = await create(input); expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: "google_meet_not_configured" }); expect(await db().select().from(S.eventTypeCreations)).toEqual([]);
    await db().update(S.users).set({ addToCalendarId: "host-calendar" }).where(eq(S.users.id, "host")); expect((await create(input)).status).toBe(201);
    await db().update(S.users).set({ addToCalendarId: null }).where(eq(S.users.id, "host")); expect((await create(input)).status).toBe(200);
  });
  it("rejects an editor save without changing the existing location", async () => {
    await db().update(S.eventTypes).set({ locations: null, location: "Office" }).where(eq(S.eventTypes.id, "meet")); await db().update(S.users).set({ addToCalendarId: null }).where(eq(S.users.id, "host"));
    const response = await edit({ locations: [automatic] }); expect(response.status).toBe(400); expect((await response.json()).error).toBe("google_meet_not_configured");
    expect((await db().select().from(S.eventTypes).where(eq(S.eventTypes.id, "meet")))[0].location).toBe("Office");
    expect((await edit({ locations: [{ id: "manual", kind: "video", provider: "google_meet", url }] })).status).toBe(200);
  });
  it.each(["collective", "round_robin"] as const)("requires every %s host's own calendar and validates later host changes", async kind => {
    const input = draft(kind); await db().update(S.users).set({ addToCalendarId: null }).where(eq(S.users.id, "other")); expect((await create(input)).status).toBe(400);
    await db().update(S.users).set({ addToCalendarId: "other-calendar" }).where(eq(S.users.id, "other")); const response = await create(input); expect(response.status).toBe(201); const event = (await response.json()).event;
    await db().update(S.calendarConnections).set({ status: "reauth" }).where(eq(S.calendarConnections.userId, "other"));
    expect((await edit({ title: "Changed", sharedVersion: event.sharedVersion, shared: input.shared }, event.id)).status).toBe(400);
  });
});

describe("automatic Meet booking snapshots and lifecycle", () => {
  it("creates a room only for the chosen automatic option and preserves manual options", async () => {
    const office = { id: "office", kind: "in_person" as const, address: "Office", notes: "" };
    await db().update(S.eventTypes).set({ locations: [automatic, office] }).where(eq(S.eventTypes.id, "meet"));
    const inPerson = await book({ locationSelection: { id: "office", input: "" } }); expect(inPerson.meetingUrl).toBeNull(); expect(effects.write.mock.calls[0][1].wantsMeet).toBe(false);
    const meet = await book({ start: at(12), locationSelection: { id: automatic.id, input: "" } }); expect(meet.meetingUrl).toBe(url); expect(meet.locationChoice.kind).toBe("google_meet"); expect(effects.write.mock.calls[1][1].wantsMeet).toBe(true); expect(effects.room).not.toHaveBeenCalled();
    expect(effects.mail.mock.calls.some(([mail]) => mail.ics.includes(url))).toBe(true);
  });
  it("blocks a disconnected host before reserving a booking, while another location still works", async () => {
    await db().update(S.users).set({ addToCalendarId: null }).where(eq(S.users.id, "host")); await expect(book()).rejects.toThrow("calendar_unavailable"); expect(await db().select().from(S.bookings)).toEqual([]); expect(effects.write).not.toHaveBeenCalled();
    await db().update(S.eventTypes).set({ locations: [automatic, { id: "office", kind: "in_person", address: "Office", notes: "" }] }).where(eq(S.eventTypes.id, "meet")); expect((await book({ locationSelection: { id: "office", input: "" } })).location).toBe("Office");
  });
  it("handles pending rooms through the existing bounded provider-read job", async () => {
    effects.write.mockResolvedValue({ externalCalendarId: "host-calendar", externalEventId: "provider-event", conferenceStatus: "pending" });
    const result = await book(); expect(result.meetingUrl).toBeNull(); expect(result.conferenceStatus).toBe("pending"); expect(effects.room).not.toHaveBeenCalled();
    await db().update(S.eventTypes).set({ locations: [{ id: "office", kind: "in_person", address: "Office", notes: "" }], location: "Office" }).where(eq(S.eventTypes.id, "meet"));
    const { processCalendarConferences } = await import("../../lib/calendar-conferences"); expect((await processCalendarConferences(new Date(Date.now() + 2000))).ready).toBe(1);
    expect((await booking.getBooking(result.uid))!.booking).toMatchObject({ meetingUrl: url, location: "Google Meet", locationChoice: { kind: "google_meet" } }); expect(effects.write).toHaveBeenCalledOnce();
  });
  it.each([null, { externalCalendarId: "host-calendar", externalEventId: undefined, conferenceStatus: "failed" }])("shows missing or failed write-back without fabricating a room (%j)", async response => {
    effects.write.mockResolvedValue(response); const result = await book(); expect(result.meetingUrl).toBeNull(); expect(result.conferenceStatus).toBe("failed"); expect(effects.room).not.toHaveBeenCalled();
  });
  it("shares one room and request identity between group seats", async () => {
    await db().update(S.eventTypes).set({ kind: "group", seats: 3 }).where(eq(S.eventTypes.id, "meet"));
    const first = await book(), second = await book({ email: "second@example.invalid" }); expect(second.meetingUrl).toBe(first.meetingUrl); expect(second.conferenceRequestId).toBe(first.conferenceRequestId); expect(effects.write).toHaveBeenCalledOnce();
    await booking.cancelBooking(first.uid, "QA"); const third = await book({ email: "third@example.invalid" }); expect(third.meetingUrl).toBe(url); expect(effects.write).toHaveBeenCalledOnce();
  });
  it("creates one room for a collective booking and shares it with other calendar copies", async () => {
    const response = await create(draft("collective")); expect(response.status).toBe(201); const event = (await response.json()).event;
    const result = await book({ slug: event.slug }); expect(result.meetingUrl).toBe(url); expect(effects.write).toHaveBeenCalledTimes(2);
    expect(effects.write.mock.calls.map(([, event]) => event.wantsMeet)).toEqual([true, false]); expect(effects.write.mock.calls[1][1].location).toBe(url);
    const rows = await db().select().from(S.bookings).where(eq(S.bookings.groupUid, result.uid)); expect(rows).toHaveLength(2); expect(rows.every(row => row.meetingUrl === url)).toBe(true);
  });
  it("rechecks Round robin calendars before choosing a host", async () => {
    const response = await create(draft("round_robin")); expect(response.status).toBe(201); const event = (await response.json()).event;
    await db().update(S.users).set({ addToCalendarId: null }).where(eq(S.users.id, "host")); const result = await book({ slug: event.slug }); expect(result.hostId).toBe("other"); expect(result.meetingUrl).toBe(url);
  });
  it("reschedules using a new room request and cancels the old provider event", async () => {
    const first = await book(); effects.write.mockImplementation(async (hostId: string, event: { uid: string }) => ({ externalCalendarId: hostId + "-calendar", externalEventId: event.uid, conferenceStatus: "ready", meetingUrl: "https://meet.google.com/new-room" }));
    const second = await book({ start: at(12), rescheduleUid: first.uid }); expect(second.conferenceRequestId).not.toBe(first.conferenceRequestId); expect(second.meetingUrl).toBe("https://meet.google.com/new-room"); expect(effects.remove).toHaveBeenCalledWith("host-calendar", first.uid);
    expect((await booking.getBooking(first.uid))!.booking).toMatchObject({ status: "cancelled", meetingUrl: url });
  });
});
