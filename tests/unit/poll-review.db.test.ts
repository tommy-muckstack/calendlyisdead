import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import type { Busy } from "../../lib/slots";
const effects = vi.hoisted(() => ({ busy: vi.fn<() => Promise<{ busy: Busy[]; errors: string[] }>>(), calendar: vi.fn(), mail: vi.fn(), user: { id: "demo-user" } as { id: string } | null }));
vi.mock("../../lib/calendars", () => ({ externalBusy: effects.busy, writeEvent: effects.calendar, removeEvent: vi.fn() }));
vi.mock("../../lib/email", () => ({ sendMail: effects.mail }));
vi.mock("../../lib/workflows", () => ({ onBooked: vi.fn(), onCancelled: vi.fn() }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
vi.mock("../../auth", () => ({ requireUser: async () => effects.user }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), polls: typeof import("../../lib/polls");
const host = "demo-user", day = DateTime.utc().plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!;
const at = (hour: number, minute = 0) => `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
const options = [at(14), at(15)];
async function poll() {
  const id = await polls.createPoll(host, { title: "Review QA", location: "Office", durationMin: 30, options });
  await polls.vote(id, { name: "First voter", email: "voter@example.invalid", picks: options });
  return id;
}
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-poll-review-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema; polls = await import("../../lib/polls");
});
beforeEach(async () => {
  vi.restoreAllMocks(); effects.user = { id: host }; effects.busy.mockReset().mockResolvedValue({ busy: [], errors: [] }); effects.calendar.mockReset(); effects.mail.mockReset();
  await db.delete(schema.bookings); await db.delete(schema.pollVotes); await db.delete(schema.polls); await db.delete(schema.eventTypes).where(eq(schema.eventTypes.kind, "poll"));
});
afterEach(() => vi.restoreAllMocks());
const book = (id: string, reviewKey?: string, extraInvitees: { name: string; email: string }[] = []) => polls.bookPoll(host, id, options[0], { reviewKey, extraInvitees });
const confirmed = () => db.select().from(schema.bookings).where(eq(schema.bookings.status, "confirmed"));

describe("poll booking review", () => {
  it("requires a review before knowingly booking over an external event", async () => {
    const id = await poll(); effects.busy.mockResolvedValue({ busy: [{ start: at(14), end: at(15) }], errors: [] });
    await expect(book(id)).rejects.toThrow("review_required"); expect(await confirmed()).toHaveLength(0);
  });
  it("rejects a failed calendar check without writing or delivering", async () => {
    const id = await poll(); effects.busy.mockResolvedValue({ busy: [], errors: ["calendar_unavailable"] });
    await expect(book(id)).rejects.toThrow("calendar_unavailable"); expect(await confirmed()).toHaveLength(0);
    expect(effects.mail).not.toHaveBeenCalled(); expect(effects.calendar).not.toHaveBeenCalled();
    expect((await polls.getPoll(id))?.poll.status).toBe("open");
  });
  it("reviews without writes and lets the host confirm a flagged external conflict", async () => {
    const id = await poll(); effects.busy.mockResolvedValue({ busy: [{ start: at(14), end: at(15) }], errors: [] });
    const review = await polls.reviewPollBooking(host, id, options[0]);
    expect(review).toMatchObject({ title: "Review QA", location: "Office", externalConflict: true, invitees: [{ name: "First voter", email: "voter@example.invalid" }] });
    expect(await confirmed()).toHaveLength(0); expect(effects.calendar).not.toHaveBeenCalled(); expect(effects.mail).not.toHaveBeenCalled();
    await book(id, review.reviewKey); expect(await confirmed()).toHaveLength(1);
  });
  it("adds invitees who did not vote and deduplicates existing voters", async () => {
    const id = await poll(), extra = [{ name: "Guest", email: "guest@example.invalid" }, { name: "Duplicate", email: "VOTER@example.invalid" }];
    const review = await polls.reviewPollBooking(host, id, options[0], extra);
    expect(review.invitees.map(i => i.email)).toEqual(["voter@example.invalid", "guest@example.invalid"]);
    const uid = await book(id, review.reviewKey, extra); const [meeting] = await confirmed();
    expect(meeting).toMatchObject({ uid, inviteeName: "First voter", inviteeEmail: "voter@example.invalid", guests: ["guest@example.invalid"] });
    expect(effects.mail.mock.calls.some(([mail]) => mail.to === "guest@example.invalid")).toBe(true);
  });
  it("does not reuse a review after the invitee list changes", async () => {
    const id = await poll(), review = await polls.reviewPollBooking(host, id, options[0]);
    await polls.vote(id, { name: "Late voter", email: "late@example.invalid", picks: options });
    await expect(book(id, review.reviewKey)).rejects.toThrow("review_changed"); expect(await confirmed()).toHaveLength(0);
  });
  it("rechecks the attendee snapshot under the poll lock", async () => {
    const id = await poll(), review = await polls.reviewPollBooking(host, id, options[0]);
    effects.busy.mockImplementationOnce(async () => {
      await polls.vote(id, { name: "Concurrent voter", email: "concurrent@example.invalid", picks: options });
      return { busy: [], errors: [] };
    });
    await expect(book(id, review.reviewKey)).rejects.toThrow("review_changed"); expect(await confirmed()).toHaveLength(0);
  });
  it("requires a refreshed review when a new external conflict appears", async () => {
    const id = await poll(), review = await polls.reviewPollBooking(host, id, options[0]);
    effects.busy.mockResolvedValue({ busy: [{ start: at(14), end: at(15) }], errors: [] });
    await expect(book(id, review.reviewKey)).rejects.toThrow("review_changed");
    const fresh = await polls.reviewPollBooking(host, id, options[0]); await book(id, fresh.reviewKey);
  });
  it("does not override an actual app booking, even with a prior review", async () => {
    const id = await poll(), review = await polls.reviewPollBooking(host, id, options[0]);
    await db.insert(schema.bookings).values({ uid: "conflict", eventTypeId: (await db.select().from(schema.eventTypes))[0].id, hostId: host, start: new Date(at(14, 15)), end: new Date(at(15)), inviteeName: "Conflict", inviteeEmail: "conflict@example.invalid", inviteeTz: "UTC" });
    await expect(book(id, review.reviewKey)).rejects.toThrow("slot_unavailable"); expect(await confirmed()).toHaveLength(1);
  });
  it("rejects a changed duration after the external preflight", async () => {
    const id = await poll(), review = await polls.reviewPollBooking(host, id, options[0]);
    effects.busy.mockImplementationOnce(async () => { await db.update(schema.polls).set({ durationMin: 60 }).where(eq(schema.polls.id, id)); return { busy: [], errors: [] }; });
    await expect(book(id, review.reviewKey)).rejects.toThrow("review_changed"); expect(await confirmed()).toHaveLength(0);
  });
  it("validates additional invitees and the combined participant limit", async () => {
    const id = await poll();
    await expect(polls.reviewPollBooking(host, id, options[0], [{ name: "", email: "bad" }])).rejects.toThrow("invalid");
    await expect(polls.reviewPollBooking(host, id, options[0], Array.from({ length: 40 }, (_, i) => ({ name: "Guest", email: `guest${i}@example.invalid` })))).rejects.toThrow("too_many_invitees");
    expect(effects.busy).not.toHaveBeenCalled();
  });
  it("checks ownership and option validity before querying external calendars", async () => {
    const id = await poll();
    await expect(polls.reviewPollBooking("demo-mate", id, options[0])).rejects.toThrow("not_found");
    await expect(polls.reviewPollBooking(host, id, at(18))).rejects.toThrow("bad_option");
    expect(effects.busy).not.toHaveBeenCalled();
  });
  it("does not query providers while holding a reservation transaction", async () => {
    const id = await poll(); const transaction = vi.spyOn(db, "transaction");
    effects.busy.mockImplementationOnce(async () => { expect(transaction).not.toHaveBeenCalled(); return { busy: [], errors: [] }; });
    await book(id); expect(transaction).toHaveBeenCalledTimes(1);
  });
  it("requires authentication and a review key at the HTTP booking boundary", async () => {
    const id = await poll(), { POST } = await import("../../app/api/polls/[id]/book/route");
    const req = () => new NextRequest("http://localhost/api/polls/book", { method: "POST", body: JSON.stringify({ option: options[0] }) });
    effects.user = null; expect((await POST(req(), { params: Promise.resolve({ id }) })).status).toBe(401);
    effects.user = { id: host }; expect((await POST(req(), { params: Promise.resolve({ id }) })).status).toBe(400);
    expect(await confirmed()).toHaveLength(0);
  });
  it("returns only a safe calendar error through review and booking APIs", async () => {
    const id = await poll(), review = await polls.reviewPollBooking(host, id, options[0]);
    effects.busy.mockResolvedValue({ busy: [], errors: ["private provider body"] });
    const { POST: preview } = await import("../../app/api/polls/[id]/review/route"), { POST: reserve } = await import("../../app/api/polls/[id]/book/route");
    for (const route of [preview, reserve]) {
      const r = await route(new NextRequest("http://localhost/api/polls/review", { method: "POST", body: JSON.stringify({ option: options[0], reviewKey: review.reviewKey }) }), { params: Promise.resolve({ id }) });
      expect(r.status).toBe(503); expect(await r.json()).toEqual({ error: "calendar_unavailable" });
    }
  });
});
