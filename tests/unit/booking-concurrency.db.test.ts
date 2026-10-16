import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";

const provider = vi.hoisted(() => ({ busy: vi.fn(async () => ({ busy: [], errors: [] })) }));
vi.mock("../../lib/calendars", () => ({ externalBusy: provider.busy, writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: async () => {} }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: any, schema: typeof import("../../lib/db/schema"), booking: typeof import("../../lib/booking");
const tz = "America/New_York";
const day = DateTime.now().setZone(tz).plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!;
const at = (time: string, offset = 0) => DateTime.fromISO(`${day}T${time}`, { zone: tz }).plus({ days: offset }).toUTC().toISO()!;
const book = (slug: string, time: string, extra = {}) => booking.createBooking({ username: "demo", slug, start: time,
  name: "Concurrent invitee", email: "race@example.invalid", tz, ...extra });

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-concurrency-")), "db"));
  const module = await import("../../lib/db"); db = await module.getDb(); schema = module.schema;
  booking = await import("../../lib/booking");
  await db.insert(schema.teams).values({ id: "race-team", slug: "race-team", name: "Race team" });
  await db.insert(schema.eventTypes).values([
    { id: "race-long", userId: "demo-user", slug: "race-long", title: "Long", durationMin: 60, minNoticeMin: 0 },
    { id: "race-short", userId: "demo-user", slug: "race-short", title: "Short", durationMin: 30, minNoticeMin: 0 },
    { id: "race-day", userId: "demo-user", slug: "race-day", title: "Daily limit", durationMin: 30, minNoticeMin: 0, maxPerDay: 1 },
    { id: "race-week", userId: "demo-user", slug: "race-week", title: "Weekly limit", durationMin: 30, minNoticeMin: 0, maxPerWeek: 1 },
    { id: "race-buffer", userId: "demo-user", slug: "race-buffer", title: "Buffered", durationMin: 30, minNoticeMin: 0, bufferBeforeMin: 15, bufferAfterMin: 15 },
    { id: "race-group", userId: "demo-user", slug: "race-group", title: "Group", kind: "group", seats: 2, durationMin: 30, minNoticeMin: 0 },
    { id: "race-robin", userId: "demo-user", teamId: "race-team", slug: "race-robin", title: "Round robin", kind: "round_robin", durationMin: 30, minNoticeMin: 0 },
    { id: "race-collective", userId: "demo-user", teamId: "race-team", slug: "race-collective", title: "Collective", kind: "collective", durationMin: 60, minNoticeMin: 0 },
  ]);
  await db.insert(schema.eventTypeHosts).values(["race-robin", "race-collective"].flatMap(eventTypeId =>
    ["demo-user", "demo-mate"].map(userId => ({ eventTypeId, userId, priority: 2 }))));
});
beforeEach(async () => {
  await db.delete(schema.bookings);
  provider.busy.mockImplementation(async () => ({ busy: [], errors: [] }));
});
afterEach(() => vi.restoreAllMocks());

// Force both requests to finish the original availability check before either
// reservation starts. This reproduces the race without timing-dependent sleeps.
async function race(actions: (() => Promise<any>)[]) {
  const transact = db.transaction.bind(db);
  let count = 0, release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: any[]) => {
    if (++count === actions.length) release();
    await ready;
    return transact(...args);
  });
  try { return await Promise.allSettled(actions.map(action => action())); }
  finally { spy.mockRestore(); }
}
const confirmed = () => db.select().from(schema.bookings).where(eq(schema.bookings.status, "confirmed"));
const oneWinner = (results: PromiseSettledResult<any>[]) => {
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
};

describe("atomic booking reservations", () => {
  it("rejects concurrent overlapping meetings with different start times", async () => {
    oneWinner(await race([() => book("race-long", at("10:00")), () => book("race-short", at("10:30"))]));
    expect(await confirmed()).toHaveLength(1);
  });
  it("enforces daily limits when different slots are booked concurrently", async () => {
    oneWinner(await race([() => book("race-day", at("10:00")), () => book("race-day", at("11:00"))]));
    expect(await confirmed()).toHaveLength(1);
  });
  it("enforces weekly limits across concurrently booked days", async () => {
    oneWinner(await race([() => book("race-week", at("10:00")), () => book("race-week", at("10:00", 1))]));
    expect(await confirmed()).toHaveLength(1);
  });
  it("rechecks buffers after another request reserves a nearby slot", async () => {
    oneWinner(await race([() => book("race-buffer", at("10:00")), () => book("race-buffer", at("10:30"))]));
    expect(await confirmed()).toHaveLength(1);
  });
  it("still accepts concurrent meetings that do not overlap", async () => {
    const results = await race([() => book("race-short", at("10:00")), () => book("race-short", at("11:00"))]);
    expect(results.every(result => result.status === "fulfilled")).toBe(true);
    expect(await confirmed()).toHaveLength(2);
  });
  it("fills exactly the available group seats under concurrent requests", async () => {
    const results = await race(Array.from({ length: 3 }, () => () => book("race-group", at("11:00"))));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(2);
    expect((await confirmed()).map((row: any) => row.seat).sort()).toEqual([0, 1]);
  });
  it("uses the other round-robin host when the initially preferred host was just booked", async () => {
    const results = await race(Array.from({ length: 2 }, () => () => book("race-robin", at("11:00"), { username: "team:race-team" })));
    expect(results.every(result => result.status === "fulfilled")).toBe(true);
    expect((await confirmed()).map((row: any) => row.hostId).sort()).toEqual(["demo-mate", "demo-user"]);
  });
  it("reserves all collective hosts or none when a personal booking competes", async () => {
    const results = await race([
      () => book("race-collective", at("11:00"), { username: "team:race-team" }),
      () => book("race-short", at("11:30")),
    ]);
    oneWinner(results);
    const rows = await confirmed();
    if (results[0].status === "fulfilled") expect(rows.map((row: any) => row.hostId).sort()).toEqual(["demo-mate", "demo-user"]);
    else expect(rows).toHaveLength(1);
  });
  it("rolls back both the cancellation and new reservation if a move cannot commit", async () => {
    const original = await book("race-short", at("09:00"));
    const transact = db.transaction.bind(db);
    const spy = vi.spyOn(db, "transaction").mockImplementation((fn: any, config: any) => transact(async (tx: any) => {
      await fn(tx);
      throw new Error("Simulated transaction failure after writes");
    }, config));
    await expect(book("race-short", at("11:00"), { rescheduleUid: original.uid })).rejects.toThrow("slot_unavailable");
    spy.mockRestore();
    const rows = await db.select().from(schema.bookings);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ uid: original.uid, status: "confirmed", cancelReason: null });
  });
  it("allows only one concurrent reschedule of the same original booking", async () => {
    const original = await book("race-short", at("09:00"));
    let checks = 0, release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    provider.busy.mockImplementation(async () => { if (++checks === 2) release(); await ready; return { busy: [], errors: [] }; });
    oneWinner(await race([
      () => book("race-short", at("11:00"), { rescheduleUid: original.uid }),
      () => book("race-short", at("12:00"), { rescheduleUid: original.uid }),
    ]));
    expect(await confirmed()).toHaveLength(1);
    const rows = await db.select().from(schema.bookings);
    expect(rows).toHaveLength(2);
    expect(rows.find((row: any) => row.uid === original.uid).status).toBe("cancelled");
  });
});
