import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";

const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
vi.mock("@/auth", () => ({ requireUser: auth }));
vi.mock("../../lib/calendars", () => ({ externalBusy: async () => ({ busy: [], errors: [] }), writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: async () => {} }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), booking: typeof import("../../lib/booking");
let patch: typeof import("../../app/api/event-types/[id]/route").PATCH;
const tz = "America/New_York", day = DateTime.now().setZone(tz).plus({ days: 7 }).startOf("day");
const at = (hour: number) => day.plus({ hours: hour }).toUTC().toISO()!;
const edit = (id: string, body: unknown) => patch(new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const owner = (id: string) => ["rr", "collective"].includes(id) ? "team:secret-team" : "demo";
const book = (id: string, hour = 9, rescheduleUid?: string) => booking.createBooking({ username: owner(id), slug: id, start: at(hour), name: "Test invitee", email: "invitee@example.invalid", tz, rescheduleUid });
const personalPage = async (user = "demo") => renderToStaticMarkup(await (await import("../../app/[user]/page")).default({ params: Promise.resolve({ user }) }));
const teamPage = async () => renderToStaticMarkup(await (await import("../../app/team/[team]/page")).default({ params: Promise.resolve({ team: "secret-team" }) }));

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-secret-events-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  booking = await import("../../lib/booking"); patch = (await import("../../app/api/event-types/[id]/route")).PATCH;
  await db.update(schema.schedules).set({ timezone: tz, weekly: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(d => [d, [{ start: "09:00", end: "17:00" }]])) });
  await db.insert(schema.teams).values({ id: "secret-team", slug: "secret-team", name: "Visibility team" });
  await db.insert(schema.teamMembers).values([{ teamId: "secret-team", userId: "demo-user", role: "owner" }, { teamId: "secret-team", userId: "demo-mate", role: "member" }]);
});
beforeEach(async () => {
  await db.delete(schema.bookings); await db.delete(schema.eventTypeHosts); await db.delete(schema.eventTypes); auth.mockResolvedValue({ id: "demo-user" });
  await db.update(schema.teamMembers).set({ role: "member" }).where(eq(schema.teamMembers.userId, "demo-mate"));
  for (const [id, kind] of [["personal", "one_on_one"], ["group", "group"], ["rr", "round_robin"], ["collective", "collective"]]) {
    const team = ["rr", "collective"].includes(id);
    await db.insert(schema.eventTypes).values({ id, slug: id, userId: "demo-user", title: `${id} event`, kind, minNoticeMin: 0, seats: kind === "group" ? 3 : 1, teamId: team ? "secret-team" : null });
    if (team) await db.insert(schema.eventTypeHosts).values(["demo-user", "demo-mate"].map(userId => ({ eventTypeId: id, userId })));
  }
});
afterEach(() => vi.restoreAllMocks());

