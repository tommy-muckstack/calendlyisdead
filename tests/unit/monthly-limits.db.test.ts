import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
vi.mock("@/auth", () => ({ requireUser: auth }));
vi.mock("../../lib/calendars", () => ({ externalBusy: async () => ({ busy: [], errors: [] }), writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: async () => {} }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), booking: typeof import("../../lib/booking");
let patch: typeof import("../../app/api/event-types/[id]/route").PATCH;
const tz = "America/New_York", month = DateTime.now().setZone(tz).plus({ months: 1 }).startOf("month");
const at = (day: number, hour = 11) => month.plus({ days: day - 1, hours: hour }).toUTC().toISO()!;
const isoDay = (start: string, zone = tz) => DateTime.fromISO(start).setZone(zone).toISODate()!;
const edit = (id: string, body: unknown) => patch(new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const book = (slug: string, start: string, extra: { rescheduleUid?: string } = {}) => booking.createBooking({ username: ["rr", "collective"].includes(slug) ? "team:limits" : "demo", slug, start,
  name: "Test invitee", email: "invitee@example.invalid", tz, ...extra });
const slots = async (slug: string, start: string, zone = tz) => (await booking.availability(["rr", "collective"].includes(slug) ? "team:limits" : "demo", slug, isoDay(start, zone), isoDay(start, zone), zone))!;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-monthly-limits-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  booking = await import("../../lib/booking"); patch = (await import("../../app/api/event-types/[id]/route")).PATCH;
  const weekly = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(day => [day, [{ start: "00:00", end: "24:00" }]]));
  await db.update(schema.schedules).set({ weekly });
  await db.update(schema.schedules).set({ timezone: "America/Los_Angeles" }).where(eq(schema.schedules.userId, "demo-mate"));
  await db.insert(schema.teams).values({ id: "limits-team", slug: "limits", name: "Limits" });
  await db.insert(schema.teamMembers).values([{ teamId: "limits-team", userId: "demo-user", role: "owner" }, { teamId: "limits-team", userId: "demo-mate", role: "member" }]);
});
beforeEach(async () => {
  await db.delete(schema.bookings); await db.delete(schema.eventTypeHosts); await db.delete(schema.eventTypes);
  auth.mockResolvedValue({ id: "demo-user" });
  for (const [id, kind] of [["personal", "one_on_one"], ["group", "group"], ["rr", "round_robin"], ["collective", "collective"]]) {
    const team = ["rr", "collective"].includes(id);
    await db.insert(schema.eventTypes).values({ id, slug: id, userId: "demo-user", title: id, kind, minNoticeMin: 0, rangeDays: 730,
      seats: kind === "group" ? 3 : 1, maxPerMonth: 1, teamId: team ? "limits-team" : null });
    if (team) await db.insert(schema.eventTypeHosts).values(["demo-user", "demo-mate"].map(userId => ({ eventTypeId: id, userId })));
  }
});
afterEach(() => vi.restoreAllMocks());

describe("event monthly limit persistence and permissions", () => {
  it("sets and clears the monthly limit without changing daily/weekly caps", async () => {
    await db.update(schema.eventTypes).set({ maxPerDay: 2, maxPerWeek: 5 }).where(eq(schema.eventTypes.id, "personal"));
    const set = await edit("personal", { maxPerMonth: 12 }); expect(set.status).toBe(200);
    expect(await set.json()).toMatchObject({ maxPerDay: 2, maxPerWeek: 5, maxPerMonth: 12 });
    const cleared = await edit("personal", { maxPerMonth: null }); expect(cleared.status).toBe(200); expect(await cleared.json()).toMatchObject({ maxPerMonth: null });
  });
  it.each([0, -1, 1.5, "3", 2147483648])("rejects invalid monthly count %j without partial saving", async value => {
    expect((await edit("personal", { maxPerMonth: value, title: "Must not save" })).status).toBe(400);
    const [event] = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "personal")); expect(event).toMatchObject({ title: "personal", maxPerMonth: 1 });
  });
  it("requires ownership or team admin permission", async () => {
    auth.mockResolvedValue(null); expect((await edit("personal", { maxPerMonth: 3 })).status).toBe(401);
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await edit("personal", { maxPerMonth: 3 })).status).toBe(404);
    expect((await edit("rr", { maxPerMonth: 3 })).status).toBe(404);
  });
  it("copies monthly limits into managed assignments, enforces locks and propagates admin edits", async () => {
    await db.insert(schema.eventTypes).values({ id: "template", userId: "demo-user", teamId: "limits-team", slug: "template", title: "Template", kind: "managed", maxPerMonth: 6, lockedFields: ["maxPerMonth"] });
    const { assignManaged } = await import("../../lib/teams"); await assignManaged("template", ["demo-mate"], "limits-team");
    const [copy] = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.managedParentId, "template")); expect(copy.maxPerMonth).toBe(6);
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await edit(copy.id, { maxPerMonth: 9 })).status).toBe(403);
    auth.mockResolvedValue({ id: "demo-user" }); expect((await edit("template", { maxPerMonth: 8 })).status).toBe(200);
    expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, copy.id)))[0].maxPerMonth).toBe(8);
  });
});

