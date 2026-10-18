import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";

const provider = vi.hoisted(() => ({ busy: vi.fn(async () => ({ busy: [] as { start: string; end: string }[], errors: [] })) }));
vi.mock("../../lib/calendars", () => ({ externalBusy: provider.busy, writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: async () => {} }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: any, schema: typeof import("../../lib/db/schema"), booking: typeof import("../../lib/booking"), polls: typeof import("../../lib/polls");
const tz = "America/New_York";
const day = DateTime.now().setZone(tz).plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!;
const at = (time: string, offset = 0) => DateTime.fromISO(`${day}T${time}`, { zone: tz }).plus({ days: offset }).toUTC().toISO()!;
const book = (slug: string, time: string, extra = {}) => booking.createBooking({ username: "demo", slug, start: at(time),
  name: "Buffer invitee", email: "buffer@example.invalid", tz, ...extra });
const settings = (id: string, before: number, after: number) => db.update(schema.eventTypes)
  .set({ bufferBeforeMin: before, bufferAfterMin: after }).where(eq(schema.eventTypes.id, id));

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-buffers-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  booking = await import("../../lib/booking"); polls = await import("../../lib/polls");
  await db.insert(schema.teams).values({ id: "buffer-team", slug: "buffer-team", name: "Buffer team" });
  await db.insert(schema.eventTypes).values([
    { id: "buffered", userId: "demo-user", slug: "buffered", title: "Buffered", durationMin: 30, minNoticeMin: 0, bufferBeforeMin: 30, bufferAfterMin: 30 },
    { id: "plain", userId: "demo-user", slug: "plain", title: "Plain", durationMin: 30, minNoticeMin: 0 },
    { id: "buffer-group", userId: "demo-user", slug: "buffer-group", title: "Group", kind: "group", seats: 3, durationMin: 30, minNoticeMin: 0, bufferBeforeMin: 30, bufferAfterMin: 30 },
    { id: "buffer-robin", userId: "demo-user", teamId: "buffer-team", slug: "buffer-robin", title: "Round robin", kind: "round_robin", durationMin: 30, minNoticeMin: 0 },
    { id: "buffer-collective", userId: "demo-user", teamId: "buffer-team", slug: "buffer-collective", title: "Collective", kind: "collective", durationMin: 30, minNoticeMin: 0 },
  ]);
  await db.insert(schema.eventTypeHosts).values(["buffer-robin", "buffer-collective"].flatMap(eventTypeId =>
    ["demo-user", "demo-mate"].map(userId => ({ eventTypeId, userId, priority: 2 }))));
});
beforeEach(async () => {
  await db.delete(schema.bookings); await db.delete(schema.polls);
  await db.delete(schema.eventTypes).where(eq(schema.eventTypes.kind, "poll"));
  await settings("buffered", 30, 30); await settings("buffer-group", 30, 30); await settings("plain", 0, 0);
  await db.update(schema.schedules).set({ overrides: {} }).where(eq(schema.schedules.id, "demo-schedule"));
  provider.busy.mockResolvedValue({ busy: [], errors: [] });
});
afterEach(() => vi.restoreAllMocks());

