import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({ user: { id: "demo-user", timezone: "America/New_York" } as { id: string; timezone: string } | null }));
vi.mock("@/auth", () => ({ requireUser: async () => auth.user }));
let meetings: typeof import("../../lib/meetings");
let exportRoute: typeof import("../../app/api/meetings/export/route").GET;
const now = new Date("2026-10-15T12:00:00Z");
const zone = "America/New_York";

beforeAll(async () => {
  // This suite is deliberately isolated from any configured remote database.
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-meetings-")), "db"));
  const { getDb, schema } = await import("../../lib/db"), db = await getDb();
  meetings = await import("../../lib/meetings");
  exportRoute = (await import("../../app/api/meetings/export/route")).GET;
  await db.insert(schema.eventTypes).values({ id: "mate-only", userId: "demo-mate", slug: "private", title: "Other host's meeting" });
  const booking = (uid: string, start: string, extra: Record<string, unknown> = {}) => ({ uid, eventTypeId: "demo-30", hostId: "demo-user", start: new Date(start), end: new Date(Date.parse(start) + 1800000), inviteeName: "Guest", inviteeEmail: `${uid}@example.invalid`, inviteeTz: "UTC", createdAt: new Date("2026-01-01"), ...extra });
  await db.insert(schema.bookings).values([
    booking("past", "2026-10-14T12:00:00Z"),
    booking("boundary", "2026-10-15T11:30:00Z"),
    booking("ongoing", "2026-10-15T11:45:00Z"),
    booking("future", "2026-10-16T12:00:00Z", { inviteeName: "=SUM(1,1)", notes: "Invitee detail", answers: { question: "A reply" }, paymentRef: "must-not-export" }),
    booking("cancelled", "2026-10-17T12:00:00Z", { status: "cancelled", cancelReason: "Changed plans" }),
    booking("private", "2026-10-16T12:00:00Z", { hostId: "demo-mate", eventTypeId: "mate-only", inviteeName: "Private guest" }),
    booking("collective-self", "2026-10-18T12:00:00Z", { eventTypeId: "demo-60", groupUid: "shared-session" }),
    booking("collective-mate", "2026-10-18T12:00:00Z", { hostId: "demo-mate", eventTypeId: "demo-60", groupUid: "shared-session" }),
    booking("dst-early", "2026-11-01T04:30:00Z", { inviteeName: 'Guest, "One"\nNext' }),
    booking("dst-late", "2026-11-02T04:30:00Z", { inviteeName: "100% literal_name" }),
    booking("dst-outside", "2026-11-02T05:00:00Z"),
    ...Array.from({ length: 501 }, (_, i) => booking(`bulk-${String(i).padStart(3, "0")}`, new Date(Date.UTC(2027, 0, 1, 0, i)).toISOString(), { inviteeName: `Bulk ${i}` })),
  ]);
});
beforeEach(() => { auth.user = { id: "demo-user", timezone: zone }; });
const filters = (extra: Record<string, unknown> = {}) => meetings.MeetingFilters.parse(extra);

