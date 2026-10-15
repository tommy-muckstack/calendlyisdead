import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { isAdmin, propagateManaged, LOCKABLE } from "@/lib/teams";
export const runtime = "nodejs";
const Patch = z.object({ title: z.string().min(1).max(120), slug: z.string().regex(/^[a-z0-9-]{1,60}$/), description: z.string().max(5000),
  durationMin: z.number().int().min(5).max(720), location: z.string().max(300), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  bufferBeforeMin: z.number().int().min(0).max(240), bufferAfterMin: z.number().int().min(0).max(240), minNoticeMin: z.number().int().min(0).max(43200),
  rangeDays: z.number().int().min(1).max(730), active: z.boolean(),
  scheduleId: z.string().min(1).nullable(), maxPerDay: z.number().int().min(1).max(100).nullable(), maxPerWeek: z.number().int().min(1).max(500).nullable(),
  questions: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,40}$/), label: z.string().min(1).max(200), type: z.enum(["text", "textarea", "phone", "select"]),
    required: z.boolean(), options: z.array(z.string().min(1).max(100)).max(30).optional() })).max(20),
  kind: z.enum(["one_on_one", "group"]), seats: z.number().int().min(1).max(1000), rrMode: z.enum(["even", "priority"]),
  lockedFields: z.array(z.enum(LOCKABLE)),
  priceCents: z.number().int().min(0).max(10_000_000), currency: z.enum(["usd", "eur", "gbp", "cad", "aud"]),
  redirectUrl: z.string().url().regex(/^https?:\/\//).max(500).nullable() }).partial();

/** Who may edit: the owner of a personal type, or a team owner/admin for team types. */
async function load(id: string, userId: string) {
  const db = await getDb();
  const [et] = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, id));
  if (!et) return null;
  if (et.teamId) return (await isAdmin(userId, et.teamId)) ? et : null;
  return et.userId === userId ? et : null;
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const p = Patch.safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: "invalid", issues: p.error.issues }, { status: 400 });
  const et = await load(id, u.id); if (!et) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const data: any = { ...p.data };
  if (et.managedParentId) {
    // a member's copy of a managed type: locked fields must not change
    const locked = (et.lockedFields ?? []).filter((f: string) => f in data && JSON.stringify(data[f]) !== JSON.stringify(et[f]));
    if (locked.length) return NextResponse.json({ error: "locked", fields: locked }, { status: 403 });
    delete data.lockedFields;
  }
  if (et.teamId) delete data.kind; // team kinds are fixed at creation
  if (!et.teamId) delete data.rrMode;
  if (et.kind !== "managed") delete data.lockedFields;
  const db = await getDb();
  if (data.scheduleId) { const [sc] = await db.select().from(schema.schedules).where(and(eq(schema.schedules.id, data.scheduleId), eq(schema.schedules.userId, u.id))); if (!sc) return NextResponse.json({ error: "bad_schedule" }, { status: 400 }); }
  try {
    const r = await db.update(schema.eventTypes).set(data).where(eq(schema.eventTypes.id, id)).returning();
    if (et.kind === "managed") await propagateManaged(id);
    return NextResponse.json(r[0]);
  } catch { return NextResponse.json({ error: "slug_taken" }, { status: 409 }); }
}
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const et = await load(id, u.id); if (!et) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (et.managedParentId) return NextResponse.json({ error: "managed" }, { status: 403 });
  const db = await getDb();
  if (et.kind === "managed") await db.delete(schema.eventTypes).where(eq(schema.eventTypes.managedParentId, id));
  await db.delete(schema.eventTypes).where(eq(schema.eventTypes.id, id));
  return NextResponse.json({ ok: true });
}
