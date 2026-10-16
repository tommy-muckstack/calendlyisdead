import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { LIMIT_FIELDS, type MeetingLimits } from "../../lib/meeting-limits";

const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
vi.mock("@/auth", () => ({ requireUser: auth }));
vi.mock("../../lib/calendars", () => ({ externalBusy: async () => ({ busy: [], errors: [] }), writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: async () => {} }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), booking: typeof import("../../lib/booking");
let settings: typeof import("../../app/api/settings/meeting-limits/route"), readHosts: typeof import("../../app/api/event-types/[id]/host-limits/route").GET;
const tz = "America/New_York", month = DateTime.now().setZone(tz).plus({ months: 1 }).startOf("month");
const at = (day: number, hour = 11) => month.plus({ days: day - 1, hours: hour }).toUTC().toISO()!;
const clear: MeetingLimits = { meetingLimitPerDay: null, meetingLimitPerWeek: null, meetingLimitPerMonth: null };
const edit = (body: unknown) => settings.PATCH(new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify(body) }));
const read = (id: string) => readHosts(new NextRequest("http://localhost"), { params: Promise.resolve({ id }) });
const team = (slug: string) => ["rr", "rr-other", "collective"].includes(slug);
const book = (slug: string, start: string, extra: { rescheduleUid?: string } = {}) => booking.createBooking({ username: team(slug) ? "team:account" : "demo", slug, start,
  name: "Test invitee", email: "invitee@example.invalid", tz, ...extra });
const slots = async (slug: string, start: string, zone = tz) => {
  const day = DateTime.fromISO(start).setZone(zone).toISODate()!;
  return (await booking.availability(team(slug) ? "team:account" : "demo", slug, day, day, zone))!;
};
const limit = (values: Partial<MeetingLimits>, userId = "demo-user") => db.update(schema.users).set(values).where(eq(schema.users.id, userId));

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-account-limits-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  booking = await import("../../lib/booking"); settings = await import("../../app/api/settings/meeting-limits/route");
  readHosts = (await import("../../app/api/event-types/[id]/host-limits/route")).GET;
  await db.update(schema.schedules).set({ weekly: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(day => [day, [{ start: "00:00", end: "24:00" }]])) });
  await db.insert(schema.teams).values({ id: "account-team", slug: "account", name: "Account limits" });
  await db.insert(schema.teamMembers).values([{ teamId: "account-team", userId: "demo-user", role: "owner" }, { teamId: "account-team", userId: "demo-mate", role: "member" }]);
});
beforeEach(async () => {
  await db.delete(schema.pollVotes); await db.delete(schema.polls); await db.delete(schema.bookings); await db.delete(schema.eventTypeHosts); await db.delete(schema.eventTypes);
  await db.update(schema.users).set({ ...clear, timezone: tz }); await db.update(schema.schedules).set({ timezone: tz });
  auth.mockResolvedValue({ id: "demo-user" });
  for (const [id, kind] of [["personal", "one_on_one"], ["other", "one_on_one"], ["group", "group"], ["rr", "round_robin"], ["rr-other", "round_robin"], ["collective", "collective"], ["once", "one_off"]]) {
    await db.insert(schema.eventTypes).values({ id, slug: id, userId: "demo-user", title: id, kind, minNoticeMin: 0, rangeDays: 730,
      seats: kind === "group" ? 3 : 1, teamId: team(id) ? "account-team" : null });
    if (team(id)) await db.insert(schema.eventTypeHosts).values(["demo-user", "demo-mate"].map(userId => ({ eventTypeId: id, userId })));
  }
});
afterEach(() => vi.restoreAllMocks());

