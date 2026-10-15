import { beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({ requireUser: vi.fn(async () => ({ id: "demo-user" })) }));

let db: any, schema: typeof import("../../lib/db").schema;
let patch: typeof import("../../app/api/event-types/[id]/route").PATCH;
let loadEvent: typeof import("../../lib/booking").loadEvent;

beforeAll(async () => {
  process.env.PGLITE_DIR = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-schedule-")), "db");
  const database = await import("../../lib/db");
  db = await database.getDb(); schema = database.schema;
  patch = (await import("../../app/api/event-types/[id]/route")).PATCH;
  loadEvent = (await import("../../lib/booking")).loadEvent;
  await db.insert(schema.schedules).values({ id: "custom-hours", userId: "demo-user", name: "Evenings", isDefault: false,
    timezone: "Europe/London", weekly: { 1: [{ start: "18:00", end: "20:00" }] }, overrides: {} });
});

function updateSchedule(scheduleId: string | null) {
  return patch(new NextRequest("http://localhost/api/event-types/demo-30", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ scheduleId }),
  }), { params: Promise.resolve({ id: "demo-30" }) });
}

describe("event availability schedule", () => {
  it("clears an explicit schedule and follows the host's current default after reload", async () => {
    expect((await updateSchedule("custom-hours")).status).toBe(200);
    expect((await loadEvent("demo", "30min"))!.hosts[0].schedule.id).toBe("custom-hours");

    const reset = await updateSchedule(null);
    expect(reset.status).toBe(200);
    expect((await reset.json()).scheduleId).toBeNull();
    expect((await loadEvent("demo", "30min"))!.hosts[0].schedule.id).toBe("demo-schedule");

    // Default means a live fallback, not a saved copy of the previous default ID.
    await db.update(schema.schedules).set({ isDefault: false }).where(eq(schema.schedules.id, "demo-schedule"));
    await db.update(schema.schedules).set({ isDefault: true }).where(eq(schema.schedules.id, "custom-hours"));
    expect((await loadEvent("demo", "30min"))!.hosts[0].schedule.id).toBe("custom-hours");
    const [saved] = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "demo-30"));
    expect(saved.scheduleId).toBeNull();
  });

  it("still rejects another user's schedule without changing the event", async () => {
    const response = await updateSchedule("sam-schedule");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_schedule" });
    const [saved] = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, "demo-30"));
    expect(saved.scheduleId).not.toBe("sam-schedule");
  });

  it("rejects an empty schedule ID rather than treating it as a default", async () => {
    const response = await updateSchedule("");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid" });
  });
});
