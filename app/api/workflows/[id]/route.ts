import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
export const runtime = "nodejs";
const Body = z.object({ name: z.string().min(1).max(120), trigger: z.enum(["on_booked", "before_start", "after_end", "on_cancelled"]), offsetMin: z.number().int().min(0).max(60 * 24 * 60),
  channel: z.enum(["email", "sms"]), recipient: z.enum(["invitee", "host"]), subject: z.string().max(300), body: z.string().max(5000), eventTypeIds: z.array(z.string()).max(200), active: z.boolean() }).partial();
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const p = Body.safeParse(await req.json()); if (!p.success) return NextResponse.json({ error: "invalid", issues: p.error.issues }, { status: 400 });
  if (p.data.channel === "sms" && p.data.recipient === "host") return NextResponse.json({ error: "sms_to_host_unsupported" }, { status: 400 });
  const db = await getDb();
  const r = await db.update(schema.workflows).set(p.data).where(and(eq(schema.workflows.id, id), eq(schema.workflows.userId, u.id))).returning();
  return r.length ? NextResponse.json(r[0]) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const db = await getDb();
  await db.delete(schema.workflows).where(and(eq(schema.workflows.id, id), eq(schema.workflows.userId, u.id)));
  return NextResponse.json({ ok: true });
}
