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
const tz = "America/New_York", date = DateTime.now().setZone(tz).plus({ days: 7 }).startOf("day");
const at = (hour: number, minute = 0) => date.plus({ hours: hour, minutes: minute }).toUTC().toISO()!;
const edit = (id: string, body: unknown) => patch(new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const owner = (slug: string) => ["rr", "collective"].includes(slug) ? "team:increments" : "demo";
const book = (slug: string, start: string, rescheduleUid?: string) => booking.createBooking({ username: owner(slug), slug, start, rescheduleUid, name: "Test invitee", email: "invitee@example.invalid", tz });
const slots = async (slug: string) => (await booking.availability(owner(slug), slug, date.toISODate()!, date.toISODate()!, tz))!;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-increments-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  booking = await import("../../lib/booking"); patch = (await import("../../app/api/event-types/[id]/route")).PATCH;
  const weekly = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(day => [day, [{ start: "09:00", end: "17:00" }]]));
  await db.update(schema.schedules).set({ weekly, timezone: tz });
  await db.insert(schema.teams).values({ id: "increment-team", slug: "increments", name: "Increments" });
  await db.insert(schema.teamMembers).values([{ teamId: "increment-team", userId: "demo-user", role: "owner" }, { teamId: "increment-team", userId: "demo-mate", role: "member" }]);
});
beforeEach(async () => {
  await db.delete(schema.bookings); await db.delete(schema.eventTypeHosts); await db.delete(schema.eventTypes); auth.mockResolvedValue({ id: "demo-user" });
  for (const [id, kind] of [["personal", "one_on_one"], ["group", "group"], ["rr", "round_robin"], ["collective", "collective"], ["once", "one_off"]]) {
    const team = ["rr", "collective"].includes(id);
    await db.insert(schema.eventTypes).values({ id, slug: id, userId: "demo-user", title: id, kind, durationMin: 60, minNoticeMin: 0, rangeDays: 60, seats: kind === "group" ? 3 : 1, teamId: team ? "increment-team" : null });
    if (team) await db.insert(schema.eventTypeHosts).values(["demo-user", "demo-mate"].map(userId => ({ eventTypeId: id, userId })));
  }
});
afterEach(() => vi.restoreAllMocks());

describe("independent event start increments", () => {
  it("defaults new events to half-hour starts regardless of duration", async () => {
    const result = await slots("personal"); expect(result.ev.eventType.startIntervalMin).toBe(30);
    expect(result.slots[date.toISODate()!].slice(0, 3)).toEqual([at(9), at(9, 30), at(10)]);
    expect((await book("personal", at(9, 30))).end.toISOString()).toBe(at(10, 30));
  });
  it("saves a custom interval and keeps it when duration changes", async () => {
    expect(await (await edit("personal", { startIntervalMin: 7 })).json()).toMatchObject({ startIntervalMin: 7, durationMin: 60 });
    expect(await (await edit("personal", { durationMin: 25 })).json()).toMatchObject({ startIntervalMin: 7, durationMin: 25 });
    expect((await slots("personal")).slots[date.toISODate()!].slice(0, 3)).toEqual([at(9), at(9, 7), at(9, 14)]);
  });
  it.each([null, 0, -1, 4, 5.5, 1441, "15", true])("rejects invalid interval %j without partial changes", async value => {
    expect((await edit("personal", { startIntervalMin: value, title: "Must not save" })).status).toBe(400);
    expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "personal")))[0]).toMatchObject({ title: "personal", startIntervalMin: 30 });
  });
  it("requires authentication, ownership and team admin permission", async () => {
    auth.mockResolvedValue(null); expect((await edit("personal", { startIntervalMin: 15 })).status).toBe(401);
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await edit("personal", { startIntervalMin: 15 })).status).toBe(404); expect((await edit("rr", { startIntervalMin: 15 })).status).toBe(404);
  });
  it("copies the interval into duplicates without coupling future edits", async () => {
    await edit("personal", { startIntervalMin: 20 });
    const { POST } = await import("../../app/api/event-types/[id]/duplicate/route");
    const response = await POST(new NextRequest("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "personal" }) }); expect(response.status).toBe(201);
    const copy = await response.json(); expect(copy.startIntervalMin).toBe(20); await edit(copy.id, { startIntervalMin: 45 });
    expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "personal")))[0].startIntervalMin).toBe(20);
  });
  it("assigns and propagates managed intervals while preventing host overrides", async () => {
    await db.insert(schema.eventTypes).values({ id: "template", userId: "demo-user", teamId: "increment-team", slug: "template", title: "Template", kind: "managed", startIntervalMin: 45, lockedFields: ["startIntervalMin"] });
    const { assignManaged } = await import("../../lib/teams"); await assignManaged("template", ["demo-mate"], "increment-team");
    const [copy] = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.managedParentId, "template")); expect(copy.startIntervalMin).toBe(45);
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await edit(copy.id, { startIntervalMin: 5 })).status).toBe(403);
    auth.mockResolvedValue({ id: "demo-user" }); expect((await edit("template", { startIntervalMin: 20 })).status).toBe(200);
    expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, copy.id)))[0].startIntervalMin).toBe(20);
  });
  it.each(["personal", "group", "rr", "collective", "once"])("applies a five-minute grid to %s booking and rejects off-grid requests", async slug => {
    await edit(slug, { startIntervalMin: 5 });
    expect((await slots(slug)).slots[date.toISODate()!]).toContain(at(9, 5));
    await expect(book(slug, at(9, 6))).rejects.toThrow("slot_unavailable");
    const saved = await book(slug, at(9, 5)); expect(saved.end.toISOString()).toBe(at(10, 5));
    if (slug === "group") { await book(slug, at(9, 5)); expect((await slots(slug)).slots[date.toISODate()!]).toContain(at(9, 5)); }
  });
  it("keeps existing reservations and applies a changed grid to rescheduling", async () => {
    await edit("personal", { startIntervalMin: 15 }); const first = await book("personal", at(9, 15));
    await edit("personal", { startIntervalMin: 60 });
    expect((await db.select().from(schema.bookings).where(eq(schema.bookings.uid, first.uid)))[0].start.toISOString()).toBe(at(9, 15));
    await expect(book("personal", at(11, 15), first.uid)).rejects.toThrow("slot_unavailable");
    expect((await book("personal", at(11), first.uid)).start.toISOString()).toBe(at(11));
  });
  it.each(["personal", "rr"])("rechecks %s increments changed after availability preflight", async slug => {
    const transact = db.transaction.bind(db); let first = true, entered!: () => void, release!: () => void;
    const ready = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
    const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: unknown[]) => { if (first) { first = false; entered(); await gate; } return transact(...args); });
    const pending = Promise.allSettled([book(slug, at(9, 30))]); await ready;
    try { expect((await edit(slug, { startIntervalMin: 60 })).status).toBe(200); } finally { release(); }
    const [result] = await pending; spy.mockRestore(); expect(result.status).toBe("rejected"); expect(await db.select().from(schema.bookings)).toHaveLength(0);
  });
  it("allows only one competing overlapping booking on the finer grid", async () => {
    await edit("personal", { startIntervalMin: 15 });
    const results = await Promise.allSettled([book("personal", at(9)), book("personal", at(9, 15))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
});
