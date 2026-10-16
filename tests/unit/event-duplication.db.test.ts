import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string; username?: string } | null));
vi.mock("@/auth", () => ({ requireUser: auth }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema");
let duplicate: typeof import("../../app/api/event-types/[id]/duplicate/route").POST;
const copy = (id = "source") => duplicate(new NextRequest(`http://localhost/api/event-types/${id}/duplicate`, { method: "POST" }), { params: Promise.resolve({ id }) });
const settings = { description: "Bring a question", durationMin: 45, location: "Room A", color: "#123456", scheduleId: "demo-schedule",
  bufferBeforeMin: 15, bufferAfterMin: 20, minNoticeMin: 60, rangeDays: 45, maxPerDay: 3, maxPerWeek: 8, active: true,
  questions: [{ id: "topic", label: "Topic", type: "text" as const, required: true }],
  priceCents: 1200, currency: "usd", redirectUrl: "https://example.invalid/thanks" };

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-event-copy-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  duplicate = (await import("../../app/api/event-types/[id]/duplicate/route")).POST;
  await db.insert(schema.teams).values({ id: "copy-team", slug: "copy-team", name: "Test team" });
  await db.insert(schema.teamMembers).values([
    { userId: "demo-user", teamId: "copy-team", role: "owner" }, { userId: "demo-mate", teamId: "copy-team", role: "member" },
  ]);
});
beforeEach(async () => {
  await db.delete(schema.bookings); await db.delete(schema.eventTypeHosts); await db.delete(schema.eventTypes);
  await db.insert(schema.eventTypes).values({ ...settings, id: "source", userId: "demo-user", slug: "my-meeting", title: "My meeting" });
  auth.mockResolvedValue({ id: "demo-user" });
  await db.update(schema.teamMembers).set({ role: "member" }).where(eq(schema.teamMembers.userId, "demo-mate"));
});

