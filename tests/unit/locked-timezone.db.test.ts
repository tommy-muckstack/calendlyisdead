import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
const mail = vi.hoisted(() => vi.fn<(message: { text: string; ics: string }) => Promise<void>>().mockResolvedValue(undefined));
const calendar = vi.hoisted(() => vi.fn<(hostId: string, event: { start: Date }) => Promise<null>>().mockResolvedValue(null));
vi.mock("@/auth", () => ({ requireUser: auth }));
vi.mock("../../lib/calendars", () => ({ externalBusy: async () => ({ busy: [], errors: [] }), writeEvent: calendar, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: mail }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), booking: typeof import("../../lib/booking");
let patch: typeof import("../../app/api/event-types/[id]/route").PATCH;
const hostZone = "America/New_York", lockedZone = "Asia/Tokyo", date = DateTime.now().setZone(hostZone).plus({ days: 7 }).startOf("day");
const at = (hour: number) => date.plus({ hours: hour }).toUTC().toISO()!;
const edit = (id: string, body: unknown) => patch(new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const owner = (id: string) => ["rr", "collective"].includes(id) ? "team:timezone" : "demo";
const book = (id: string, start = at(16), tz = "Pacific/Honolulu", rescheduleUid?: string) => booking.createBooking({ username: owner(id), slug: id, start, tz, rescheduleUid, name: "Timezone QA", email: "timezone@example.invalid" });
const weekly = (start = "09:00", end = "17:00") => Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(day => [day, [{ start, end }]]));
const fixedNow = (month: number) => { const now = DateTime.utc(2027, month, 1); if (now.isValid) return now; throw new Error("Invalid test date"); };

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-timezone-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  booking = await import("../../lib/booking"); patch = (await import("../../app/api/event-types/[id]/route")).PATCH;
  await db.insert(schema.teams).values({ id: "timezone-team", slug: "timezone", name: "Timezone team" });
  await db.insert(schema.teamMembers).values([{ teamId: "timezone-team", userId: "demo-user", role: "owner" }, { teamId: "timezone-team", userId: "demo-mate", role: "member" }]);
});
beforeEach(async () => {
  await db.delete(schema.bookings); await db.delete(schema.eventTypeHosts); await db.delete(schema.eventTypes); auth.mockResolvedValue({ id: "demo-user" }); mail.mockClear(); calendar.mockClear();
  await db.update(schema.schedules).set({ weekly: weekly(), timezone: hostZone });
  for (const [id, kind] of [["personal", "one_on_one"], ["group", "group"], ["rr", "round_robin"], ["collective", "collective"], ["once", "one_off"]]) {
    const team = ["rr", "collective"].includes(id);
    await db.insert(schema.eventTypes).values({ id, slug: id, userId: "demo-user", title: id, kind, minNoticeMin: 0, rangeDays: 730, seats: kind === "group" ? 3 : 1, teamId: team ? "timezone-team" : null });
    if (team) await db.insert(schema.eventTypeHosts).values(["demo-user", "demo-mate"].map(userId => ({ eventTypeId: id, userId })));
  }
});
afterEach(() => vi.restoreAllMocks());

