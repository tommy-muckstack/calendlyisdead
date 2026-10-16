import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import * as S from "../../lib/db/schema";
import { initialEventFields } from "../../lib/event-creation-validation";
import { publicLocations, type LocationOption } from "../../lib/event-locations";

const harness = vi.hoisted(() => ({ db: undefined as Awaited<ReturnType<typeof import("../../lib/db").getDb>>, userId: "host" }));
const effects = vi.hoisted(() => ({ busy: vi.fn(async () => ({ busy: [], errors: [] })), mail: vi.fn<typeof import("../../lib/email").sendMail>(async () => false),
  write: vi.fn<typeof import("../../lib/calendars").writeEvent>(async () => null), meeting: vi.fn<typeof import("../../lib/conferencing").meetingUrlFor>(async () => null), sms: vi.fn(async () => {}) }));
vi.mock("../../lib/db", async () => ({ schema: await import("../../lib/db/schema"), getDb: async () => harness.db }));
vi.mock("@/auth", () => ({ requireUser: async () => harness.userId ? { id: harness.userId } : null }));
vi.mock("../../lib/calendars", () => ({ externalBusy: effects.busy, writeEvent: effects.write, removeEvent: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: (value: string) => value.includes("Google Meet") ? "meet" : null, meetingUrlFor: effects.meeting }));
vi.mock("../../lib/email", () => ({ sendMail: effects.mail }));
vi.mock("../../lib/sms", () => ({ sendSms: effects.sms }));
let client: PGlite, create: typeof import("../../app/api/event-types/route").POST, patch: typeof import("../../app/api/event-types/[id]/route").PATCH,
  booking: typeof import("../../lib/booking"), bookRoute: typeof import("../../app/api/bookings/route").POST;
const secret = "Private entrance code 6489", custom: LocationOption = { id: "custom", kind: "custom", details: secret, showBeforeBooking: false };
const phone: LocationOption = { id: "phone", kind: "phone", direction: "host_calls", phone: "" };
const day = DateTime.utc().plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!, start = `${day}T11:00:00.000Z`;
const request = (url: string, data: unknown, method = "POST") => new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
const edit = (id: string, data: unknown) => patch(request(`/api/event-types/${id}`, data, "PATCH"), { params: Promise.resolve({ id }) });
async function event(options: LocationOption[], kind: "one_on_one" | "group" = "one_on_one") {
  const response = await create(request("/api/event-types", { draftId: crypto.randomUUID(), autoSlug: true, settings: { ...initialEventFields(kind, null), title: "Structured location", slug: "location", minNoticeMin: 0, locations: options } }));
  expect(response.status).toBe(201); return (await response.json()).event as typeof S.eventTypes.$inferSelect;
}
const reserve = (selection?: { id: string; input?: string }, extra = {}) => bookRoute(request("/api/bookings", { username: "host", slug: "location", start, name: "Location QA", email: "qa@example.invalid", tz: "UTC", ...(selection ? { locationSelection: selection } : {}), ...extra }));
beforeAll(async () => {
  client = new PGlite(); await client.exec(fs.readFileSync("lib/db/ddl.sql", "utf8")); harness.db = drizzle(client, { schema: S });
  create = (await import("../../app/api/event-types/route")).POST; patch = (await import("../../app/api/event-types/[id]/route")).PATCH;
  booking = await import("../../lib/booking"); bookRoute = (await import("../../app/api/bookings/route")).POST;
});
beforeEach(async () => {
  await client.exec('TRUNCATE users CASCADE; TRUNCATE teams CASCADE;');
  await harness.db.insert(S.users).values([{ id: "host", username: "host", name: "Host", email: "host@example.invalid", timezone: "UTC" }, { id: "mate", username: "mate", name: "Mate", email: "mate@example.invalid", timezone: "UTC" }]);
  await harness.db.insert(S.schedules).values(["host", "mate"].map(userId => ({ id: `schedule-${userId}`, userId, timezone: "UTC", weekly: Object.fromEntries([1,2,3,4,5,6,7].map(day => [day, [{ start: "09:00", end: "17:00" }]])) })));
  harness.userId = "host"; effects.busy.mockReset().mockResolvedValue({ busy: [], errors: [] }); effects.write.mockClear(); effects.mail.mockClear(); effects.meeting.mockClear(); effects.sms.mockClear();
});
afterAll(async () => { await client?.close(); });

