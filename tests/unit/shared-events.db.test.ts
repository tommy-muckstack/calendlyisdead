import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { initialEventFields, type EventCreation } from "../../lib/event-creation-validation";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
const provider = vi.hoisted(() => ({ busy: vi.fn<(id: string) => Promise<{ busy: { start: string; end: string }[]; errors: string[] }>>(async () => ({ busy: [], errors: [] })) }));
vi.mock("@/auth", () => ({ requireUser: auth }));
vi.mock("../../lib/calendars", () => ({ externalBusy: provider.busy, writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: async () => ({ sent: false }) }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, S: typeof import("../../lib/db/schema"), shared: typeof import("../../lib/shared-events"), booking: typeof import("../../lib/booking");
let create: typeof import("../../app/api/event-types/route").POST, editRoute: typeof import("../../app/api/event-types/[id]/route");
const tz = "America/New_York", day = DateTime.now().setZone(tz).plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!;
const validTime = (iso: string) => { const value = DateTime.fromISO(iso); if (!value.isValid) throw new Error("Invalid test instant"); return value; };
const at = (hour: number, minute = 0) => DateTime.fromISO(`${day}T00:00`, { zone: tz }).set({ hour, minute }).toUTC().toISO()!;
const weekly = Object.fromEntries([1,2,3,4,5,6,7].map(day => [day, [{ start: "09:00", end: "17:00" }]]));
const draft = (kind: "round_robin" | "collective" = "collective"): EventCreation => ({ draftId: crypto.randomUUID(), autoSlug: true,
  settings: { ...initialEventFields(kind, null), title: "Shared interview", slug: "shared", minNoticeMin: 0 },
  shared: { workspaceId: "workspace", hosts: [{ membershipId: "owner-membership", scheduleId: null, priority: 3 }, { membershipId: "sam-membership", scheduleId: null, priority: 2 }], distribution: "availability", reschedule: "reassign" } });
const post = (body: unknown) => create(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }));
const edit = (id: string, body: unknown) => editRoute.PATCH(new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const publish = async (input = draft()) => { const response = await post(input); expect(response.status).toBe(201); return (await response.json()).event as Awaited<ReturnType<typeof shared.sharedEventDto>>; };
const book = (hour = 11, extra = {}) => booking.createBooking({ username: "demo", slug: "shared", start: at(hour), name: "Test invitee", email: "invitee@example.invalid", tz, ...extra });
const slots = () => booking.availability("demo", "shared", day, day, tz);
const confirmed = () => db.select().from(S.bookings).where(eq(S.bookings.status, "confirmed"));
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-shared-events-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); S = database.schema;
  shared = await import("../../lib/shared-events"); booking = await import("../../lib/booking"); create = (await import("../../app/api/event-types/route")).POST; editRoute = await import("../../app/api/event-types/[id]/route");
  await db.insert(S.users).values({ id: "outsider", email: "outside@example.invalid", username: "outside", name: "Outside" });
});
beforeEach(async () => {
  await db.delete(S.bookings); await db.delete(S.eventTypeHosts); await db.delete(S.eventTypes); await db.delete(S.eventTypeCreations); await db.delete(S.workspaces);
  await db.insert(S.workspaces).values({ id: "workspace", name: "Shared workspace" });
  await db.insert(S.workspaceMembers).values([{ id: "owner-membership", workspaceId: "workspace", userId: "demo-user", role: "owner" }, { id: "sam-membership", workspaceId: "workspace", userId: "demo-mate", role: "user" }]);
  await db.update(S.schedules).set({ timezone: tz, weekly, overrides: {}, holidayCountry: null, isDefault: true });
  await db.update(S.users).set({ meetingLimitPerDay: null, meetingLimitPerWeek: null, meetingLimitPerMonth: null });
  provider.busy.mockImplementation(async () => ({ busy: [], errors: [] })); auth.mockResolvedValue({ id: "demo-user" });
});
afterEach(() => vi.restoreAllMocks());
describe("shared event creation and access", () => {
  it.each(["collective", "round_robin"] as const)("creates %s atomically with accepted hosts and a stable retry", async kind => {
    const input = draft(kind), event = await publish(input); expect(event).toMatchObject({ sharedWorkspaceId: "workspace", secret: true, teamId: null, bookingUsername: "demo", canEdit: true, canDelete: true });
    expect(await db.select().from(S.eventTypeHosts)).toHaveLength(2); expect((await post(input)).status).toBe(200); expect(await db.select().from(S.eventTypes)).toHaveLength(1);
    expect((await shared.listSharedEvents("demo-mate"))[0]).toMatchObject({ id: event.id, bookingUsername: "demo", canEdit: true, canDelete: false }); expect(await shared.listSharedEvents("outsider")).toEqual([]);
  });
  it("rolls back receipt, event and hosts together after a host write fails", async () => {
    const input = draft(); await db.$client.exec(`CREATE FUNCTION reject_shared_host() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test host failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_shared_host BEFORE INSERT ON event_type_hosts FOR EACH ROW EXECUTE FUNCTION reject_shared_host();`);
    try { expect((await post(input)).status).toBe(500); expect(await db.select().from(S.eventTypes)).toEqual([]); expect(await db.select().from(S.eventTypeCreations)).toEqual([]); }
    finally { await db.$client.exec('DROP TRIGGER reject_shared_host ON event_type_hosts; DROP FUNCTION reject_shared_host();'); }
    expect((await post(input)).status).toBe(201);
  });
  it("concurrent unchanged creation retries publish one shared event", async () => {
    const input = draft(); const responses = await Promise.all([post(input), post(input)]); expect(responses.map(r => r.status).sort()).toEqual([200,201]); expect(await db.select().from(S.eventTypes)).toHaveLength(1); expect(await db.select().from(S.eventTypeHosts)).toHaveLength(2);
  });
  it("workspace admins can manage without gaining private host automations", async () => {
    const input = draft(); input.shared!.hosts = input.shared!.hosts.slice(0,1); const event = await publish(input); await db.update(S.workspaceMembers).set({ role: "admin" }).where(eq(S.workspaceMembers.id, "sam-membership"));
    expect((await shared.listSharedEvents("demo-mate"))[0]).toMatchObject({ canEdit: true, canDelete: true, isHost: false }); const { contactAutomationEvent } = await import("../../lib/contact-automation-store"); await expect(contactAutomationEvent(db, "demo-mate", event.id)).rejects.toThrow();
    await db.update(S.workspaceMembers).set({ role: "user" }).where(eq(S.workspaceMembers.id, "sam-membership")); expect(await shared.listSharedEvents("demo-mate")).toEqual([]);
  });
  it("limits the host directory to accepted members and exposes schedule metadata only", async () => {
    const directory = await shared.sharedHostDirectory("demo-user"); expect(directory?.members).toHaveLength(2); expect(directory?.members.find(m => m.isMe)?.schedules[0]).toEqual({ id: "demo-schedule", name: "Working hours", timezone: tz, isDefault: true }); expect(JSON.stringify(directory)).not.toContain("weekly"); expect(await shared.sharedHostDirectory("outsider")).toBeNull();
  });
  it("rejects arbitrary users, old memberships, duplicate hosts and foreign schedules", async () => {
    for (const fields of [{ membershipId: "outsider" }, { membershipId: "old-sam-membership" }, { scheduleId: "sam-schedule" }]) { const input = draft(); Object.assign(input.shared!.hosts[0], fields); expect((await post(input)).status).toBe(fields.scheduleId ? 400 : 409); }
    const input = draft(); input.shared!.hosts.push(input.shared!.hosts[0]); expect((await post(input)).status).toBe(400); expect(await db.select().from(S.eventTypes)).toEqual([]); expect(await db.select().from(S.eventTypeCreations)).toEqual([]);
  });
  it("rejects a workspace outsider and a shared payload on a personal kind", async () => {
    auth.mockResolvedValue({ id: "outsider" }); expect((await post(draft())).status).toBe(409); auth.mockResolvedValue({ id: "demo-user" }); const input = draft(); input.settings.kind = "one_on_one"; expect((await post(input)).status).toBe(400);
  });
  it("never lists shared events on a public profile, even with legacy visibility false", async () => {
    const event = await publish(); await db.update(S.eventTypes).set({ secret: false }).where(eq(S.eventTypes.id, event.id));
    const html = renderToStaticMarkup(await (await import("../../app/[user]/page")).default({ params: Promise.resolve({ user: "demo" }) })); expect(html).not.toContain("Shared interview"); expect(await booking.loadEvent("demo", "shared")).not.toBeNull();
    expect((await edit(event.id, { sharedVersion: 1, secret: false })).status).toBe(400);
  });
  it("allows a cohost to edit with a version and rejects stale edits or kind changes", async () => {
    const event = await publish(); auth.mockResolvedValue({ id: "demo-mate" }); expect((await edit(event.id, { title: "No version" })).status).toBe(409);
    expect((await edit(event.id, { sharedVersion: 1, title: "Cohost edit" })).status).toBe(200); expect((await edit(event.id, { sharedVersion: 1, title: "Stale edit" })).status).toBe(409);
    expect((await edit(event.id, { sharedVersion: 2, kind: "group" })).status).toBe(409); expect((await shared.listSharedEvents("demo-user"))[0].title).toBe("Cohost edit");
  });
  it("removing yourself loses access while existing reservations remain", async () => {
    const event = await publish(), meeting = await book(); auth.mockResolvedValue({ id: "demo-mate" });
    const response = await edit(event.id, { sharedVersion: 1, shared: { ...event.shared, hosts: event.shared.hosts.filter(h => h.membershipId !== "sam-membership") } }); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ canEdit: false, isHost: false });
    expect(await shared.listSharedEvents("demo-mate")).toEqual([]); expect((await edit(event.id, { sharedVersion: 2, title: "No access" })).status).toBe(404); expect((await confirmed()).map(row => row.uid)).toContain(meeting.uid);
    const { contactAutomationEvent } = await import("../../lib/contact-automation-store"); await expect(contactAutomationEvent(db, "demo-mate", event.id)).rejects.toThrow();
  });
  it("removal and rejoining cannot restore old host rights or silently remove a required host", async () => {
    const event = await publish(); await db.delete(S.workspaceMembers).where(eq(S.workspaceMembers.id, "sam-membership")); await db.insert(S.workspaceMembers).values({ id: "sam-rejoined", workspaceId: "workspace", userId: "demo-mate", role: "user" });
    expect(await shared.listSharedEvents("demo-mate")).toEqual([]); expect(await slots()).toBeNull();
    const updated = { ...event.shared, hosts: event.shared.hosts.map(h => h.membershipId === "sam-membership" ? { ...h, membershipId: "sam-rejoined" } : h) };
    expect((await edit(event.id, { sharedVersion: 1, shared: updated })).status).toBe(200); expect(await slots()).not.toBeNull();
  });
  it("workspace deletion preserves scope and prevents new bookings", async () => {
    const event = await publish(); await db.delete(S.workspaces).where(eq(S.workspaces.id, "workspace")); expect(await slots()).toBeNull(); expect((await db.select().from(S.eventTypes))[0].sharedWorkspaceId).toBe("workspace"); expect((await edit(event.id, { sharedVersion: 1, title: "No workspace" })).status).toBe(404);
  });
  it("cohosts can duplicate hosts and settings using their own direct link", async () => {
    const event = await publish(); auth.mockResolvedValue({ id: "demo-mate" }); const response = await (await import("../../app/api/event-types/[id]/duplicate/route")).POST(new NextRequest("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: event.id }) }); expect(response.status).toBe(201); const copy = await response.json(); expect(copy).toMatchObject({ userId: "demo-mate", bookingUsername: "sam", sharedWorkspaceId: "workspace", secret: true }); expect(copy.shared.hosts).toHaveLength(2); expect(await booking.loadEvent("sam", copy.slug)).not.toBeNull();
  });
  it("only the creator or workspace administrator can delete, retaining meetings", async () => {
    const event = await publish(); await book(); auth.mockResolvedValue({ id: "demo-mate" }); const remove = () => editRoute.DELETE(new NextRequest("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: event.id }) }); expect((await remove()).status).toBe(403); auth.mockResolvedValue({ id: "demo-user" }); expect((await remove()).status).toBe(200); expect(await confirmed()).toHaveLength(2); expect(await slots()).toBeNull();
  });
  it("never grants a non-host creator private contact automation access", async () => {
    const input = draft(); input.shared!.hosts = input.shared!.hosts.slice(1); const event = await publish(input); expect(event.isHost).toBe(false); const { contactAutomationEvent } = await import("../../lib/contact-automation-store"); await expect(contactAutomationEvent(db, "demo-user", event.id)).rejects.toThrow(); await expect(contactAutomationEvent(db, "demo-mate", event.id)).resolves.toMatchObject({ id: event.id });
  });
});
describe("shared rescheduling links", () => {
  const redirectPage = async (uid: string) => (await import("../../app/booking/[uid]/reschedule/page")).default({ params: Promise.resolve({ uid }) });
  it.each(["collective", "round_robin"] as const)("uses the creator's scheduling URL for a %s meeting hosted by a cohost", async kind => {
    const input = draft(kind); if (kind === "round_robin") input.shared!.hosts = input.shared!.hosts.slice(1);
    await publish(input); const meeting = await book(); expect(meeting.hostId).toBe("demo-mate");
    await expect(redirectPage(meeting.uid)).rejects.toMatchObject({ digest: expect.stringContaining(`/demo/shared?reschedule=${meeting.uid}&tz=America%2FNew_York`) });
  });
  it("uses the creator's latest username and event slug while retaining the actual host", async () => {
    const input = draft("round_robin"); input.shared!.hosts = input.shared!.hosts.slice(1); const event = await publish(input); const meeting = await book();
    await db.update(S.eventTypes).set({ slug: "updated-shared-link" }).where(eq(S.eventTypes.id, event.id));
    await db.update(S.users).set({ username: "new-creator-link" }).where(eq(S.users.id, "demo-user"));
    try { expect((await booking.getBooking(meeting.uid))?.user.id).toBe("demo-mate"); await expect(redirectPage(meeting.uid)).rejects.toMatchObject({ digest: expect.stringContaining(`/new-creator-link/updated-shared-link?reschedule=${meeting.uid}`) }); }
    finally { await db.update(S.users).set({ username: "demo" }).where(eq(S.users.id, "demo-user")); }
  });
  it.each([false, true])("retains the existing personal/team redirect when team=%s", async team => {
    if (team) await db.insert(S.teams).values({ id: "redirect-team", slug: "redirect-team", name: "Redirect team" }).onConflictDoNothing();
    await db.insert(S.eventTypes).values({ id: "redirect-event", userId: "demo-user", title: "Redirect", slug: "redirect-event", kind: team ? "collective" : "one_on_one", teamId: team ? "redirect-team" : null, minNoticeMin: 0 });
    if (team) await db.insert(S.eventTypeHosts).values({ eventTypeId: "redirect-event", userId: "demo-mate", priority: 2 });
    const meeting = await book(11, { username: team ? "team:redirect-team" : "demo", slug: "redirect-event" });
    await expect(redirectPage(meeting.uid)).rejects.toMatchObject({ digest: expect.stringContaining(`${team ? "/team/redirect-team" : "/demo"}/redirect-event?reschedule=${meeting.uid}`) });
  });
  it("does not prefill a booking on an unrelated event or team scheduling page", async () => {
    await publish(); const meeting = await book();
    await db.insert(S.eventTypes).values({ id: "another-event", userId: "demo-user", title: "Unrelated event", slug: "another-event", minNoticeMin: 0 });
    const page = await (await import("../../app/[user]/[slug]/page")).default({ params: Promise.resolve({ user: "demo", slug: "another-event" }), searchParams: Promise.resolve({ reschedule: meeting.uid }) });
    expect(page.props.children.props.reschedule).toBeUndefined();
    await db.insert(S.teams).values({ id: "redirect-team", slug: "redirect-team", name: "Redirect team" }).onConflictDoNothing();
    await db.update(S.eventTypes).set({ teamId: "redirect-team", kind: "collective" }).where(eq(S.eventTypes.id, "another-event"));
    await db.insert(S.eventTypeHosts).values({ eventTypeId: "another-event", userId: "demo-user", priority: 2 });
    const teamPage = await (await import("../../app/team/[team]/[slug]/page")).default({ params: Promise.resolve({ team: "redirect-team", slug: "another-event" }), searchParams: Promise.resolve({ reschedule: meeting.uid }) });
    expect(teamPage.props.children.props.reschedule).toBeUndefined();
  });
});
describe("shared reservations", () => {
  it("intersects all collective schedules, writes all hosts and cancels the whole meeting", async () => {
    await publish(); await db.update(S.schedules).set({ timezone: "America/Chicago" }).where(eq(S.schedules.id, "sam-schedule"));
    const result = await slots(); expect(result?.slots[day]).not.toContain(at(9)); expect(result?.slots[day]).toContain(at(10));
    const meeting = await book(11); expect((await confirmed()).map(row => row.hostId).sort()).toEqual(["demo-mate", "demo-user"]); await booking.cancelBooking(meeting.uid, "QA"); expect(await confirmed()).toEqual([]);
  });
  it("selects the highest-priority available host and supports two simultaneous round-robin meetings", async () => {
    await publish(draft("round_robin")); expect((await book()).hostId).toBe("demo-user"); expect((await book()).hostId).toBe("demo-mate"); await expect(book()).rejects.toThrow("slot_unavailable");
  });
  it("does not silently drop a host whose explicit schedule disappeared", async () => {
    const input = draft(); input.shared!.hosts[1].scheduleId = "sam-schedule"; await publish(input); await db.delete(S.schedules).where(eq(S.schedules.id, "sam-schedule")); expect(await slots()).toBeNull(); await db.insert(S.schedules).values({ id: "sam-schedule", userId: "demo-mate", timezone: tz, weekly });
  });
  it("honors account caps, buffers and external busy time for each host", async () => {
    const input = draft(); input.settings.bufferAfterMin = 30; await publish(input); await book(11); expect((await slots())?.slots[day]).not.toContain(at(11, 30)); expect((await slots())?.slots[day]).toContain(at(12));
    provider.busy.mockImplementation(async id => ({ busy: id === "demo-mate" ? [{ start: at(13), end: at(14) }] : [], errors: [] })); expect((await slots())?.slots[day]).not.toContain(at(13));
    await db.update(S.users).set({ meetingLimitPerDay: 1 }).where(eq(S.users.id, "demo-mate")); expect((await slots())?.slots[day] ?? []).toEqual([]);
  });
  it("equal distribution hides a host three meetings ahead, then resets when the pool changes", async () => {
    const input = draft("round_robin"); input.shared!.distribution = "equal"; const event = await publish(input);
    await db.insert(S.bookings).values([9,10,11].map(hour => ({ uid: `ahead-${hour}`, eventTypeId: event.id, hostId: "demo-user", start: new Date(at(hour)), end: new Date(at(hour,30)), inviteeName: "QA", inviteeEmail: "qa@example.invalid", inviteeTz: tz })));
    provider.busy.mockImplementation(async id => ({ busy: id === "demo-mate" ? [{ start: at(9), end: at(17) }] : [], errors: [] })); expect((await slots())?.slots[day] ?? []).toEqual([]);
    const response = await edit(event.id, { sharedVersion: 1, shared: { ...event.shared, hosts: event.shared.hosts.filter(h => h.membershipId === "owner-membership") } }); expect(response.status).toBe(200); expect((await slots())?.slots[day]).toContain(at(12));
  });
  it("keeps the original host on rescheduling when requested, or reassigns by preference", async () => {
    const input = draft("round_robin"); input.shared!.reschedule = "same"; const event = await publish(input); const first = await book(11);
    provider.busy.mockImplementation(async id => ({ busy: id === "demo-user" ? [{ start: at(13), end: at(14) }] : [], errors: [] })); await expect(book(13, { rescheduleUid: first.uid })).rejects.toThrow("slot_unavailable");
    const response = await edit(event.id, { sharedVersion: 1, shared: { ...event.shared, reschedule: "reassign" } }); expect(response.status).toBe(200); const moved = await book(13, { rescheduleUid: first.uid }); expect(moved.hostId).toBe("demo-mate"); expect(moved.rescheduledFrom).toBe(first.uid);
  });
  it("rejects a host or schedule change after availability preflight", async () => {
    const event = await publish(); let changed = false;
    provider.busy.mockImplementation(async () => { if (!changed) { changed = true; await db.update(S.eventTypes).set({ sharedVersion: 2 }).where(eq(S.eventTypes.id, event.id)); } return { busy: [], errors: [] }; });
    await expect(book()).rejects.toThrow("slot_unavailable"); expect(await confirmed()).toEqual([]);
    provider.busy.mockImplementation(async () => { if (changed) { changed = false; await db.update(S.schedules).set({ weekly: {} }).where(eq(S.schedules.id, "sam-schedule")); } return { busy: [], errors: [] }; });
    await expect(book()).rejects.toThrow("slot_unavailable"); expect(await confirmed()).toEqual([]);
  });
  it("rejects membership removal after preflight", async () => {
    await publish(); let removed = false; provider.busy.mockImplementation(async () => { if (!removed) { removed = true; await db.delete(S.workspaceMembers).where(eq(S.workspaceMembers.id, "sam-membership")); } return { busy: [], errors: [] }; }); await expect(book()).rejects.toThrow("slot_unavailable"); expect(await confirmed()).toEqual([]);
  });
  it.each([["2027-03-14", "02:00", "04:00", "01:00", "03:00", ["07:00", "07:30"]], ["2026-11-01", "01:00", "03:00", "01:00", "03:00", ["06:00", "06:30", "07:00", "07:30"]]] as const)("intersects DST transitions on %s using real instants", async (date, start, end, otherStart, otherEnd, expected) => {
    const input = draft(); input.settings.dateRange = { kind: "indefinite" }; await publish(input);
    await db.update(S.schedules).set({ timezone: tz, weekly: { "7": [{ start, end }] } }).where(eq(S.schedules.id, "demo-schedule"));
    await db.update(S.schedules).set({ timezone: "America/Chicago", weekly: { "7": [{ start: otherStart, end: otherEnd }] } }).where(eq(S.schedules.id, "sam-schedule"));
    const result = await booking.availability("demo", "shared", date, date, "UTC", validTime(`${date}T00:00Z`).minus({ days: 1 }));
    expect(result?.slots[date]).toEqual(expected.map(time => `${date}T${time}:00.000Z`));
  });
  it("rechecks minimum notice and serializes a shared event daily cap", async () => {
    const input = draft(); input.settings.minNoticeMin = 240; await publish(input);
    const result = await booking.availability("demo", "shared", day, day, tz, validTime(at(10)));
    expect(result?.slots[day]).not.toContain(at(13)); expect(result?.slots[day]).toContain(at(14));
  });
  it("limits the event across hosts and rejects conflicting concurrent collective bookings", async () => {
    const input = draft(); input.settings.maxPerDay = 1; await publish(input);
    const results = await Promise.allSettled([book(11), book(12)]); expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(await confirmed()).toHaveLength(2);
  });
});
