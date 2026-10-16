import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
const mail = vi.hoisted(() => vi.fn<(message: { text: string; ics: string }) => Promise<void>>().mockResolvedValue(undefined));
vi.mock("@/auth", () => ({ requireUser: auth }));
vi.mock("../../lib/calendars", () => ({ externalBusy: async () => ({ busy: [], errors: [] }), writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: mail }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), booking: typeof import("../../lib/booking");
let patch: typeof import("../../app/api/event-types/[id]/route").PATCH;
const zone = "America/New_York", date = DateTime.now().setZone(zone).plus({ days: 14 }).startOf("day");
const range = { kind: "fixed", start: date.toISODate()!, end: date.toISODate()! } as const;
const at = (days = 0, hour = 16) => date.plus({ days, hours: hour }).toUTC().toISO()!;
const edit = (id: string, body: unknown) => patch(new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const book = (id: string, start = at(), rescheduleUid?: string) => booking.createBooking({ username: ["rr", "collective"].includes(id) ? "team:range" : "demo",
  slug: id, start, tz: "Asia/Tokyo", rescheduleUid, name: "Range QA", email: "range@example.invalid" });
const get = async (id = "personal") => (await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, id)))[0];

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-range-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  booking = await import("../../lib/booking"); patch = (await import("../../app/api/event-types/[id]/route")).PATCH;
  await db.insert(schema.teams).values({ id: "range-team", slug: "range", name: "Range team" });
  await db.insert(schema.teamMembers).values([{ teamId: "range-team", userId: "demo-user", role: "owner" }, { teamId: "range-team", userId: "demo-mate", role: "member" }]);
});
beforeEach(async () => {
  await db.delete(schema.bookings); await db.delete(schema.eventTypeHosts); await db.delete(schema.eventTypes); auth.mockResolvedValue({ id: "demo-user" }); mail.mockClear();
  await db.update(schema.schedules).set({ weekly: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(day => [day, [{ start: "00:00", end: "24:00" }]])), timezone: zone });
  await db.update(schema.schedules).set({ timezone: "Pacific/Honolulu" }).where(eq(schema.schedules.userId, "demo-mate"));
  for (const [id, kind] of [["personal", "one_on_one"], ["group", "group"], ["rr", "round_robin"], ["collective", "collective"], ["once", "one_off"]]) {
    const team = ["rr", "collective"].includes(id);
    await db.insert(schema.eventTypes).values({ id, slug: id, userId: "demo-user", title: id, kind, minNoticeMin: 0, seats: kind === "group" ? 3 : 1, teamId: team ? "range-team" : null });
    if (team) await db.insert(schema.eventTypeHosts).values(["demo-user", "demo-mate"].map(userId => ({ eventTypeId: id, userId })));
  }
});
afterEach(() => vi.restoreAllMocks());

