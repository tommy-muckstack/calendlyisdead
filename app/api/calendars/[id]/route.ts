import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
export const runtime = "nodejs";
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const { checkConflicts } = await req.json();
  const db = await getDb();
  const r = await db.update(schema.userCalendars).set({ checkConflicts: !!checkConflicts }).where(and(eq(schema.userCalendars.id, id), eq(schema.userCalendars.userId, u.id))).returning();
  return r.length ? NextResponse.json(r[0]) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
