import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cid6-"));
process.env.PGLITE_DIR = path.join(tmp, "db");
let db: any, schema: any, B: typeof import("../../lib/booking"), P: typeof import("../../lib/polls"), O: typeof import("../../lib/oneoff"), R: typeof import("../../lib/assistant-run");
const A = "demo-user", tz = "America/New_York";
const wed = DateTime.now().setZone(tz).plus({ weeks: 1 }).set({ weekday: 3 }).toISODate()!;
const at = (hhmm: string, d = wed) => DateTime.fromISO(`${d}T${hhmm}`, { zone: tz }).toUTC().toISO()!;
const outbox = (who = "payer@example.com") => fs.existsSync(".data/outbox") ? fs.readdirSync(".data/outbox").filter(f => f.includes(who)).length : 0;

beforeAll(async () => {
  const m = await import("../../lib/db"); db = await m.getDb(); schema = m.schema;
  B = await import("../../lib/booking"); P = await import("../../lib/polls"); O = await import("../../lib/oneoff"); R = await import("../../lib/assistant-run");
});

describe("conferencing on bookings", () => {
  it("Zoom event gets a demo room link without keys", async () => {
    const b = await B.createBooking({ username: "demo", slug: "deep-dive", start: at("10:00"), name: "Zed", email: "zed@example.com", tz });
    expect(b.meetingUrl).toMatch(/\/meet\/zoom-/);
    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.uid, b.uid)); expect(row.meetingUrl).toBe(b.meetingUrl);
  });
});

describe("paid bookings", () => {
  beforeAll(async () => { await db.update(schema.eventTypes).set({ priceCents: 7500 }).where(eq(schema.eventTypes.id, "demo-30")); });
  it("holds the slot, sends nothing until paid, then confirms once", async () => {
    const before = outbox();
    const b = await B.createBooking({ username: "demo", slug: "30min", start: at("13:00"), name: "Pay Er", email: "payer@example.com", tz });
    expect(b.paymentStatus).toBe("pending"); expect(b.amountCents).toBe(7500); expect(outbox()).toBe(before);
    await expect(B.createBooking({ username: "demo", slug: "30min", start: at("13:00"), name: "X", email: "x@example.com", tz })).rejects.toThrow("slot_unavailable");
    expect(await B.confirmPayment(b.uid, "pi_1")).toEqual({ ok: true });
    expect(await B.confirmPayment(b.uid, "pi_1")).toMatchObject({ already: true });
    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.uid, b.uid));
    expect(row.paymentStatus).toBe("paid"); expect(row.paymentRef).toBe("pi_1"); expect(row.meetingUrl).toMatch(/meet-/); expect(outbox()).toBeGreaterThan(before);
    // reschedule keeps the payment, no new charge
    const r = await B.createBooking({ username: "demo", slug: "30min", start: at("14:00"), name: "Pay Er", email: "payer@example.com", tz, rescheduleUid: b.uid });
    expect(r.paymentStatus).toBe("paid"); expect(r.amountCents).toBe(7500);
  });
  it("expires unpaid holds after 30 minutes", async () => {
    const b = await B.createBooking({ username: "demo", slug: "30min", start: at("15:00"), name: "Slow", email: "slow@example.com", tz });
    expect(await B.expireUnpaid(new Date(Date.now() + 31 * 60_000))).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.uid, b.uid));
    expect(row.status).toBe("cancelled"); expect(row.cancelReason).toBe("payment_expired");
    expect(await B.confirmPayment(b.uid, "pi_late")).toEqual({ error: "expired" });
  });
  it("after: free again", async () => { await db.update(schema.eventTypes).set({ priceCents: 0 }).where(eq(schema.eventTypes.id, "demo-30")); });
});

describe("one-off links", () => {
  it("books once, then the link is dead", async () => {
    const et = await O.createOneOff(A, { title: "", durationMin: 0, fromEventTypeId: "demo-30" });
    expect(et.title).toBe("Quick chat"); expect(et.kind).toBe("one_off");
    expect(await B.loadEvent("demo", et.slug)).not.toBeNull();
    await B.createBooking({ username: "demo", slug: et.slug, start: at("11:00"), name: "Once", email: "once@example.com", tz });
    expect(await B.loadEvent("demo", et.slug)).toBeNull();
  });
});

describe("meeting polls", () => {
  it("collects votes and books the winner with everyone who can make it", async () => {
    const o1 = at("16:00"), o2 = at("16:30");
    const id = await P.createPoll(A, { title: "Planning", durationMin: 30, location: "Google Meet", options: [o1, o2] });
    await P.vote(id, { name: "Ann", email: "ann@example.com", picks: [o1, o2] });
    await P.vote(id, { name: "Bo", email: "bo@example.com", picks: [o2, "2099-01-01T00:00:00.000Z"] });
    await P.vote(id, { name: "Bo", email: "BO@example.com", picks: [o2] }); // re-vote replaces
    const g = await P.getPoll(id); expect(g!.votes).toHaveLength(2); expect(g!.tally.find(t => t.best)!.option).toBe(o2);
    const uid = await P.bookPoll(A, id, o2);
    const bk = await B.getBooking(uid); expect(bk!.booking.guests).toEqual(["bo@example.com"]); expect(bk!.booking.inviteeEmail).toBe("ann@example.com");
    await expect(P.vote(id, { name: "C", email: "c@example.com", picks: [o1] })).rejects.toThrow("closed");
    await expect(P.bookPoll("demo-mate", id, o1)).rejects.toThrow("not_found");
  });
});

describe("AI email-thread booker (heuristic)", () => {
  it("proposes real open slots inside the asked windows and drafts a reply", async () => {
    const host = { username: "demo", name: "Demo Host", email: "demo@calendlyisdead.local", timezone: tz };
    const thread = `From: Jordan Lee <jordan@example.com>\nSubject: Intro\n\nCan we grab 30 min next week? Thursday between 1 and 4pm eastern works.`;
    const r = await R.runAssistant(host, "30min", thread);
    expect(r!.source).toBe("heuristic"); expect(r!.slots.length).toBeGreaterThan(0);
    for (const s of r!.slots) { const d = DateTime.fromISO(s).setZone(tz); expect(d.weekday).toBe(4); expect(d.hour).toBeGreaterThanOrEqual(13); expect(d.hour).toBeLessThan(16); }
    expect(r!.reply).toContain("Hi Jordan"); expect(r!.links[0]).toContain("slot="); expect(r!.links[0]).toContain("email=jordan%40example.com");
  });
});
