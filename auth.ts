// Sign-in for CalendlyIsDead: shared IsDead Firebase session (lib/isdead-auth) or, in demo mode, a signed demo cookie.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema, DEMO_USER_ID } from "@/lib/db";
import { upsertFirebaseUser } from "@/lib/account-provisioning";
export { upsertFirebaseUser };
import { SESSION_COOKIE, DEMO_COOKIE, verifySessionCookie, verifyDemo, revokeSessions, firebaseConfigured } from "@/lib/isdead-auth/server";

export { firebaseConfigured };
export const demoEnabled = () => process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1";
export type User = typeof schema.users.$inferSelect;

async function currentUserId(): Promise<string | null> {
  const jar = await cookies();
  if (demoEnabled()) { const d = verifyDemo(jar.get(DEMO_COOKIE)?.value); if (d) return d; }
  const id = await verifySessionCookie(jar.get(SESSION_COOKIE)?.value, true);
  if (!id) return null;
  const u = await upsertFirebaseUser(id);
  return "error" in u ? null : u.id;
}

/** Same shape the app used with Auth.js: `{ user: { id } } | null`. */
export async function auth() { const id = await currentUserId(); return id ? { user: { id } } : null; }

export async function requireUser(): Promise<User | null> {
  const id = await currentUserId(); if (!id) return null;
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return u ?? null;
}

/** Server-action sign out: clears the shared cookie (all IsDead apps) and revokes Firebase refresh tokens. */
export async function signOut({ redirectTo }: { redirectTo: string }) {
  const jar = await cookies();
  const id = await verifySessionCookie(jar.get(SESSION_COOKIE)?.value);
  if (id) await revokeSessions(id.uid);
  jar.delete({ name: SESSION_COOKIE, path: "/" }); jar.delete({ name: DEMO_COOKIE, path: "/" });
  redirect(redirectTo);
}
export { DEMO_USER_ID };
