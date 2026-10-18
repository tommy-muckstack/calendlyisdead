import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { seal } from "../../lib/crypto";
import { google } from "../../lib/calendars/google";
import { ProviderError } from "../../lib/calendars/types";

const effects = vi.hoisted(() => ({ mail: vi.fn(), booked: vi.fn() }));
vi.mock("../../lib/email", () => ({ sendMail: effects.mail }));
vi.mock("../../lib/workflows", () => ({ onBooked: effects.booked, onCancelled: vi.fn() }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>;
let schema: typeof import("../../lib/db/schema");
let booking: typeof import("../../lib/booking");
let calendars: typeof import("../../lib/calendars");
const day = DateTime.utc().plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!;
const at = (hour = 14) => `${day}T${hour}:00:00.000Z`;
const input = (slug = "failure-personal", extra = {}) => ({ username: "demo", slug, start: at(), name: "Test invitee", email: "calendar@example.invalid", tz: "UTC", ...extra });

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-calendar-failures-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  booking = await import("../../lib/booking"); calendars = await import("../../lib/calendars");
  await db.insert(schema.teams).values({ id: "failure-team", slug: "failure-team", name: "Test team" });
  await db.insert(schema.eventTypes).values([
    { id: "failure-personal", userId: "demo-user", slug: "failure-personal", title: "Test", minNoticeMin: 0 },
    { id: "failure-group", userId: "demo-user", slug: "failure-group", title: "Test", kind: "group", seats: 2, minNoticeMin: 0 },
    ...["collective", "round_robin"].map(kind => ({ id: `failure-${kind}`, userId: "demo-user", teamId: "failure-team", slug: `failure-${kind}`, title: "Test", kind, minNoticeMin: 0 })),
  ]);
  await db.insert(schema.eventTypeHosts).values(["collective", "round_robin"].flatMap(kind => ["demo-user", "demo-mate"].map(userId => ({ eventTypeId: `failure-${kind}`, userId }))));
});
beforeEach(async () => {
  vi.restoreAllMocks(); effects.mail.mockClear(); effects.booked.mockClear();
  await db.delete(schema.bookings);
  await db.delete(schema.userCalendars); await db.delete(schema.calendarConnections);
  await db.insert(schema.calendarConnections).values({ id: "failure-google", userId: "demo-user", provider: "google", accountEmail: "host@example.invalid", secret: seal({ access_token: "offline-test-token" }) });
  await db.insert(schema.userCalendars).values({ id: "failure-calendar", userId: "demo-user", connectionId: "failure-google", externalId: "selected", name: "Test", checkConflicts: true });
  vi.spyOn(google, "freeBusy").mockRejectedValue(new ProviderError(401, "private-provider-message"));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const slots = (slug = "failure-personal", owner = "demo") => booking.availability(owner, slug, day, day, "UTC");

describe("failed selected calendar checks", () => {
  it("does not offer slots when the selected provider fails", async () => {
    expect((await slots())?.slots).toEqual({});
  });
  it("rejects a direct booking before creating records or sending notifications", async () => {
    await expect(booking.createBooking(input())).rejects.toThrow("calendar_unavailable");
    expect(await db.select().from(schema.bookings)).toHaveLength(0);
    expect(effects.mail).not.toHaveBeenCalled(); expect(effects.booked).not.toHaveBeenCalled();
  });
});

describe("calendar failure boundaries and recovery", () => {
  it("marks revoked access for reconnect without exposing provider details", async () => {
    const result = await calendars.externalBusy("demo-user", new Date(day), new Date(at()));
    expect(result).toEqual({ busy: [], errors: ["calendar_unavailable"] });
    expect((await db.select().from(schema.calendarConnections))[0].status).toBe("reauth");
  });
  it("marks a temporary error and clears it after a complete successful retry", async () => {
    vi.mocked(google.freeBusy).mockRejectedValueOnce(new ProviderError(503, "private detail"));
    await slots();
    expect((await db.select().from(schema.calendarConnections))[0].status).toBe("error");
    vi.mocked(google.freeBusy).mockResolvedValue([]);
    expect((await slots())?.slots[day]).toContain(at());
    expect((await db.select().from(schema.calendarConnections))[0].status).toBe("ok");
  });
  it("does not block a host who has opted out of conflict checking", async () => {
    await db.update(schema.userCalendars).set({ checkConflicts: false });
    expect((await slots())?.slots[day]).toContain(at());
    expect(google.freeBusy).not.toHaveBeenCalled();
  });
  it("does not trust a selected calendar attached to another user's connection", async () => {
    await db.update(schema.calendarConnections).set({ userId: "demo-mate" });
    expect((await slots())?.slots).toEqual({});
    expect(google.freeBusy).not.toHaveBeenCalled();
  });
  it("preserves an existing booking when a reschedule cannot check the calendar", async () => {
    vi.mocked(google.freeBusy).mockResolvedValueOnce([]);
    const original = await booking.createBooking(input()); effects.mail.mockClear();
    await expect(booking.createBooking(input("failure-personal", { start: at(15), rescheduleUid: original.uid }))).rejects.toThrow("calendar_unavailable");
    expect(await db.select().from(schema.bookings)).toMatchObject([{ uid: original.uid, status: "confirmed", start: new Date(at()) }]);
    expect(effects.mail).not.toHaveBeenCalled();
  });
  it("does not offer remaining group seats when the host calendar cannot be checked", async () => {
    vi.mocked(google.freeBusy).mockResolvedValueOnce([]);
    await booking.createBooking(input("failure-group"));
    await expect(booking.createBooking(input("failure-group"))).rejects.toThrow("calendar_unavailable");
    expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
  it("requires every collective host's calendar check to succeed", async () => {
    expect((await slots("failure-collective", "team:failure-team"))?.slots).toEqual({});
    await expect(booking.createBooking(input("failure-collective", { username: "team:failure-team" }))).rejects.toThrow("calendar_unavailable");
    expect(await db.select().from(schema.bookings)).toHaveLength(0);
  });
  it("offers a healthy round-robin host and assigns only that host", async () => {
    const available = await slots("failure-round_robin", "team:failure-team");
    expect(available?.slots[day]).toContain(at());
    expect(available?.free.get(at())).toEqual(["demo-mate"]);
    const result = await booking.createBooking(input("failure-round_robin", { username: "team:failure-team" }));
    expect(result.hostId).toBe("demo-mate");
  });
  it("returns a bounded 503 for availability and direct booking requests", async () => {
    const { GET } = await import("../../app/api/slots/route");
    const { POST } = await import("../../app/api/bookings/route");
    const response = await GET(new NextRequest(`http://localhost/api/slots?user=demo&slug=failure-personal&from=${day}&to=${day}&tz=UTC`));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "calendar_unavailable" });
    const reserve = await POST(new NextRequest("http://localhost/api/bookings", { method: "POST", body: JSON.stringify(input()) }));
    expect(reserve.status).toBe(503); expect(await reserve.json()).toEqual({ error: "calendar_unavailable" });
    expect(await db.select().from(schema.bookings)).toHaveLength(0);
  });
  it("still returns healthy round-robin times through the public API", async () => {
    const { GET } = await import("../../app/api/slots/route");
    const response = await GET(new NextRequest(`http://localhost/api/slots?user=team:failure-team&slug=failure-round_robin&from=${day}&to=${day}&tz=UTC`));
    expect(response.status).toBe(200); expect((await response.json()).slots[day]).toContain(at());
  });
  it("does not confuse a successfully checked busy slot with an outage", async () => {
    vi.mocked(google.freeBusy).mockResolvedValue([{ start: at(), end: at(15) }]);
    await expect(booking.createBooking(input())).rejects.toThrow("slot_unavailable");
  });
});
