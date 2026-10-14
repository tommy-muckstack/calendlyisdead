import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
export const runtime = "nodejs";
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb(); const { id } = await params;
  // deactivate rather than delete so past bookings keep their event type
  const r = await db.update(schema.eventTypes).set({ active: false }).where(and(eq(schema.eventTypes.id, id), eq(schema.eventTypes.userId, u.id), eq(schema.eventTypes.kind, "one_off"))).returning();
  return r.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
