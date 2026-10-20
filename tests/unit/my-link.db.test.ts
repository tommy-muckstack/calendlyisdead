import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
vi.mock("@/auth", () => ({ requireUser: auth }));
vi.mock("../../lib/calendars", () => ({ externalBusy: async () => ({ busy: [], errors: [] }), writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: async () => ({ sent: false }) }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, S: typeof import("../../lib/db/schema"), api: typeof import("../../app/api/settings/my-link/route"), booking: typeof import("../../lib/booking");
const patch = (raw: unknown, headers = {}) => api.PATCH(new NextRequest("http://localhost/api/settings/my-link?userId=demo-mate", { method: "PATCH", headers, body: JSON.stringify(raw) }));
const edit = (username: string, expectedUsername: string | null = "demo") => patch({ username, expectedUsername });
const read = async () => (await api.GET()).json();
const user = async (id = "demo-user") => (await db.select().from(S.users).where(eq(S.users.id, id)))[0];
const day = DateTime.utc().plus({ weeks: 1 }).startOf("day");
const book = (extra = {}) => booking.createBooking({ username: "demo", slug: "30min", start: day.plus({ hours: 12 }).toISO()!, name: "Test invitee", email: "invitee@example.invalid", tz: "UTC", ...extra });
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-my-link-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); S = database.schema;
  api = await import("../../app/api/settings/my-link/route"); booking = await import("../../lib/booking");
  await db.update(S.schedules).set({ timezone: "UTC", weekly: Object.fromEntries([1,2,3,4,5,6,7].map(d => [d, [{ start: "00:00", end: "24:00" }]])) });
  await db.update(S.eventTypes).set({ minNoticeMin: 0, rangeDays: 730, bufferAfterMin: 0, location: "In person" });
});
beforeEach(async () => {
  auth.mockResolvedValue({ id: "demo-user" }); await db.delete(S.bookings);
  await db.update(S.users).set({ username: "demo" }).where(eq(S.users.id, "demo-user"));
  await db.update(S.users).set({ username: "sam" }).where(eq(S.users.id, "demo-mate"));
});
afterEach(() => vi.restoreAllMocks());
describe("My link persistence and URL identity", () => {
  it("changes only the caller's username and returns a private projection", async () => {
    const before = await user(), other = await user("demo-mate"), events = await db.select().from(S.eventTypes);
    const response = await edit("new-host"); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ username: "new-host" }); expect(await read()).toEqual({ username: "new-host" });
    expect(await user()).toEqual({ ...before, username: "new-host" }); expect(await user("demo-mate")).toEqual(other); expect(await db.select().from(S.eventTypes)).toEqual(events);
  });
  it("closes old profile/event URLs, opens the new ones and can restore a still-available name", async () => {
    const HostPage = (await import("../../app/[user]/page")).default;
    expect((await booking.loadEvent("demo", "30min"))?.eventType.id).toBe("demo-30"); await edit("new-host");
    expect(await booking.loadEvent("demo", "30min")).toBeNull(); await expect(HostPage({ params: Promise.resolve({ user: "demo" }) })).rejects.toThrow();
    expect((await booking.loadEvent("new-host", "30min"))?.eventType.id).toBe("demo-30");
    expect(renderToStaticMarkup(await HostPage({ params: Promise.resolve({ user: "new-host" }) }))).toContain('/new-host/30min');
    expect((await edit("demo", "new-host")).status).toBe(200); expect(await booking.loadEvent("new-host", "30min")).toBeNull(); expect(await booking.loadEvent("demo", "30min")).not.toBeNull();
  });
  it("preserves an existing meeting and routes its reschedule token through the current name", async () => {
    const meeting = await book(); const before = await booking.getBooking(meeting.uid); await edit("new-host");
    expect((await booking.getBooking(meeting.uid))?.booking).toEqual(before?.booking);
    const Reschedule = (await import("../../app/booking/[uid]/reschedule/page")).default;
    await expect(Reschedule({ params: Promise.resolve({ uid: meeting.uid }) })).rejects.toMatchObject({ digest: expect.stringContaining(`/new-host/30min?reschedule=${meeting.uid}`) });
    const moved = await book({ username: "new-host", rescheduleUid: meeting.uid, start: day.plus({ hours: 14 }).toISO()! });
    expect(moved.hostId).toBe(meeting.hostId); expect((await booking.getBooking(meeting.uid))?.booking.status).toBe("cancelled");
  });
  it("does not let an old URL commit a reservation after a rename during preflight", async () => {
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementationOnce(async (...args: unknown[]) => { expect((await edit("new-host")).status).toBe(200); return transaction(...args); });
    await expect(book()).rejects.toThrow("slot_unavailable"); expect(await db.select().from(S.bookings)).toHaveLength(0);
    expect((await book({ username: "new-host" })).eventTypeId).toBe("demo-30");
  });
  it("keeps shared links and rescheduling on the renamed creator even when only a cohost hosts", async () => {
    await db.insert(S.workspaces).values({ id: "link-workspace", name: "Link workspace" });
    await db.insert(S.workspaceMembers).values([{ id: "link-owner", workspaceId: "link-workspace", userId: "demo-user", role: "owner" }, { id: "link-mate", workspaceId: "link-workspace", userId: "demo-mate", role: "user" }]);
    await db.insert(S.eventTypes).values({ id: "link-shared", userId: "demo-user", sharedWorkspaceId: "link-workspace", slug: "shared", title: "Shared", kind: "round_robin", secret: true, minNoticeMin: 0, location: "In person" });
    await db.insert(S.eventTypeHosts).values({ eventTypeId: "link-shared", userId: "demo-mate", membershipId: "link-mate", priority: 2 });
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementationOnce(async (...args: unknown[]) => { await edit("new-host"); return transaction(...args); });
    await expect(book({ slug: "shared" })).rejects.toThrow("slot_unavailable");
    const { listSharedEvents } = await import("../../lib/shared-events"); expect((await listSharedEvents("demo-mate"))[0].bookingUsername).toBe("new-host");
    const meeting = await book({ username: "new-host", slug: "shared" }); expect(meeting.hostId).toBe("demo-mate");
    const Reschedule = (await import("../../app/booking/[uid]/reschedule/page")).default;
    await expect(Reschedule({ params: Promise.resolve({ uid: meeting.uid }) })).rejects.toMatchObject({ digest: expect.stringContaining(`/new-host/shared?reschedule=${meeting.uid}`) });
  });
  it("keeps team event URLs independent of personal names", async () => {
    await db.insert(S.teams).values({ id: "link-team", slug: "link-team", name: "Link team" });
    await db.insert(S.eventTypes).values({ id: "link-team-event", userId: "demo-user", teamId: "link-team", slug: "interview", title: "Interview", kind: "collective" });
    await db.insert(S.eventTypeHosts).values({ eventTypeId: "link-team-event", userId: "demo-user" });
    await edit("new-host"); expect((await booking.loadEvent("team:link-team", "interview"))?.eventType.id).toBe("link-team-event");
  });
  it("preserves source-based single-use links under the new name", async () => {
    const { createOneOff } = await import("../../lib/oneoff");
    const event = await createOneOff("demo-user", { title: "", durationMin: 30, fromEventTypeId: "demo-30" });
    await edit("new-host"); expect(await booking.loadEvent("demo", event.slug)).toBeNull(); expect((await booking.loadEvent("new-host", event.slug))?.eventType.id).toBe(event.id);
  });
});
describe("My link validation and concurrency", () => {
  it.each(["", " ", "X", "two words", "with_under", "a/b", "a?b", "a#b", "a%2fb", "<script>", "é", "x".repeat(61), "app", "login", "onboarding", "home", "team", "api"])("rejects invalid or reserved names: %s", async username => {
    expect((await edit(username)).status).toBe(400); expect(await read()).toEqual({ username: "demo" });
  });
  it("allows boundary-length names and normalizes surrounding whitespace", async () => {
    expect((await edit(" a ")).status).toBe(200); expect(await read()).toEqual({ username: "a" });
    expect((await edit("z".repeat(60), "a")).status).toBe(200);
  });
  it("allows a legacy account without a username to set one", async () => {
    await db.update(S.users).set({ username: null }).where(eq(S.users.id, "demo-user")); expect((await edit("new-host", null)).status).toBe(200);
  });
  it("requires authentication and does not accept account selectors or other settings", async () => {
    auth.mockResolvedValue(null); expect((await api.GET()).status).toBe(401); expect((await edit("new-host")).status).toBe(401); auth.mockResolvedValue({ id: "demo-user" });
    for (const raw of [null, [], {}, { username: "new-host" }, { username: "new-host", expectedUsername: "demo", userId: "demo-mate" }, { username: "new-host", expectedUsername: "demo", email: "other@example.invalid" }]) expect((await patch(raw)).status).toBe(400);
    expect((await api.PATCH(new NextRequest("http://localhost", { method: "PATCH", body: "{" }))).status).toBe(400);
    expect((await patch({ username: "new-host", expectedUsername: "demo" }, { origin: "https://elsewhere.invalid" })).status).toBe(403);
    expect((await patch({ username: "x".repeat(5000), expectedUsername: "demo" })).status).toBe(413); expect(await read()).toEqual({ username: "demo" });
  });
  it("refuses an occupied name without changing either owner", async () => {
    const response = await edit("sam"); expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: "link_taken" }); expect((await user()).username).toBe("demo"); expect((await user("demo-mate")).username).toBe("sam");
  });
  it("accepts the browser host when Next normalizes its internal request URL", async () => {
    const request = (origin: string) => new NextRequest("http://localhost:3159/api/settings/my-link", { method: "PATCH", headers: { host: "127.0.0.1:3159", origin }, body: JSON.stringify({ username: "new-host", expectedUsername: "demo" }) });
    expect((await api.PATCH(request("http://elsewhere.invalid:3159"))).status).toBe(403);
    expect((await api.PATCH(request("null"))).status).toBe(403);
    expect((await api.PATCH(request("http://127.0.0.1:3159/extra"))).status).toBe(403);
    expect((await api.PATCH(request("http://127.0.0.1:3159"))).status).toBe(200);
  });
  it("rejects stale saves and permits unchanged retries without restoring an older link", async () => {
    expect((await edit("first")).status).toBe(200); expect((await edit("first")).status).toBe(200);
    const stale = await edit("second"); expect(stale.status).toBe(409); expect(await stale.json()).toEqual({ error: "link_changed" });
    expect((await edit("second", "first")).status).toBe(200); expect((await edit("first")).status).toBe(409); expect(await read()).toEqual({ username: "second" });
  });
  it("serializes competing edits of one account", async () => {
    const responses = await Promise.all([edit("first"), edit("second")]); expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const winner = await responses.find(r => r.status === 200)!.json(); expect(await read()).toEqual(winner);
  });
  it("gives a name to exactly one of two competing accounts", async () => {
    auth.mockResolvedValueOnce({ id: "demo-user" }).mockResolvedValueOnce({ id: "demo-mate" });
    const responses = await Promise.all([edit("contested"), edit("contested", "sam")]); expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(await db.select().from(S.users).where(eq(S.users.username, "contested"))).toHaveLength(1);
  });
  it("shares reserved routes and the uniqueness boundary with signup provisioning", async () => {
    const { upsertFirebaseUser } = await import("../../lib/account-provisioning"); await edit("claimed");
    const identity = (email: string) => ({ uid: crypto.randomUUID(), email, emailVerified: true, name: "Test", picture: null, provider: "password" });
    expect(await upsertFirebaseUser(identity("claimed@example.invalid"))).toMatchObject({ username: "claimed-2" });
    expect(await upsertFirebaseUser(identity("home@example.invalid"))).toMatchObject({ username: "home-2" });
    const [renamed, newAccount] = await Promise.all([edit("signup-race", "claimed"), upsertFirebaseUser(identity("signup-race@example.invalid"))]);
    expect([200,409]).toContain(renamed.status); expect(newAccount).not.toHaveProperty("error");
    const rows = await db.select().from(S.users).where(eq(S.users.username, "signup-race")); expect(rows).toHaveLength(1);
  });
  it("reports missing accounts and storage failures with no false success", async () => {
    auth.mockResolvedValue({ id: "missing" }); expect((await api.GET()).status).toBe(404); expect((await edit("new-host")).status).toBe(404); auth.mockResolvedValue({ id: "demo-user" });
    vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("private database details")); const failed = await edit("new-host"); expect(failed.status).toBe(500); expect(await failed.json()).toEqual({ error: "save_failed" }); expect(await read()).toEqual({ username: "demo" });
    vi.spyOn(db, "select").mockImplementationOnce(() => { throw new Error("read failure"); }); expect((await api.GET()).status).toBe(500);
  });
});
