import { BP } from "@/lib/basepath";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { getDb, schema, DEMO_USER_ID, DEMO_MATE_ID } from "@/lib/db";
import { sendMail } from "@/lib/email";
import { defaultWeekly } from "@/lib/slots";

export const demoEnabled = () => process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1";

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const db = await getDb();
  const providers: NextAuthConfig["providers"] = [
    {
      id: "email", name: "Email", type: "email", maxAge: 60 * 60 * 24, from: process.env.EMAIL_FROM ?? "noreply@calendlyisdead.local",
      async sendVerificationRequest({ identifier, url }: { identifier: string; url: string }) {
        await sendMail({ to: identifier, subject: "Your sign-in link", text: `Sign in to CalendlyIsDead:\n${url}\n\nThis link expires in 24 hours.` });
      },
    } as any,
  ];
  if (process.env.AUTH_GOOGLE_ID) providers.push(Google({ allowDangerousEmailAccountLinking: true }));
  if (demoEnabled()) providers.push(Credentials({ id: "demo", name: "Demo", credentials: { who: {} }, authorize: async (c: any) => {
    const id = c?.who === "mate" ? DEMO_MATE_ID : DEMO_USER_ID;
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id)); return u ?? null; } }));
  return {
    secret: process.env.AUTH_SECRET ?? "dev-only-secret-change-me-in-production",
    trustHost: true,
    adapter: DrizzleAdapter(db, { usersTable: schema.users, accountsTable: schema.accounts, sessionsTable: schema.sessions, verificationTokensTable: schema.verificationTokens } as any),
    session: { strategy: "jwt" },
    providers,
    basePath: `${BP}/api/auth`,
    pages: { signIn: `${BP}/login`, verifyRequest: `${BP}/login?sent=1` },
    callbacks: {
      jwt({ token, user }) { if (user?.id) token.uid = user.id; return token; },
      session({ session, token }) { (session.user as any).id = token.uid ?? token.sub; return session; },
    },
    events: {
      async createUser({ user }) {
        const base = (user.email ?? "user").split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 24) || "user";
        let username = base, n = 1;
        while ((await db.select().from(schema.users).where(eq(schema.users.username, username))).length) username = `${base}-${++n}`;
        await db.update(schema.users).set({ username }).where(eq(schema.users.id, user.id!));
        await db.insert(schema.schedules).values({ id: crypto.randomUUID(), userId: user.id!, timezone: "America/New_York", weekly: defaultWeekly(), overrides: {} });
        await db.insert(schema.eventTypes).values({ id: crypto.randomUUID(), userId: user.id!, slug: "30min", title: "30 minute meeting", durationMin: 30 });
      },
    },
  } satisfies NextAuthConfig;
});

export async function requireUser() {
  const s = await auth();
  const id = (s?.user as any)?.id as string | undefined;
  if (!id) return null;
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return u ?? null;
}
