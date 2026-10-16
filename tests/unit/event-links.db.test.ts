import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
vi.mock("@/auth", () => ({ requireUser: auth }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema");
let patch: typeof import("../../app/api/event-types/[id]/route").PATCH;
let teamCreate: typeof import("../../app/api/teams/[id]/event-types/route").POST;
const rename = (id: string, slug: string) => patch(new NextRequest("http://localhost", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) }), { params: Promise.resolve({ id }) });
const create = (title = "Team meeting", teamId = "links-a") => teamCreate(new NextRequest("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, kind: "collective" }) }), { params: Promise.resolve({ id: teamId }) });
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-event-links-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  patch = (await import("../../app/api/event-types/[id]/route")).PATCH;
  teamCreate = (await import("../../app/api/teams/[id]/event-types/route")).POST;
  await db.insert(schema.teams).values([{ id: "links-a", slug: "links-a", name: "A" }, { id: "links-b", slug: "links-b", name: "B" }]);
  await db.insert(schema.teamMembers).values(["links-a", "links-b"].flatMap(teamId => [
    { teamId, userId: "demo-user", role: "owner" }, { teamId, userId: "demo-mate", role: "admin" },
  ]));
});
beforeEach(async () => {
  await db.delete(schema.bookings); await db.delete(schema.eventTypeHosts); await db.delete(schema.eventTypes);
  auth.mockResolvedValue({ id: "demo-user" });
});

