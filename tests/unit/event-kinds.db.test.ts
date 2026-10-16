import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
vi.mock("@/auth", () => ({ requireUser: auth }));
vi.mock("../../lib/calendars", () => ({ externalBusy: async () => ({ busy: [], errors: [] }), writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: async () => {} }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema");
let create: typeof import("../../app/api/event-types/route").POST;
let patch: typeof import("../../app/api/event-types/[id]/route").PATCH;
const post = (input: unknown) => create(new Request("http://localhost", { method: "POST", body: JSON.stringify(input) }));
const edit = (id: string, body: unknown) => patch(new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const byId = async (id: string) => (await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, id)))[0];

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-event-kinds-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  create = (await import("../../app/api/event-types/route")).POST;
  patch = (await import("../../app/api/event-types/[id]/route")).PATCH;
  await db.insert(schema.teams).values({ id: "kinds-team", slug: "kinds-team", name: "Kinds team" });
  await db.insert(schema.teamMembers).values({ teamId: "kinds-team", userId: "demo-user", role: "owner" });
});
beforeEach(async () => {
  await db.delete(schema.bookings); await db.delete(schema.eventTypes);
  auth.mockResolvedValue({ id: "demo-user" });
});

describe("event kind is chosen when creating a template", () => {
  it("keeps the legacy empty POST as a personal one-on-one", async () => {
    const response = await create(); expect(response.status).toBe(200);
    const event = await response.json();
    expect(event).toMatchObject({ kind: "one_on_one", seats: 1, userId: "demo-user", teamId: null, title: "New meeting", slug: "new-meeting" });
    expect(await byId(event.id)).toMatchObject({ kind: "one_on_one", seats: 1 });
  });
  it.each(["one_on_one", "group"])("creates %s with the current owner's default schedule and valid capacity", async kind => {
    const response = await post({ kind }); expect(response.status).toBe(200);
    const event = await response.json();
    const [schedule] = await db.select().from(schema.schedules).where(and(eq(schema.schedules.userId, "demo-user"), eq(schema.schedules.isDefault, true)));
    expect(event).toMatchObject({ kind, scheduleId: schedule.id, seats: kind === "group" ? 2 : 1, userId: "demo-user", teamId: null });
  });
  it("does not borrow a different user's default schedule", async () => {
    await db.insert(schema.users).values({ id: "no-schedule-host", email: "no-schedule@example.invalid", username: "no-schedule" });
    auth.mockResolvedValue({ id: "no-schedule-host" });
    const response = await post({ kind: "group" }); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ userId: "no-schedule-host", scheduleId: null, kind: "group" });
  });
  it.each([{ kind: "collective" }, { kind: "round_robin" }, { kind: "managed" }, { kind: "poll" }, { kind: "unknown" }, { kind: "group", userId: "demo-mate" }, null, []])("rejects invalid or authority-changing creation input %j", async input => {
    expect((await post(input)).status).toBe(400); expect(await db.select().from(schema.eventTypes)).toHaveLength(0);
  });
  it("returns validation errors for malformed JSON and authenticates before creating", async () => {
    expect((await create(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400);
    auth.mockResolvedValue(null); expect((await post({ kind: "group" })).status).toBe(401);
    expect(await db.select().from(schema.eventTypes)).toHaveLength(0);
  });
  it("allocates unique group links when creation requests overlap", async () => {
    const responses = await Promise.all([post({ kind: "group" }), post({ kind: "group" }), post({ kind: "group" })]);
    expect(responses.map(r => r.status)).toEqual([200, 200, 200]);
    const events = await Promise.all(responses.map(r => r.json()));
    expect(events.map(e => e.slug).sort()).toEqual(["new-group-meeting", "new-group-meeting-2", "new-group-meeting-3"]);
  });
  it("new group types support multiple invitees immediately and enforce their seat limit", async () => {
    const event = await (await post({ kind: "group" })).json();
    const { createBooking } = await import("../../lib/booking");
    const tz = "America/New_York";
    const start = DateTime.now().setZone(tz).plus({ weeks: 1 }).set({ weekday: 2, hour: 11, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO()!;
    const book = (name: string) => createBooking({ username: "demo", slug: event.slug, start, name, email: `${name}@example.invalid`, tz });
    await book("first"); await book("second"); await expect(book("third")).rejects.toThrow("slot_unavailable");
    const bookings = await db.select().from(schema.bookings).where(eq(schema.bookings.eventTypeId, event.id));
    expect(bookings).toHaveLength(2); expect(bookings.every(b => b.inviteeLimit === 2)).toBe(true);
  });
  it("reports insert failure without creating a fallback event of the wrong kind", async () => {
    await db.execute(sql`CREATE FUNCTION fail_kind_create() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test insert failure'; END; $$`);
    await db.execute(sql`CREATE TRIGGER fail_kind_create BEFORE INSERT ON event_types FOR EACH ROW EXECUTE FUNCTION fail_kind_create()`);
    try {
      const response = await post({ kind: "group" }); expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "create_failed" }); expect(await db.select().from(schema.eventTypes)).toHaveLength(0);
    } finally { await db.execute(sql`DROP TRIGGER fail_kind_create ON event_types`); await db.execute(sql`DROP FUNCTION fail_kind_create()`); }
  });
});

describe("editing never converts an existing event type", () => {
  it.each(["one_on_one", "group", "collective", "round_robin", "managed", "one_off", "poll"])("rejects converting %s and does not partially save other fields", async kind => {
    const teamId = ["collective", "round_robin", "managed"].includes(kind) ? "kinds-team" : null;
    await db.insert(schema.eventTypes).values({ id: "immutable", userId: "demo-user", slug: "immutable", title: "Original", kind, teamId, seats: kind === "group" ? 2 : 1 });
    const response = await edit("immutable", { kind: kind === "group" ? "one_on_one" : "group", title: "Must not save", seats: 4 });
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: "event_kind_locked" });
    expect(await byId("immutable")).toMatchObject({ title: "Original", kind, seats: kind === "group" ? 2 : 1 });
  });
  it.each(["one_on_one", "group", "collective"])("accepts an unchanged %s kind alongside editable settings", async kind => {
    await db.insert(schema.eventTypes).values({ id: "unchanged", userId: "demo-user", slug: "unchanged", title: "Original", kind,
      teamId: kind === "collective" ? "kinds-team" : null, seats: kind === "group" ? 2 : 1 });
    const response = await edit("unchanged", { kind, title: "Updated" }); expect(response.status).toBe(200);
    expect(await byId("unchanged")).toMatchObject({ kind, title: "Updated" });
  });
  it("preserves ownership checks for attempted conversions", async () => {
    await db.insert(schema.eventTypes).values({ id: "private", userId: "demo-mate", slug: "private", title: "Private" });
    expect((await edit("private", { kind: "group", seats: 2 })).status).toBe(404);
    auth.mockResolvedValue(null); expect((await edit("private", { kind: "group" })).status).toBe(401);
    expect(await byId("private")).toMatchObject({ kind: "one_on_one", title: "Private" });
  });
});
