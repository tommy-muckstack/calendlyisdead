import { beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({ requireUser: vi.fn(async () => ({ id: "demo-user" })) }));

let db: any, schema: typeof import("../../lib/db").schema;
let put: typeof import("../../app/api/schedules/[id]/route").PUT;
const hours = [{ start: "09:00", end: "17:00" }];

beforeAll(async () => {
  process.env.PGLITE_DIR = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-hours-")), "db");
  const database = await import("../../lib/db");
  db = await database.getDb(); schema = database.schema;
  put = (await import("../../app/api/schedules/[id]/route")).PUT;
});

function update(body: unknown) {
  return put(new NextRequest("http://localhost/api/schedules/demo-schedule", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: "demo-schedule" }) });
}

async function stored() {
  return (await db.select().from(schema.schedules).where(eq(schema.schedules.id, "demo-schedule")))[0];
}

describe("availability validation at the API/database boundary", () => {
  it.each([
    ["hour outside the clock", { weekly: { 1: [{ start: "98:00", end: "99:00" }] } }],
    ["invalid minute", { weekly: { 1: [{ start: "09:61", end: "10:00" }] } }],
    ["time after midnight", { weekly: { 1: [{ start: "23:00", end: "24:01" }] } }],
    ["zero-length range", { weekly: { 1: [{ start: "09:00", end: "09:00" }] } }],
    ["backwards range", { weekly: { 1: [{ start: "17:00", end: "09:00" }] } }],
    ["weekday zero", { weekly: { 0: hours } }],
    ["weekday eight", { weekly: { 8: hours } }],
    ["non-leap February 29", { overrides: { "2026-02-29": hours } }],
    ["April 31", { overrides: { "2026-04-31": [] } }],
    ["invalid month", { overrides: { "2026-13-01": hours } }],
    ["invalid override clock", { overrides: { "2026-11-01": [{ start: "12:00", end: "50:00" }] } }],
    ["empty timezone", { timezone: "" }],
  ])("rejects %s and leaves the saved schedule unchanged", async (_, body) => {
    const before = await stored();
    const response = await update(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid" });
    expect(await stored()).toEqual(before);
  });

  it("preserves valid midnight, leap-day, split-day and closed-day hours", async () => {
    const body = { timezone: "UTC", weekly: { 1: [{ start: "00:00", end: "08:00" }, { start: "09:00", end: "24:00" }], 7: [] },
      overrides: { "2028-02-29": [{ start: "23:30", end: "24:00" }], "2026-12-25": [] } };
    const response = await update(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject(body);
    expect(await stored()).toMatchObject(body);
  });
});
