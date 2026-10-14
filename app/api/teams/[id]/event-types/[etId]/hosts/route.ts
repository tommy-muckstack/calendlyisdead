import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { isAdmin, setHosts, teamMembers } from "@/lib/teams";
export const runtime = "nodejs";
const Body = z.object({ hosts: z.array(z.object({ userId: z.string(), priority: z.number().int().min(1).max(3) })).max(100) });
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; etId: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, etId } = await params; if (!(await isAdmin(u.id, id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const p = Body.safeParse(await req.json()); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const db = await getDb();
  const [et] = await db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.id, etId), eq(schema.eventTypes.teamId, id)));
  if (!et || et.kind === "managed") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const members = (await teamMembers(id)).map(m => m.userId);
  if (p.data.hosts.some(h => !members.includes(h.userId))) return NextResponse.json({ error: "not_a_member" }, { status: 400 });
  await setHosts(etId, p.data.hosts);
  return NextResponse.json({ ok: true });
}
