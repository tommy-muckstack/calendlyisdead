import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { defaultWeekly } from "../../lib/slots";
import { loginDestination, OnboardingMutation } from "../../lib/onboarding-validation";
import type { FirebaseIdentity } from "../../lib/isdead-auth/server";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "" }) as { id: string } | null));
vi.mock("@/auth", () => ({ requireUser: auth }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, S: typeof import("../../lib/db/schema"), service: typeof import("../../lib/onboarding"), provision: typeof import("../../lib/account-provisioning").upsertFirebaseUser, api: typeof import("../../app/api/onboarding/route");
let user: string;
const identity = (extra: Partial<FirebaseIdentity> = {}): FirebaseIdentity => ({ uid: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.invalid`, emailVerified: false, name: "QA User", picture: null, provider: "password", ...extra });
async function create(extra: Partial<FirebaseIdentity> = {}) { const result = await provision(identity(extra)); if ("error" in result) throw new Error(result.error); return result; }
const role = () => ({ action: "role" as const, version: 1, role: "Consulting" as const, timezone: "Europe/Paris" });
const calendar = (skip = true) => ({ action: "calendar" as const, version: 2, skip });
const finish = () => ({ action: "finish" as const, version: 3, timezone: "Asia/Kathmandu", weekly: defaultWeekly() as import("../../lib/onboarding-validation").OnboardingData["weekly"] });
const request = (body: unknown, extra: Record<string, string> = {}) => new NextRequest("http://localhost/calendlyisdead/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json", ...extra }, body: JSON.stringify(body) });
const state = () => service.readOnboarding(user);
const schedules = () => db.select().from(S.schedules).where(eq(S.schedules.userId, user));
const events = () => db.select().from(S.eventTypes).where(eq(S.eventTypes.userId, user));
async function ready() { await service.changeOnboarding(user, role()); await service.changeOnboarding(user, calendar()); }
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-onboarding-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); S = database.schema;
  service = await import("../../lib/onboarding"); provision = (await import("../../lib/account-provisioning")).upsertFirebaseUser; api = await import("../../app/api/onboarding/route");
});
beforeEach(async () => { user = (await create()).id; auth.mockResolvedValue({ id: user }); });
describe("new account setup", () => {
  it("creates only a resumable setup record before availability is confirmed", async () => {
    expect(await state()).toMatchObject({ step: "role", version: 1, role: null, timezone: null }); expect(await schedules()).toEqual([]); expect(await events()).toEqual([]); expect(await service.onboardingRequired(user)).toBe(true);
  });
  it("persists role and calendar skipping, then creates a linked schedule and event atomically", async () => {
    await ready(); const input = finish(); input.weekly[1] = [{ start: "10:00", end: "12:00" }];
    expect(await service.changeOnboarding(user, input)).toMatchObject({ step: "complete", version: 4, timezone: "Asia/Kathmandu", calendarSkipped: true });
    const [schedule] = await schedules(), [event] = await events(); expect(schedule).toMatchObject({ timezone: "Asia/Kathmandu", weekly: input.weekly, isDefault: true }); expect(event).toMatchObject({ scheduleId: schedule.id, title: "30 Minute Meeting", active: true, durationMin: 30 });
    expect((await db.select().from(S.users).where(eq(S.users.id, user)))[0].timezone).toBe("Asia/Kathmandu"); expect(await service.onboardingRequired(user)).toBe(false);
  });
  it("accepts exact lost-response retries and simultaneous finishes without duplicate events", async () => {
    expect(await service.changeOnboarding(user, role())).toEqual(await service.changeOnboarding(user, role())); await service.changeOnboarding(user, calendar()); expect(await service.changeOnboarding(user, calendar())).toMatchObject({ version: 3 });
    const results = await Promise.all([service.changeOnboarding(user, finish()), service.changeOnboarding(user, finish())]); expect(results[0]).toEqual(results[1]); expect(await schedules()).toHaveLength(1); expect(await events()).toHaveLength(1);
  });
  it("rejects stale changes without erasing the newer role or restarting completed setup", async () => {
    await ready(); await expect(service.changeOnboarding(user, { ...role(), role: "Sales" })).rejects.toMatchObject({ status: 409 });
    await service.changeOnboarding(user, finish()); await expect(service.changeOnboarding(user, { ...role(), version: 4 })).rejects.toMatchObject({ status: 409 }); expect((await state())?.role).toBe("Consulting");
  });
  it("does not skip prerequisite steps", async () => {
    await expect(service.changeOnboarding(user, { ...calendar(), version: 1 })).rejects.toMatchObject({ status: 409 }); await expect(service.changeOnboarding(user, { ...finish(), version: 1 })).rejects.toMatchObject({ status: 409 }); expect((await state())?.version).toBe(1);
  });
  it("requires an actually connected, owned calendar when continuing without skipping", async () => {
    await service.changeOnboarding(user, role()); await db.insert(S.calendarConnections).values({ id: crypto.randomUUID(), userId: "demo-mate", provider: "google", secret: "test" });
    await expect(service.changeOnboarding(user, calendar(false))).rejects.toMatchObject({ status: 409 });
    const id = crypto.randomUUID(); await db.insert(S.calendarConnections).values({ id, userId: user, provider: "google", secret: "test", status: "error" }); await expect(service.changeOnboarding(user, calendar(false))).rejects.toMatchObject({ status: 409 });
    await db.update(S.calendarConnections).set({ status: "ok" }).where(eq(S.calendarConnections.id, id)); expect(await service.changeOnboarding(user, calendar(false))).toMatchObject({ calendarSkipped: false, step: "availability" });
  });
  it("supports revisiting the role while preserving calendar progress until explicitly changed", async () => {
    await ready(); expect(await service.changeOnboarding(user, { ...role(), version: 3, role: "Sales" })).toMatchObject({ step: "calendar", role: "Sales", calendarSkipped: true, version: 4 });
    await service.changeOnboarding(user, { ...calendar(), version: 4 }); expect((await state())?.step).toBe("availability");
  });
  it("leaves established and linked legacy users out of onboarding", async () => {
    expect(await service.readOnboarding("demo-user")).toBeNull(); expect(await service.onboardingRequired("demo-user")).toBe(false);
    const result = await create({ email: "demo@calendlyisdead.local", emailVerified: true }); expect(result.id).toBe("demo-user"); expect(await service.readOnboarding(result.id)).toBeNull(); expect(await db.select().from(S.eventTypes).where(eq(S.eventTypes.userId, result.id))).toHaveLength(2);
  });
  it("preserves profile, completed availability and event changes on later sign-ins", async () => {
    await ready(); await service.changeOnboarding(user, finish()); const [before] = await db.select().from(S.users).where(eq(S.users.id, user)); await db.update(S.users).set({ name: "Edited", timezone: "UTC" }).where(eq(S.users.id, user));
    const found = await provision(identity({ uid: before.firebaseUid, email: before.email, name: "Provider Name" })); expect(found).toMatchObject({ id: user, name: "Edited", timezone: "UTC" }); expect(await schedules()).toHaveLength(1);
  });
  it("serializes simultaneous first sign-ins and handles username collisions", async () => {
    const id = identity({ email: "collision@example.invalid" }); const rows = await Promise.all([provision(id), provision(id)]); expect(rows[0]).toEqual(rows[1]); const second = await create({ email: "collision@another.invalid" }); expect(second.username).toBe("collision-2");
  });
  it("keeps verified-email linking protections", async () => {
    await db.insert(S.users).values({ id: "legacy-unverified", email: "legacy@example.invalid" }); expect(await provision(identity({ email: "legacy@example.invalid" }))).toHaveProperty("error");
    const owner = await create({ email: "different@example.invalid" }); expect(await provision(identity({ email: owner.email!, emailVerified: true }))).toMatchObject({ error: "This email is linked to a different sign-in." });
  });
  it("avoids reserving app routes as new public usernames", async () => {
    expect((await create({ email: "onboarding@example.invalid" })).username).toBe("onboarding-2");
    expect((await create({ email: "login@example.invalid" })).username).toBe("login-2");
  });
  it("rolls user creation back if its setup insert fails", async () => {
    await db.$client.exec(`CREATE FUNCTION reject_setup() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'storage failed'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER fail_setup BEFORE INSERT ON account_onboarding FOR EACH ROW EXECUTE FUNCTION reject_setup();`);
    const id = identity(); try { await expect(provision(id)).rejects.toThrow(); expect(await db.select().from(S.users).where(eq(S.users.firebaseUid, id.uid))).toEqual([]); } finally { await db.$client.exec('DROP TRIGGER fail_setup ON account_onboarding; DROP FUNCTION reject_setup();'); }
  });
  it("rolls schedule, event, timezone and progress back if completion fails", async () => {
    await ready(); await db.$client.exec(`CREATE FUNCTION reject_first_event() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'storage failed'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER fail_first_event BEFORE INSERT ON event_types FOR EACH ROW EXECUTE FUNCTION reject_first_event();`);
    try { await expect(service.changeOnboarding(user, finish())).rejects.toThrow(); expect(await schedules()).toEqual([]); expect(await events()).toEqual([]); expect(await state()).toMatchObject({ step: "availability", version: 3 }); expect((await db.select().from(S.users).where(eq(S.users.id, user)))[0].timezone).toBe("America/New_York"); } finally { await db.$client.exec('DROP TRIGGER fail_first_event ON event_types; DROP FUNCTION reject_first_event();'); }
    expect(await service.changeOnboarding(user, finish())).toMatchObject({ step: "complete" });
  });
  it("does not overwrite scheduling data created outside setup", async () => {
    await ready(); await db.insert(S.schedules).values({ id: crypto.randomUUID(), userId: user, timezone: "UTC", weekly: defaultWeekly() }); await expect(service.changeOnboarding(user, finish())).rejects.toMatchObject({ status: 409 }); expect(await schedules()).toHaveLength(1); expect(await events()).toHaveLength(0);
    expect(await service.changeOnboarding(user, { action: "keep_existing", version: 3 })).toMatchObject({ step: "complete" }); expect(await schedules()).toHaveLength(1); expect((await schedules())[0].timezone).toBe("UTC"); expect(await events()).toHaveLength(0);
  });
  it("returns calendar authorization to the pending wizard and established calendars page", async () => { expect(await service.calendarReturnPath(user)).toBe("/onboarding"); expect(await service.calendarReturnPath("demo-user")).toBe("/app/calendars"); await ready(); await service.changeOnboarding(user, finish()); expect(await service.calendarReturnPath(user)).toBe("/app/calendars"); });
});
describe("setup validation and private HTTP contract", () => {
  it("supports split days, empty weeks, adjacent ranges and end-of-day midnight", () => { const input = finish(); input.weekly[1] = [{ start: "09:00", end: "12:00" }, { start: "12:00", end: "24:00" }]; expect(OnboardingMutation.safeParse(input).success).toBe(true); for (const key of [1, 2, 3, 4, 5, 6, 7] as const) input.weekly[key] = []; expect(OnboardingMutation.safeParse(input).success).toBe(true); });
  it.each([["10:00", "09:00"], ["09:00", "09:00"], ["25:00", "26:00"], ["9:00", "12:00"]])("rejects invalid ranges %s to %s", (start, end) => { const input = finish(); input.weekly[1] = [{ start, end }]; expect(OnboardingMutation.safeParse(input).success).toBe(false); });
  it("rejects overlaps, missing days, extra fields, unknown roles and invalid zones", () => {
    const input = finish(); input.weekly[1] = [{ start: "12:00", end: "14:00" }, { start: "10:00", end: "13:00" }]; expect(OnboardingMutation.safeParse(input).success).toBe(false);
    for (const raw of [{ ...finish(), weekly: {} }, { ...role(), role: "Owner" }, { ...role(), timezone: "Not/AZone" }, { ...role(), userId: "demo-mate" }]) expect(OnboardingMutation.safeParse(raw).success).toBe(false);
  });
  it("never returns another account's setup or internal receipt", async () => { const response = await api.GET(); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(await response.json()).not.toHaveProperty("userId"); const result = await api.POST(request(role())); expect(result.status).toBe(200); expect(await result.json()).not.toHaveProperty("lastRequest"); });
  it("returns 401, 403, 400, 404, 409 and 413 without changing progress", async () => {
    auth.mockResolvedValue(null); expect((await api.GET()).status).toBe(401); expect((await api.POST(request(role()))).status).toBe(401); auth.mockResolvedValue({ id: user });
    expect((await api.POST(request(role(), { origin: "https://elsewhere.invalid" }))).status).toBe(403); expect((await api.POST(request({ ...role(), userId: "demo-mate" }))).status).toBe(400); expect((await api.POST(request({ value: "x".repeat(33_000) }))).status).toBe(413); expect((await api.POST(request({ ...finish(), version: 1 }))).status).toBe(409); expect((await state())?.version).toBe(1);
    auth.mockResolvedValue({ id: "demo-user" }); expect((await api.GET()).status).toBe(404); expect((await api.POST(request(role()))).status).toBe(404);
  });
  it.each(["https://evil.invalid/app", "//evil.invalid/app", "/\\evil.invalid", "/login", "/signup", "/onboarding", "/api/session", "/app/../../login", " /app"]) ("does not redirect signed-in login to %s", callback => { expect(loginDestination(callback, "/calendlyisdead")).toBe("/app"); });
  it("preserves internal app paths, queries and invitation destinations", () => { expect(loginDestination("/calendlyisdead/app/meetings?filter=today", "/calendlyisdead")).toBe("/app/meetings?filter=today"); expect(loginDestination("/invite/test-token", "/calendlyisdead")).toBe("/invite/test-token"); });
});
