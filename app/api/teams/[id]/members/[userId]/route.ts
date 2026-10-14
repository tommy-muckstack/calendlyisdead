import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { isAdmin, role } from "@/lib/teams";
export const runtime = "nodejs";
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, userId } = await params;
  if (!(await isAdmin(u.id, id)) && u.id !== userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if ((await role(userId, id)) === "owner") return NextResponse.json({ error: "cannot_remove_owner" }, { status: 409 });
  const db = await getDb();
  await db.delete(schema.teamMembers).where(and(eq(schema.teamMembers.teamId, id), eq(schema.teamMembers.userId, userId)));
  const ets = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.teamId, id));
  for (const et of ets) await db.delete(schema.eventTypeHosts).where(and(eq(schema.eventTypeHosts.eventTypeId, et.id), eq(schema.eventTypeHosts.userId, userId)));
  return NextResponse.json({ ok: true });
}
