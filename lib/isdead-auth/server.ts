import crypto from "node:crypto";
import { firebaseConfigured, SESSION_MAX_AGE_S } from "./config";
export * from "./config";

export type FirebaseIdentity = { uid: string; email: string | null; emailVerified: boolean; name: string | null; picture: string | null; provider: string | null };

let adminAuth: Promise<import("firebase-admin/auth").Auth> | null = null;
/** Lazily initialised firebase-admin Auth. Throws if FIREBASE_SERVICE_ACCOUNT_JSON is missing. */
export function getAdminAuth() {
  if (!adminAuth) adminAuth = (async () => {
    const raw = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");
    const sa = JSON.parse(raw);
    const app = getApps().find(a => a.name === "isdead") ?? initializeApp({ credential: cert(sa), projectId: sa.project_id }, "isdead");
    return getAuth(app);
  })().catch(e => { adminAuth = null; throw e; });
  return adminAuth;
}

const toIdentity = (t: any): FirebaseIdentity => ({ uid: t.uid, email: t.email ?? null, emailVerified: !!t.email_verified, name: t.name ?? null, picture: t.picture ?? null, provider: t.firebase?.sign_in_provider ?? null });

/** Exchange a fresh client ID token for a session cookie value. Rejects tokens older than 5 minutes. */
export async function createSessionFromIdToken(idToken: string) {
  const auth = await getAdminAuth();
  const decoded = await auth.verifyIdToken(idToken, true);
  if (Date.now() / 1000 - decoded.auth_time > 5 * 60) throw new Error("recent sign-in required");
  const cookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_S * 1000 });
  return { cookie, identity: toIdentity(decoded) };
}

/** Verify a session cookie value. Returns null (never throws) when missing, invalid or not configured. */
export async function verifySessionCookie(cookie: string | undefined, checkRevoked = false): Promise<FirebaseIdentity | null> {
  if (!cookie || !firebaseConfigured()) return null;
  try { return toIdentity(await (await getAdminAuth()).verifySessionCookie(cookie, checkRevoked)); } catch { return null; }
}

export async function revokeSessions(uid: string) { try { await (await getAdminAuth()).revokeRefreshTokens(uid); } catch { /* best effort */ } }

// ---- demo-mode cookie (no Firebase): HMAC-signed user id ----
const demoKey = () => process.env.AUTH_SECRET ?? "dev-only-secret-change-me-in-production";
export const signDemo = (userId: string) => `${userId}.${crypto.createHmac("sha256", demoKey()).update(`demo:${userId}`).digest("base64url")}`;
export function verifyDemo(v: string | undefined): string | null {
  if (!v) return null; const i = v.lastIndexOf("."); if (i < 1) return null;
  const id = v.slice(0, i), want = signDemo(id);
  return want.length === v.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(v)) ? id : null;
}
