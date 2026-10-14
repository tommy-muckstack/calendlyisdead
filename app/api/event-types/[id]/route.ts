import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
export const runtime = "nodejs";
const Patch = z.object({ title: z.string().min(1).max(120), slug: z.string().regex(/^[a-z0-9-]{1,60}$/), description: z.string().max(5000),
  durationMin: z.number().int().min(5).max(720), location: z.string().max(300), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  bufferBeforeMin: z.number().int().min(0).max(240), bufferAfterMin: z.number().int().min(0).max(240), minNoticeMin: z.number().int().min(0).max(43200),
  rangeDays: z.number().int().min(1).max(730), active: z.boolean() }).partial();
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const p = Patch.safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: "invalid", issues: p.error.issues }, { status: 400 });
  const db = await getDb();
  try {
    const r = await db.update(schema.eventTypes).set(p.data).where(and(eq(schema.eventTypes.id, id), eq(schema.eventTypes.userId, u.id))).returning();
    return r.length ? NextResponse.json(r[0]) : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch { return NextResponse.json({ error: "slug_taken" }, { status: 409 }); }
}
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const db = await getDb();
  await db.delete(schema.eventTypes).where(and(eq(schema.eventTypes.id, id), eq(schema.eventTypes.userId, u.id)));
  return NextResponse.json({ ok: true });
}
