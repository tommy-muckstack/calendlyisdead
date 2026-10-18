import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as S from "../../lib/db/schema";
import { upsertFirebaseUser } from "../../lib/account-provisioning";
import { readLoginSettings } from "../../lib/login-settings-server";
import { GET } from "../../app/api/settings/login/route";
import { LoginSettings } from "../../components/LoginSettings";
import type { FirebaseIdentity } from "../../lib/isdead-auth/server";
const mocks = vi.hoisted(() => ({ db: undefined as Awaited<ReturnType<typeof import("../../lib/db").getDb>>, user: vi.fn(), getUser: vi.fn(), configured: vi.fn() }));
vi.mock("../../lib/db", async () => ({ schema: await import("../../lib/db/schema"), getDb: async () => mocks.db }));
vi.mock("@/auth", () => ({ requireUser: mocks.user }));
vi.mock("../../lib/isdead-auth/server", () => ({ firebaseConfigured: mocks.configured, getAdminAuth: async () => ({ getUser: mocks.getUser }) }));
const identity: FirebaseIdentity = { uid: "firebase-host", email: "old@example.invalid", emailVerified: true, name: "Provider name", picture: "https://example.invalid/provider", provider: "password" };
const db = () => mocks.db;
const current = async () => (await db().select().from(S.users).where(eq(S.users.id, "host")))[0];
let client: PGlite;
beforeAll(async () => { client = new PGlite(); await client.exec(fs.readFileSync("lib/db/ddl.sql", "utf8")); mocks.db = drizzle(client, { schema: S }); });
beforeEach(async () => {
  await client.exec("TRUNCATE users CASCADE");
  await db().insert(S.users).values({ id: "host", firebaseUid: identity.uid, email: identity.email, name: "My chosen name", username: "my-link", welcomeMessage: "Welcome", timezone: "Europe/Paris" });
  mocks.user.mockReset().mockResolvedValue(await current()); mocks.configured.mockReset().mockReturnValue(true);
  mocks.getUser.mockReset().mockResolvedValue({ uid: identity.uid, email: identity.email, emailVerified: true, disabled: false, providerData: [{ providerId: "google.com" }, { providerId: "password" }], passwordHash: "not-for-the-client", tokensValidAfterTime: "private", customClaims: { admin: true } });
});
afterAll(async () => { await client.close(); });
describe("login settings identity boundary", () => {
  it("reads only the signed-in Firebase user and returns an explicit safe projection", async () => {
    const response = await GET(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ status: "ready", uid: identity.uid, email: identity.email, emailVerified: true, providers: ["google.com", "password"] }); expect(mocks.getUser).toHaveBeenCalledWith(identity.uid);
  });
  it("rejects anonymous access before any provider read", async () => { mocks.user.mockResolvedValue(null); expect((await GET()).status).toBe(401); expect(mocks.getUser).not.toHaveBeenCalled(); });
  it("does not simulate credential changes for demo or unconfigured accounts", async () => {
    expect(await readLoginSettings({ firebaseUid: null })).toEqual({ status: "demo" }); mocks.configured.mockReturnValue(false); expect(await readLoginSettings({ firebaseUid: identity.uid })).toEqual({ status: "unavailable" }); expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("bounds provider failure and refuses mismatched or disabled accounts", async () => {
    mocks.getUser.mockRejectedValueOnce(new Error("private provider content")); const r = await GET(); expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "error" });
    mocks.getUser.mockResolvedValueOnce({ uid: "other" }); expect(await readLoginSettings({ firebaseUid: identity.uid })).toEqual({ status: "unavailable" });
    mocks.getUser.mockResolvedValueOnce({ uid: identity.uid, disabled: true }); expect(await readLoginSettings({ firebaseUid: identity.uid })).toEqual({ status: "unavailable" });
  });
  it("synchronizes a verified email only after a fresh sign-in, preserving app identity", async () => {
    await db().insert(S.eventTypes).values({ id: "event", userId: "host", slug: "meeting", title: "Meeting" });
    const result = await upsertFirebaseUser({ ...identity, email: "NEW@example.invalid" }, { syncVerifiedEmail: true });
    expect(result).toMatchObject({ id: "host", email: "new@example.invalid", name: "My chosen name", username: "my-link", welcomeMessage: "Welcome", timezone: "Europe/Paris" });
    expect((await current()).emailVerified).toBeInstanceOf(Date); expect(await db().select().from(S.accountOnboarding)).toEqual([]); expect(await db().select().from(S.eventTypes)).toHaveLength(1);
    await upsertFirebaseUser(identity); expect((await current()).email).toBe("new@example.invalid");
  });
  it("never copies an unverified email into an existing app identity", async () => {
    await upsertFirebaseUser({ ...identity, email: "unverified@example.invalid", emailVerified: false }, { syncVerifiedEmail: true }); expect((await current()).email).toBe(identity.email);
  });
  it("refuses collisions with existing linked or unlinked app accounts without merging", async () => {
    for (const firebaseUid of [null, "other-firebase"]) {
      await db().delete(S.users).where(eq(S.users.id, "other")); await db().insert(S.users).values({ id: "other", email: "new@example.invalid", firebaseUid });
      expect(await upsertFirebaseUser({ ...identity, email: "new@example.invalid" }, { syncVerifiedEmail: true })).toMatchObject({ error: expect.stringContaining("accounts have not been merged") }); expect((await current()).email).toBe(identity.email);
    }
  });
  it("serializes competing claims to a new email without duplicate identities", async () => {
    await db().insert(S.users).values({ id: "other", email: "other@example.invalid", firebaseUid: "other-firebase" });
    const results = await Promise.all([identity.uid, "other-firebase"].map(uid => upsertFirebaseUser({ ...identity, uid, email: "new@example.invalid" }, { syncVerifiedEmail: true })));
    expect(results.filter(result => "error" in result)).toHaveLength(1); expect(await db().select().from(S.users).where(eq(S.users.email, "new@example.invalid"))).toHaveLength(1);
  });
  it("renders an honest demo state and only email/Google controls", () => {
    const demo = renderToStaticMarkup(createElement(LoginSettings, { initial: { status: "demo" }, config: null, signInAgain: async () => {} })); expect(demo).toContain("no email password or Google login"); expect(demo).not.toContain("Change password");
    const html = renderToStaticMarkup(createElement(LoginSettings, { initial: { status: "ready", uid: identity.uid, email: identity.email!, emailVerified: true, providers: ["password", "google.com"] }, config: { apiKey: "offline", authDomain: "example.invalid", projectId: "offline", appId: "offline" }, signInAgain: async () => {} }));
    expect(html).toContain("Change password"); expect(html).toContain("Change email"); expect(html).toContain("Remove Google sign-in"); expect(html).not.toMatch(/Microsoft|SSO|passwordHash|not-for-the-client/);
  });
});
