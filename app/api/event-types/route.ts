import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
export const runtime = "nodejs";
export async function POST() {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const mine = await db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.userId, u.id), isNull(schema.eventTypes.deletedAt)));
  const [sc] = await db.select().from(schema.schedules).where(and(eq(schema.schedules.userId, u.id), eq(schema.schedules.isDefault, true)));
  let slug = "new-meeting", n = 1; while (mine.some((e: any) => e.slug === slug)) slug = `new-meeting-${++n}`;
  const [et] = await db.insert(schema.eventTypes).values({ id: crypto.randomUUID(), userId: u.id, scheduleId: sc?.id, slug, title: "New meeting", durationMin: 30 }).returning();
  return NextResponse.json(et);
}
