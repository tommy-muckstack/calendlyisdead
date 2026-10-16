import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { isAdmin } from "@/lib/teams";
import { meetingLimits } from "@/lib/meeting-limits";
export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb(); const { id } = await params;
  const [event] = await db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.id, id), isNull(schema.eventTypes.deletedAt)));
  if (!event || (event.teamId ? !(await isAdmin(user.id, event.teamId)) : event.userId !== user.id))
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const hostIds = !event.teamId ? [event.userId] : event.kind === "managed"
    ? (await db.select({ userId: schema.eventTypes.userId }).from(schema.eventTypes).where(and(eq(schema.eventTypes.managedParentId, id), isNull(schema.eventTypes.deletedAt)))).map((row: { userId: string }) => row.userId)
    : (await db.select().from(schema.eventTypeHosts).where(eq(schema.eventTypeHosts.eventTypeId, id))).map((row: { userId: string }) => row.userId);
  const hosts: typeof schema.users.$inferSelect[] = hostIds.length ? await db.select().from(schema.users).where(inArray(schema.users.id, hostIds)) : [];
  return NextResponse.json({ hosts: hosts.map(host => ({ id: host.id, name: host.name || "Unnamed host", timezone: host.timezone,
    isMe: host.id === user.id, ...meetingLimits(host) })) });
}
