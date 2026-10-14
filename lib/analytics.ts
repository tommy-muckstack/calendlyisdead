import { DateTime } from "luxon";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "./db";

export async function recordView(eventTypeId: string, now = new Date()) {
  try {
    const db = await getDb(); const day = now.toISOString().slice(0, 10);
    await db.insert(schema.pageViews).values({ eventTypeId, day, count: 1 })
      .onConflictDoUpdate({ target: [schema.pageViews.eventTypeId, schema.pageViews.day], set: { count: sql`${schema.pageViews.count} + 1` } });
  } catch { /* analytics never breaks a booking page */ }
}

export type Row = { uid: string; eventTypeId: string; start: Date; createdAt: Date; status: string; cancelReason: string | null; rescheduledFrom: string | null; paymentStatus: string; amountCents: number; groupUid: string | null };
export type Stats = ReturnType<typeof computeStats>;

/** Pure: aggregate bookings created in the window. Collective/RR siblings (groupUid, suffix -n) count once. */
export function computeStats(rows: Row[], views: { eventTypeId: string; count: number }[], types: { id: string; title: string; color: string }[], tz: string, now = new Date()) {
  const primary = rows.filter(r => !(r.groupUid && r.uid !== r.groupUid));
  const created = primary.filter(r => r.paymentStatus !== "pending" && r.cancelReason !== "payment_expired");
  const rescheduled = created.filter(r => r.rescheduledFrom).length;
  const cancelled = created.filter(r => r.status === "cancelled" && r.cancelReason !== "rescheduled").length;
  const live = created.filter(r => r.status === "confirmed");
  const completed = live.filter(r => r.start < now).length, upcoming = live.length - completed;
  const newBookings = created.filter(r => !r.rescheduledFrom).length;
  const revenueCents = created.filter(r => r.paymentStatus === "paid" && r.status === "confirmed").reduce((a, r) => a + r.amountCents, 0);
  const totalViews = views.reduce((a, v) => a + v.count, 0);
  const byType = types.map(t => {
    const mine = created.filter(r => r.eventTypeId === t.id && !r.rescheduledFrom);
    const v = views.filter(x => x.eventTypeId === t.id).reduce((a, x) => a + x.count, 0);
    return { ...t, bookings: mine.length, views: v, conversion: v ? mine.length / v : null };
  }).filter(t => t.bookings || t.views).sort((a, b) => b.bookings - a.bookings);
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0)) as number[][];
  for (const r of live) { const d = DateTime.fromJSDate(r.start).setZone(tz); heat[d.weekday - 1][d.hour]++; }
  let best = { day: -1, hour: -1, n: 0 };
  heat.forEach((row, d) => row.forEach((n, h) => { if (n > best.n) best = { day: d, hour: h, n }; }));
  return { newBookings, rescheduled, cancelled, completed, upcoming, revenueCents, totalViews,
    cancelRate: created.length ? cancelled / created.length : 0, conversion: totalViews ? newBookings / totalViews : null, byType, heat,
    busiest: best.n ? { day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][best.day], hour: best.hour, n: best.n } : null };
}

export async function statsFor(userId: string, days: number, tz: string) {
  const db = await getDb();
  const since = DateTime.utc().minus({ days }).toJSDate();
  const types = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.userId, userId));
  const ids = types.map((t: any) => t.id);
  const rows = ids.length ? await db.select().from(schema.bookings).where(and(inArray(schema.bookings.eventTypeId, ids), gte(schema.bookings.createdAt, since))) : [];
  const views = ids.length ? await db.select().from(schema.pageViews).where(and(inArray(schema.pageViews.eventTypeId, ids), gte(schema.pageViews.day, since.toISOString().slice(0, 10)))) : [];
  return computeStats(rows, views, types, tz);
}
