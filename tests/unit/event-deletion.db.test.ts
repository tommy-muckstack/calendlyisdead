import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user", username: "demo" }) as { id: string; username: string } | null));
const effects = vi.hoisted(() => ({ mail: vi.fn(async () => {}), remove: vi.fn(async () => {}) }));
vi.mock("@/auth", () => ({ requireUser: auth }));
vi.mock("../../lib/calendars", () => ({ externalBusy: async () => ({ busy: [], errors: [] }), writeEvent: async () => null, removeEvent: effects.remove }));
vi.mock("../../lib/email", () => ({ sendMail: effects.mail }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>;
let schema: typeof import("../../lib/db/schema"), booking: typeof import("../../lib/booking"), teams: typeof import("../../lib/teams");
let remove: typeof import("../../app/api/event-types/[id]/route").DELETE;
let patch: typeof import("../../app/api/event-types/[id]/route").PATCH;
const tz = "America/New_York";
const day = DateTime.now().setZone(tz).plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!;
const at = (time = "11:00") => DateTime.fromISO(`${day}T${time}`, { zone: tz }).toUTC().toISO()!;
const book = (slug = "delete-me", username = "demo") => booking.createBooking({ username, slug, start: at(),
  name: "Test invitee", email: "delete-test@example.invalid", tz });
const del = (id = "delete-me") => remove(new NextRequest(`http://localhost/api/event-types/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-event-deletion-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  booking = await import("../../lib/booking"); teams = await import("../../lib/teams");
  ({ DELETE: remove, PATCH: patch } = await import("../../app/api/event-types/[id]/route"));
  await db.insert(schema.teams).values({ id: "delete-team", slug: "delete-team", name: "Test team" });
  await db.insert(schema.teamMembers).values([
    { teamId: "delete-team", userId: "demo-user", role: "owner" }, { teamId: "delete-team", userId: "demo-mate", role: "member" },
  ]);
  await db.insert(schema.workflows).values({ id: "delete-reminder", userId: "demo-user", name: "Reminder", trigger: "before_start",
    offsetMin: 30, subject: "Reminder", body: "{{event.name}}", eventTypeIds: [] });
});
beforeEach(async () => {
  await db.delete(schema.bookings); await db.delete(schema.eventTypeHosts);
  await db.delete(schema.eventTypes);
  await db.insert(schema.eventTypes).values([
    { id: "delete-me", userId: "demo-user", slug: "delete-me", title: "Original meeting", durationMin: 30, location: "Room A", minNoticeMin: 0 },
    { id: "other", userId: "demo-user", slug: "other", title: "Other meeting", durationMin: 30, minNoticeMin: 0 },
  ]);
  auth.mockResolvedValue({ id: "demo-user", username: "demo" }); vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());

describe("deleting event types preserves scheduled meetings", () => {
  it("preserves booking details, reminders, history and external calendar events", async () => {
    const first = await book();
    const before = await booking.getBooking(first.uid);
    const reminders = await db.select().from(schema.scheduledMessages);
    expect(reminders).toHaveLength(1); expect(reminders[0].status).toBe("pending");
    vi.clearAllMocks();
    expect((await del()).status).toBe(200);
    const after = await booking.getBooking(first.uid);
    expect(after?.booking).toEqual(before!.booking);
    expect(after?.eventType).toMatchObject({ id: "delete-me", title: "Original meeting", location: "Room A" });
    expect(await db.select().from(schema.scheduledMessages)).toEqual(reminders);
    expect(effects.mail).not.toHaveBeenCalled(); expect(effects.remove).not.toHaveBeenCalled();
    const { listHostMeetings, getHostMeeting, parseMeetingFilters } = await import("../../lib/meetings");
    const filters = parseMeetingFilters(new URLSearchParams()); if (!filters.success) throw new Error("bad test filter");
    expect((await listHostMeetings("demo-user", tz, filters.data)).total).toBe(1);
    expect(await getHostMeeting("demo-user", first.uid)).toMatchObject({ uid: first.uid, title: "Original meeting" });
    const { processDue } = await import("../../lib/workflows");
    expect(await processDue(new Date(+first.start - 29 * 60000))).toMatchObject({ sent: 1, failed: 0 });
    expect(effects.mail).toHaveBeenCalledWith(expect.objectContaining({ to: "delete-test@example.invalid", text: "Original meeting" }));
  });
  it("removes the type from scheduling but keeps its booked time unavailable", async () => {
    await book(); await del();
    expect(await booking.loadEvent("demo", "delete-me")).toBeNull();
    await expect(book()).rejects.toThrow("not_found");
    await expect(book("other")).rejects.toThrow("slot_unavailable");
    const Page = (await import("../../app/app/page")).default;
    expect((await Page()).props.initial.map((et: { id: string }) => et.id)).toEqual(["other"]);
  });
  it("keeps the original confirmation and cancellation link usable", async () => {
    const first = await book(); await del();
    const cancelled = await booking.cancelBooking(first.uid, "No longer attending");
    expect(cancelled?.booking.uid).toBe(first.uid);
    expect((await booking.getBooking(first.uid))?.booking.status).toBe("cancelled");
    expect((await db.select().from(schema.scheduledMessages))[0].status).toBe("cancelled");
    await expect(book("other")).resolves.toMatchObject({ eventTypeId: "other" });
  });
  it("does not allow a deleted type to be edited or reactivated", async () => {
    await del();
    const response = await patch(new NextRequest("http://localhost/api/event-types/delete-me", { method: "PATCH",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ active: true, title: "Revived" }) }), { params: Promise.resolve({ id: "delete-me" }) });
    expect(response.status).toBe(404); expect((await del()).status).toBe(404);
  });
  it("reuses the normal new-event slug after deletion", async () => {
    await db.update(schema.eventTypes).set({ slug: "new-meeting" }).where(eq(schema.eventTypes.id, "delete-me"));
    await del();
    const create = (await import("../../app/api/event-types/route")).POST;
    const response = await create();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ slug: "new-meeting" });
  });
  it("requires the owner and leaves meetings intact for rejected requests", async () => {
    const first = await book();
    auth.mockResolvedValue(null); expect((await del()).status).toBe(401);
    auth.mockResolvedValue({ id: "demo-mate", username: "sam" }); expect((await del()).status).toBe(404);
    expect((await booking.getBooking(first.uid))?.booking.status).toBe("confirmed");
    expect(await booking.loadEvent("demo", "delete-me")).not.toBeNull();
  });
  it("preserves every group attendee", async () => {
    await db.update(schema.eventTypes).set({ kind: "group", seats: 3 }).where(eq(schema.eventTypes.id, "delete-me"));
    const first = await book(), second = await book(); await del();
    expect((await booking.getBooking(first.uid))?.booking.status).toBe("confirmed");
    expect((await booking.getBooking(second.uid))?.booking.status).toBe("confirmed");
    expect(await db.select().from(schema.scheduledMessages)).toHaveLength(2);
  });
  it("preserves every host of a deleted collective event", async () => {
    await db.update(schema.eventTypes).set({ kind: "collective", teamId: "delete-team" }).where(eq(schema.eventTypes.id, "delete-me"));
    await db.insert(schema.eventTypeHosts).values(["demo-user", "demo-mate"].map(userId => ({ userId, eventTypeId: "delete-me" })));
    const first = await book("delete-me", "team:delete-team");
    auth.mockResolvedValue({ id: "demo-mate", username: "sam" }); expect((await del()).status).toBe(404);
    auth.mockResolvedValue({ id: "demo-user", username: "demo" }); expect((await del()).status).toBe(200);
    expect((await booking.getBooking(first.uid))?.group).toHaveLength(2);
    expect((await booking.getBooking(first.uid))?.hosts).toHaveLength(2);
    const Page = (await import("../../app/app/teams/page")).default;
    expect((await Page()).props.teams[0].eventTypes).toEqual([]);
  });
  it("removes assigned managed types without losing their meetings", async () => {
    await db.update(schema.eventTypes).set({ kind: "managed", teamId: "delete-team" }).where(eq(schema.eventTypes.id, "delete-me"));
    await teams.assignManaged("delete-me", ["demo-mate"], "delete-team");
    const first = await book("delete-me", "sam"); await del();
    expect((await booking.getBooking(first.uid))?.booking.status).toBe("confirmed");
    expect(await booking.loadEvent("sam", "delete-me")).toBeNull();
    await expect(teams.assignManaged("delete-me", ["demo-mate"], "delete-team")).rejects.toThrow("not_managed");
  });
  it("preserves bookings when unassigning a managed type and creates a fresh copy on reassignment", async () => {
    await db.update(schema.eventTypes).set({ kind: "managed", teamId: "delete-team" }).where(eq(schema.eventTypes.id, "delete-me"));
    await teams.assignManaged("delete-me", ["demo-mate"], "delete-team");
    const first = await book("delete-me", "sam");
    await teams.assignManaged("delete-me", [], "delete-team");
    expect((await booking.getBooking(first.uid))?.booking.status).toBe("confirmed");
    expect(await booking.loadEvent("sam", "delete-me")).toBeNull();
    await teams.assignManaged("delete-me", ["demo-mate"], "delete-team");
    expect((await booking.loadEvent("sam", "delete-me"))?.eventType.id).not.toBe(first.eventTypeId);
    await db.update(schema.eventTypes).set({ title: "New title", lockedFields: ["title"] }).where(eq(schema.eventTypes.id, "delete-me"));
    await teams.propagateManaged("delete-me");
    expect((await booking.loadEvent("sam", "delete-me"))?.eventType.title).toBe("New title");
    expect((await booking.getBooking(first.uid))?.eventType.title).toBe("Original meeting");
  });
  it("can reuse a deleted link without changing the old meeting or redirecting its reschedule", async () => {
    const first = await book(); await del();
    await db.insert(schema.eventTypes).values({ id: "replacement", userId: "demo-user", slug: "delete-me", title: "Replacement", minNoticeMin: 0 });
    expect((await booking.loadEvent("demo", "delete-me"))?.eventType.id).toBe("replacement");
    expect((await booking.getBooking(first.uid))?.eventType.title).toBe("Original meeting");
    await expect(booking.createBooking({ username: "demo", slug: "delete-me", start: at("13:00"), name: "Test", email: "test@example.invalid", tz,
      rescheduleUid: first.uid })).rejects.toThrow("not_found");
    expect((await booking.getBooking(first.uid))?.booking.status).toBe("confirmed");
    const Page = (await import("../../app/booking/[uid]/reschedule/page")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    expect(renderToStaticMarkup(await Page({ params: Promise.resolve({ uid: first.uid }) })))
      .toContain("This event type is no longer available");
  });
  it("rejects an assignment whose template was deleted before its transaction starts", async () => {
    await db.update(schema.eventTypes).set({ kind: "managed", teamId: "delete-team" }).where(eq(schema.eventTypes.id, "delete-me"));
    const transact = db.transaction.bind(db);
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    let first = true;
    const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: unknown[]) => {
      if (first) { first = false; entered(); await gate; }
      return transact(...args);
    });
    const outcome = Promise.allSettled([teams.assignManaged("delete-me", ["demo-mate"], "delete-team")]);
    await ready;
    try { expect((await del()).status).toBe(200); } finally { release(); }
    expect((await outcome)[0].status).toBe("rejected");
    spy.mockRestore();
    expect(await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.managedParentId, "delete-me"))).toHaveLength(0);
  });
  it("rejects a reservation whose type was deleted after the availability preflight", async () => {
    const transact = db.transaction.bind(db);
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    let first = true;
    const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: unknown[]) => {
      if (first) { first = false; entered(); await gate; }
      return transact(...args);
    });
    const outcome = Promise.allSettled([book()]);
    await ready;
    try { expect((await del()).status).toBe(200); } finally { release(); }
    expect((await outcome)[0].status).toBe("rejected");
    spy.mockRestore(); expect(await db.select().from(schema.bookings)).toHaveLength(0);
  });
});