describe("calendar-month meeting counts", () => {
  it("counts an earlier week when viewing the last week and resets next month", async () => {
    await book("personal", at(1));
    expect(Object.values((await slots("personal", at(25))).slots).flat()).toEqual([]);
    const next = month.plus({ months: 1, hours: 11 }).toUTC().toISO()!;
    expect(Object.values((await slots("personal", next)).slots).flat()).toContain(next);
  });
  it("counts a group session once and keeps open seats after reaching the monthly cap", async () => {
    const a = await book("group", at(2)); const b = await book("group", at(2));
    expect(Object.values((await slots("group", at(2))).slots).flat()).toEqual([at(2)]);
    await expect(book("group", at(20))).rejects.toThrow("slot_unavailable");
    await booking.cancelBooking(a.uid, "test"); expect(Object.values((await slots("group", at(20))).slots).flat()).toEqual([]);
    await booking.cancelBooking(b.uid, "test"); expect(Object.values((await slots("group", at(20))).slots).flat()).toContain(at(20));
  });
  it("does not charge a second allowance for rescheduling a personal meeting", async () => {
    const first = await book("personal", at(1)); const moved = await book("personal", at(25), { rescheduleUid: first.uid });
    expect(moved.start.toISOString()).toBe(at(25));
    const rows = await db.select().from(schema.bookings).where(eq(schema.bookings.eventTypeId, "personal")); expect(rows.filter(b => b.status === "confirmed")).toHaveLength(1);
  });
  it("does not let one attendee create a second session by rescheduling while others remain", async () => {
    const first = await book("group", at(1)); const second = await book("group", at(1));
    await expect(book("group", at(25), { rescheduleUid: first.uid })).rejects.toThrow("slot_unavailable");
    await booking.cancelBooking(second.uid, "test"); await book("group", at(25), { rescheduleUid: first.uid });
    const rows = await db.select().from(schema.bookings).where(eq(schema.bookings.status, "confirmed")); expect(rows).toHaveLength(1); expect(rows[0].start.toISOString()).toBe(at(25));
  });
  it("keeps the monthly cap when an invitee selects another timezone", async () => {
    await book("personal", at(1)); expect(Object.values((await slots("personal", at(25), "Asia/Tokyo")).slots).flat()).toEqual([]);
  });
  it.each(["maxPerDay", "maxPerWeek", "maxPerMonth"])("enforces the round-robin %s cap across all hosts", async field => {
    await db.update(schema.eventTypes).set({ maxPerMonth: null, [field]: 1 }).where(eq(schema.eventTypes.id, "rr"));
    await book("rr", at(2)); expect(Object.values((await slots("rr", at(2))).slots).flat()).toEqual([]);
    await expect(book("rr", at(2, 12))).rejects.toThrow("slot_unavailable");
  });
  it("counts simultaneous round-robin meetings with different invitees separately", async () => {
    await db.update(schema.eventTypes).set({ maxPerMonth: 2 }).where(eq(schema.eventTypes.id, "rr"));
    const a = await book("rr", at(2)); const b = await book("rr", at(2)); expect(a.hostId).not.toBe(b.hostId);
    await expect(book("rr", at(2, 12))).rejects.toThrow("slot_unavailable");
  });
  it("counts a collective meeting once despite its separate host records", async () => {
    await db.update(schema.eventTypes).set({ maxPerMonth: 2 }).where(eq(schema.eventTypes.id, "collective"));
    await book("collective", at(2)); await book("collective", at(2, 12));
    await expect(book("collective", at(2, 13))).rejects.toThrow("slot_unavailable");
    expect(await db.select().from(schema.bookings)).toHaveLength(4);
  });
  it("excludes every host record when rescheduling a collective meeting at its cap", async () => {
    const first = await book("collective", at(2)); const moved = await book("collective", at(25), { rescheduleUid: first.uid });
    const rows = await db.select().from(schema.bookings).where(eq(schema.bookings.status, "confirmed"));
    expect(rows).toHaveLength(2); expect(rows.every(b => b.groupUid === moved.uid && b.start.toISOString() === at(25))).toBe(true);
  });
  it("uses the creator's default-schedule calendar consistently across team host timezones", async () => {
    const last = month.endOf("month").startOf("day").plus({ hours: 23 }).toUTC().toISO()!;
    await book("rr", last);
    const next = month.plus({ months: 1 }).toUTC().toISO()!;
    const result = await slots("rr", next, "America/Los_Angeles");
    expect(result.ev.limitsTimezone).toBe(tz); expect(result.free.get(next)?.sort()).toEqual(["demo-mate", "demo-user"]);
  });
  it("allows only one of two competing personal reservations to consume the last monthly allowance", async () => {
    const transact = db.transaction.bind(db); let arrived = 0, release!: () => void;
    const ready = new Promise<void>(r => { release = r; });
    const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: unknown[]) => { if (++arrived === 2) release(); await ready; return transact(...args); });
    const results = await Promise.allSettled([book("personal", at(2)), book("personal", at(25))]); spy.mockRestore();
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
  it("serializes competing round-robin requests against one event-wide allowance", async () => {
    const transact = db.transaction.bind(db); let arrived = 0, release!: () => void;
    const ready = new Promise<void>(r => { release = r; });
    const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: unknown[]) => { if (++arrived === 2) release(); await ready; return transact(...args); });
    const results = await Promise.allSettled([book("rr", at(2)), book("rr", at(2))]); spy.mockRestore();
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
  it.each(["maxPerDay", "maxPerWeek", "maxPerMonth"])("rechecks a %s reduction committed after preflight", async field => {
    await db.update(schema.eventTypes).set({ maxPerMonth: null, [field]: 2 }).where(eq(schema.eventTypes.id, "personal"));
    await book("personal", at(2));
    const transact = db.transaction.bind(db); let first = true, entered!: () => void, release!: () => void;
    const ready = new Promise<void>(r => { entered = r; }); const gate = new Promise<void>(r => { release = r; });
    const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: unknown[]) => { if (first) { first = false; entered(); await gate; } return transact(...args); });
    const pending = Promise.allSettled([book("personal", at(2, 12))]); await ready;
    try { expect((await edit("personal", { [field]: 1 })).status).toBe(200); } finally { release(); }
    const [result] = await pending; spy.mockRestore(); expect(result.status).toBe("rejected"); expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
});
