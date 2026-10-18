import { eq, isNull, and } from "drizzle-orm";
import { getDb, schema } from "./db";
import { defaultWeekly } from "./slots";
import type { FirebaseIdentity } from "./isdead-auth/server";
type DB = Awaited<ReturnType<typeof getDb>>;
type User = typeof schema.users.$inferSelect;
// These paths serve application pages rather than public scheduling profiles.
const reservedNames = new Set(["app", "api", "login", "signup", "onboarding", "pricing", "team", "booking", "meet", "pay", "poll", "invite", "f"]);
function uniqueConflict(error: unknown): boolean {
  return !!error && typeof error === "object" && (("code" in error && error.code === "23505") || ("cause" in error && uniqueConflict(error.cause)));
}

/** User and resumable setup are atomic. Existing/linked accounts are never reseeded. */
export async function upsertFirebaseUser(identity: FirebaseIdentity, options: { syncVerifiedEmail?: boolean } = {}): Promise<User | { error: string }> {
  const db = await getDb(), U = schema.users;
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx: DB) => {
        const [byUid] = await tx.select().from(U).where(eq(U.firebaseUid, identity.uid));
        const email = identity.email?.toLowerCase() ?? null;
        if (byUid) {
          // Only a freshly verified sign-in can synchronize login identity.
          // Reading an older session must never restore an obsolete email.
          if (!options.syncVerifiedEmail || !identity.emailVerified || !email) return byUid;
          if (byUid.email === email && byUid.emailVerified) return byUid;
          const [owner] = await tx.select({ id: U.id }).from(U).where(eq(U.email, email));
          if (owner && owner.id !== byUid.id) return { error: "This login email is already used by another app account. Contact the site administrator; accounts have not been merged." };
          const [updated] = await tx.update(U).set({ email, emailVerified: byUid.email === email ? byUid.emailVerified ?? new Date() : new Date() }).where(eq(U.id, byUid.id)).returning();
          return updated;
        }
        if (email) {
          const [byEmail] = await tx.select().from(U).where(eq(U.email, email)).for("update");
          if (byEmail) {
            if (byEmail.firebaseUid === identity.uid) return byEmail;
            if (byEmail.firebaseUid) return { error: "This email is linked to a different sign-in." };
            if (!identity.emailVerified) return { error: "Verify your email address (check your inbox), then sign in again." };
            const [linked] = await tx.update(U).set({ firebaseUid: identity.uid }).where(and(eq(U.id, byEmail.id), isNull(U.firebaseUid))).returning();
            return linked;
          }
        }
        const id = crypto.randomUUID();
        const base = (email ?? "user").split("@")[0].replace(/[^a-z0-9-]/g, "-").slice(0, 24) || "user";
        let username = base, suffix = 1;
        while (reservedNames.has(username) || (await tx.select({ id: U.id }).from(U).where(eq(U.username, username))).length) username = `${base}-${++suffix}`;
        const [user] = await tx.insert(U).values({ id, firebaseUid: identity.uid, email, name: identity.name, image: identity.picture, username, emailVerified: identity.emailVerified ? new Date() : null }).returning();
        await tx.insert(schema.accountOnboarding).values({ userId: id, weekly: defaultWeekly() });
        return user;
      });
    } catch (error) {
      // A competing first sign-in can win a UID, email or public username.
      // Retry the whole transaction so it reads the winner and cannot leave an orphan user.
      if (!uniqueConflict(error) || attempt >= 7) throw error;
    }
  }
}