describe("host meetings query and export", () => {
  it("separates past, ongoing, upcoming and cancelled meetings at the end boundary", async () => {
    const upcoming = await meetings.listHostMeetings("demo-user", zone, filters(), now);
    expect(upcoming.rows[0].uid).toBe("ongoing");
    expect(upcoming.rows.some(r => r.uid === "cancelled")).toBe(false);
    const past = await meetings.listHostMeetings("demo-user", zone, filters({ status: "past" }), now);
    expect(past.rows.map(r => r.uid)).toEqual(["boundary", "past"]);
    const cancelled = await meetings.listHostMeetings("demo-user", zone, filters({ status: "cancelled" }), now);
    expect(cancelled.rows.map(r => r.uid)).toEqual(["cancelled"]);
  });
  it("enforces host ownership for list, detail and event-type filter choices", async () => {
    expect(await meetings.getHostMeeting("demo-user", "private")).toBeNull();
    expect(await meetings.getHostMeeting("demo-user", "collective-mate")).toBeNull();
    expect((await meetings.getHostMeeting("demo-mate", "collective-mate"))?.title).toBe("Deep dive");
    expect((await meetings.listHostMeetings("demo-user", zone, filters({ status: "all", eventType: "mate-only" }), now)).total).toBe(0);
    expect((await meetings.hostMeetingTypes("demo-user")).map(t => t.id).sort()).toEqual(["demo-30", "demo-60"]);
    const detail = await meetings.getHostMeeting("demo-user", "future");
    expect(detail).toMatchObject({ notes: "Invitee detail", answers: { question: "A reply" } });
    expect(detail).not.toHaveProperty("paymentRef");
  });
  it("filters inclusive local dates across a 25-hour DST day", async () => {
    const result = await meetings.listHostMeetings("demo-user", zone, filters({ status: "all", from: "2026-11-01", to: "2026-11-01" }), now);
    expect(result.rows.map(r => r.uid)).toEqual(["dst-early", "dst-late"]);
  });
  it("searches names, emails and titles literally and without case sensitivity", async () => {
    for (const q of ["LITERAL_name", "100%", "dst-late@example.invalid"]) {
      expect((await meetings.listHostMeetings("demo-user", zone, filters({ q }), now)).rows.map(r => r.uid)).toEqual(["dst-late"]);
    }
    expect((await meetings.listHostMeetings("demo-user", zone, filters({ q: "deep DIVE" }), now)).rows.map(r => r.uid)).toEqual(["collective-self"]);
  });
  it("paginates deterministically while preserving the total", async () => {
    const page = await meetings.listHostMeetings("demo-user", zone, filters({ q: "bulk", page: 2 }), now);
    expect(page.total).toBe(501); expect(page.rows).toHaveLength(25);
    expect(page.rows[0].uid).toBe("bulk-025"); expect(page.rows[24].uid).toBe("bulk-049");
  });
  it.each([{ from: "2026-02-29" }, { from: "2026-12-31", to: "2026-01-01" }, { page: "0" }, { page: "abc" }, { status: "private" }])("rejects malformed filters %j", value => {
    expect(meetings.parseMeetingFilters(new URLSearchParams(value as Record<string, string>)).success).toBe(false);
  });
  it("exports every matching row across batches, ignoring list pagination", async () => {
    let csv = "";
    for await (const chunk of meetings.exportHostMeetings("demo-user", zone, filters({ q: "bulk", page: 2 }), now)) csv += chunk;
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(502);
    expect(csv).toContain('"Bulk 0"'); expect(csv).toContain('"Bulk 500"');
    expect(csv).not.toContain("Private guest");
  });
  it("quotes commas/newlines and neutralizes spreadsheet formulas", async () => {
    let csv = "";
    for await (const chunk of meetings.exportHostMeetings("demo-user", zone, filters({ status: "all", to: "2026-12-31" }), now)) csv += chunk;
    expect(csv).toContain('"\'=SUM(1,1)"'); expect(csv).toContain('"Guest, ""One""\nNext"');
    expect(csv).not.toContain("Private guest"); expect(csv).not.toContain("must-not-export");
  });
  it("requires authentication before starting an export", async () => {
    auth.user = null;
    expect((await exportRoute(new NextRequest("http://localhost/api/meetings/export"))).status).toBe(401);
  });
  it("returns a private CSV attachment and validates export filters", async () => {
    expect((await exportRoute(new NextRequest("http://localhost/api/meetings/export?from=bad"))).status).toBe(400);
    const result = await exportRoute(new NextRequest("http://localhost/api/meetings/export?status=all&q=bulk"));
    expect(result.status).toBe(200); expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(result.headers.get("Content-Disposition")).toContain("attachment");
    expect((await result.text()).split("\r\n").filter(Boolean)).toHaveLength(502);
  });
});
