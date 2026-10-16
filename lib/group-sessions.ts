import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "./db";

export const InviteeLimit = z.number().int().min(2).max(9999);
const { bookings: B, eventTypes: E, users } = schema;

/** Past and cancelled bookings still lock a group template's core settings. */
export async function getLockedGroupEventIds(userId: string): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.selectDistinct({ id: E.id }).from(E).innerJoin(B, eq(B.eventTypeId, E.id))
    .where(and(eq(E.userId, userId), eq(E.kind, "group")));
  return new Set(rows.map((row: { id: string }) => row.id));
}

async function session(db: any, hostId: string, uid: string) {
  const [meeting] = await db.select({ eventTypeId: B.eventTypeId, start: B.start }).from(B).innerJoin(E, eq(B.eventTypeId, E.id))
    .where(and(eq(B.uid, uid), eq(B.hostId, hostId), eq(B.status, "confirmed"), eq(E.kind, "group")));
  if (!meeting) return null;
  const where = and(eq(B.hostId, hostId), eq(B.eventTypeId, meeting.eventTypeId), eq(B.start, meeting.start), eq(B.status, "confirmed"));
  const rows = await db.select({ uid: B.uid, inviteeLimit: B.inviteeLimit }).from(B).where(where).orderBy(B.createdAt, B.uid);
  return rows.length ? { where, rows } : null;
}

export async function getGroupInviteeLimit(hostId: string, uid: string) {
  const found = await session(await getDb(), hostId, uid);
  return found ? { inviteeLimit: found.rows[0].inviteeLimit as number, booked: found.rows.length } : null;
}

export async function updateGroupInviteeLimit(hostId: string, uid: string, value: number) {
  const parsed = InviteeLimit.safeParse(value);
  if (!parsed.success) return { error: "invalid" as const };
  const db = await getDb();
  return db.transaction(async (tx: any) => {
    // Serialize capacity edits with new seats, using the booking reservation lock.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, hostId)).for("update");
    const found = await session(tx, hostId, uid);
    if (!found) return { error: "not_found" as const };
    if (parsed.data < found.rows.length) return { error: "below_invitee_count" as const, minimum: found.rows.length };
    const saved = await tx.update(B).set({ inviteeLimit: parsed.data }).where(found.where).returning({ uid: B.uid });
    return { inviteeLimit: parsed.data, booked: saved.length };
  }, { isolationLevel: "read committed" });
}
