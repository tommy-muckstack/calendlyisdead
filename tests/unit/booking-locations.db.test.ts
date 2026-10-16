import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const effects = vi.hoisted(() => ({
  busy: vi.fn(async () => ({ busy: [], errors: [] })),
  write: vi.fn<typeof import("../../lib/calendars").writeEvent>(async () => null),
  mail: vi.fn<typeof import("../../lib/email").sendMail>(async () => false),
  meeting: vi.fn<typeof import("../../lib/conferencing").meetingUrlFor>(async () => null),
}));
vi.mock("../../lib/calendars", () => ({ externalBusy: effects.busy, writeEvent: effects.write, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: effects.mail }));
vi.mock("../../lib/conferencing", () => ({ confFor: (location: string) => location === "Google Meet" ? "meet" : null, meetingUrlFor: effects.meeting }));
vi.mock("../../components/BrandFrame", () => ({ BrandFrame: ({ children }: { children: ReactNode }) => children }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, S: typeof import("../../lib/db/schema"), booking: typeof import("../../lib/booking"), meetings: typeof import("../../lib/meetings"), workflows: typeof import("../../lib/workflows"), polls: typeof import("../../lib/polls");
const tz = "America/New_York";
const day = DateTime.now().setZone(tz).plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!;
const at = (hour: number) => DateTime.fromISO(`${day}T${hour}:00`, { zone: tz }).toUTC().toISO()!;
const book = (hour = 11, extra = {}) => booking.createBooking({ username: "demo", slug: "location", start: at(hour), name: "Location QA", email: "location@example.invalid", tz, ...extra });
const location = (value: string) => db.update(S.eventTypes).set({ location: value }).where(eq(S.eventTypes.id, "location"));
const stored = async (uid: string) => (await booking.getBooking(uid))!.booking;
const confirmation = async (uid: string) => renderToStaticMarkup(await (await import("../../app/booking/[uid]/page")).default({ params: Promise.resolve({ uid }), searchParams: Promise.resolve({}) }));

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-locations-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); S = database.schema;
  booking = await import("../../lib/booking"); meetings = await import("../../lib/meetings"); workflows = await import("../../lib/workflows"); polls = await import("../../lib/polls");
  await db.insert(S.eventTypes).values({ id: "location", userId: "demo-user", slug: "location", title: "Location QA meeting", minNoticeMin: 0, location: "Room A" });
  await db.insert(S.teams).values({ id: "location-team", slug: "location-team", name: "Location team" });
  await db.insert(S.eventTypeHosts).values(["demo-user", "demo-mate"].map(userId => ({ eventTypeId: "location", userId, priority: 2 })));
});
beforeEach(async () => {
  await db.delete(S.scheduledMessages); await db.delete(S.workflows); await db.delete(S.bookings); await db.delete(S.polls);
  await db.delete(S.eventTypes).where(eq(S.eventTypes.kind, "poll"));
  await db.update(S.eventTypes).set({ kind: "one_on_one", teamId: null, seats: 3, location: "Room A" }).where(eq(S.eventTypes.id, "location"));
  effects.busy.mockReset().mockResolvedValue({ busy: [], errors: [] }); effects.write.mockReset().mockResolvedValue(null); effects.mail.mockClear(); effects.meeting.mockReset().mockResolvedValue(null);
});
afterAll(async () => { await db?.$client.close(); });

