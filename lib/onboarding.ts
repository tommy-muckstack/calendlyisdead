import { and, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { OnboardingData, OnboardingMutation } from "./onboarding-validation";
type DB = Awaited<ReturnType<typeof getDb>>;
const O = schema.accountOnboarding;
export class OnboardingError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export async function readOnboarding(userId: string, db?: DB): Promise<OnboardingData | null> {
  db ??= await getDb();
  const [row] = await db.select().from(O).where(eq(O.userId, userId));
  return row ? OnboardingData.parse(row) : null;
}
export async function onboardingRequired(userId: string) {
  const state = await readOnboarding(userId); return !!state && state.step !== "complete";
}
export async function calendarReturnPath(userId: string) { return await onboardingRequired(userId) ? "/onboarding" : "/app/calendars"; }

export async function changeOnboarding(userId: string, raw: OnboardingMutation): Promise<OnboardingData> {
  const input = OnboardingMutation.parse(raw), db = await getDb();
  return db.transaction(async (tx: DB) => {
    const [owner] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).for("update");
    if (!owner) throw new OnboardingError(404, "Account not found.");
    const [row] = await tx.select().from(O).where(eq(O.userId, userId)).for("update");
    if (!row) throw new OnboardingError(404, "This account does not need setup.");
    const current = OnboardingData.parse(row);
    // Parse JSONB to canonical key order before comparing a lost-response retry.
    const previous = OnboardingMutation.safeParse(row.lastRequest);
    if (previous.success && JSON.stringify(previous.data) === JSON.stringify(input) && current.version === input.version + 1) return current;
    if (current.version !== input.version || current.step === "complete") throw new OnboardingError(409, "Setup changed in another tab. Reload the saved progress before continuing.");
    let next: OnboardingData;
    if (input.action === "role") next = { ...current, role: input.role, timezone: input.timezone, step: "calendar" };
    else if (input.action === "calendar") {
      if (current.step === "role") throw new OnboardingError(409, "Choose your role first.");
      if (!input.skip) {
        const connections = await tx.select({ id: schema.calendarConnections.id }).from(schema.calendarConnections).where(and(eq(schema.calendarConnections.userId, userId), eq(schema.calendarConnections.status, "ok")));
        if (!connections.length) throw new OnboardingError(409, "Connect a calendar or choose Skip for now.");
      }
      next = { ...current, calendarSkipped: input.skip, step: "availability" };
    } else {
      if (current.step !== "availability") throw new OnboardingError(409, "Complete the previous setup steps first.");
      // Never overwrite an account that acquired scheduling data in another session.
      const existing = await tx.select({ id: schema.schedules.id }).from(schema.schedules).where(eq(schema.schedules.userId, userId));
      const events = await tx.select({ id: schema.eventTypes.id }).from(schema.eventTypes).where(eq(schema.eventTypes.userId, userId));
      if (input.action === "keep_existing") {
        if (!existing.length && !events.length) throw new OnboardingError(409, "No existing setup was found. Reload to confirm your availability.");
        next = { ...current, step: "complete" };
      } else {
        if (existing.length || events.length) throw new OnboardingError(409, "Scheduling was already set up in another session. Keep your existing schedules and events to finish without replacing them.", "existing_setup");
        const scheduleId = crypto.randomUUID();
        await tx.insert(schema.schedules).values({ id: scheduleId, userId, timezone: input.timezone, weekly: input.weekly, overrides: {} });
        await tx.insert(schema.eventTypes).values({ id: crypto.randomUUID(), userId, scheduleId, slug: "30min", title: "30 Minute Meeting", durationMin: 30 });
        await tx.update(schema.users).set({ timezone: input.timezone }).where(eq(schema.users.id, userId));
        next = { ...current, step: "complete", timezone: input.timezone, weekly: input.weekly };
      }
    }
    const [saved] = await tx.update(O).set({ ...next, version: current.version + 1, lastRequest: input, ...(next.step === "complete" ? { completedAt: new Date() } : {}) }).where(eq(O.userId, userId)).returning();
    return OnboardingData.parse(saved);
  });
}
