import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import fs from "node:fs";
import * as schema from "../../lib/db/schema";
import { integrationById, integrationState } from "../../lib/integrations/catalog";

const harness = vi.hoisted(() => ({ db: undefined as ReturnType<typeof drizzle<typeof schema>> | undefined }));
vi.mock("../../lib/db", async () => ({ schema: await import("../../lib/db/schema"), getDb: async () => harness.db }));
const state = (id: string, connections = [{ id: "google", provider: "google", status: "ok" }], calendars = [{ id: "calendar", connectionId: "google", canWrite: true }], destination: string | null = "calendar") => integrationState(integrationById(id)!, connections, calendars, destination);

describe("truthful integration states", () => {
  it("does not treat another provider or the demo calendar as connected", () => {
    expect(state("outlook").connected).toBe(false);
    expect(state("google-calendar", [{ id: "mock", provider: "mock", status: "ok" }]).connected).toBe(false);
  });
  it("retains broken connections in the connected filter and surfaces mixed-account failures", () => {
    expect(state("google-calendar", [{ id: "one", provider: "google", status: "ok" }, { id: "two", provider: "google", status: "reauth" }])).toMatchObject({ connected: true, tone: "attention" });
    expect(state("google-calendar")).toMatchObject({ label: "Connected", tone: "connected" });
  });
  it("requires the selected Google destination to be writable", () => {
    expect(state("google-meet", undefined, undefined, null).connected).toBe(false);
    expect(state("google-meet", undefined, [{ id: "calendar", connectionId: "google", canWrite: false }]).connected).toBe(false);
    expect(state("google-meet", [{ id: "google", provider: "microsoft", status: "ok" }]).connected).toBe(false);
    expect(state("google-meet")).toMatchObject({ label: "Calendar ready", connected: true });
  });
  it("uses the selected account's health rather than an unrelated healthy Google account", () => {
    expect(state("google-meet", [{ id: "google", provider: "google", status: "error" }, { id: "other", provider: "google", status: "ok" }])).toMatchObject({ tone: "attention", connected: true });
    expect(state("google-meet", [{ id: "other", provider: "google", status: "ok" }]).connected).toBe(false);
  });
  it.each(["zoom", "microsoft-teams", "embed"])("does not invent an account connection for %s", id => {
    expect(state(id)).toMatchObject({ tone: "neutral", connected: false });
  });
  it("does not resolve unsupported or inherited property names", () => {
    expect(integrationById("salesforce")).toBeUndefined(); expect(integrationById("constructor")).toBeUndefined();
  });
});

describe("integration state ownership and projection", () => {
  let client: PGlite;
  beforeAll(async () => { client = new PGlite(); await client.exec(fs.readFileSync("lib/db/ddl.sql", "utf8")); harness.db = drizzle(client, { schema }); });
  afterAll(async () => { await client?.close(); });
  it("reads only the caller's connections and returns no account or credential data", async () => {
    await harness.db!.insert(schema.users).values([{ id: "owner", email: "owner@example.invalid" }, { id: "other", email: "other@example.invalid" }]);
    await harness.db!.insert(schema.calendarConnections).values({ id: "private", userId: "other", provider: "google", accountEmail: "private@example.invalid", secret: "private-credential", status: "ok" });
    await harness.db!.insert(schema.userCalendars).values({ id: "private-calendar", connectionId: "private", userId: "other", externalId: "private-provider-id", name: "Private calendar", canWrite: true });
    const { integrationStates } = await import("../../lib/integrations/state");
    const owner = await integrationStates("owner", "private-calendar");
    expect(owner["google-calendar"].connected).toBe(false); expect(owner["google-meet"].connected).toBe(false);
    const other = await integrationStates("other", "private-calendar");
    expect(other["google-calendar"].connected).toBe(true); expect(other["google-meet"].label).toBe("Calendar ready");
    expect(JSON.stringify(other)).not.toContain("private");
  });
});
