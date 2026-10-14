import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
export const runtime = "nodejs";
export async function PUT(req: NextRequest) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { calendarId } = await req.json(); const db = await getDb();
  if (calendarId) {
    const [c] = await db.select().from(schema.userCalendars).where(and(eq(schema.userCalendars.id, calendarId), eq(schema.userCalendars.userId, u.id)));
    if (!c || !c.canWrite) return NextResponse.json({ error: "not_writable" }, { status: 400 });
  }
  await db.update(schema.users).set({ addToCalendarId: calendarId || null }).where(eq(schema.users.id, u.id));
  return NextResponse.json({ ok: true });
}