describe("structured location creation, booking and access", () => {
  it("keeps hidden details out of the public client props, then includes them after booking", async () => {
    const saved = await event([custom]); expect(saved.location).toBe("Custom"); expect(saved.locations).toEqual([custom]);
    const page = await (await import("../../app/[user]/[slug]/page")).default({ params: Promise.resolve({ user: "host", slug: "location" }), searchParams: Promise.resolve({}) });
    expect(JSON.stringify(page.props.children.props)).not.toContain(secret);
    const response = await reserve(); expect(response.status).toBe(200); const uid = (await response.json()).uid;
    expect((await booking.getBooking(uid))!.booking.location).toBe(secret);
    expect(effects.mail.mock.calls[0][0].text).toContain(secret); expect(effects.mail.mock.calls[0][0].ics).toContain(`LOCATION:${secret}`);
  });
  it("keeps host phone numbers private until booking", async () => {
    const configured: LocationOption = { ...phone, direction: "invitee_calls", phone: "+1 212 555 0102" }; await event([configured]);
    expect(JSON.stringify(publicLocations([configured]))).not.toContain("555"); expect((await reserve()).status).toBe(200);
    expect(effects.mail.mock.calls[0][0].text).toContain("+1 212 555 0102");
  });
  it("requires a location selection and required phone input before any reservation", async () => {
    await event([custom, phone]);
    for (const selection of [undefined, { id: "removed" }, { id: "phone", input: "bad" }]) expect((await reserve(selection)).status).toBe(400);
    expect(await harness.db.select().from(S.bookings)).toEqual([]); expect(effects.write).not.toHaveBeenCalled();
    const response = await reserve({ id: "phone", input: "+1 212 555 0102" }); expect(response.status).toBe(200);
    const row = (await booking.getBooking((await response.json()).uid))!.booking; expect(row.locationChoice?.phone).toBe("+1 212 555 0102");
    expect((await harness.db.select().from(S.contacts))[0].phone).toBe("+1 212 555 0102");
  });
  it("uses the location phone for SMS workflow addressing without a duplicate question", async () => {
    await event([phone]); await harness.db.insert(S.workflows).values({ id: "phone-reminder", userId: "host", name: "QA", trigger: "on_booked", channel: "sms", recipient: "invitee", body: "Location reminder" });
    expect((await reserve({ id: "phone", input: "+1 212 555 0102" })).status).toBe(200);
    expect(effects.sms).toHaveBeenCalledWith("+1 212 555 0102", "Location reminder");
  });
  it("stores an invitee-supplied location and preserves its reschedule prefill", async () => {
    await event([{ id: "ask", kind: "invitee", prompt: "Where should we meet?" }]); expect((await reserve()).status).toBe(400);
    const response = await reserve({ id: "ask", input: "Local library" }); expect(response.status).toBe(200); const uid = (await response.json()).uid;
    const page = await (await import("../../app/[user]/[slug]/page")).default({ params: Promise.resolve({ user: "host", slug: "location" }), searchParams: Promise.resolve({ reschedule: uid }) });
    expect(page.props.children.props.reschedule.locationSelection).toEqual({ id: "ask", input: "Local library" });
    const moved = await reserve({ id: "ask", input: "Library annex" }, { rescheduleUid: uid }); expect(moved.status).toBe(200);
    expect((await booking.getBooking((await moved.json()).uid))!.booking.location).toBe("Library annex"); expect((await booking.getBooking(uid))!.booking.location).toBe("Local library");
  });
  it.each(["zoom", "google_meet", "teams", "webex", "gotomeeting"] as const)("uses the supplied %s link without generating another room", async provider => {
    const url = `https://example.invalid/${provider}`; await event([{ id: "video", kind: "video", provider, url }]);
    const response = await reserve(); expect(response.status).toBe(200); const row = (await booking.getBooking((await response.json()).uid))!.booking;
    expect(row.meetingUrl).toBe(url); expect(effects.meeting).not.toHaveBeenCalled(); expect(effects.write.mock.calls[0][1]).toMatchObject({ location: url, wantsMeet: false });
  });
  it("does not turn custom text mentioning Google Meet into automatic conferencing", async () => {
    await event([{ ...custom, details: "We will discuss Google Meet at the office." }]); expect((await reserve()).status).toBe(200);
    expect(effects.meeting).not.toHaveBeenCalled(); expect(effects.write.mock.calls[0][1].wantsMeet).toBe(false);
  });
  it("rejects changes to hidden configuration during reservation preflight", async () => {
    const saved = await event([custom]); effects.busy.mockImplementationOnce(async () => { expect((await edit(saved.id, { locations: [{ ...custom, details: "Changed hidden details" }] })).status).toBe(200); return { busy: [], errors: [] }; });
    expect((await reserve()).status).toBe(409); expect(await harness.db.select().from(S.bookings)).toEqual([]);
  });
  it("retains configuration on unrelated and unchanged legacy edits, and clears it on a new legacy location", async () => {
    const saved = await event([custom]);
    expect((await edit(saved.id, { title: "Renamed", location: "Custom" })).status).toBe(200);
    expect((await harness.db.select().from(S.eventTypes).where(eq(S.eventTypes.id, saved.id)))[0].locations).toEqual([custom]);
    expect((await edit(saved.id, { location: "Plain location" })).status).toBe(200);
    expect((await harness.db.select().from(S.eventTypes).where(eq(S.eventTypes.id, saved.id)))[0].locations).toBeNull();
  });
  it("rejects invalid configuration atomically and requires the event owner", async () => {
    const saved = await event([custom]);
    expect((await edit(saved.id, { title: "Must not save", locations: [{ ...custom, details: "" }] })).status).toBe(400);
    expect((await harness.db.select().from(S.eventTypes).where(eq(S.eventTypes.id, saved.id)))[0].title).toBe("Structured location");
    harness.userId = "mate"; expect((await edit(saved.id, { locations: [] })).status).toBe(404);
  });
  it("locks structured group details after the first booking even if the summary is unchanged", async () => {
    const saved = await event([custom], "group"); expect((await reserve()).status).toBe(200);
    expect((await edit(saved.id, { locations: [{ ...custom, details: "Different address" }] })).status).toBe(409);
    expect((await edit(saved.id, { locations: [custom], title: "Unchanged location" })).status).toBe(200);
  });
  it("copies configured options to duplicates and source single-use links", async () => {
    const saved = await event([custom, phone]);
    const duplicate = await (await import("../../app/api/event-types/[id]/duplicate/route")).POST(request("/duplicate", {}), { params: Promise.resolve({ id: saved.id }) });
    expect(duplicate.status).toBe(201); expect((await duplicate.json()).locations).toEqual([custom, phone]);
    const { createOneOff } = await import("../../lib/oneoff");
    expect((await createOneOff("host", { title: "", durationMin: 30, fromEventTypeId: saved.id })).locations).toEqual([custom, phone]);
    expect((await createOneOff("host", { title: "", durationMin: 30, fromEventTypeId: saved.id, location: "Override" })).locations).toBeNull();
  });
  it("couples managed location locks, propagation and explicit unlock", async () => {
    await harness.db.insert(S.teams).values({ id: "team", slug: "team", name: "Team" }); await harness.db.insert(S.teamMembers).values([{ teamId: "team", userId: "host", role: "owner" }, { teamId: "team", userId: "mate", role: "member" }]);
    await harness.db.insert(S.eventTypes).values({ id: "managed", userId: "host", teamId: "team", slug: "managed", title: "Managed", kind: "managed", location: "Custom", locations: [custom], lockedFields: ["location"] });
    const { assignManaged } = await import("../../lib/teams"); await assignManaged("managed", ["mate"]);
    const child = (await harness.db.select().from(S.eventTypes).where(eq(S.eventTypes.managedParentId, "managed")))[0]; expect(child.locations).toEqual([custom]);
    harness.userId = "mate"; expect((await edit(child.id, { locations: [] })).status).toBe(403); expect((await edit(child.id, { location: "Bypass" })).status).toBe(403);
    harness.userId = "host"; expect((await edit("managed", { locations: [{ ...custom, details: "Managed new location" }] })).status).toBe(200);
    expect((await harness.db.select().from(S.eventTypes).where(eq(S.eventTypes.id, child.id)))[0].locations[0].details).toBe("Managed new location");
    expect((await edit("managed", { lockedFields: [] })).status).toBe(200); harness.userId = "mate"; expect((await edit(child.id, { locations: [] })).status).toBe(200);
  });
  it("replays startup without losing structured settings or booked choices", async () => {
    const saved = await event([phone]); const response = await reserve({ id: "phone", input: "+1 212 555 0102" }); const uid = (await response.json()).uid;
    await client.exec(fs.readFileSync("lib/db/ddl.sql", "utf8"));
    expect((await harness.db.select().from(S.eventTypes).where(eq(S.eventTypes.id, saved.id)))[0].locations).toEqual([phone]);
    expect((await booking.getBooking(uid))!.booking.locationChoice.phone).toBe("+1 212 555 0102");
  });
  it("renders labels, required choices and no private values in the invitee fields", async () => {
    const { createElement } = await import("react"), { BookingLocationFields } = await import("../../components/BookingLocationFields");
    const html = renderToStaticMarkup(createElement(BookingLocationFields, { options: publicLocations([custom, phone])! }));
    expect(html).toContain('type="radio"'); expect(html).toContain('required=""'); expect(html).not.toContain(secret);
  });
});