describe("account settings and read-only host visibility", () => {
  it("sets each period, preserves unrelated values and clears limits", async () => {
    for (const field of LIMIT_FIELDS) { expect((await edit({ [field]: 3 })).status).toBe(200); }
    const result = await (await settings.GET()).json(); expect(result).toEqual({ meetingLimitPerDay: 3, meetingLimitPerWeek: 3, meetingLimitPerMonth: 3, timezone: tz });
    expect((await edit({ meetingLimitPerDay: null })).status).toBe(200);
    expect(await (await settings.GET()).json()).toMatchObject({ meetingLimitPerDay: null, meetingLimitPerWeek: 3, meetingLimitPerMonth: 3 });
  });
  it.each([0, -1, 1.5, "3", 2147483648])("rejects invalid counts %j without partial saving", async value => {
    expect((await edit({ meetingLimitPerDay: value, meetingLimitPerMonth: 10 })).status).toBe(400);
    expect(await (await settings.GET()).json()).toMatchObject(clear);
  });
  it("rejects malformed, empty and authority-changing payloads", async () => {
    for (const body of [{}, null, [], { userId: "demo-mate", meetingLimitPerDay: 1 }, { timezone: "UTC", meetingLimitPerDay: 1 }]) expect((await edit(body)).status).toBe(400);
    expect((await settings.PATCH(new NextRequest("http://localhost", { method: "PATCH", body: "{" }))).status).toBe(400);
  });
  it("requires authentication and never lets an admin target another account", async () => {
    auth.mockResolvedValue(null); expect((await settings.GET()).status).toBe(401); expect((await edit({ meetingLimitPerDay: 1 })).status).toBe(401); expect((await read("rr")).status).toBe(401);
    auth.mockResolvedValue({ id: "demo-user" });
    expect((await settings.PATCH(new NextRequest("http://localhost?userId=demo-mate", { method: "PATCH", body: JSON.stringify({ meetingLimitPerDay: 2 }) }))).status).toBe(200);
    const [mate] = await db.select().from(schema.users).where(eq(schema.users.id, "demo-mate")); expect(mate.meetingLimitPerDay).toBeNull();
  });
  it("returns an honest failure when persistence fails", async () => {
    vi.spyOn(db, "update").mockImplementationOnce(() => { throw new Error("test failure"); });
    expect((await edit({ meetingLimitPerDay: 1 })).status).toBe(500);
    expect(await (await settings.GET()).json()).toMatchObject(clear);
  });
  it("lets owners/admins read only the relevant hosts, without exposing private user fields", async () => {
    await limit({ meetingLimitPerDay: 4 }, "demo-mate");
    const personal = await (await read("personal")).json(); expect(personal.hosts).toHaveLength(1); expect(personal.hosts[0].isMe).toBe(true);
    const result = await (await read("rr")).json(); expect(result.hosts).toHaveLength(2);
    expect(result.hosts.find((h: { id: string }) => h.id === "demo-mate")).toEqual({ id: "demo-mate", name: "Sam Rivera", timezone: tz, isMe: false, ...clear, meetingLimitPerDay: 4 });
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await read("rr")).status).toBe(404); expect((await read("personal")).status).toBe(404);
    auth.mockResolvedValue({ id: "stranger" }); expect((await read("rr")).status).toBe(404);
  });
  it("shows assigned hosts for managed templates and hides deleted event types", async () => {
    await db.insert(schema.eventTypes).values({ id: "template", userId: "demo-user", teamId: "account-team", slug: "template", title: "Template", kind: "managed" });
    await (await import("../../lib/teams")).assignManaged("template", ["demo-mate"], "account-team");
    expect((await (await read("template")).json()).hosts.map((h: { id: string }) => h.id)).toEqual(["demo-mate"]);
    await db.update(schema.eventTypes).set({ deletedAt: new Date() }).where(eq(schema.eventTypes.id, "template")); expect((await read("template")).status).toBe(404);
  });
});