describe("event type duplication", () => {
  it("copies all template settings without changing the source", async () => {
    const response = await copy(); expect(response.status).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject({ ...settings, slug: "my-meeting-copy", title: "My meeting (copy)",
      kind: "one_on_one", userId: "demo-user", managedParentId: null, deletedAt: null, usedAt: null, groupSettingsLocked: false });
    expect(created.id).not.toBe("source");
    await db.update(schema.eventTypes).set({ title: "Independent copy", questions: [] }).where(eq(schema.eventTypes.id, created.id));
    const [source] = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "source"));
    expect(source).toMatchObject({ title: "My meeting", questions: settings.questions });
  });
  it("duplicates a booked group with editable settings and no copied attendees", async () => {
    await db.update(schema.eventTypes).set({ kind: "group", seats: 5 }).where(eq(schema.eventTypes.id, "source"));
    await db.insert(schema.bookings).values({ uid: "attendee", eventTypeId: "source", hostId: "demo-user", start: new Date("2030-01-01T10:00:00Z"),
      end: new Date("2030-01-01T10:45:00Z"), inviteeName: "Test", inviteeEmail: "test@example.invalid", inviteeTz: "UTC", inviteeLimit: 5 });
    const created = await (await copy()).json();
    expect(created).toMatchObject({ kind: "group", seats: 5, groupSettingsLocked: false });
    const { PATCH } = await import("../../app/api/event-types/[id]/route");
    const response = await PATCH(new NextRequest("http://localhost", { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ durationMin: 60, location: "Room B" }) }), { params: Promise.resolve({ id: created.id }) });
    expect(response.status).toBe(200);
    expect(await db.select().from(schema.bookings)).toHaveLength(1);
    expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "source")))[0].durationMin).toBe(45);
  });
  it("preserves an inactive template's state", async () => {
    await db.update(schema.eventTypes).set({ active: false }).where(eq(schema.eventTypes.id, "source"));
    expect(await (await copy()).json()).toMatchObject({ active: false });
  });
  it("creates unique, valid links for concurrent copies of a maximum-length slug", async () => {
    await db.update(schema.eventTypes).set({ slug: "a".repeat(60), title: "T".repeat(120) }).where(eq(schema.eventTypes.id, "source"));
    const responses = await Promise.all([copy(), copy(), copy()]);
    expect(responses.map(r => r.status)).toEqual([201, 201, 201]);
    const copies = await Promise.all(responses.map(r => r.json()));
    expect(new Set(copies.map(e => e.slug)).size).toBe(3);
    for (const e of copies) { expect(e.slug).toMatch(/^[a-z0-9-]{1,60}$/); expect(e.title.length).toBeLessThanOrEqual(120); }
  });
  it("requires ownership and rejects missing/deleted templates", async () => {
    auth.mockResolvedValue(null); expect((await copy()).status).toBe(401);
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await copy()).status).toBe(404);
    auth.mockResolvedValue({ id: "demo-user" }); expect((await copy("missing")).status).toBe(404);
    await db.update(schema.eventTypes).set({ deletedAt: new Date(), active: false }).where(eq(schema.eventTypes.id, "source"));
    expect((await copy()).status).toBe(404); expect(await db.select().from(schema.eventTypes)).toHaveLength(1);
  });
  it.each(["one_off", "poll"])("does not clone the separate %s lifecycle", async kind => {
    await db.update(schema.eventTypes).set({ kind }).where(eq(schema.eventTypes.id, "source"));
    expect((await copy()).status).toBe(400);
  });
  it.each(["collective", "round_robin"])("copies %s hosts and priorities for team admins only", async kind => {
    await db.update(schema.eventTypes).set({ kind, teamId: "copy-team", rrMode: "priority" }).where(eq(schema.eventTypes.id, "source"));
    await db.insert(schema.eventTypeHosts).values([
      { eventTypeId: "source", userId: "demo-user", priority: 3 }, { eventTypeId: "source", userId: "demo-mate", priority: 1 },
    ]);
    auth.mockResolvedValue({ id: "demo-mate" }); expect((await copy()).status).toBe(404);
    await db.update(schema.teamMembers).set({ role: "admin" }).where(eq(schema.teamMembers.userId, "demo-mate"));
    const response = await copy(); expect(response.status).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject({ kind, teamId: "copy-team", rrMode: "priority" });
    expect(await db.select().from(schema.eventTypeHosts).where(eq(schema.eventTypeHosts.eventTypeId, created.id))).toEqual([
      { eventTypeId: created.id, userId: "demo-user", priority: 3 }, { eventTypeId: created.id, userId: "demo-mate", priority: 1 },
    ]);
  });
  it("copies managed template locks without assigning the new template", async () => {
    await db.update(schema.eventTypes).set({ kind: "managed", teamId: "copy-team", lockedFields: ["durationMin", "location"] }).where(eq(schema.eventTypes.id, "source"));
    const created = await (await copy()).json();
    expect(created).toMatchObject({ kind: "managed", lockedFields: ["durationMin", "location"] });
    expect(await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.managedParentId, created.id))).toHaveLength(0);
    const { PATCH } = await import("../../app/api/event-types/[id]/route");
    const response = await PATCH(new NextRequest("http://localhost", { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ durationMin: 60, location: "Changed copy" }) }), { params: Promise.resolve({ id: created.id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ durationMin: 60, location: "Changed copy", lockedFields: ["durationMin", "location"] });
    expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "source")))[0].durationMin).toBe(45);
  });
  it("makes an owned assigned copy independent without modifying its managed source", async () => {
    await db.update(schema.eventTypes).set({ managedParentId: "template", lockedFields: ["durationMin"] }).where(eq(schema.eventTypes.id, "source"));
    expect(await (await copy()).json()).toMatchObject({ managedParentId: null, lockedFields: [] });
    expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "source")))[0]).toMatchObject({ managedParentId: "template", lockedFields: ["durationMin"] });
  });
  it("rolls back the new event if copying hosts fails", async () => {
    await db.update(schema.eventTypes).set({ kind: "collective", teamId: "copy-team" }).where(eq(schema.eventTypes.id, "source"));
    await db.insert(schema.eventTypeHosts).values({ eventTypeId: "source", userId: "demo-user", priority: 3 });
    await db.execute(sql`CREATE FUNCTION fail_copied_host() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test host insertion failure'; END $$`);
    await db.execute(sql`CREATE TRIGGER fail_copied_host BEFORE INSERT ON event_type_hosts FOR EACH ROW EXECUTE FUNCTION fail_copied_host()`);
    try {
      expect((await copy()).status).toBe(500);
      expect(await db.select().from(schema.eventTypes)).toHaveLength(1);
      expect(await db.select().from(schema.eventTypeHosts)).toEqual([{ eventTypeId: "source", userId: "demo-user", priority: 3 }]);
    } finally {
      await db.execute(sql`DROP TRIGGER fail_copied_host ON event_type_hosts`);
      await db.execute(sql`DROP FUNCTION fail_copied_host()`);
    }
    expect((await copy()).status).toBe(201);
  });
  it("retains the previous host set when a replacement fails", async () => {
    const { setHosts } = await import("../../lib/teams");
    await db.insert(schema.eventTypeHosts).values({ eventTypeId: "source", userId: "demo-user", priority: 3 });
    await expect(setHosts("source", [{ userId: "missing-user", priority: 1 }])).rejects.toThrow();
    expect(await db.select().from(schema.eventTypeHosts)).toEqual([{ eventTypeId: "source", userId: "demo-user", priority: 3 }]);
    await setHosts("source", [{ userId: "demo-mate", priority: 1 }]);
    await db.update(schema.eventTypes).set({ kind: "round_robin", teamId: "copy-team" }).where(eq(schema.eventTypes.id, "source"));
    const created = await (await copy()).json();
    expect(await db.select().from(schema.eventTypeHosts).where(eq(schema.eventTypeHosts.eventTypeId, created.id)))
      .toEqual([{ eventTypeId: created.id, userId: "demo-mate", priority: 1 }]);
  });
  it("opens the requested owned embed, including turned-off events, and excludes inaccessible or deleted types", async () => {
    auth.mockResolvedValue({ id: "demo-user", username: "demo" });
    await db.update(schema.eventTypes).set({ active: false }).where(eq(schema.eventTypes.id, "source"));
    await db.insert(schema.eventTypes).values([
      { id: "foreign", userId: "demo-mate", slug: "foreign", title: "Foreign" },
      { id: "deleted", userId: "demo-user", slug: "deleted", title: "Deleted", deletedAt: new Date() },
      { id: "team", userId: "demo-user", slug: "team", title: "Team", teamId: "copy-team", kind: "collective" },
    ]);
    const Page = (await import("../../app/app/embed/page")).default;
    const selected = await Page({ searchParams: Promise.resolve({ event: "my-meeting" }) });
    expect(selected.props.initialSlug).toBe("my-meeting");
    expect(selected.props.types).toEqual([{ slug: "my-meeting", title: "My meeting", active: false }]);
    for (const event of ["foreign", "deleted", "team", "missing"]) {
      expect((await Page({ searchParams: Promise.resolve({ event }) })).props.initialSlug).toBeUndefined();
    }
  });
});
