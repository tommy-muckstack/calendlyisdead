import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import { shortId } from "./polls";
const { eventTypes, schedules } = schema;
/** A single-use booking link. It stops accepting bookings after the first one (usedAt). */
export async function createOneOff(userId: string, o: { title: string; durationMin: number; location?: string; fromEventTypeId?: string }) {
  const db = await getDb();
  let base: any = null;
  if (o.fromEventTypeId) [base] = await db.select().from(eventTypes).where(and(eq(eventTypes.id, o.fromEventTypeId), eq(eventTypes.userId, userId), isNull(eventTypes.deletedAt)));
  const [sc] = await db.select().from(schedules).where(and(eq(schedules.userId, userId), eq(schedules.isDefault, true)));
  const id = crypto.randomUUID(), slug = `o-${shortId()}`;
  const [et] = await db.insert(eventTypes).values({ id, userId, scheduleId: base?.scheduleId ?? sc?.id, slug, kind: "one_off",
    title: o.title || base?.title || "Meeting", durationMin: o.durationMin || base?.durationMin || 30, location: o.location ?? base?.location ?? "",
    description: base?.description ?? "", questions: base?.questions ?? [], lockedTimezone: base?.lockedTimezone ?? null, minNoticeMin: base?.minNoticeMin ?? 240, bufferBeforeMin: base?.bufferBeforeMin ?? 0, bufferAfterMin: base?.bufferAfterMin ?? 0,
    color: base?.color ?? "#0E7C66", priceCents: base?.priceCents ?? 0, currency: base?.currency ?? "usd" }).returning();
  return et;
}
export async function listOneOffs(userId: string) {
  const db = await getDb();
  return (await db.select().from(eventTypes).where(and(eq(eventTypes.userId, userId), eq(eventTypes.kind, "one_off"), isNull(eventTypes.deletedAt))));
}