describe("booked meeting buffer protection", () => {
  it("protects both buffers from an event type that has none, allowing exact boundary contact", async () => {
    await book("buffered", "11:00");
    await expect(book("plain", "10:30")).rejects.toThrow("slot_unavailable");
    await expect(book("plain", "11:30")).rejects.toThrow("slot_unavailable");
    await book("plain", "10:00"); await book("plain", "12:00");
  });
  it("preserves the booked buffer values when the event type's settings are later removed", async () => {
    const original = await book("buffered", "11:00");
    expect((await booking.getBooking(original.uid))!.booking).toMatchObject({ bufferBeforeMin: 30, bufferAfterMin: 30 });
    await settings("buffered", 0, 0);
    await expect(book("plain", "10:30")).rejects.toThrow("slot_unavailable");
    await expect(book("plain", "11:30")).rejects.toThrow("slot_unavailable");
    const newer = await book("buffered", "14:00");
    expect((await booking.getBooking(newer.uid))!.booking).toMatchObject({ bufferBeforeMin: 0, bufferAfterMin: 0 });
    await book("plain", "14:30");
  });
  it("does not add buffers to a prior zero-buffer reservation when its type gains buffers", async () => {
    await book("plain", "11:00");
    await settings("plain", 60, 60); await settings("buffered", 0, 0);
    await book("buffered", "11:30");
    const saved = (await db.select().from(schema.bookings)).find((b: any) => b.eventTypeId === "plain");
    expect(saved).toMatchObject({ bufferBeforeMin: 0, bufferAfterMin: 0 });
  });
  it("adds the prior after-buffer and the next before-buffer instead of overlapping them", async () => {
    await settings("buffered", 0, 20); await settings("plain", 20, 0);
    await book("buffered", "11:00");
    await expect(book("plain", "12:00")).rejects.toThrow("slot_unavailable");
    await book("plain", "12:30");
  });
  it("protects adjacent group sessions while keeping seats in the same session available", async () => {
    await book("buffer-group", "11:00"); await book("buffer-group", "11:00");
    await expect(book("buffer-group", "11:30")).rejects.toThrow("slot_unavailable");
    await expect(book("buffer-group", "12:00")).rejects.toThrow("slot_unavailable");
    await book("buffer-group", "12:30");
  });
  it("joining a group session retains its original buffers after the type is changed", async () => {
    await book("buffer-group", "11:00");
    await book("plain", "09:30"); await book("plain", "12:30");
    await settings("buffer-group", 120, 120);
    const joined = await book("buffer-group", "11:00");
    expect((await booking.getBooking(joined.uid))!.booking).toMatchObject({ bufferBeforeMin: 30, bufferAfterMin: 30 });
    await book("plain", "12:00");
  });
  it("cancelling a meeting releases its protected buffer", async () => {
    const original = await book("buffered", "11:00");
    await expect(book("plain", "11:30")).rejects.toThrow("slot_unavailable");
    await booking.cancelBooking(original.uid, "Test cancellation");
    await book("plain", "11:30");
  });
  it("rescheduling releases the old buffer and protects the replacement meeting", async () => {
    const original = await book("buffered", "11:00");
    await book("buffered", "11:30", { rescheduleUid: original.uid });
    await book("plain", "10:30");
    await expect(book("plain", "12:00")).rejects.toThrow("slot_unavailable");
  });
  it("can place buffers outside working hours but still checks external conflicts there", async () => {
    await book("buffered", "09:00"); await book("buffered", "16:30");
    await db.delete(schema.bookings);
    provider.busy.mockResolvedValue({ busy: [{ start: at("08:45"), end: at("09:00") }], errors: [] });
    await expect(book("buffered", "09:00")).rejects.toThrow("slot_unavailable");
  });
  it("uses other-event buffers to choose a round-robin host and reject a collective time", async () => {
    await book("buffered", "11:00");
    await expect(book("buffer-collective", "11:30", { username: "team:buffer-team" })).rejects.toThrow("slot_unavailable");
    const assigned = await book("buffer-robin", "11:30", { username: "team:buffer-team" });
    expect(assigned.hostId).toBe("demo-mate");
  });
  it.each(["10:30", "11:30"])("permits a poll over only the existing meeting's buffer at %s", async time => {
    await book("buffered", "11:00");
    const options = [at(time), at("12:00")];
    const id = await polls.createPoll("demo-user", { title: "Buffer poll", durationMin: 30, options });
    await polls.vote(id, { name: "Poll invitee", email: "poll@example.invalid", picks: options });
    await expect(polls.bookPoll("demo-user", id, at(time))).resolves.toBeTypeOf("string");
  });
  it("rejects a concurrent zero-buffer booking after another transaction protects that time", async () => {
    const transact = db.transaction.bind(db);
    let count = 0, release!: () => void, arrived!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const firstArrived = new Promise<void>(resolve => { arrived = resolve; });
    const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: any[]) => {
      if (++count === 1) arrived(); else release();
      await ready; return transact(...args);
    });
    const first = book("buffered", "11:00");
    await firstArrived;
    const result = await Promise.allSettled([first, book("plain", "11:30")]);
    spy.mockRestore();
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
  it("protects an after-buffer across midnight in the host's timezone", async () => {
    const tomorrow = DateTime.fromISO(day).plus({ days: 1 }).toISODate()!;
    await db.update(schema.schedules).set({ overrides: {
      [day]: [{ start: "22:00", end: "24:00" }], [tomorrow]: [{ start: "00:00", end: "02:00" }],
    } }).where(eq(schema.schedules.id, "demo-schedule"));
    await settings("buffered", 0, 60);
    await book("buffered", "23:30");
    await expect(book("plain", "00:30", { start: at("00:30", 1) })).rejects.toThrow("slot_unavailable");
    await book("plain", "01:00", { start: at("01:00", 1) });
  });
});
