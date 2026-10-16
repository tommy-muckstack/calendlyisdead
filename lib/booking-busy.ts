import { and, eq, gt, lt, sql } from "drizzle-orm";
import { bookings } from "./db/schema";

/** Include any confirmed reservation whose meeting or saved buffer intersects the window. */
export async function confirmedReservations(db: any, hostId: string, from: Date, to: Date) {
  const starts = sql`${bookings.start} - ${bookings.bufferBeforeMin} * interval '1 minute'`;
  const ends = sql`${bookings.end} + ${bookings.bufferAfterMin} * interval '1 minute'`;
  return db.select().from(bookings).where(and(eq(bookings.hostId, hostId), eq(bookings.status, "confirmed"),
    lt(starts, to.toISOString()), gt(ends, from.toISOString())));
}

export function reservationBusy(b: { start: Date; end: Date; bufferBeforeMin: number; bufferAfterMin: number }) {
  return {
    start: new Date(+b.start - b.bufferBeforeMin * 60_000).toISOString(),
    end: new Date(+b.end + b.bufferAfterMin * 60_000).toISOString(),
  };
}