describe("account-wide booking enforcement", () => {
  it.each(LIMIT_FIELDS)("applies %s across distinct event types", async field => {
    await limit({ [field]: 1 }); await book("personal", at(2));
    expect(Object.values((await slots("other", at(2))).slots).flat()).toEqual([]);
    await expect(book("other", at(2, 12))).rejects.toThrow("slot_unavailable");
    await expect(book("once", at(2, 13))).rejects.toThrow("slot_unavailable");
    expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "once")))[0].usedAt).toBeNull();
  });
  it("removes a capped host from every round-robin pool, while another host remains bookable", async () => {
    await limit({ meetingLimitPerDay: 1 }); await book("personal", at(2));
    for (const slug of ["rr", "rr-other"]) expect((await slots(slug, at(2, 12))).free.get(at(2, 12))).toEqual(["demo-mate"]);
    const next = await book("rr", at(2, 12)); expect(next.hostId).toBe("demo-mate");
    await limit({ meetingLimitPerDay: 1 }, "demo-mate"); expect(Object.values((await slots("rr-other", at(2))).slots).flat()).toEqual([]);
  });
  it("requires every collective host below their cap and counts one meeting per participating host", async () => {
    await limit({ meetingLimitPerDay: 1 }); await limit({ meetingLimitPerDay: 1 }, "demo-mate");
    await book("collective", at(2));
    expect(await db.select().from(schema.bookings)).toHaveLength(2);
    await expect(book("personal", at(2, 12))).rejects.toThrow("slot_unavailable");
    expect(Object.values((await slots("rr", at(2))).slots).flat()).toEqual([]);
    const first = (await db.select().from(schema.bookings))[0]; await booking.cancelBooking(first.uid, "test");
    await book("personal", at(2, 12)); await expect(book("collective", at(2, 13))).rejects.toThrow("slot_unavailable");
  });
  it("combines event and account caps without weakening either", async () => {
    await limit({ meetingLimitPerDay: 2 }); await db.update(schema.eventTypes).set({ maxPerDay: 1 }).where(eq(schema.eventTypes.id, "personal"));
    await book("personal", at(2)); await expect(book("personal", at(2, 12))).rejects.toThrow("slot_unavailable");
    await book("other", at(2, 12)); await expect(book("once", at(2, 13))).rejects.toThrow("slot_unavailable");
  });
  it("counts a group session once, retains its open seats at the cap and frees it only after its last cancellation", async () => {
    await limit({ meetingLimitPerDay: 1 }); const first = await book("group", at(2)); const second = await book("group", at(2));
    expect(Object.values((await slots("group", at(2))).slots).flat()).toEqual([at(2)]);
    await expect(book("personal", at(2, 12))).rejects.toThrow("slot_unavailable");
    await booking.cancelBooking(first.uid, "test"); await expect(book("personal", at(2, 12))).rejects.toThrow("slot_unavailable");
    await booking.cancelBooking(second.uid, "test"); await book("personal", at(2, 12));
  });
  it("excludes a moved personal or collective booking from the old allowance", async () => {
    await limit({ meetingLimitPerMonth: 1 }); await limit({ meetingLimitPerMonth: 1 }, "demo-mate");
    const first = await book("personal", at(2)); await book("personal", at(25), { rescheduleUid: first.uid });
    await db.delete(schema.bookings); const collective = await book("collective", at(2)); await book("collective", at(25), { rescheduleUid: collective.uid });
    expect((await db.select().from(schema.bookings).where(eq(schema.bookings.status, "confirmed"))).map((b: { start: Date }) => b.start.toISOString())).toEqual([at(25), at(25)]);
  });
  it("does not let a group move evade the cap while another attendee remains", async () => {
    await limit({ meetingLimitPerMonth: 1 }); const first = await book("group", at(2)); const second = await book("group", at(2));
    await expect(book("group", at(25), { rescheduleUid: first.uid })).rejects.toThrow("slot_unavailable");
    await booking.cancelBooking(second.uid, "test"); await book("group", at(25), { rescheduleUid: first.uid });
  });
  it("includes past weeks and deleted templates in the monthly count, independent of invitee timezone", async () => {
    await limit({ meetingLimitPerMonth: 1 }); await book("personal", at(1));
    await db.update(schema.eventTypes).set({ deletedAt: new Date(), active: false }).where(eq(schema.eventTypes.id, "personal"));
    expect(Object.values((await slots("other", at(25), "Asia/Tokyo")).slots).flat()).toEqual([]);
    const next = month.plus({ months: 1, hours: 12 }).toUTC().toISO()!; expect(Object.values((await slots("other", next)).slots).flat()).toContain(next);
  });
  it("uses the account timezone across event schedules and resets within another schedule's day", async () => {
    await limit({ meetingLimitPerDay: 1 }); await db.update(schema.schedules).set({ timezone: "America/Los_Angeles" });
    await book("personal", at(2)); const reset = month.plus({ days: 2 }).toUTC().toISO()!;
    const result = await slots("other", reset, "America/Los_Angeles");
    expect(Object.values(result.slots).flat()).toContain(reset);
    expect(Object.values(result.slots).flat()).not.toContain(DateTime.fromISO(reset).minus({ minutes: 30 }).toUTC().toISO());
  });
  it.each([
    { field: "meetingLimitPerMonth", starts: ["2028-02-29T15:00:00Z"], blocked: "2028-03-01T04:30:00Z", reset: "2028-03-01T05:00:00Z" },
    { field: "meetingLimitPerMonth", starts: ["2027-12-31T15:00:00Z"], blocked: "2028-01-01T04:30:00Z", reset: "2028-01-01T05:00:00Z" },
    { field: "meetingLimitPerWeek", starts: ["2027-12-31T15:00:00Z"], blocked: "2028-01-03T04:30:00Z", reset: "2028-01-03T05:00:00Z" },
    { field: "meetingLimitPerDay", starts: ["2027-11-07T05:30:00Z", "2027-11-07T06:30:00Z"], blocked: "2027-11-08T04:30:00Z", reset: "2027-11-08T05:00:00Z" },
  ])("handles $field across leap/year/week/DST boundaries ($reset)", async ({ field, starts, blocked, reset }) => {
    await limit({ [field]: starts.length });
    for (const [index, start] of starts.entries()) await db.insert(schema.bookings).values({ uid: `boundary-${index}`, eventTypeId: "personal", hostId: "demo-user", start: new Date(start),
      end: new Date(+new Date(start) + 900000), inviteeName: "Boundary test", inviteeEmail: "boundary@example.invalid", inviteeTz: "UTC" });
    const [host] = await db.select().from(schema.users).where(eq(schema.users.id, "demo-user"));
    const check = await (await import("../../lib/host-meeting-limits")).hostLimitCheck(db, host, new Date(blocked), new Date(reset));
    expect(check(blocked)).toBe(true); expect(check(reset)).toBe(false);
  });
  it("serializes competing bookings from different event types against the final account allowance", async () => {
    await limit({ meetingLimitPerMonth: 1 }); await limit({ meetingLimitPerMonth: 1 }, "demo-mate");
    await db.delete(schema.eventTypeHosts).where(eq(schema.eventTypeHosts.userId, "demo-mate"));
    const transact = db.transaction.bind(db); let arrived = 0, release!: () => void; const ready = new Promise<void>(r => { release = r; });
    const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: unknown[]) => { if (++arrived === 2) release(); await ready; return transact(...args); });
    const result = await Promise.allSettled([book("personal", at(2)), book("rr", at(25))]); spy.mockRestore();
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
  it.each(LIMIT_FIELDS)("rereads a %s reduction committed after availability preflight", async field => {
    await book("personal", at(2)); const transact = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementationOnce(async (...args: unknown[]) => { await limit({ [field]: 1 }); return transact(...args); });
    await expect(book("other", at(2, 12))).rejects.toThrow("slot_unavailable"); expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
  it("includes poll meetings in account totals and cannot bypass a reached cap through poll closure", async () => {
    const polls = await import("../../lib/polls");
    const make = async (start: string) => { const id = await polls.createPoll("demo-user", { title: "Limit poll", durationMin: 30, options: [start, at(26)] }); await polls.vote(id, { name: "Test", email: "test@example.invalid", picks: [start] }); return id; };
    await limit({ meetingLimitPerMonth: 1 }); const id = await make(at(2)); await polls.bookPoll("demo-user", id, at(2));
    await expect(book("other", at(25))).rejects.toThrow("slot_unavailable");
    const blocked = await make(at(25)); await expect(polls.bookPoll("demo-user", blocked, at(25))).rejects.toThrow("slot_unavailable");
    expect((await polls.getPoll(blocked))?.poll.status).toBe("open");
    expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
});
