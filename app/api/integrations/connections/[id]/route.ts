import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
export const runtime = "nodejs";
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const db = await getDb();
  const cals = await db.select().from(schema.userCalendars).where(and(eq(schema.userCalendars.connectionId, id), eq(schema.userCalendars.userId, u.id)));
  if (cals.some((c: any) => c.id === u.addToCalendarId)) await db.update(schema.users).set({ addToCalendarId: null }).where(eq(schema.users.id, u.id));
  await db.delete(schema.calendarConnections).where(and(eq(schema.calendarConnections.id, id), eq(schema.calendarConnections.userId, u.id)));
  return NextResponse.json({ ok: true });
}
