// Sign-in for CalendlyIsDead: shared IsDead Firebase session (lib/isdead-auth) or, in demo mode, a signed demo cookie.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema, DEMO_USER_ID } from "@/lib/db";
import { defaultWeekly } from "@/lib/slots";
import { SESSION_COOKIE, DEMO_COOKIE, verifySessionCookie, verifyDemo, revokeSessions, firebaseConfigured, type FirebaseIdentity } from "@/lib/isdead-auth/server";

export { firebaseConfigured };
export const demoEnabled = () => process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1";
export type User = typeof schema.users.$inferSelect;

/** Find the app user for a Firebase identity, linking by verified email or creating one. */
export async function upsertFirebaseUser(id: FirebaseIdentity): Promise<User | { error: string }> {
  const db = await getDb();
  const [byUid] = await db.select().from(schema.users).where(eq(schema.users.firebaseUid, id.uid));
  if (byUid) return byUid;
  const email = id.email?.toLowerCase() ?? null;
  if (email) {
    const [byEmail] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (byEmail) {
      if (byEmail.firebaseUid) return { error: "This email is linked to a different sign-in." };
      if (!id.emailVerified) return { error: "Verify your email address (check your inbox), then sign in again." };
      await db.update(schema.users).set({ firebaseUid: id.uid }).where(eq(schema.users.id, byEmail.id));
      return { ...byEmail, firebaseUid: id.uid };
    }
  }
  const userId = crypto.randomUUID();
  const base = (email ?? "user").split("@")[0].replace(/[^a-z0-9-]/g, "-").slice(0, 24) || "user";
  let username = base, n = 1;
  while ((await db.select().from(schema.users).where(eq(schema.users.username, username))).length) username = `${base}-${++n}`;
  await db.insert(schema.users).values({ id: userId, firebaseUid: id.uid, email, name: id.name, image: id.picture, username, emailVerified: id.emailVerified ? new Date() : null });
  await db.insert(schema.schedules).values({ id: crypto.randomUUID(), userId, timezone: "America/New_York", weekly: defaultWeekly(), overrides: {} });
  await db.insert(schema.eventTypes).values({ id: crypto.randomUUID(), userId, slug: "30min", title: "30 minute meeting", durationMin: 30 });
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return u;
}

async function currentUserId(): Promise<string | null> {
  const jar = await cookies();
  if (demoEnabled()) { const d = verifyDemo(jar.get(DEMO_COOKIE)?.value); if (d) return d; }
  const id = await verifySessionCookie(jar.get(SESSION_COOKIE)?.value);
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