describe("secret event visibility", () => {
  it("hides a personal event's title and link from its index without turning it off", async () => {
    expect(await personalPage()).toContain("personal event");
    const response = await edit("personal", { secret: true }); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ secret: true, active: true });
    const html = await personalPage(); expect(html).not.toContain("personal event"); expect(html).not.toContain("/demo/personal"); expect(html).toContain("group event");
    expect(await booking.loadEvent("demo", "personal")).not.toBeNull();
  });
  it("hides a team event from its index and preserves its direct link", async () => {
    await edit("rr", { secret: true }); const html = await teamPage();
    expect(html).not.toContain("rr event"); expect(html).not.toContain("/secret-team/rr"); expect(html).toContain("collective event");
    expect(await booking.loadEvent("team:secret-team", "rr")).not.toBeNull();
  });
  it("restores public visibility and keeps on/off status independent", async () => {
    await edit("personal", { secret: true }); await edit("personal", { active: false });
    expect(await booking.loadEvent("demo", "personal")).toBeNull();
    expect(await (await edit("personal", { active: true })).json()).toMatchObject({ secret: true, active: true });
    expect(await personalPage()).not.toContain("personal event"); await edit("personal", { active: false });
    expect(await (await edit("personal", { secret: false })).json()).toMatchObject({ secret: false, active: false });
    expect(await personalPage()).not.toContain("personal event"); expect(await booking.loadEvent("demo", "personal")).toBeNull();
    await edit("personal", { active: true }); expect(await personalPage()).toContain("personal event");
  });
  it.each(["personal", "group", "rr", "collective"])("keeps %s availability, booking, rescheduling and cancellation usable while hidden", async id => {
    const first = await book(id); await edit(id, { secret: true });
    const direct = await book(id, 12); expect(direct.uid).toBeTruthy();
    const result = await booking.availability(owner(id), id, day.toISODate()!, day.toISODate()!, tz); expect(result?.slots[day.toISODate()!]).toContain(at(11));
    const moved = await book(id, 11, first.uid); expect(moved.rescheduledFrom).toBe(first.uid);
    expect(await booking.cancelBooking(moved.uid, "QA cleanup")).toBeTruthy();
    expect(await booking.cancelBooking(direct.uid, "QA cleanup")).toBeTruthy();
    expect((await db.select().from(schema.bookings)).every(row => row.status === "cancelled")).toBe(true);
  });
  it.each([null, "true", 1, {}, []])("rejects non-boolean visibility %j without partial saving", async secret => {
    expect((await edit("personal", { secret, title: "Must not save" })).status).toBe(400);
    expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "personal")))[0]).toMatchObject({ secret: false, title: "personal event" });
  });
  it("requires authentication, ownership or team admin permission", async () => {
    auth.mockResolvedValue(null); expect((await edit("personal", { secret: true })).status).toBe(401);
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await edit("personal", { secret: true })).status).toBe(404); expect((await edit("rr", { secret: true })).status).toBe(404);
    await db.update(schema.teamMembers).set({ role: "admin" }).where(eq(schema.teamMembers.userId, "demo-mate")); expect((await edit("rr", { secret: true })).status).toBe(200);
  });
  it("reports persistence failure without exposing a hidden event", async () => {
    await edit("personal", { secret: true }); const spy = vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("database unavailable"));
    expect((await edit("personal", { secret: false })).status).toBe(500); spy.mockRestore(); expect(await personalPage()).not.toContain("personal event");
  });
  it("does not expose secret events when other settings change or when duplicated", async () => {
    await edit("personal", { secret: true }); await edit("personal", { durationMin: 45 });
    const duplicate = (await import("../../app/api/event-types/[id]/duplicate/route")).POST;
    const response = await duplicate(new NextRequest("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "personal" }) });
    expect(response.status).toBe(201); const copy = await response.json(); expect(copy).toMatchObject({ secret: true, active: true, durationMin: 45 });
    expect(await personalPage()).not.toContain("personal event"); await edit(copy.id, { secret: false });
    const html = await personalPage(); expect(html).toContain("personal event (copy)"); expect(html).not.toContain('href="/demo/personal"');
  });
  it("allows an assigned host to hide their managed copy without propagating visibility through the template", async () => {
    await db.insert(schema.eventTypes).values({ id: "template", userId: "demo-user", teamId: "secret-team", slug: "template", title: "Assigned event", kind: "managed", lockedFields: ["durationMin"] });
    const { assignManaged } = await import("../../lib/teams"); await assignManaged("template", ["demo-mate"], "secret-team");
    const [copy] = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.managedParentId, "template"));
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await edit(copy.id, { secret: true })).status).toBe(200);
    auth.mockResolvedValue({ id: "demo-user" }); expect((await edit("template", { durationMin: 45 })).status).toBe(200);
    expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, copy.id)))[0]).toMatchObject({ secret: true, durationMin: 45 });
    expect((await edit("template", { secret: true, title: "Must not save" })).status).toBe(400);
    expect((await edit("template", { lockedFields: ["secret"] })).status).toBe(400);
  });
  it("does not revive deleted events through visibility changes", async () => {
    const { DELETE } = await import("../../app/api/event-types/[id]/route");
    await DELETE(new NextRequest("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: "personal" }) });
    expect((await edit("personal", { secret: false })).status).toBe(404); expect(await personalPage()).not.toContain("personal event");
  });
  it("keeps hidden events in authenticated host data", async () => {
    await edit("personal", { secret: true });
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, "demo-user")); auth.mockResolvedValue(user);
    const page = await (await import("../../app/app/page")).default();
    expect(renderToStaticMarkup(page)).toContain("personal event");
  });
});
