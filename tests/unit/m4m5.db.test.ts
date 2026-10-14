import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cid-"));
process.env.PGLITE_DIR = path.join(tmp, "db");
let db: any, schema: any, B: typeof import("../../lib/booking"), T: typeof import("../../lib/teams"), W: typeof import("../../lib/workflows");
const A = "demo-user", M = "demo-mate", tz = "America/New_York";
// next Tuesday (always > 4h notice, inside 60-day range)
const tue = DateTime.now().setZone(tz).plus({ weeks: 1 }).set({ weekday: 2 }).toISODate()!;
const at = (hhmm: string, d = tue) => DateTime.fromISO(`${d}T${hhmm}`, { zone: tz }).toUTC().toISO()!;
const book = (owner: string, slug: string, start: string, extra: any = {}) => B.createBooking({ username: owner, slug, start, name: "Ivy Invitee", email: `ivy${Math.random().toString(36).slice(2, 6)}@example.com`, tz, ...extra });

beforeAll(async () => {
  ({ getDb: undefined } as any);
  const m = await import("../../lib/db"); db = await m.getDb(); schema = m.schema;
  B = await import("../../lib/booking"); T = await import("../../lib/teams"); W = await import("../../lib/workflows");
});

describe("teams, invites and team event types", () => {
  let teamId = "", rr: any, coll: any;
  it("invites: wrong account rejected, right one accepted, link single-use", async () => {
    teamId = await T.createTeam(A, "Acme Sales", "acme");
    const inv = await T.invite(teamId, "sam@calendlyisdead.local", "member", { id: A, name: "Demo Host" });
    expect(await T.acceptInvite(inv.token, { id: A, email: "demo@calendlyisdead.local" })).toMatchObject({ error: "wrong_account" });
    expect(await T.acceptInvite(inv.token, { id: M, email: "SAM@calendlyisdead.local" })).toEqual({ teamId });
    expect(await T.acceptInvite(inv.token, { id: M, email: "sam@calendlyisdead.local" })).toMatchObject({ error: "invalid_or_expired" });
    expect(await T.role(M, teamId)).toBe("member");
  });
  it("collective: only times when every host is free; one booking blocks both", async () => {
    [coll] = await db.insert(schema.eventTypes).values({ id: "coll", userId: A, teamId, slug: "together", title: "Together", kind: "collective", durationMin: 30, minNoticeMin: 0 }).returning();
    await T.setHosts("coll", [{ userId: A, priority: 2 }, { userId: M, priority: 2 }]);
    const s = (await B.availability("team:acme", "together", tue, tue, tz))!.slots[tue];
    // host A 9-5 ET, Sam 9-5 CT (10-6 ET) => 10:00 to 16:30 ET
    expect(s[0]).toBe(at("10:00")); expect(s[s.length - 1]).toBe(at("16:30"));
    const b = await book("team:acme", "together", at("10:00"));
    const rows = await db.select().from(schema.bookings).where(eq(schema.bookings.groupUid, b.uid));
    expect(rows.map((r: any) => r.hostId).sort()).toEqual([M, A].sort());
    const a1 = (await B.availability("demo", "30min", tue, tue, tz))!.slots[tue];
    expect(a1).not.toContain(at("10:00"));
    await B.cancelBooking(b.uid, "test");
    expect((await db.select().from(schema.bookings).where(eq(schema.bookings.groupUid, b.uid))).every((r: any) => r.status === "cancelled")).toBe(true);
  });
  it("round robin, even: alternates between equally loaded hosts", async () => {
    [rr] = await db.insert(schema.eventTypes).values({ id: "rr", userId: A, teamId, slug: "intro", title: "Intro", kind: "round_robin", durationMin: 30, minNoticeMin: 0 }).returning();
    await T.setHosts("rr", [{ userId: A, priority: 2 }, { userId: M, priority: 2 }]);
    const hosts = [];
    for (const t of ["11:00", "11:30", "13:00", "13:30"]) hosts.push((await book("team:acme", "intro", at(t))).hostId);
    expect(hosts.filter(h => h === A).length).toBe(2); expect(hosts.filter(h => h === M).length).toBe(2);
  });
  it("round robin, priority: the high-priority host wins even with more bookings", async () => {
    await db.update(schema.eventTypes).set({ rrMode: "priority" }).where(eq(schema.eventTypes.id, "rr"));
    await T.setHosts("rr", [{ userId: A, priority: 2 }, { userId: M, priority: 3 }]);
    expect((await book("team:acme", "intro", at("14:00"))).hostId).toBe(M);
    expect((await book("team:acme", "intro", at("14:30"))).hostId).toBe(M);
  });
  it("round robin only offers a time if someone is free, and books whoever is", async () => {
    // Sam is busy at 15:00 (personal booking); A must get it
    await db.insert(schema.eventTypes).values({ id: "sam30", userId: M, slug: "30min", title: "Sam 30", durationMin: 30, minNoticeMin: 0 });
    await book("sam", "30min", at("15:00"));
    expect((await book("team:acme", "intro", at("15:00"))).hostId).toBe(A);
  });
  it("managed event types: copies, locked fields, propagation, unassign", async () => {
    const [tpl] = await db.insert(schema.eventTypes).values({ id: "tpl", userId: A, teamId, slug: "demo-call", title: "Product demo", kind: "managed", durationMin: 45, lockedFields: ["title", "durationMin"] }).returning();
    expect(await T.assignManaged(tpl.id, [A, M, "not-a-member"], teamId)).toBe(2);
    const kids = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.managedParentId, "tpl"));
    expect(kids).toHaveLength(2); expect(kids.every((k: any) => k.durationMin === 45 && k.kind === "one_on_one")).toBe(true);
    await db.update(schema.eventTypes).set({ title: "Product tour", durationMin: 60, location: "Zoom" }).where(eq(schema.eventTypes.id, "tpl"));
    expect(await T.propagateManaged("tpl")).toBe(2);
    const k2 = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.managedParentId, "tpl"));
    expect(k2.every((k: any) => k.title === "Product tour" && k.durationMin === 60 && k.location === "")).toBe(true); // location not locked
    expect((await B.availability("sam", "demo-call", tue, tue, tz))!.slots[tue]?.length).toBeGreaterThan(0);
    expect(await B.loadEvent("team:acme", "demo-call")).toBeNull(); // the template itself isn't bookable
    await T.assignManaged("tpl", [A], teamId);
    expect(await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.managedParentId, "tpl"))).toHaveLength(1);
  });
});

