import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { insertEventWithLink } from "@/lib/event-type-links";
export const runtime = "nodejs";
export async function POST() {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const [sc] = await db.select().from(schema.schedules).where(and(eq(schema.schedules.userId, u.id), eq(schema.schedules.isDefault, true)));
  const et = await insertEventWithLink(db, { id: crypto.randomUUID(), userId: u.id, scheduleId: sc?.id, title: "New meeting", durationMin: 30 }, "new-meeting");
  return NextResponse.json(et);
}
