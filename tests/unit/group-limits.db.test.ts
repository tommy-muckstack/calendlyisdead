import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";

vi.mock("../../lib/calendars", () => ({ externalBusy: async () => ({ busy: [], errors: [] }), writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: async () => {} }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: any, schema: typeof import("../../lib/db/schema"), booking: typeof import("../../lib/booking");
const tz = "America/New_York";
const day = DateTime.now().setZone(tz).plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!;
const date = (offset = 0) => DateTime.fromISO(day).plus({ days: offset }).toISODate()!;
const at = (time: string, offset = 0) => DateTime.fromISO(`${date(offset)}T${time}`, { zone: tz }).toUTC().toISO()!;
const book = (time: string, offset = 0) => booking.createBooking({ username: "demo", slug: "limited-group", start: at(time, offset),
  name: "Group invitee", email: "group@example.invalid", tz });
const slots = async (offset = 0, zone = tz) => (await booking.slotsFor("demo", "limited-group", date(offset), date(offset), zone))!.slots;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-group-limits-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  booking = await import("../../lib/booking");
  await db.insert(schema.eventTypes).values({ id: "limited-group", userId: "demo-user", slug: "limited-group", title: "Limited group", kind: "group",
    durationMin: 60, seats: 3, minNoticeMin: 0, maxPerDay: 1 });
});
beforeEach(async () => {
  await db.delete(schema.bookings);
  await db.update(schema.eventTypes).set({ maxPerDay: 1, maxPerWeek: null }).where(eq(schema.eventTypes.id, "limited-group"));
});
afterEach(() => vi.restoreAllMocks());

describe("group session meeting limits", () => {
  it("closes new sessions at the daily limit while keeping unfilled seats open", async () => {
    await book("11:00");
    expect((await slots())[day]).toEqual([at("11:00")]);
    await expect(book("12:00")).rejects.toThrow("slot_unavailable");
    await book("11:00"); await book("11:00");
    expect((await slots())[day] ?? []).toEqual([]);
  });
  it("counts a group session once, regardless of its number of invitees", async () => {
    await db.update(schema.eventTypes).set({ maxPerDay: 2 }).where(eq(schema.eventTypes.id, "limited-group"));
    await book("10:00"); await book("10:00"); await book("10:00");
    await book("12:00");
    expect((await slots())[day]).toEqual([at("12:00")]);
  });
  it("applies weekly limits across days and resets them for the next week", async () => {
    await db.update(schema.eventTypes).set({ maxPerDay: null, maxPerWeek: 1 }).where(eq(schema.eventTypes.id, "limited-group"));
    await book("11:00");
    expect((await slots())[day]).toEqual([at("11:00")]);
    expect((await slots(1))[date(1)] ?? []).toEqual([]);
    expect((await slots(7))[date(7)]).toContain(at("11:00", 7));
  });
  it("reopens seats after one cancellation, and new sessions only after the last cancellation", async () => {
    const a = await book("11:00"), b = await book("11:00");
    await booking.cancelBooking(a.uid, "Test cancellation");
    expect((await slots())[day]).toEqual([at("11:00")]);
    await booking.cancelBooking(b.uid, "Test cancellation");
    expect((await slots())[day]).toContain(at("12:00"));
  });
  it("retains the host-local limit when the invitee views another timezone", async () => {
    await book("11:00");
    expect(Object.values(await slots(0, "Europe/London")).flat()).toEqual([at("11:00")]);
  });
  it("permits just one new session when two different times compete for the last daily allowance", async () => {
    const transact = db.transaction.bind(db);
    let arrived = 0, release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: any[]) => {
      if (++arrived === 2) release(); await ready; return transact(...args);
    });
    const result = await Promise.allSettled([book("11:00"), book("12:00")]);
    spy.mockRestore();
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
});
