import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { safeUrl } from "@/lib/routing";
export const runtime = "nodejs";
const Action = z.object({ type: z.enum(["event", "url", "message"]), value: z.string().max(1000) })
  .refine(a => a.type !== "url" || !!safeUrl(a.value), "url must be http(s)").refine(a => a.type !== "event" || /^(team:)?[a-z0-9-]+\/[a-z0-9-]+$/.test(a.value), "event must be user/slug or team:team/slug");
const Body = z.object({ name: z.string().min(1).max(120),
  fields: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,40}$/), label: z.string().min(1).max(200), type: z.enum(["text", "email", "select"]), required: z.boolean(), options: z.array(z.string().min(1).max(100)).max(50).optional() })).max(30),
  rules: z.array(z.object({ match: z.enum(["all", "any"]), conditions: z.array(z.object({ fieldId: z.string(), op: z.enum(["equals", "not_equals", "contains", "in", "gte", "lte"]), value: z.string().max(500) })).max(20), action: Action })).max(50),
  fallback: Action }).partial();
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const p = Body.safeParse(await req.json()); if (!p.success) return NextResponse.json({ error: "invalid", issues: p.error.issues }, { status: 400 });
  const db = await getDb();
  const r = await db.update(schema.routingForms).set(p.data as any).where(and(eq(schema.routingForms.id, id), eq(schema.routingForms.userId, u.id))).returning();
  return r.length ? NextResponse.json(r[0]) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const db = await getDb();
  await db.delete(schema.routingForms).where(and(eq(schema.routingForms.id, id), eq(schema.routingForms.userId, u.id)));
  return NextResponse.json({ ok: true });
}
