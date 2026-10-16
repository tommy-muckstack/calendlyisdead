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
  kind: z.enum(["one_on_one", "group"]), seats: z.number().int().min(1).max(9999), rrMode: z.enum(["even", "priority"]),
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
  const db = await getDb();
  const apply = async (current: typeof schema.eventTypes.$inferSelect, connection: typeof db) => {
    const data: Record<string, unknown> = { ...p.data };
    if (current.managedParentId) {
      const locked = (current.lockedFields ?? []).filter(f => f in data && JSON.stringify(data[f]) !== JSON.stringify(current[f]));
      if (locked.length) return NextResponse.json({ error: "locked", fields: locked }, { status: 403 });
      delete data.lockedFields;
    }
    if (current.teamId) delete data.kind;
    if (!current.teamId) delete data.rrMode;
    if (current.kind !== "managed") delete data.lockedFields;
    const groupSettingsLocked = current.kind === "group" && (await connection.select({ uid: schema.bookings.uid })
      .from(schema.bookings).where(eq(schema.bookings.eventTypeId, id)).limit(1)).length > 0;
    if (groupSettingsLocked) {
      // Including kind prevents switching to one-on-one to bypass the field locks.
      const fields = (["durationMin", "location", "kind"] as const).filter(f => f in data && data[f] !== current[f]);
      if (fields.length) return NextResponse.json({ error: "group_settings_locked", fields,
        settings: { durationMin: current.durationMin, location: current.location, kind: current.kind } }, { status: 409 });
    }
    if ((data.kind ?? current.kind) === "group" && Number(data.seats ?? current.seats) < 2)
      return NextResponse.json({ error: "invalid_invitee_limit" }, { status: 400 });
    if (typeof data.scheduleId === "string") {
      const [sc] = await connection.select().from(schema.schedules)
        .where(and(eq(schema.schedules.id, data.scheduleId), eq(schema.schedules.userId, u.id)));
      if (!sc) return NextResponse.json({ error: "bad_schedule" }, { status: 400 });
    }
    const [saved] = Object.keys(data).length
      ? await connection.update(schema.eventTypes).set(data).where(eq(schema.eventTypes.id, id)).returning()
      : [current];
    return NextResponse.json({ ...saved, groupSettingsLocked });
  };
  try {
    const response = et.teamId ? await apply(et, db) : await db.transaction(async (tx: typeof db) => {
      // Same lock as reservations: either the edit commits before the first
      // booking, or it sees that booking and rejects protected-field changes.
      await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, u.id)).for("update");
      const [current] = await tx.select().from(schema.eventTypes)
        .where(and(eq(schema.eventTypes.id, id), eq(schema.eventTypes.userId, u.id)));
      if (!current || current.teamId) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return apply(current, tx);
    }, { isolationLevel: "read committed" });
    if (response.ok && et.kind === "managed") await propagateManaged(id);
    return response;
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
