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
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>;
let schema: typeof import("../../lib/db/schema"), booking: typeof import("../../lib/booking");
let patch: typeof import("../../app/api/event-types/[id]/route").PATCH;
const tz = "America/New_York";
const day = DateTime.now().setZone(tz).plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!;
const start = DateTime.fromISO(`${day}T11:00`, { zone: tz }).toUTC().toISO()!;
const book = () => booking.createBooking({ username: "demo", slug: "locked-group", start,
  name: "Group invitee", email: "group@example.invalid", tz });
const edit = (body: Record<string, unknown>, id = "locked-group") => patch(new NextRequest(`http://localhost/api/event-types/${id}`, {
  method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id }) });
const savedType = async () => (await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "locked-group")))[0];

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-group-locks-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  booking = await import("../../lib/booking");
  patch = (await import("../../app/api/event-types/[id]/route")).PATCH;
  await db.insert(schema.eventTypes).values({ id: "locked-group", userId: "demo-user", slug: "locked-group", title: "Group", kind: "group",
    durationMin: 30, location: "Room A", seats: 3, minNoticeMin: 0 });
});
beforeEach(async () => {
  await db.delete(schema.bookings);
  await db.update(schema.eventTypes).set({ title: "Group", kind: "group", durationMin: 30, location: "Room A", seats: 3 })
    .where(eq(schema.eventTypes.id, "locked-group"));
  auth.mockResolvedValue({ id: "demo-user" });
});
afterEach(() => vi.restoreAllMocks());

describe("group event settings after booking", () => {
  it("allows duration and location changes before the first booking", async () => {
    const response = await edit({ durationMin: 60, location: "Room B" });
    expect(response.status).toBe(200);
    expect(await savedType()).toMatchObject({ durationMin: 60, location: "Room B" });
  });
  it.each([{ durationMin: 60 }, { location: "Room B" }, { kind: "one_on_one" }])("rejects changes to %j after booking", async change => {
    await book();
    const response = await edit({ ...change, title: "Must not partially save" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "group_settings_locked", fields: Object.keys(change),
      settings: { durationMin: 30, location: "Room A", kind: "group" } });
    expect(await savedType()).toMatchObject({ title: "Group", durationMin: 30, location: "Room A", kind: "group" });
  });
  it("accepts unchanged locked values alongside editable settings", async () => {
    await book();
    const response = await edit({ durationMin: 30, location: "Room A", kind: "group", title: "Updated group", seats: 5 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ title: "Updated group", seats: 5, groupSettingsLocked: true });
    await book();
    const meetings = await db.select().from(schema.bookings);
    expect(meetings).toHaveLength(2);
    expect(meetings.every((b: typeof schema.bookings.$inferSelect) => b.inviteeLimit === 3 && +b.end - +b.start === 30 * 60000)).toBe(true);
  });
  it("keeps settings locked after all invitees cancel", async () => {
    const first = await book(); await booking.cancelBooking(first.uid, "Test cancellation");
    expect((await edit({ location: "Room B" })).status).toBe(409);
  });
  it("keeps settings locked after the meeting has ended", async () => {
    const first = await book();
    await db.update(schema.bookings).set({ start: new Date("2020-01-01T10:00:00Z"), end: new Date("2020-01-01T10:30:00Z") })
      .where(eq(schema.bookings.uid, first.uid));
    expect((await edit({ durationMin: 60 })).status).toBe(409);
  });
  it("does not lock a never-booked group because another event has bookings", async () => {
    await booking.createBooking({ username: "demo", slug: "30min", start, name: "Other invitee", email: "other@example.invalid", tz });
    expect((await edit({ durationMin: 60 })).status).toBe(200);
  });
  it("requires the owner and does not disclose booked settings to another account", async () => {
    await book();
    auth.mockResolvedValue(null); expect((await edit({ durationMin: 60 })).status).toBe(401);
    auth.mockResolvedValue({ id: "demo-mate" });
    const response = await edit({ durationMin: 60 });
    expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "not_found" });
    auth.mockResolvedValue({ id: "demo-user" }); expect((await edit({ durationMin: 60 }, "missing")).status).toBe(404);
  });
  it("does not apply group restrictions to a booked one-on-one event", async () => {
    await db.update(schema.eventTypes).set({ kind: "one_on_one" }).where(eq(schema.eventTypes.id, "locked-group"));
    await book(); expect((await edit({ durationMin: 60, location: "Room B" })).status).toBe(200);
  });
  it("returns owner-scoped lock metadata for the dashboard, including cancelled bookings", async () => {
    const { getLockedGroupEventIds } = await import("../../lib/group-sessions");
    expect(await getLockedGroupEventIds("demo-user")).toEqual(new Set());
    const first = await book();
    expect(await getLockedGroupEventIds("demo-user")).toEqual(new Set(["locked-group"]));
    expect(await getLockedGroupEventIds("demo-mate")).toEqual(new Set());
    await booking.cancelBooking(first.uid, "Test cancellation");
    expect(await getLockedGroupEventIds("demo-user")).toEqual(new Set(["locked-group"]));
  });
  it("rejects an edit whose transaction starts after the first reservation commits", async () => {
    const transact = db.transaction.bind(db);
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    let first = true;
    const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: unknown[]) => {
      if (first) { first = false; entered(); await gate; }
      return transact(...args);
    });
    const editing = edit({ durationMin: 60, location: "Room B" });
    await ready;
    try { await book(); } finally { release(); }
    const response = await editing;
    spy.mockRestore();
    expect(response.status).toBe(409);
    expect(await savedType()).toMatchObject({ durationMin: 30, location: "Room A" });
    await book();
    const meetings = await db.select().from(schema.bookings);
    expect(meetings).toHaveLength(2);
    expect(meetings.every((b: typeof schema.bookings.$inferSelect) => +b.end - +b.start === 30 * 60000)).toBe(true);
  });
  it.each([{ durationMin: 60 }, { location: "Room B" }, { kind: "one_on_one" }])("rejects a stale reservation if %j is saved before its transaction", async change => {
    const transact = db.transaction.bind(db);
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    let first = true;
    const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: unknown[]) => {
      if (first) { first = false; entered(); await gate; }
      return transact(...args);
    });
    const pending = book();
    // Attach rejection handling before releasing the deferred reservation.
    const result = Promise.allSettled([pending]);
    await ready;
    let response: Response;
    try { response = await edit(change); } finally { release(); }
    expect(response!.status).toBe(200);
    const [outcome] = await result;
    spy.mockRestore();
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") expect(outcome.reason.message).toBe("slot_unavailable");
    expect(await db.select().from(schema.bookings)).toHaveLength(0);
    await book();
    const [meeting] = await db.select().from(schema.bookings);
    expect(+meeting.end - +meeting.start).toBe((change.durationMin ?? 30) * 60000);
  });
});