describe("saved booking date ranges", () => {
  it.each(["personal", "group", "rr", "collective", "once"])("enforces a fixed range for %s in availability and direct bookings without moving confirmation instants", async id => {
    expect((await edit(id, { dateRange: range })).status).toBe(200);
    await expect(book(id, at(-1))).rejects.toThrow("slot_unavailable"); await expect(book(id, at(1))).rejects.toThrow("slot_unavailable");
    const queryDay = DateTime.fromISO(at()).setZone("Asia/Tokyo").toISODate()!;
    const owner = ["rr", "collective"].includes(id) ? "team:range" : "demo";
    const { GET } = await import("../../app/api/slots/route");
    const response = await GET(new NextRequest(`http://localhost/api/slots?${new URLSearchParams({ user: owner, slug: id, from: queryDay, to: queryDay, tz: "Asia/Tokyo" })}`));
    expect(response.status).toBe(200); expect((await response.json()).slots[queryDay]).toContain(at());
    const saved = await book(id); expect(saved.start.toISOString()).toBe(at());
    expect(mail.mock.calls[0][0].ics).toContain(`DTSTART:${DateTime.fromISO(at()).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")}`);
  });
  it("allows an indefinite booking beyond the previous maximum horizon", async () => {
    const start = date.plus({ years: 3, hours: 9 }).toUTC().toISO()!;
    await expect(book("personal", start)).rejects.toThrow("slot_unavailable");
    expect((await edit("personal", { dateRange: { kind: "indefinite" } })).status).toBe(200);
    expect((await book("personal", start)).start.toISOString()).toBe(start);
  });
  it.each(["calendar", "weekdays"])("applies a saved rolling %s horizon to direct bookings across a weekend", async unit => {
    const now = DateTime.utc(2027, 3, 5, 12); if (!now.isValid) throw new Error("Invalid test date");
    vi.spyOn(DateTime, "utc").mockReturnValue(now);
    expect((await edit("personal", { dateRange: { kind: "rolling", days: 2, unit } })).status).toBe(200);
    const tuesday = "2027-03-09T14:00:00.000Z";
    if (unit === "weekdays") expect((await book("personal", tuesday)).start.toISOString()).toBe(tuesday);
    else await expect(book("personal", tuesday)).rejects.toThrow("slot_unavailable");
    expect((await book("personal", "2027-03-07T14:00:00.000Z")).start.toISOString()).toBe("2027-03-07T14:00:00.000Z");
  });
  it("keeps existing meetings and applies changed dates when rescheduling", async () => {
    const first = await book("personal"); const next = date.plus({ days: 1 }).toISODate()!;
    await edit("personal", { dateRange: { kind: "fixed", start: next, end: next } });
    await expect(book("personal", at(0, 17), first.uid)).rejects.toThrow("slot_unavailable");
    expect((await db.select().from(schema.bookings).where(eq(schema.bookings.uid, first.uid)))[0].status).toBe("confirmed");
    const moved = await book("personal", at(1), first.uid); expect(moved.rescheduledFrom).toBe(first.uid);
    expect(await booking.cancelBooking(moved.uid, "QA cleanup")).toBeTruthy();
  });
  it.each([
    {}, { kind: "unknown" }, { kind: "rolling", days: 0, unit: "calendar" }, { kind: "rolling", days: 731, unit: "calendar" },
    { kind: "rolling", days: 1.5, unit: "calendar" }, { kind: "rolling", days: "5", unit: "calendar" }, { kind: "rolling", days: 5, unit: "holidays" },
    { kind: "fixed", start: "2027-02-29", end: "2027-03-01" }, { kind: "fixed", start: "2028-03-01", end: "2028-02-29" },
    { kind: "fixed", start: "2028-02-29T00:00:00Z", end: "2028-03-01" }, { kind: "fixed", start: "", end: "" },
    { kind: "fixed", start: "0000-01-01", end: "0000-01-02" }, { kind: "indefinite", days: 5 },
  ])("rejects invalid range %j without partial changes", async dateRange => {
    expect((await edit("personal", { dateRange, title: "Must not save" })).status).toBe(400);
    expect(await get()).toMatchObject({ dateRange: null, title: "personal" });
  });
  it("preserves unrelated edits, supports the legacy rolling API and rejects ambiguous range payloads", async () => {
    await edit("personal", { dateRange: range }); await edit("personal", { title: "Still fixed" }); expect((await get()).dateRange).toEqual(range);
    expect((await edit("personal", { dateRange: range, rangeDays: 3 })).status).toBe(400);
    expect((await edit("personal", { rangeDays: 3 })).status).toBe(200); expect(await get()).toMatchObject({ dateRange: null, rangeDays: 3 });
    await expect(book("personal")).rejects.toThrow("slot_unavailable");
  });
  it("requires authentication and owner/team admin permissions", async () => {
    auth.mockResolvedValue(null); expect((await edit("personal", { dateRange: range })).status).toBe(401);
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await edit("personal", { dateRange: range })).status).toBe(404); expect((await edit("rr", { dateRange: range })).status).toBe(404);
  });
  it("retains the prior range when persistence fails", async () => {
    await edit("personal", { dateRange: range }); vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("offline"));
    expect((await edit("personal", { dateRange: { kind: "indefinite" } })).status).toBe(500); expect((await get()).dateRange).toEqual(range);
  });
  it("preserves fixed and legacy ranges in duplicates and source-created single-use links", async () => {
    await edit("personal", { dateRange: range }); const { POST } = await import("../../app/api/event-types/[id]/duplicate/route");
    const copy = await (await POST(new NextRequest("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "personal" }) })).json(); expect(copy.dateRange).toEqual(range);
    const { createOneOff } = await import("../../lib/oneoff"); const link = await createOneOff("demo-user", { title: "Single-use", durationMin: 30, fromEventTypeId: "personal" }); expect(link.dateRange).toEqual(range);
    await expect(book(link.slug, at(1))).rejects.toThrow("slot_unavailable"); expect((await book(link.slug)).start.toISOString()).toBe(at());
    await edit("personal", { rangeDays: 7 }); const legacy = await createOneOff("demo-user", { title: "Legacy", durationMin: 30, fromEventTypeId: "personal" }); expect(legacy).toMatchObject({ dateRange: null, rangeDays: 7 });
  });
  it.each(["rangeDays", "dateRange"])("propagates and protects a managed range through the %s lock", async field => {
    await db.insert(schema.eventTypes).values({ id: "template", userId: "demo-user", teamId: "range-team", slug: "template", title: "Template", kind: "managed", dateRange: range, lockedFields: [field] });
    await (await import("../../lib/teams")).assignManaged("template", ["demo-mate"], "range-team");
    const [assigned] = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.managedParentId, "template")); expect(assigned.dateRange).toEqual(range);
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await edit(assigned.id, { dateRange: { end: range.end, start: range.start, kind: "fixed" } })).status).toBe(200);
    expect((await edit(assigned.id, { dateRange: { kind: "indefinite" } })).status).toBe(403); expect((await edit(assigned.id, { rangeDays: 2 })).status).toBe(403);
    auth.mockResolvedValue({ id: "demo-user" }); expect((await edit("template", { dateRange: { kind: "rolling", days: 4, unit: "weekdays" } })).status).toBe(200);
    expect((await get(assigned.id)).dateRange).toEqual({ kind: "rolling", days: 4, unit: "weekdays" });
    await edit("template", { lockedFields: [] }); auth.mockResolvedValue({ id: "demo-mate" }); expect((await edit(assigned.id, { dateRange: { kind: "indefinite" } })).status).toBe(200);
  });
  it.each(["personal", "group", "rr", "collective", "once"])("rechecks a narrowed %s range after preflight under the reservation lock", async id => {
    const transact = db.transaction.bind(db); let first = true, entered!: () => void, release!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(db, "transaction").mockImplementation(async (...args: unknown[]) => { if (first) { first = false; entered(); await gate; } return transact(...args); });
    const pending = book(id); const result = expect(pending).rejects.toThrow("slot_unavailable"); await ready;
    try { expect((await edit(id, { dateRange: { kind: "fixed", start: date.plus({ days: 1 }).toISODate(), end: date.plus({ days: 1 }).toISODate() } })).status).toBe(200); } finally { release(); }
    await result; expect(await db.select().from(schema.bookings)).toEqual([]); expect((await get(id)).usedAt).toBeNull(); expect(mail).not.toHaveBeenCalled();
  });
  it("still prevents double bookings within a fixed range", async () => {
    await edit("personal", { dateRange: range }); const results = await Promise.allSettled([book("personal"), book("personal")]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1); expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
  it("rechecks legacy rolling-count changes made after preflight", async () => {
    const transact = db.transaction.bind(db); let first = true, entered!: () => void, release!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(db, "transaction").mockImplementation(async (...args: unknown[]) => { if (first) { first = false; entered(); await gate; } return transact(...args); });
    const pending = book("personal"); const result = expect(pending).rejects.toThrow("slot_unavailable"); await ready;
    try { expect((await edit("personal", { rangeDays: 2 })).status).toBe(200); } finally { release(); }
    await result; expect(await db.select().from(schema.bookings)).toEqual([]);
  });
});