describe("booked location snapshots", () => {
  it("keeps the booked address on confirmation after the event type changes", async () => {
    const first = await book(); await location("Room B");
    expect((await stored(first.uid)).location).toBe("Room A");
    const html = await confirmation(first.uid); expect(html).toContain("Room A"); expect(html).not.toContain("Room B");
  });
  it("uses the booked address for host detail, list and CSV export", async () => {
    const first = await book(); await location("Room B");
    expect((await meetings.getHostMeeting("demo-user", first.uid))?.location).toBe("Room A");
    const filters = meetings.MeetingFilters.parse({}); expect((await meetings.listHostMeetings("demo-user", tz, filters)).rows[0].location).toBe("Room A");
    let csv = ""; for await (const chunk of meetings.exportHostMeetings("demo-user", tz, filters)) csv += chunk;
    expect(csv).toContain('"Room A"'); expect(csv).not.toContain('"Room B"');
  });
  it("keeps the original address in cancellation mail and ICS", async () => {
    const first = await book(); await location("Room B"); effects.mail.mockClear(); await booking.cancelBooking(first.uid, "QA cancellation");
    const sent = effects.mail.mock.calls.find(([message]) => message.to === "location@example.invalid")![0];
    expect(sent.text).toContain("Where: Room A"); expect(sent.text).not.toContain("Room B"); expect(sent.ics).toContain("LOCATION:Room A"); expect(sent.ics).toContain("STATUS:CANCELLED");
  });
  it("renders delayed workflow location from the booked details", async () => {
    await db.insert(S.workflows).values({ id: "location-reminder", userId: "demo-user", name: "Local reminder", trigger: "before_start", offsetMin: 60, channel: "email", recipient: "invitee", subject: "Location reminder", body: "Meet at {{event.location}}" });
    const first = await book(); await location("Room B"); effects.mail.mockClear();
    expect((await workflows.processDue(new Date(+first.start - 30 * 60_000))).sent).toBe(1);
    expect(effects.mail.mock.calls[0][0].text).toBe("Meet at Room A");
  });
  it("keeps an explicitly empty location empty after an address is added", async () => {
    await location(""); const first = await book(); await location("Room B");
    expect((await stored(first.uid)).location).toBe(""); expect(await confirmation(first.uid)).not.toContain("Room B");
    expect(workflows.render("{{event.location}}", { booking: await stored(first.uid), eventType: { location: "Room B" }, host: {} })).toBe("");
    effects.mail.mockClear(); await booking.cancelBooking(first.uid, "QA"); expect(effects.mail.mock.calls[0][0].text).toContain("Where: TBD");
  });
  it("uses the new location only for new bookings and explicit rescheduling, including the same time", async () => {
    const first = await book(); await location("Room B"); const second = await book(13);
    const moved = await book(11, { rescheduleUid: first.uid });
    expect(await stored(first.uid)).toMatchObject({ location: "Room A", status: "cancelled" });
    expect(await stored(second.uid)).toMatchObject({ location: "Room B", status: "confirmed" });
    expect(await stored(moved.uid)).toMatchObject({ location: "Room B", rescheduledFrom: first.uid });
    expect(effects.write.mock.calls.at(-1)?.[1].location).toBe("Room B");
  });
  it("uses reserved location through deferred finalization rather than the edited event", async () => {
    const first = await book(); const row = await stored(first.uid); await location("Google Meet");
    const event = (await db.select().from(S.eventTypes).where(eq(S.eventTypes.id, "location")))[0];
    const host = (await db.select().from(S.users).where(eq(S.users.id, "demo-user")))[0];
    effects.write.mockClear(); effects.meeting.mockClear(); effects.mail.mockClear();
    await booking.finalize([row], event, [host], false);
    expect(effects.write.mock.calls[0][1]).toMatchObject({ location: "Room A", wantsMeet: false });
    expect(effects.meeting.mock.calls[0][0]).toBe("Room A"); expect(effects.mail.mock.calls[0][0].ics).toContain("LOCATION:Room A");
  });
  it("rejects location changes between availability and reservation", async () => {
    effects.busy.mockImplementationOnce(async () => { await location("Room B"); return { busy: [], errors: [] }; });
    await expect(book()).rejects.toThrow("slot_unavailable"); expect(await db.select().from(S.bookings)).toEqual([]); expect(effects.write).not.toHaveBeenCalled();
  });
  it.each(["collective", "round_robin"])("captures the location for every assigned %s host", async kind => {
    await db.update(S.eventTypes).set({ kind, teamId: "location-team" }).where(eq(S.eventTypes.id, "location"));
    await book(11, { username: "team:location-team" }); await location("Room B");
    const rows = await db.select().from(S.bookings); expect(rows).toHaveLength(kind === "collective" ? 2 : 1); expect(rows.every((row: typeof S.bookings.$inferSelect) => row.location === "Room A")).toBe(true);
  });
  it("joining a group keeps the session's original location after a direct template change", async () => {
    await db.update(S.eventTypes).set({ kind: "group" }).where(eq(S.eventTypes.id, "location"));
    await book(); await location("Room B"); const joined = await book();
    expect((await stored(joined.uid)).location).toBe("Room A"); expect(effects.meeting.mock.calls.at(-1)?.[0]).toBe("Room A");
  });
  it("stores the poll's location when reserving its meeting", async () => {
    const options = [at(11), at(13)], id = await polls.createPoll("demo-user", { title: "Location poll", durationMin: 30, location: "Poll room", options });
    await polls.vote(id, { name: "Poll QA", email: "poll@example.invalid", picks: options });
    const uid = await polls.bookPoll("demo-user", id, options[0]);
    await db.update(S.eventTypes).set({ location: "Changed poll room" }).where(eq(S.eventTypes.id, `poll-${id}`));
    expect((await stored(uid)).location).toBe("Poll room"); expect(await confirmation(uid)).not.toContain("Changed poll room");
  });
  it("retains an existing conference link when the event's location changes", async () => {
    effects.meeting.mockResolvedValue("https://meet.example.invalid/local-room");
    const first = await book(); await location("Room B"); const saved = await stored(first.uid);
    expect(saved).toMatchObject({ location: "Room A", meetingUrl: "https://meet.example.invalid/local-room" });
    expect(workflows.render("{{event.location}}", { booking: saved, eventType: { location: "Room B" }, host: {} })).toBe(saved.meetingUrl);
    effects.mail.mockClear(); await booking.cancelBooking(first.uid, "QA"); expect(effects.mail.mock.calls[0][0].ics).toContain("LOCATION:https://meet.example.invalid/local-room");
  });
});