describe("event booking-link namespaces", () => {
  it("rejects a team rename to another creator's current URL without modifying either event", async () => {
    await db.insert(schema.eventTypes).values([
      { id: "a", userId: "demo-user", teamId: "links-a", slug: "first", title: "First" },
      { id: "b", userId: "demo-mate", teamId: "links-a", slug: "second", title: "Second" },
    ]);
    const response = await rename("a", "second"); expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "slug_taken" });
    expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "a")))[0].slug).toBe("first");
  });
  it("enforces the same-team invariant even for direct writes by different creators", async () => {
    await db.insert(schema.eventTypes).values({ id: "a", userId: "demo-user", teamId: "links-a", slug: "shared", title: "A" });
    await expect(db.insert(schema.eventTypes).values({ id: "b", userId: "demo-mate", teamId: "links-a", slug: "shared", title: "B" })).rejects.toThrow();
  });
  it("allows personal and distinct team URLs to use the same slug and resolves each correct event", async () => {
    // Insert team first to catch a personal loader that takes the first owner/slug row.
    await db.insert(schema.eventTypes).values([
      { id: "team-a", userId: "demo-user", teamId: "links-a", slug: "shared", title: "Team A", kind: "collective" },
      { id: "team-b", userId: "demo-user", teamId: "links-b", slug: "shared", title: "Team B", kind: "collective" },
      { id: "personal", userId: "demo-user", slug: "shared", title: "Personal" },
      { id: "other-personal", userId: "demo-mate", slug: "shared", title: "Other personal" },
    ]);
    await db.insert(schema.eventTypeHosts).values(["team-a", "team-b"].map(eventTypeId => ({ eventTypeId, userId: "demo-user" })));
    const { loadEvent } = await import("../../lib/booking");
    for (const [owner, id] of [["demo", "personal"], ["sam", "other-personal"], ["team:links-a", "team-a"], ["team:links-b", "team-b"]]) {
      expect((await loadEvent(owner, "shared"))?.eventType.id).toBe(id);
    }
  });
  it("creates a team event when its creator has that slug on their personal page", async () => {
    await db.insert(schema.eventTypes).values({ id: "personal", userId: "demo-user", slug: "team-meeting", title: "Personal" });
    const response = await create(); expect(response.status).toBe(200);
    const event = await response.json(); expect(event.slug).toBe("team-meeting");
    expect(await db.select().from(schema.eventTypeHosts).where(eq(schema.eventTypeHosts.eventTypeId, event.id))).toHaveLength(2);
  });
  it("allocates distinct links for concurrent team creates", async () => {
    const responses = await Promise.all([create(), create(), create()]);
    expect(responses.map(r => r.status)).toEqual([200, 200, 200]);
    const events = await Promise.all(responses.map(r => r.json()));
    expect(events.map(e => e.slug).sort()).toEqual(["team-meeting", "team-meeting-2", "team-meeting-3"]);
    for (const event of events) expect(await db.select().from(schema.eventTypeHosts).where(eq(schema.eventTypeHosts.eventTypeId, event.id))).toHaveLength(2);
  });
  it("bounds generated slugs including collision suffixes for long titles", async () => {
    const responses = await Promise.all([create("A".repeat(120)), create("A".repeat(120))]);
    for (const response of responses) {
      const event = await response.json(); expect(event.slug).toMatch(/^[a-z0-9-]{1,60}$/);
      expect((await rename(event.id, event.slug)).status).toBe(200);
    }
    expect((await (await create("!!!")).json()).slug).toBe("meeting");
  });
  it("personal create and duplicate ignore unrelated team links", async () => {
    await db.insert(schema.eventTypes).values([
      { id: "team", userId: "demo-user", teamId: "links-a", slug: "new-meeting", title: "Team" },
      { id: "team-copy", userId: "demo-user", teamId: "links-a", slug: "new-meeting-copy", title: "Team copy" },
    ]);
    const { POST } = await import("../../app/api/event-types/route");
    const event = await (await POST()).json(); expect(event.slug).toBe("new-meeting");
    const duplicate = (await import("../../app/api/event-types/[id]/duplicate/route")).POST;
    const copy = await duplicate(new NextRequest("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: event.id }) });
    expect((await copy.json()).slug).toBe("new-meeting-copy");
  });
  it("managed assignment uses the recipient's personal namespace and safely resolves collisions", async () => {
    await db.insert(schema.eventTypes).values([
      { id: "template", userId: "demo-user", teamId: "links-a", slug: "managed", title: "Managed", kind: "managed" },
      { id: "personal", userId: "demo-mate", slug: "managed", title: "Personal" },
    ]);
    const { assignManaged } = await import("../../lib/teams");
    await assignManaged("template", ["demo-user", "demo-mate", "demo-user"], "links-a");
    const copies = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.managedParentId, "template"));
    expect(copies).toHaveLength(2);
    expect(copies.find((e: { userId: string }) => e.userId === "demo-user").slug).toBe("managed");
    expect(copies.find((e: { userId: string }) => e.userId === "demo-mate").slug).toBe("managed-2");
  });
  it("keeps inactive URLs reserved and allows deleted team URLs to be reused", async () => {
    await db.insert(schema.eventTypes).values([
      { id: "off", userId: "demo-mate", teamId: "links-a", slug: "team-meeting", title: "Off", active: false },
      { id: "deleted", userId: "demo-mate", teamId: "links-a", slug: "team-meeting-2", title: "Deleted", deletedAt: new Date() },
    ]);
    const event = await (await create()).json(); expect(event.slug).toBe("team-meeting-2");
    expect((await rename(event.id, "team-meeting")).status).toBe(409);
    expect(await db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.teamId, "links-a"), isNull(schema.eventTypes.deletedAt)))).toHaveLength(2);
  });
  it("arbitrates concurrent team renames by different creators", async () => {
    await db.insert(schema.eventTypes).values([
      { id: "a", userId: "demo-user", teamId: "links-a", slug: "first", title: "First" },
      { id: "b", userId: "demo-mate", teamId: "links-a", slug: "second", title: "Second" },
    ]);
    const responses = await Promise.all([rename("a", "wanted"), rename("b", "wanted")]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(await db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.teamId, "links-a"), eq(schema.eventTypes.slug, "wanted")))).toHaveLength(1);
  });
  it("allocates distinct links for concurrent personal creates", async () => {
    const { POST } = await import("../../app/api/event-types/route");
    const responses = await Promise.all([POST(), POST(), POST()]);
    expect(responses.map(r => r.status)).toEqual([200, 200, 200]);
    expect((await Promise.all(responses.map(r => r.json()))).map(e => e.slug).sort()).toEqual(["new-meeting", "new-meeting-2", "new-meeting-3"]);
  });
  it("team duplication checks all team creators and ignores unrelated personal URLs", async () => {
    await db.insert(schema.eventTypes).values([
      { id: "source", userId: "demo-user", teamId: "links-a", kind: "collective", slug: "source", title: "Source" },
      { id: "taken", userId: "demo-mate", teamId: "links-a", slug: "source-copy", title: "Taken" },
      { id: "personal", userId: "demo-user", slug: "source-copy-2", title: "Personal" },
    ]);
    await db.insert(schema.eventTypeHosts).values({ eventTypeId: "source", userId: "demo-user", priority: 2 });
    const duplicate = (await import("../../app/api/event-types/[id]/duplicate/route")).POST;
    const response = await duplicate(new NextRequest("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "source" }) });
    expect(response.status).toBe(201); expect((await response.json()).slug).toBe("source-copy-2");
  });
  it("does not leave a team type or consumed slug behind if assigning its hosts fails", async () => {
    await db.execute(sql`CREATE FUNCTION fail_initial_hosts() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$`);
    await db.execute(sql`CREATE TRIGGER fail_initial_hosts BEFORE INSERT ON event_type_hosts FOR EACH ROW EXECUTE FUNCTION fail_initial_hosts()`);
    try {
      expect((await create()).status).toBe(500);
      expect(await db.select().from(schema.eventTypes)).toHaveLength(0);
      expect(await db.select().from(schema.eventTypeHosts)).toHaveLength(0);
    } finally {
      await db.execute(sql`DROP TRIGGER fail_initial_hosts ON event_type_hosts`);
      await db.execute(sql`DROP FUNCTION fail_initial_hosts()`);
    }
    expect((await (await create()).json()).slug).toBe("team-meeting");
  });
  it("reports unrelated save failures without falsely claiming the URL is taken", async () => {
    await db.insert(schema.eventTypes).values({ id: "source", userId: "demo-user", teamId: "links-a", slug: "source", title: "Source" });
    await db.execute(sql`CREATE FUNCTION fail_link_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private database detail'; END $$`);
    await db.execute(sql`CREATE TRIGGER fail_link_update BEFORE UPDATE ON event_types FOR EACH ROW EXECUTE FUNCTION fail_link_update()`);
    try {
      const response = await rename("source", "available"); expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "save_failed" });
      expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "source")))[0].slug).toBe("source");
    } finally {
      await db.execute(sql`DROP TRIGGER fail_link_update ON event_types`);
      await db.execute(sql`DROP FUNCTION fail_link_update()`);
    }
  });
});
