import { and, eq, inArray, sql } from "drizzle-orm";
import { schema } from "./db";
import type { ContactDB } from "./contact-store";
const { opportunityBookings: L, opportunities: O, bookings: B } = schema;
export async function opportunityBooking(db: ContactDB, userId: string, opportunityId: string) {
  const [row] = await db.select({ link: L, booking: { uid: B.uid, start: B.start, end: B.end, status: B.status, name: B.inviteeName } }).from(L).innerJoin(O, eq(O.id, L.opportunityId))
    .leftJoin(B, and(eq(B.uid, L.bookingUid), eq(B.hostId, userId))).where(and(eq(L.opportunityId, opportunityId), eq(L.userId, userId), eq(O.userId, userId)));
  if (!row) return null;
  return { automationName: row.link.automationName, eventTitle: row.link.eventTitle, bookingUid: row.booking?.uid ?? null, start: row.booking?.start.toISOString() ?? null, end: row.booking?.end.toISOString() ?? null, status: row.booking?.status ?? null, inviteeName: row.booking?.name ?? null };
}
// A reschedule updates the linked booking without creating another opportunity
// or changing a person's edits/stage. Collective rows share the anchor UID.
export async function relinkOpportunityBookings(db: ContactDB, booking: { hostId: string; uid: string; eventTypeId: string; rescheduledFrom?: string | null }) {
  if (!booking.rescheduledFrom) return;
  const [current] = await db.select({ uid: B.uid }).from(B).where(and(eq(B.uid, booking.uid), eq(B.hostId, booking.hostId), eq(B.eventTypeId, booking.eventTypeId), eq(B.status, "confirmed"), eq(B.rescheduledFrom, booking.rescheduledFrom)));
  const [anchor] = await db.select({ groupUid: B.groupUid }).from(B).where(and(eq(B.uid, booking.rescheduledFrom), eq(B.eventTypeId, booking.eventTypeId))); if (!current || !anchor) return;
  const prior = await db.select({ uid: B.uid }).from(B).where(and(eq(B.hostId, booking.hostId), eq(B.eventTypeId, booking.eventTypeId), anchor.groupUid ? eq(B.groupUid, anchor.groupUid) : eq(B.uid, booking.rescheduledFrom))); if (!prior.length) return;
  await db.update(L).set({ bookingUid: booking.uid }).where(and(eq(L.userId, booking.hostId), inArray(L.bookingUid, prior.map(row => row.uid)), sql`EXISTS (SELECT 1 FROM ${O} WHERE ${O.id} = ${L.opportunityId} AND ${O.userId} = ${booking.hostId})`));
}
