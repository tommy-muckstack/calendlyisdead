import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
const auth = vi.hoisted(() => ({ user: { id: "demo-user" } as { id: string } | null }));
vi.mock("../../auth", () => ({ requireUser: async () => auth.user }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema"), polls: typeof import("../../lib/polls");
const future = new Date(Date.now() + 7 * 864e5).toISOString(), later = new Date(Date.now() + 8 * 864e5).toISOString();
const person = { name: "First voter", email: "voter@example.invalid", picks: [future] };
const make = () => polls.createPoll("demo-user", { title: "Participation QA", durationMin: 30, options: [future, later] });
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-poll-participation-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema; polls = await import("../../lib/polls");
});
beforeEach(async () => { auth.user = { id: "demo-user" }; await db.delete(schema.polls); });

describe("poll participation", () => {
  it("does not replace a submitted vote", async () => {
    const id = await make(); await polls.vote(id, person);
    await expect(polls.vote(id, { ...person, name: "Replacement", picks: [later] })).rejects.toThrow("already_voted");
    expect((await polls.getPoll(id))!.votes).toMatchObject([person]);
  });
  it("does not accept votes after every proposed time has passed", async () => {
    const id = await make(), past = new Date(Date.now() - 60_000).toISOString();
    await db.update(schema.polls).set({ options: [past] }).where(eq(schema.polls.id, id));
    await expect(polls.vote(id, { ...person, picks: [past] })).rejects.toThrow("closed");
    expect((await polls.getPoll(id))!.votes).toHaveLength(0);
  });
  it("keeps the fortieth participant limit under competing submissions", async () => {
    const id = await make();
    for (let i = 0; i < 39; i++) await polls.vote(id, { ...person, email: `voter${i}@example.invalid` });
    const result = await Promise.allSettled([polls.vote(id, { ...person, email: "last-a@example.invalid" }), polls.vote(id, { ...person, email: "last-b@example.invalid" })]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await polls.getPoll(id))!.votes).toHaveLength(40);
    await expect(polls.vote(id, { ...person, email: "voter0@example.invalid" })).resolves.toEqual([future]);
  });
  it("retries the same normalized vote without changing its identity or timestamp", async () => {
    const id = await make(); await polls.vote(id, { ...person, name: " First voter ", email: " VOTER@example.invalid ", picks: [later, future, future] });
    const original = (await polls.getPoll(id))!.votes;
    await expect(polls.vote(id, { ...person, picks: [future, later] })).resolves.toEqual([future, later]);
    expect((await polls.getPoll(id))!.votes).toEqual(original);
  });
  it.each([{ name: "   " }, { email: "invalid" }, { picks: [] }, { picks: ["invalid-time"] }])("rejects invalid participation input %j", async changed => {
    const id = await make(); await expect(polls.vote(id, { ...person, ...changed })).rejects.toThrow("invalid"); expect((await polls.getPoll(id))!.votes).toHaveLength(0);
  });
  it("rejects foreign and passed choices without silently submitting different choices", async () => {
    const id = await make(), past = new Date(Date.now() - 60_000).toISOString();
    await expect(polls.vote(id, { ...person, picks: [future, new Date(Date.now() + 9 * 864e5).toISOString()] })).rejects.toThrow("bad_option");
    await db.update(schema.polls).set({ options: [past, future] }).where(eq(schema.polls.id, id));
    await expect(polls.vote(id, { ...person, picks: [past, future] })).rejects.toThrow("bad_option");
    await expect(polls.vote(id, person)).resolves.toEqual([future]);
  });
  it("omits all vote details from public data unless the host enables visibility", async () => {
    const id = await make(); await polls.vote(id, person);
    const hidden = await polls.getPublicPoll(id);
    expect(hidden?.tally).toEqual([{ option: future }, { option: later }]);
    expect(JSON.stringify(hidden)).not.toMatch(/First voter|voter@example|demo@|bookingUid|userId/);
    await polls.setPollVisibility("demo-user", id, true);
    const visible = await polls.getPublicPoll(id);
    expect(visible?.tally[0]).toEqual({ option: future, count: 1, names: [person.name] });
    expect(JSON.stringify(visible)).not.toMatch(/voter@example|demo@|bookingUid|userId/);
    await polls.setPollVisibility("demo-user", id, false);
    expect((await polls.getPublicPoll(id))?.tally).toEqual(hidden?.tally);
    expect((await polls.getPoll(id))?.votes[0].email).toBe(person.email);
  });
  it("honors visibility at creation and denies changes from a different owner", async () => {
    const id = await polls.createPoll("demo-user", { title: "Visible", durationMin: 30, options: [future, later], showVotes: true });
    expect((await polls.getPublicPoll(id))?.tally[0].count).toBe(0);
    await expect(polls.setPollVisibility("demo-mate", id, false)).rejects.toThrow("not_found");
    expect((await polls.getPoll(id))?.poll.showVotes).toBe(true);
  });
  it("derives expiry consistently for public/host pages, voting, visibility and review", async () => {
    const id = await make(), past = new Date(Date.now() - 60_000).toISOString();
    await db.update(schema.polls).set({ options: [past] }).where(eq(schema.polls.id, id));
    expect((await polls.getPoll(id))?.poll.status).toBe("expired"); expect((await polls.getPublicPoll(id))?.poll.status).toBe("expired");
    await expect(polls.setPollVisibility("demo-user", id, true)).rejects.toThrow("closed");
    await expect(polls.reviewPollBooking("demo-user", id, past)).rejects.toThrow("closed");
    await db.update(schema.polls).set({ status: "booked" }).where(eq(schema.polls.id, id));
    expect((await polls.getPublicPoll(id))?.poll.status).toBe("booked");
  });
  it("validates future option counts and deduplicates equivalent times before creation", async () => {
    const input = { title: "Invalid", durationMin: 30, options: [future, later] };
    await expect(polls.createPoll("demo-user", { ...input, options: Array(41).fill(future) })).rejects.toThrow("invalid");
    await expect(polls.createPoll("demo-user", { ...input, options: [future, future] })).rejects.toThrow("invalid_options");
    await expect(polls.createPoll("demo-user", { ...input, options: [new Date(0).toISOString(), future] })).rejects.toThrow("invalid_options");
    expect(await db.select().from(schema.polls)).toHaveLength(0);
  });
  it("exposes bounded API errors and requires the owner for visibility updates", async () => {
    const id = await make(), params = { params: Promise.resolve({ id }) };
    const voting = await import("../../app/api/polls/[id]/vote/route"), visibility = await import("../../app/api/polls/[id]/route");
    const request = (value: unknown, method = "POST") => new NextRequest("http://localhost/api/polls/qa", { method, body: JSON.stringify(value) });
    auth.user = null; expect((await visibility.PATCH(request({ showVotes: true }, "PATCH"), params)).status).toBe(401);
    expect((await voting.POST(request(person), params)).status).toBe(200);
    const repeat = await voting.POST(request({ ...person, picks: [later] }), params); expect(repeat.status).toBe(409); expect(await repeat.json()).toEqual({ error: "already_voted" });
    const malformed = new NextRequest("http://localhost/api/polls/qa", { method: "POST", body: "{" }); expect((await voting.POST(malformed, params)).status).toBe(400);
    auth.user = { id: "demo-mate" }; expect((await visibility.PATCH(request({ showVotes: true }, "PATCH"), params)).status).toBe(404);
    auth.user = { id: "demo-user" }; expect((await visibility.PATCH(request({ showVotes: true, userId: "demo-mate" }, "PATCH"), params)).status).toBe(400);
    expect((await visibility.PATCH(request({ showVotes: true }, "PATCH"), params)).status).toBe(200);
    const fail = vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("private database detail"));
    const error = await voting.POST(request({ ...person, email: "new@example.invalid" }), params); fail.mockRestore();
    expect(error.status).toBe(503); expect(await error.json()).toEqual({ error: "unavailable" });
  });
  it("migrates existing polls without exposing votes and preserves saved visibility on replay", async () => {
    const { PGlite } = await import("@electric-sql/pglite"), legacy = new PGlite();
    try {
      await legacy.exec("CREATE TABLE polls (id text PRIMARY KEY); INSERT INTO polls VALUES ('legacy');");
      const migration = fs.readFileSync("lib/db/ddl.sql", "utf8").match(/ALTER TABLE polls ADD COLUMN IF NOT EXISTS "showVotes"[^;]+;/)![0];
      await legacy.exec(migration); expect((await legacy.query('SELECT "showVotes" FROM polls')).rows).toEqual([{ showVotes: false }]);
      await legacy.exec('UPDATE polls SET "showVotes" = true'); await legacy.exec(migration);
      expect((await legacy.query('SELECT "showVotes" FROM polls')).rows).toEqual([{ showVotes: true }]);
    } finally { await legacy.close(); }
  });
});
