import { and, asc, eq, gt, inArray, isNull, lte, ne } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { ConferenceResult } from "./calendars/types";
const { calendarConferenceJobs: J, bookings: B } = schema;
type DB = Awaited<ReturnType<typeof getDb>>;
type Job = typeof J.$inferSelect;
const RETRY_MS = 5 * 60_000, MAX_ATTEMPTS = 12;

export async function queueGoogleConference(input: Pick<Job, "id" | "hostId" | "calendarId" | "externalEventId">, now = new Date()) {
  const db = await getDb();
  // A session has one selected provider event. A retry cannot retarget its job.
  await db.insert(J).values({ ...input, nextAttemptAt: now }).onConflictDoNothing();
}

const live = (id: string, now: Date) => and(eq(B.conferenceRequestId, id), eq(B.status, "confirmed"), gt(B.end, now));
async function claim(id: string, now: Date): Promise<Job | null> {
  const db = await getDb();
  return db.transaction(async (tx: DB) => {
    const [job]: Job[] = await tx.select().from(J).where(eq(J.id, id)).for("update");
    if (!job || !["pending", "reading"].includes(job.status) || +job.nextAttemptAt > +now) return null;
    const rows = await tx.select({ uid: B.uid }).from(B).where(live(id, now));
    if (!rows.length) {
      const expired = await tx.update(B).set({ conferenceStatus: "failed" }).where(and(eq(B.conferenceRequestId, id), eq(B.status, "confirmed"), lte(B.end, now), isNull(B.meetingUrl))).returning({ uid: B.uid });
      await tx.update(J).set({ status: expired.length ? "failed" : "cancelled" }).where(eq(J.id, id)); return null;
    }
    if (job.attempts >= MAX_ATTEMPTS) {
      await tx.update(J).set({ status: "failed" }).where(eq(J.id, id));
      await tx.update(B).set({ conferenceStatus: "failed" }).where(and(live(id, now), isNull(B.meetingUrl)));
      return null;
    }
    const [claimed]: Job[] = await tx.update(J).set({ status: "reading", attempts: job.attempts + 1, nextAttemptAt: new Date(+now + RETRY_MS) }).where(eq(J.id, id)).returning();
    return claimed;
  });
}

async function settle(job: Job, result: ConferenceResult, now: Date) {
  const db = await getDb();
  return db.transaction(async (tx: DB) => {
    const [current]: Job[] = await tx.select().from(J).where(eq(J.id, job.id)).for("update");
    // A slow response from an expired lease cannot replace a newer result.
    if (!current || current.status !== "reading" || current.attempts !== job.attempts) return "stale";
    const rows = await tx.select({ uid: B.uid }).from(B).where(live(job.id, now)).for("update");
    const status = !rows.length ? "cancelled" : result.conferenceStatus === "pending" && job.attempts >= MAX_ATTEMPTS ? "failed" : result.conferenceStatus;
    await tx.update(J).set({ status, ...(status === "ready" ? { meetingUrl: result.meetingUrl! } : {}) }).where(eq(J.id, job.id));
    if (rows.length && status !== "pending") await tx.update(B).set({ conferenceStatus: status === "ready" ? "ready" : "failed", ...(status === "ready" ? { meetingUrl: result.meetingUrl! } : {}) })
      .where(and(inArray(B.uid, rows.map((row: { uid: string }) => row.uid)), eq(B.status, "confirmed"), ne(B.paymentStatus, "pending"), isNull(B.meetingUrl)));
    return status;
  });
}

/** Poll known provider events only; no event creation and no provider I/O in a transaction. */
export async function processCalendarConferences(now = new Date()) {
  if (!Number.isFinite(+now)) throw new Error("invalid_time");
  const db = await getDb(), began = Date.now();
  const due: { id: string }[] = await db.select({ id: J.id }).from(J)
    .where(and(inArray(J.status, ["pending", "reading"]), lte(J.nextAttemptAt, now))).orderBy(asc(J.nextAttemptAt), asc(J.id)).limit(20);
  const counts = { checked: 0, ready: 0, pending: 0, failed: 0, cancelled: 0 };
  for (const { id } of due) {
    if (Date.now() - began >= 20_000) break;
    const job = await claim(id, now); if (!job) continue;
    let result: ConferenceResult;
    try { const { readCalendarConference } = await import("./calendars"); result = await readCalendarConference(job.hostId, job.calendarId, job.externalEventId); }
    catch { result = { conferenceStatus: "pending" }; } // Transient reads retry within a bounded window.
    const status = await settle(job, result, now); counts.checked++;
    if (status !== "stale") counts[status as "ready" | "pending" | "failed" | "cancelled"]++;
  }
  return counts;
}
