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
let db: any, schema: typeof import("../../lib/db/schema"), booking: typeof import("../../lib/booking");
let patch: typeof import("../../app/api/meetings/[uid]/invitee-limit/route").PATCH;
let patchType: typeof import("../../app/api/event-types/[id]/route").PATCH;
let groups: typeof import("../../lib/group-sessions");
const tz = "America/New_York";
const day = DateTime.now().setZone(tz).plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!;
const at = (time: string) => DateTime.fromISO(`${day}T${time}`, { zone: tz }).toUTC().toISO()!;
const book = (time: string) => booking.createBooking({ username: "demo", slug: "capacity-group", start: at(time),
  name: "Group invitee", email: "group@example.invalid", tz });
const setDefault = (seats: number) => db.update(schema.eventTypes).set({ seats }).where(eq(schema.eventTypes.id, "capacity-group"));
const edit = (uid: string, inviteeLimit: unknown) => patch(new NextRequest(`http://localhost/api/meetings/${uid}/invitee-limit`, {
  method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ inviteeLimit }),
}), { params: Promise.resolve({ uid }) });

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-group-capacity-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  booking = await import("../../lib/booking");
  groups = await import("../../lib/group-sessions");
  patch = (await import("../../app/api/meetings/[uid]/invitee-limit/route")).PATCH;
  patchType = (await import("../../app/api/event-types/[id]/route")).PATCH;
  await db.insert(schema.eventTypes).values({ id: "capacity-group", userId: "demo-user", slug: "capacity-group", title: "Group", kind: "group",
    durationMin: 30, seats: 3, minNoticeMin: 0 });
});
beforeEach(async () => { await db.delete(schema.bookings); await setDefault(3); auth.mockResolvedValue({ id: "demo-user" }); });
afterEach(() => vi.restoreAllMocks());

