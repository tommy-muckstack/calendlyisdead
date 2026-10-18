import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";

const effects = vi.hoisted(() => ({ calendar: vi.fn(async () => null), mail: vi.fn(async () => {}) }));
vi.mock("../../lib/calendars", () => ({ externalBusy: async () => ({ busy: [], errors: [] }), writeEvent: effects.calendar, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: effects.mail }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: any, schema: typeof import("../../lib/db/schema"), polls: typeof import("../../lib/polls"), booking: typeof import("../../lib/booking");
const host = "demo-user", tz = "America/New_York";
const day = DateTime.now().setZone(tz).plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!;
const at = (time: string) => DateTime.fromISO(`${day}T${time}`, { zone: tz }).toUTC().toISO()!;
const regular = (time: string) => booking.createBooking({ username: "demo", slug: "30min", start: at(time), name: "Regular invitee", email: "regular@example.invalid", tz });
const confirmed = () => db.select().from(schema.bookings).where(eq(schema.bookings.status, "confirmed"));
async function poll(options = [at("11:00"), at("12:00")]) {
  const id = await polls.createPoll(host, { title: "Poll", durationMin: 30, options });
  await polls.vote(id, { name: "Poll invitee", email: "poll@example.invalid", picks: options });
  return id;
}
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-polls-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  polls = await import("../../lib/polls"); booking = await import("../../lib/booking");
});
beforeEach(async () => {
  await db.delete(schema.bookings);
  await db.delete(schema.polls);
  await db.delete(schema.eventTypes).where(eq(schema.eventTypes.kind, "poll"));
  effects.calendar.mockClear(); effects.mail.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("poll reservations", () => {
  it("books a poll once when two different options are selected concurrently", async () => {
    const id = await poll();
    const result = await Promise.allSettled([polls.bookPoll(host, id, at("11:00")), polls.bookPoll(host, id, at("12:00"))]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rows = await confirmed(); expect(rows).toHaveLength(1);
    expect((await polls.getPoll(id))!.poll.bookingUid).toBe(rows[0].uid);
    expect(effects.calendar).toHaveBeenCalledTimes(1);
  });
  it("rejects different polls that would overlap for the same host", async () => {
    const a = await poll([at("11:00"), at("12:00")]), b = await poll([at("11:15"), at("13:00")]);
    const result = await Promise.allSettled([polls.bookPoll(host, a, at("11:00")), polls.bookPoll(host, b, at("11:15"))]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await confirmed()).toHaveLength(1);
  });
  it("does not book over an existing event-type meeting", async () => {
    await regular("11:00");
    const id = await poll([at("11:15"), at("13:00")]);
    await expect(polls.bookPoll(host, id, at("11:15"))).rejects.toThrow("slot_unavailable");
    expect((await polls.getPoll(id))!.poll.status).toBe("open");
    expect(await confirmed()).toHaveLength(1);
  });
  it("serializes a poll and regular booking competing for overlapping time", async () => {
    const id = await poll([at("11:15"), at("13:00")]);
    const result = await Promise.allSettled([regular("11:00"), polls.bookPoll(host, id, at("11:15"))]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await confirmed()).toHaveLength(1);
  });
  it("permits adjacent meetings and ignores cancelled reservations", async () => {
    const old = await regular("11:00"); await booking.cancelBooking(old.uid, "Test cancellation");
    const a = await poll(), b = await poll([at("11:30"), at("13:00")]);
    await polls.bookPoll(host, a, at("11:00"));
    await polls.bookPoll(host, b, at("11:30"));
    expect(await confirmed()).toHaveLength(2);
  });
  it("rolls back the event, reservation and poll state together before any delivery", async () => {
    const id = await poll();
    const transact = db.transaction.bind(db);
    const spy = vi.spyOn(db, "transaction").mockImplementation((fn: any, config: any) => transact(async (tx: any) => {
      await fn(tx); throw new Error("Simulated transaction failure");
    }, config));
    await expect(polls.bookPoll(host, id, at("11:00"))).rejects.toThrow();
    spy.mockRestore();
    expect(await confirmed()).toHaveLength(0);
    expect(await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, `poll-${id}`))).toHaveLength(0);
    expect((await polls.getPoll(id))!.poll).toMatchObject({ status: "open", chosen: null, bookingUid: null });
    expect(effects.calendar).not.toHaveBeenCalled(); expect(effects.mail).not.toHaveBeenCalled();
    await expect(polls.bookPoll(host, id, at("12:00"))).resolves.toBeTypeOf("string");
  });
  it("rejects non-owners, invalid options and options without votes", async () => {
    const id = await polls.createPoll(host, { title: "Poll", durationMin: 30, options: [at("11:00"), at("12:00")] });
    await expect(polls.bookPoll("demo-mate", id, at("11:00"))).rejects.toThrow("not_found");
    await expect(polls.bookPoll(host, id, at("14:00"))).rejects.toThrow("bad_option");
    await polls.vote(id, { name: "Poll invitee", email: "poll@example.invalid", picks: [at("12:00")] });
    await expect(polls.bookPoll(host, id, at("11:00"))).rejects.toThrow("no_votes");
    expect(await confirmed()).toHaveLength(0);
  });
  it("accepts only one of two different concurrent votes from the same email", async () => {
    const id = await poll();
    const result = await Promise.allSettled([
      polls.vote(id, { name: "New A", email: "NEW@example.invalid", picks: [at("11:00")] }),
      polls.vote(id, { name: "New B", email: "new@example.invalid", picks: [at("12:00")] }),
    ]);
    expect(result.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(result.find(row => row.status === "rejected")).toMatchObject({ reason: new Error("already_voted") });
    const votes = (await polls.getPoll(id))!.votes.filter((v: any) => v.email === "new@example.invalid");
    expect(votes).toHaveLength(1);
    expect(votes[0].picks).toHaveLength(1);
  });
  it("does not accept new votes after the poll is booked", async () => {
    const id = await poll(); await polls.bookPoll(host, id, at("11:00"));
    await expect(polls.vote(id, { name: "Late", email: "late@example.invalid", picks: [at("11:00")] })).rejects.toThrow("closed");
    expect((await polls.getPoll(id))!.votes).toHaveLength(1);
  });
  it("either includes a concurrent vote in the booking or rejects it after closure", async () => {
    const id = await poll();
    const result = await Promise.allSettled([
      polls.bookPoll(host, id, at("11:00")),
      polls.vote(id, { name: "Concurrent voter", email: "concurrent@example.invalid", picks: [at("11:00")] }),
    ]);
    expect(result[0].status).toBe("fulfilled");
    const [meeting] = await confirmed();
    const invited = [meeting.inviteeEmail, ...meeting.guests];
    if (result[1].status === "fulfilled") expect(invited).toContain("concurrent@example.invalid");
    else {
      expect(result[1].reason.message).toBe("closed");
      expect(invited).not.toContain("concurrent@example.invalid");
    }
  });
  it("rolls back a new vote when the transaction cannot commit", async () => {
    const id = await poll();
    const transact = db.transaction.bind(db);
    const spy = vi.spyOn(db, "transaction").mockImplementation((fn: any, config: any) => transact(async (tx: any) => {
      await fn(tx); throw new Error("Simulated transaction failure");
    }, config));
    await expect(polls.vote(id, { name: "New", email: "new@example.invalid", picks: [at("11:00")] })).rejects.toThrow("Simulated transaction failure");
    spy.mockRestore();
    const votes = (await polls.getPoll(id))!.votes;
    expect(votes).toHaveLength(1);
    expect(votes[0]).toMatchObject({ name: "Poll invitee", picks: [at("11:00"), at("12:00")] });
  });
});
