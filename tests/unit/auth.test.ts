import { describe, it, expect, beforeAll, vi, beforeEach } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cid-auth-"));
process.env.PGLITE_DIR = path.join(tmp, "db");

// ---- mocks: firebase-admin + next/headers cookie jar ----
const tokens: Record<string, any> = {
  "tok-new": { uid: "fb-new", email: "new@example.com", email_verified: false, name: "New Person", auth_time: 0, firebase: { sign_in_provider: "password" } },
  "tok-demo": { uid: "fb-demo", email: "demo@calendlyisdead.local", email_verified: true, name: "Demo", auth_time: 0, firebase: { sign_in_provider: "google.com" } },
  "tok-unverified": { uid: "fb-x", email: "sam@calendlyisdead.local", email_verified: false, auth_time: 0, firebase: {} },
};
const revoke = vi.fn();
vi.mock("firebase-admin/app", () => ({ initializeApp: () => ({ name: "isdead" }), getApps: () => [], cert: (x: any) => x }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({
  verifyIdToken: async (t: string) => { if (!tokens[t]) throw new Error("bad"); return { ...tokens[t], auth_time: Math.floor(Date.now() / 1000) }; },
  createSessionCookie: async (t: string) => `sess:${t}`,
  verifySessionCookie: async (c: string) => { const t = c.replace(/^sess:/, ""); if (!tokens[t]) throw new Error("bad"); return tokens[t]; },
  revokeRefreshTokens: revoke,
}) }));
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined), delete: ({ name }: any) => jar.delete(name) }) }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));

const FB = { NEXT_PUBLIC_FIREBASE_API_KEY: "k", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "yourappisdead.firebaseapp.com", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "yourappisdead", NEXT_PUBLIC_FIREBASE_APP_ID: "a", FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: "yourappisdead" }) };
const setFb = (on: boolean) => { for (const [k, v] of Object.entries(FB)) on ? (process.env[k] = v) : delete process.env[k]; };
let A: typeof import("../../auth"), R: typeof import("../../app/api/session/route"), D: typeof import("../../app/api/session/demo/route"), S: typeof import("../../lib/isdead-auth/server");
const { NextRequest } = await import("next/server");
const post = (body: any) => new NextRequest("http://localhost/calendlyisdead/api/session", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeAll(async () => {
  await (await import("../../lib/db")).getDb();
  A = await import("../../auth"); R = await import("../../app/api/session/route"); D = await import("../../app/api/session/demo/route"); S = await import("../../lib/isdead-auth/server");
});
beforeEach(() => { jar.clear(); setFb(true); });

describe("shared Firebase session", () => {
  it("without Firebase env: not configured, 503, no crash", async () => {
    setFb(false);
    expect(A.firebaseConfigured()).toBe(false);
    expect((await R.POST(post({ idToken: "tok-new" }))).status).toBe(503);
    jar.set("isdead_session", "sess:tok-new"); expect(await A.requireUser()).toBeNull();
  });
  it("exchanges an ID token for a path=/ httpOnly cookie and provisions a user", async () => {
    const res = await R.POST(post({ idToken: "tok-new" }));
    expect(res.status).toBe(204);
    const c = res.headers.get("set-cookie")!;
    expect(c).toMatch(/isdead_session=sess%3Atok-new|isdead_session=sess:tok-new/); expect(c).toMatch(/Path=\//); expect(c).toMatch(/HttpOnly/i);
    jar.set("isdead_session", "sess:tok-new");
    const u = await A.requireUser();
    expect(u).toMatchObject({ firebaseUid: "fb-new", email: "new@example.com", username: "new", name: "New Person" });
    const { getDb, schema } = await import("../../lib/db"); const { eq } = await import("drizzle-orm"); const db = await getDb();
    expect((await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.userId, u!.id))).length).toBe(1);
    // second sign-in maps to the same row
    expect((await R.POST(post({ idToken: "tok-new" }))).status).toBe(204); expect((await A.requireUser())!.id).toBe(u!.id);
  });
  it("links a verified email to the existing Postgres user (keeps app data)", async () => {
    expect((await R.POST(post({ idToken: "tok-demo" }))).status).toBe(204);
    jar.set("isdead_session", "sess:tok-demo"); expect((await A.requireUser())!.id).toBe("demo-user");
  });
  it("refuses to link an unverified email to an existing account", async () => {
    const r = await R.POST(post({ idToken: "tok-unverified" })); expect(r.status).toBe(403);
    expect((await r.json()).error).toMatch(/Verify your email/);
  });
  it("rejects bad tokens and bad cookies", async () => {
    expect((await R.POST(post({ idToken: "nope" }))).status).toBe(401);
    expect((await R.POST(post({}))).status).toBe(400);
    jar.set("isdead_session", "garbage"); expect(await A.auth()).toBeNull();
  });
  it("demo cookie is HMAC-signed; tampering fails; mate is reachable for tests", async () => {
    const res = await D.POST(new NextRequest("http://localhost/calendlyisdead/api/session/demo?who=mate", { method: "POST" }));
    const v = decodeURIComponent(res.headers.get("set-cookie")!.match(/isdead_demo=([^;]+)/)![1]);
    jar.set("isdead_demo", v); expect((await A.auth())?.user.id).toBe("demo-mate");
    jar.set("isdead_demo", v.replace("demo-mate", "demo-user")); expect(await A.auth()).toBeNull();
    expect(S.verifyDemo(S.signDemo("demo-user"))).toBe("demo-user");
  });
  it("sign out clears the shared cookie and revokes refresh tokens", async () => {
    jar.set("isdead_session", "sess:tok-new");
    await expect(A.signOut({ redirectTo: "/calendlyisdead/" })).rejects.toThrow("REDIRECT /calendlyisdead/");
    expect(jar.has("isdead_session")).toBe(false); expect(revoke).toHaveBeenCalledWith("fb-new");
  });
});