describe("group events with seats", () => {
  it("fills seats, then closes the time; the host is busy for other types", async () => {
    await db.insert(schema.eventTypes).values({ id: "grp", userId: A, slug: "workshop", title: "Workshop", kind: "group", seats: 2, durationMin: 60, minNoticeMin: 0 });
    const t = at("09:00", DateTime.fromISO(tue).plus({ days: 1 }).toISODate()!);
    const d = DateTime.fromISO(tue).plus({ days: 1 }).toISODate()!;
    const b1 = await book("demo", "workshop", t); const b2 = await book("demo", "workshop", t);
    expect([b1.seat, b2.seat].sort()).toEqual([0, 1]);
    await expect(book("demo", "workshop", t)).rejects.toThrow("slot_unavailable");
    expect((await B.availability("demo", "workshop", d, d, tz))!.slots[d]).not.toContain(t);
    expect((await B.availability("demo", "30min", d, d, tz))!.slots[d]).not.toContain(t);
    await B.cancelBooking(b1.uid, "x");
    expect((await B.availability("demo", "workshop", d, d, tz))!.slots[d]).toContain(t);
  });
});

describe("workflows", () => {
  const outbox = () => path.join(process.cwd(), ".data/outbox");
  const smsbox = () => path.join(tmp, "sms-outbox");
  it("schedules reminders, sends when due, cancels on cancel, fires on_booked and on_cancelled", async () => {
    await db.insert(schema.workflows).values([
      { id: "w-before", userId: A, name: "1h before", trigger: "before_start", offsetMin: 60, channel: "email", recipient: "invitee", subject: "Soon: {{event.name}}", body: "Hi {{invitee.first_name}} see you at {{event.time}}", eventTypeIds: ["demo-60"] },
      { id: "w-now", userId: A, name: "on booked host", trigger: "on_booked", channel: "email", recipient: "host", subject: "New: {{invitee.name}}", body: "{{answers.co}}", eventTypeIds: ["demo-60"] },
      { id: "w-sms", userId: A, name: "sms", trigger: "before_start", offsetMin: 30, channel: "sms", recipient: "invitee", body: "{{event.name}} in 30 min", eventTypeIds: ["demo-60"] },
      { id: "w-cancel", userId: A, name: "cancelled", trigger: "on_cancelled", channel: "email", recipient: "invitee", subject: "Cancelled", body: "Sorry {{invitee.first_name}}", eventTypeIds: ["demo-60"] } ]);
    await db.update(schema.eventTypes).set({ questions: [{ id: "ph", label: "Phone", type: "phone", required: false }], minNoticeMin: 0 }).where(eq(schema.eventTypes.id, "demo-60"));
    const thu = DateTime.fromISO(tue).plus({ days: 2 }).toISODate()!;
    const b = await book("demo", "deep-dive", at("10:00", thu), { answers: { ph: "+1 555 0100" } });
    const msgs = await db.select().from(schema.scheduledMessages).where(eq(schema.scheduledMessages.bookingUid, b.uid));
    expect(msgs.find((m: any) => m.workflowId === "w-now").status).toBe("sent");
    const before = msgs.find((m: any) => m.workflowId === "w-before");
    expect(before.status).toBe("pending"); expect(+before.sendAt).toBe(+new Date(at("09:00", thu)));
    const r = await W.processDue(new Date(at("09:45", thu)));
    expect(r.sent).toBe(2);
    const sms = fs.readdirSync(smsbox()).map(f => JSON.parse(fs.readFileSync(path.join(smsbox(), f), "utf8")));
    expect(sms.some(s => s.to === "+1 555 0100" && s.body === "Deep dive in 30 min")).toBe(true);
    // a second booking, cancelled before its reminder: reminder cancelled, cancellation notice sent
    const b2 = await book("demo", "deep-dive", at("13:00", thu));
    await B.cancelBooking(b2.uid, "x");
    const m2 = await db.select().from(schema.scheduledMessages).where(eq(schema.scheduledMessages.bookingUid, b2.uid));
    expect(m2.find((m: any) => m.workflowId === "w-before").status).toBe("cancelled");
    expect(m2.find((m: any) => m.workflowId === "w-cancel").status).toBe("sent");
    expect(m2.find((m: any) => m.workflowId === "w-sms").status).toBe("cancelled");
    const mails = fs.readdirSync(outbox()).map(f => JSON.parse(fs.readFileSync(path.join(outbox(), f), "utf8")));
    expect(mails.some(m => m.subject === "Soon: Deep dive" && m.text.startsWith("Hi Ivy"))).toBe(true);
  });
  it("text reminders without a phone number are skipped, not failed", async () => {
    const fri = DateTime.fromISO(tue).plus({ days: 3 }).toISODate()!;
    const b = await book("demo", "deep-dive", at("10:00", fri));
    await W.processDue(new Date(at("09:45", fri)));
    const [m] = await db.select().from(schema.scheduledMessages).where(eq(schema.scheduledMessages.bookingUid, b.uid)).then((x: any[]) => x.filter(y => y.workflowId === "w-sms"));
    expect(m.status).toBe("skipped");
  });
});
