// @isdead/auth — shared Firebase Auth for every IsDead app under yourappisdead.com.
// Vendored copy; canonical source lives in isdead-design/auth. Keep the two in sync.
// Env is read with bracket access so Next does not inline it at build time: setting the
// vars in Vercel and redeploying (or even restarting) is enough.
export type FirebaseClientConfig = { apiKey: string; authDomain: string; projectId: string; appId: string; messagingSenderId?: string; storageBucket?: string };
const env = (k: string) => process.env[k] || undefined;
export function firebaseClientConfig(): FirebaseClientConfig | null {
  const apiKey = env("NEXT_PUBLIC_FIREBASE_API_KEY"), authDomain = env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId = env("NEXT_PUBLIC_FIREBASE_PROJECT_ID"), appId = env("NEXT_PUBLIC_FIREBASE_APP_ID");
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId, messagingSenderId: env("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"), storageBucket: env("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET") };
}
/** Sign-in works only when both the browser config and the admin service account are present. */
export const firebaseConfigured = () => !!firebaseClientConfig() && !!env("FIREBASE_SERVICE_ACCOUNT_JSON");
/** One cookie, path "/", shared by /calendlyisdead, /superhumanisdead, /wisprflowisdead … */
export const SESSION_COOKIE = "isdead_session";
export const DEMO_COOKIE = "isdead_demo";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 14; // Firebase allows 5 min – 14 days
export function cookieOptions(maxAge = SESSION_MAX_AGE_S) {
  const domain = env("ISDEAD_COOKIE_DOMAIN"); // optional, e.g. "yourappisdead.com" to include subdomains
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge, ...(domain ? { domain } : {}) };
}
