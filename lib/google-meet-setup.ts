import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
type DB = Awaited<ReturnType<typeof getDb>>;

/** Local configuration check only. Provider access is checked during calendar I/O. */
export async function googleMeetHostsReady(db: DB, userIds: string[]) {
  const ids = [...new Set(userIds)]; if (!ids.length) return false;
  const { users: U, userCalendars: C, calendarConnections: A } = schema;
  const rows = await db.select({ id: U.id }).from(U)
    .innerJoin(C, and(eq(C.id, U.addToCalendarId), eq(C.userId, U.id)))
    .innerJoin(A, and(eq(A.id, C.connectionId), eq(A.userId, U.id)))
    .where(and(inArray(U.id, ids), eq(C.canWrite, true), eq(A.provider, "google"), eq(A.status, "ok")));
  return rows.length === ids.length;
}
