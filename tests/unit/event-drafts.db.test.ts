import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { EventCreation, eventSlug, initialEventFields } from "../../lib/event-creation-validation";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
vi.mock("@/auth", () => ({ requireUser: auth }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, S: typeof import("../../lib/db/schema"), create: typeof import("../../app/api/event-types/route").POST;
const draft = (extra: Partial<EventCreation> = {}): EventCreation => ({ draftId: crypto.randomUUID(), autoSlug: true, settings: { ...initialEventFields("one_on_one", "demo-schedule"), title: "Intro meeting", slug: "intro-meeting" }, ...extra });
const post = (body: unknown) => create(new Request("http://localhost/api/event-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const events = () => db.select().from(S.eventTypes);
const receipts = () => db.select().from(S.eventTypeCreations);
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-event-drafts-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); S = database.schema; create = (await import("../../app/api/event-types/route")).POST;
});
beforeEach(async () => { await db.delete(S.bookings); await db.delete(S.eventTypes); await db.delete(S.eventTypeCreations); auth.mockResolvedValue({ id: "demo-user" }); });
describe("explicit event creation", () => {
  it.each(["one_on_one", "group"] as const)("creates %s with the submitted settings in a single write", async kind => {
    const input = draft({ settings: { ...initialEventFields(kind, "demo-schedule"), title: "  Intro meeting  ", slug: "intro-meeting", location: "Library", description: "Bring your questions", durationMin: 45, bufferAfterMin: 10, minNoticeMin: 60, maxPerDay: 2, maxPerWeek: 7, maxPerMonth: 15, startIntervalMin: 15, lockedTimezone: "Europe/Paris", dateRange: { kind: "fixed", start: "2026-11-02", end: "2026-11-30" }, questions: [{ id: "topic", label: "Topic?", type: "select", required: true, options: ["Planning", "Review"] }] } });
    const response = await post(input); expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ replayed: false, event: { ...input.settings, id: input.draftId, title: "Intro meeting", userId: "demo-user", teamId: null, groupSettingsLocked: false } }); expect(await events()).toHaveLength(1); expect(await receipts()).toHaveLength(1);
  });
  it("returns the same event after a lost response without repeating creation", async () => {
    const input = draft(), first = await post(input), second = await post(input); expect(first.status).toBe(201); expect(second.status).toBe(200); const one = await first.json(), two = await second.json(); expect(one.event).toEqual(two.event); expect(two.replayed).toBe(true); expect(await events()).toHaveLength(1);
  });
  it("normalizes object key order and trimmed names before comparing retries", async () => {
    const input = draft(); await post(input); const reordered = { settings: Object.fromEntries(Object.entries({ ...input.settings, title: " Intro meeting " }).reverse()), autoSlug: true, draftId: input.draftId }; expect((await post(reordered)).status).toBe(200); expect(await events()).toHaveLength(1);
  });
  it("serializes concurrent retries and allocates unique automatic slugs for independent drafts", async () => {
    const input = draft(); const repeated = await Promise.all([post(input), post(input), post(input)]); expect(repeated.map(response => response.status).sort()).toEqual([200, 200, 201]); expect(await events()).toHaveLength(1);
    const independent = await Promise.all([post(draft()), post(draft())]); expect(independent.map(response => response.status)).toEqual([201, 201]); expect((await events()).map(event => event.slug).sort()).toEqual(["intro-meeting", "intro-meeting-2", "intro-meeting-3"]);
  });
  it("rejects a different payload with the same draft ID without modifying its event", async () => {
    const input = draft(); await post(input); const changed = await post({ ...input, settings: { ...input.settings, title: "Changed after uncertain save" } }); expect(changed.status).toBe(409); expect(await changed.json()).toEqual({ error: "creation_conflict" }); expect((await events())[0].title).toBe("Intro meeting");
  });
  it("returns current saved edits on an exact retry, rather than overwriting them", async () => {
    const input = draft(); await post(input); await db.update(S.eventTypes).set({ title: "Edited elsewhere", slug: "updated-link" }).where(eq(S.eventTypes.id, input.draftId)); const response = await post(input); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ replayed: true, event: { id: input.draftId, title: "Edited elsewhere", slug: "updated-link" } });
  });
  it("does not recreate a soft-deleted or permanently removed event", async () => {
    const input = draft(); await post(input); await db.update(S.eventTypes).set({ deletedAt: new Date(), active: false }).where(eq(S.eventTypes.id, input.draftId)); expect((await post(input)).status).toBe(410); await db.delete(S.eventTypes).where(eq(S.eventTypes.id, input.draftId)); expect((await post(input)).status).toBe(410); expect(await events()).toHaveLength(0); expect(await receipts()).toHaveLength(1);
  });
  it("never exposes or claims another owner's receipt or existing event ID", async () => {
    const input = draft(); await post(input); auth.mockResolvedValue({ id: "demo-mate" }); expect((await post(input)).status).toBe(409); auth.mockResolvedValue({ id: "demo-user" }); const id = crypto.randomUUID(); await db.insert(S.eventTypes).values({ id, userId: "demo-mate", title: "Private", slug: "private" }); expect((await post(draft({ draftId: id }))).status).toBe(409); expect((await events()).find(event => event.id === id).userId).toBe("demo-mate"); expect(await receipts()).toHaveLength(1);
  });
  it("rejects an unavailable/foreign schedule and permits a dynamic default", async () => {
    for (const scheduleId of ["sam-schedule", "missing"]) { const input = draft(); input.settings.scheduleId = scheduleId; expect((await post(input)).status).toBe(400); } expect(await events()).toHaveLength(0); expect(await receipts()).toHaveLength(0);
    const input = draft(); input.settings.scheduleId = null; expect((await post(input)).status).toBe(201); expect((await events())[0].scheduleId).toBeNull();
  });
  it("honors a custom link exactly and rejects collisions without consuming its draft ID", async () => {
    await post(draft()); const input = draft({ autoSlug: false }); const conflict = await post(input); expect(conflict.status).toBe(409); expect(await conflict.json()).toEqual({ error: "slug_taken" }); expect(await receipts()).toHaveLength(1); input.settings.slug = "custom-link"; expect((await post(input)).status).toBe(201); expect((await events()).map(event => event.slug)).toContain("custom-link");
  });
  it("persists an inactive event without enabling it on retry", async () => { const input = draft(); input.settings.active = false; expect((await post(input)).status).toBe(201); expect((await (await post(input)).json()).event.active).toBe(false); });
  it("rolls the event and receipt back together on a storage error", async () => {
    const input = draft(); await db.$client.exec(`CREATE FUNCTION fail_draft_event() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test storage failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_draft_event BEFORE INSERT ON event_types FOR EACH ROW EXECUTE FUNCTION fail_draft_event();`);
    try { expect((await post(input)).status).toBe(500); expect(await events()).toEqual([]); expect(await receipts()).toEqual([]); } finally { await db.$client.exec('DROP TRIGGER reject_draft_event ON event_types; DROP FUNCTION fail_draft_event();'); }
    expect((await post(input)).status).toBe(201);
  });
  it("includes current group locks when replaying creation after a booking", async () => {
    const input = draft({ settings: { ...initialEventFields("group", "demo-schedule"), title: "Group", slug: "group" } }); await post(input); await db.insert(S.bookings).values({ uid: "group-booking", eventTypeId: input.draftId, hostId: "demo-user", start: new Date("2026-11-02T15:00:00Z"), end: new Date("2026-11-02T15:30:00Z"), inviteeName: "QA", inviteeEmail: "qa@example.invalid", inviteeTz: "UTC", inviteeLimit: 2 }); expect((await (await post(input)).json()).event.groupSettingsLocked).toBe(true);
  });
  it("accepts a fully populated form within the documented field bounds", async () => {
    const input = draft(); input.settings.description = "D".repeat(5000); input.settings.questions = Array.from({ length: 20 }, (_, index) => ({ id: `q${index}`, label: "L".repeat(200), type: "select", required: true, options: Array.from({ length: 30 }, (_, choice) => `${choice}`.padEnd(100, "x")) }));
    expect(JSON.stringify(input).length).toBeGreaterThan(50_000); expect((await post(input)).status).toBe(201); expect((await events())[0].questions).toHaveLength(20);
  });
  it("authenticates before accepting a draft and bounds the request", async () => { auth.mockResolvedValue(null); expect((await post(draft())).status).toBe(401); auth.mockResolvedValue({ id: "demo-user" }); expect((await post({ draftId: crypto.randomUUID(), content: "x".repeat(500_001) })).status).toBe(413); expect(await events()).toEqual([]); });
});
describe("creation input", () => {
  it.each(["", "   "])("does not save an unnamed draft %j", async title => { const input = draft(); input.settings.title = title; expect((await post(input)).status).toBe(400); expect(await events()).toEqual([]); });
  it.each(["collective", "round_robin", "managed", "one_off", "poll"])("rejects unsupported personal creation kind %s without falling back", async kind => { const input = draft(); expect((await post({ ...input, settings: { ...input.settings, kind } })).status).toBe(400); expect(await events()).toEqual([]); });
  it("rejects unknown ownership fields, missing settings and invalid capacity", async () => {
    const input = draft(); for (const invalid of [{ ...input, userId: "demo-mate" }, { ...input, settings: { ...input.settings, teamId: "private" } }, { ...input, settings: {} }, { ...input, settings: { ...input.settings, kind: "group", seats: 1 } }, { ...input, settings: { ...input.settings, seats: 2 } }]) expect((await post(invalid)).status).toBe(400); expect(await events()).toEqual([]);
  });
  it("rejects duplicate and incomplete invitee questions", async () => {
    const input = draft(), question = { id: "q", label: "Topic", type: "text", required: false }; for (const questions of [[question, question], [{ ...question, label: " " }], [{ ...question, type: "select", options: [] }], [{ ...question, type: "select", options: [" "] }]]) expect((await post({ ...input, settings: { ...input.settings, questions } })).status).toBe(400); expect(await events()).toEqual([]);
  });
  it("generates bounded readable links from names without inventing a title", () => { expect(eventSlug(" Planning & Review ")).toBe("planning-review"); expect(eventSlug("🗓️")).toBe("meeting"); expect(eventSlug("x".repeat(90))).toHaveLength(60); expect(initialEventFields("one_on_one", null).title).toBe(""); });
});
