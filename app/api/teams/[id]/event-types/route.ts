import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { isAdmin, setHosts, teamMembers } from "@/lib/teams";
export const runtime = "nodejs";
const Body = z.object({ kind: z.enum(["collective", "round_robin", "managed"]), title: z.string().min(1).max(120).default("Team meeting") });
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; if (!(await isAdmin(u.id, id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const p = Body.safeParse(await req.json()); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const db = await getDb();
  const mine = await db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.teamId, id), isNull(schema.eventTypes.deletedAt)));
  const baseSlug = p.data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "meeting";
  let slug = baseSlug, n = 1; while (mine.some((e: any) => e.slug === slug)) slug = `${baseSlug}-${++n}`;
  const [et] = await db.insert(schema.eventTypes).values({ id: crypto.randomUUID(), userId: u.id, teamId: id, slug, title: p.data.title, kind: p.data.kind, durationMin: 30,
    lockedFields: p.data.kind === "managed" ? ["title", "durationMin", "location", "description"] : [] }).returning();
  if (p.data.kind !== "managed") await setHosts(et.id, (await teamMembers(id)).map(m => ({ userId: m.userId, priority: 2 })));
  return NextResponse.json(et);
}