describe("scheduled group invitee limits", () => {
  it("edits every attendee's session limit without changing another session or the type default", async () => {
    const first = await book("11:00"); await book("11:00"); const other = await book("13:00");
    const response = await edit(first.uid, 4);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ inviteeLimit: 4, booked: 2 });
    expect(await groups.getGroupInviteeLimit("demo-user", first.uid)).toEqual({ inviteeLimit: 4, booked: 2 });
    expect(await groups.getGroupInviteeLimit("demo-user", other.uid)).toEqual({ inviteeLimit: 3, booked: 1 });
    expect((await booking.loadEvent("demo", "capacity-group"))!.eventType.seats).toBe(3);
    await book("11:00"); await book("11:00"); await expect(book("11:00")).rejects.toThrow("slot_unavailable");
    expect((await db.select().from(schema.bookings)).filter((b: any) => b.start.toISOString() === at("11:00")).map((b: any) => b.inviteeLimit)).toEqual([4, 4, 4, 4]);
  });
  it("rejects a limit below the booked count without cancelling anyone", async () => {
    const first = await book("11:00"); await book("11:00"); await book("11:00");
    const response = await edit(first.uid, 2);
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: "below_invitee_count", minimum: 3 });
    expect(await groups.getGroupInviteeLimit("demo-user", first.uid)).toEqual({ inviteeLimit: 3, booked: 3 });
  });
  it.each([1, 10000, 2.5, "3"])("rejects an invalid invitee limit %s", async value => {
    const first = await book("11:00"); expect((await edit(first.uid, value)).status).toBe(400);
    expect(await groups.getGroupInviteeLimit("demo-user", first.uid)).toEqual({ inviteeLimit: 3, booked: 1 });
  });
  it("requires the meeting's host and rejects missing or cancelled meetings", async () => {
    const first = await book("11:00");
    auth.mockResolvedValue(null); expect((await edit(first.uid, 4)).status).toBe(401);
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await edit(first.uid, 4)).status).toBe(404);
    expect(await groups.getGroupInviteeLimit("demo-mate", first.uid)).toBeNull();
    auth.mockResolvedValue({ id: "demo-user" }); expect((await edit("missing", 4)).status).toBe(404);
    await booking.cancelBooking(first.uid, "Test cancellation"); expect((await edit(first.uid, 4)).status).toBe(404);
  });
  it("can reduce capacity after cancellations even when remaining seat numbers are higher", async () => {
    await setDefault(5); const attendees = [];
    for (let i = 0; i < 5; i++) attendees.push(await book("11:00"));
    await booking.cancelBooking(attendees[0].uid, "Test cancellation"); await booking.cancelBooking(attendees[1].uid, "Test cancellation");
    expect((await edit(attendees[2].uid, 3)).status).toBe(200);
    await booking.cancelBooking(attendees[2].uid, "Test cancellation");
    await book("11:00"); await expect(book("11:00")).rejects.toThrow("slot_unavailable");
  });
  it("serializes a limit reduction and a simultaneous attendee reservation", async () => {
    const first = await book("11:00"); await book("11:00");
    const transact = db.transaction.bind(db);
    let count = 0, release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: any[]) => {
      if (++count === 2) release(); await ready; return transact(...args);
    });
    const results = await Promise.allSettled([edit(first.uid, 2), book("11:00")]);
    spy.mockRestore();
    const saved = (await groups.getGroupInviteeLimit("demo-user", first.uid))!;
    expect(saved.booked).toBeLessThanOrEqual(saved.inviteeLimit);
    expect(results[0].status).toBe("fulfilled");
    const response = (results[0] as PromiseFulfilledResult<Response>).value;
    expect(response.status).toBe(results[1].status === "fulfilled" ? 409 : 200);
  });
  it("supports the original default range of 2–9,999 for group events", async () => {
    for (const [seats, status] of [[1, 400], [2, 200], [9999, 200], [10000, 400]]) {
      const response = await patchType(new NextRequest("http://localhost/api/event-types/capacity-group", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ seats }),
      }), { params: Promise.resolve({ id: "capacity-group" }) });
      expect(response.status).toBe(status);
    }
  });
  it("does not close existing seats when the default is reduced", async () => {
    await book("11:00"); await setDefault(2);
    await book("11:00"); await book("11:00");
    await expect(book("11:00")).rejects.toThrow("slot_unavailable");
  });
  it("does not open extra seats when the default is increased, but uses it for a new session", async () => {
    await setDefault(2); await book("11:00"); await setDefault(4);
    await book("11:00"); await expect(book("11:00")).rejects.toThrow("slot_unavailable");
    for (let i = 0; i < 4; i++) await book("13:00");
    await expect(book("13:00")).rejects.toThrow("slot_unavailable");
  });
  it("retains the session limit after the first attendee cancels", async () => {
    const first = await book("11:00"); await book("11:00"); await setDefault(2);
    await booking.cancelBooking(first.uid, "Test cancellation");
    await book("11:00"); await book("11:00");
    await expect(book("11:00")).rejects.toThrow("slot_unavailable");
  });
  it("treats a fully cancelled session as a new session using the current default", async () => {
    const first = await book("11:00"); await booking.cancelBooking(first.uid, "Test cancellation");
    await setDefault(2); await book("11:00"); await book("11:00");
    await expect(book("11:00")).rejects.toThrow("slot_unavailable");
  });
  it("fills only the last saved seat under concurrent requests after the default increases", async () => {
    await setDefault(2); await book("11:00"); await setDefault(5);
    const transact = db.transaction.bind(db);
    let count = 0, release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const spy = vi.spyOn(db, "transaction").mockImplementation(async (...args: any[]) => {
      if (++count === 2) release(); await ready; return transact(...args);
    });
    const result = await Promise.allSettled([book("11:00"), book("11:00")]);
    spy.mockRestore();
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(schema.bookings)).toHaveLength(2);
  });
});