describe("locked booking time zones", () => {
  it("saves a fixed invitee zone without changing the host's schedule", async () => {
    const response = await edit("personal", { lockedTimezone: lockedZone }); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ lockedTimezone: lockedZone });
    expect((await db.select().from(schema.schedules)).every(schedule => schedule.timezone === hostZone)).toBe(true);
  });
  it("ignores an alternate public timezone query and groups slots by the locked date", async () => {
    await edit("personal", { lockedTimezone: lockedZone });
    const day = DateTime.fromISO(at(16)).setZone(lockedZone).toISODate()!;
    const { GET } = await import("../../app/api/slots/route");
    const response = await GET(new NextRequest(`http://localhost/api/slots?${new URLSearchParams({ user: "demo", slug: "personal", from: day, to: day, tz: "Pacific/Honolulu" })}`));
    const body = await response.json(); expect(response.status).toBe(200); expect(body.timezone).toBe(lockedZone); expect(body.slots[day]).toContain(at(16));
    expect(Object.keys(body.slots)).toEqual([day]);
  });
  it.each(["personal", "group", "rr", "collective", "once"])("books %s across midnight with the locked zone, unchanged UTC instant and correct local confirmations", async id => {
    await edit(id, { lockedTimezone: lockedZone }); const saved = await book(id);
    expect(saved.inviteeTz).toBe(lockedZone); expect(saved.start.toISOString()).toBe(at(16));
    expect(calendar.mock.calls[0][1].start.toISOString()).toBe(at(16));
    const expected = DateTime.fromISO(at(16)).setZone(lockedZone).toFormat("cccc, LLLL d, yyyy 'at' h:mm a ZZZZ");
    expect(mail.mock.calls.some(([message]) => message.text.includes(expected))).toBe(true);
    expect(mail.mock.calls[0][0].ics).toContain(`DTSTART:${DateTime.fromISO(at(16)).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")}`);
  });
  it("unlocks new bookings without rewriting past confirmation zones or instants", async () => {
    await edit("personal", { lockedTimezone: lockedZone }); const first = await book("personal", at(9));
    expect(await (await edit("personal", { lockedTimezone: null })).json()).toMatchObject({ lockedTimezone: null });
    expect((await book("personal", at(11), "Europe/London")).inviteeTz).toBe("Europe/London");
    const [past] = await db.select().from(schema.bookings).where(eq(schema.bookings.uid, first.uid)); expect(past.inviteeTz).toBe(lockedZone); expect(past.start.toISOString()).toBe(at(9));
  });
  it("reschedules using the current event zone and retains the cancelled reservation's original zone", async () => {
    const first = await book("personal", at(9), "Europe/London"); await edit("personal", { lockedTimezone: lockedZone });
    const moved = await book("personal", at(16), "Pacific/Honolulu", first.uid); expect(moved.inviteeTz).toBe(lockedZone); expect(moved.rescheduledFrom).toBe(first.uid);
    expect(await booking.cancelBooking(moved.uid, "QA cleanup")).toBeTruthy();
    const [old] = await db.select().from(schema.bookings).where(eq(schema.bookings.uid, first.uid)); expect(old).toMatchObject({ status: "cancelled", inviteeTz: "Europe/London" });
  });
  it.each(["", " UTC", "UTC ", "Mars/Olympus", "UTC+5", true, 5, {}])("rejects invalid locked zone %j without partial changes", async lockedTimezone => {
    expect((await edit("personal", { lockedTimezone, title: "Must not save" })).status).toBe(400);
    expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "personal")))[0]).toMatchObject({ lockedTimezone: null, title: "personal" });
  });
  it("requires authentication and owner/team admin permissions", async () => {
    auth.mockResolvedValue(null); expect((await edit("personal", { lockedTimezone: lockedZone })).status).toBe(401);
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await edit("personal", { lockedTimezone: lockedZone })).status).toBe(404); expect((await edit("rr", { lockedTimezone: lockedZone })).status).toBe(404);
  });
  it("retains a configured zone after a failed save", async () => {
    await edit("personal", { lockedTimezone: lockedZone }); const spy = vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("offline"));
    expect((await edit("personal", { lockedTimezone: null })).status).toBe(500); spy.mockRestore(); expect((await booking.loadEvent("demo", "personal"))?.eventType.lockedTimezone).toBe(lockedZone);
  });
  it("carries the zone into duplicates and managed assignments and enforces the template lock", async () => {
    await edit("personal", { lockedTimezone: lockedZone }); const { POST } = await import("../../app/api/event-types/[id]/duplicate/route");
    const copy = await (await POST(new NextRequest("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "personal" }) })).json(); expect(copy.lockedTimezone).toBe(lockedZone);
    await db.insert(schema.eventTypes).values({ id: "template", userId: "demo-user", teamId: "timezone-team", slug: "template", title: "Template", kind: "managed", lockedTimezone: lockedZone, lockedFields: ["lockedTimezone"] });
    await (await import("../../lib/teams")).assignManaged("template", ["demo-mate"], "timezone-team");
    const [assigned] = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.managedParentId, "template")); expect(assigned.lockedTimezone).toBe(lockedZone);
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await edit(assigned.id, { lockedTimezone: null })).status).toBe(403);
    auth.mockResolvedValue({ id: "demo-user" }); expect((await edit("template", { lockedTimezone: "UTC" })).status).toBe(200);
    expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, assigned.id)))[0].lockedTimezone).toBe("UTC");
  });
  it("preserves the source timezone in a single-use link", async () => {
    await edit("personal", { lockedTimezone: lockedZone }); const { createOneOff } = await import("../../lib/oneoff");
    const link = await createOneOff("demo-user", { title: "Single-use", durationMin: 30, fromEventTypeId: "personal" });
    expect(link.lockedTimezone).toBe(lockedZone);
    const saved = await book(link.slug); expect(saved.inviteeTz).toBe(lockedZone); expect(saved.start.toISOString()).toBe(at(16));
    await expect(book(link.slug, at(11))).rejects.toThrow("not_found");
  });
  it.each([["personal", lockedZone], ["rr", lockedZone], ["personal", null], ["rr", null]])("rechecks a %s timezone change to %s after preflight under the reservation lock", async (id, target) => {
    if (target === null) await edit(id, { lockedTimezone: lockedZone });
    const transact = db.transaction.bind(db); let first = true, entered!: () => void, release!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: unknown[]) => { if (first) { first = false; entered(); await gate; } return transact(...args); });
    const pending = book(id); await ready; try { expect((await edit(id, { lockedTimezone: target })).status).toBe(200); } finally { release(); }
    const saved = await pending; spy.mockRestore(); expect(saved.inviteeTz).toBe(target ?? "Pacific/Honolulu"); expect(saved.start.toISOString()).toBe(at(16));
  });
  it("keeps daily meeting limits in the host calendar even when invitee dates differ", async () => {
    await edit("personal", { lockedTimezone: lockedZone, maxPerDay: 1 }); await book("personal", at(9));
    expect(DateTime.fromISO(at(9)).setZone(lockedZone).toISODate()).not.toBe(DateTime.fromISO(at(16)).setZone(lockedZone).toISODate());
    await expect(book("personal", at(16))).rejects.toThrow("slot_unavailable");
  });
  it("prevents simultaneous conflicting bookings with different requested zones", async () => {
    await edit("personal", { lockedTimezone: lockedZone });
    const results = await Promise.allSettled([book("personal", at(16), "UTC"), book("personal", at(16), "Pacific/Honolulu")]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1); expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
  it("keeps the same host wall-time across DST while the fixed invitee zone sees the correct UTC conversion", async () => {
    await edit("personal", { lockedTimezone: lockedZone }); const now = fixedNow(3);
    for (const [hostDay, instant] of [["2027-03-13", "2027-03-13T21:00:00.000Z"], ["2027-03-14", "2027-03-14T20:00:00.000Z"]]) {
      const local = DateTime.fromISO(instant).setZone(lockedZone).toISODate()!;
      const result = await booking.availability("demo", "personal", local, local, "Pacific/Honolulu", now);
      expect(result?.slots[local]).toContain(instant); expect(DateTime.fromISO(instant).setZone(hostZone).toISODate()).toBe(hostDay);
    }
  });
  it("omits nonexistent spring times and preserves both repeated fall instants in a locked DST zone", async () => {
    await edit("personal", { lockedTimezone: hostZone }); await db.update(schema.schedules).set({ weekly: weekly("01:00", "04:00") });
    const spring = await booking.availability("demo", "personal", "2027-03-14", "2027-03-14", lockedZone, fixedNow(3));
    expect(spring?.slots["2027-03-14"].some(start => DateTime.fromISO(start).setZone(hostZone).hour === 2)).toBe(false);
    const fall = await booking.availability("demo", "personal", "2027-11-07", "2027-11-07", lockedZone, fixedNow(11));
    expect(fall?.slots["2027-11-07"]).toEqual(expect.arrayContaining(["2027-11-07T05:30:00.000Z", "2027-11-07T06:30:00.000Z"]));
  });
});
