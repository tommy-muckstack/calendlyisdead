import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { isAdmin, propagateManaged, LOCKABLE } from "@/lib/teams";
import { EventTypePatch } from "@/lib/event-type-validation";
import { isEventLinkConflict } from "@/lib/event-type-links";
export const runtime = "nodejs";
const Patch = EventTypePatch.extend({ lockedFields: z.array(z.enum(LOCKABLE)).optional() });

/** Who may edit: the owner of a personal type, or a team owner/admin for team types. */
async function load(id: string, userId: string) {
  const db = await getDb();
  const [et] = await db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.id, id), isNull(schema.eventTypes.deletedAt)));
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
    // The chosen kind defines the booking model; editing must never convert it.
    if (data.kind !== undefined && data.kind !== current.kind)
      return NextResponse.json({ error: "event_kind_locked" }, { status: 409 });
    delete data.kind;
    if ((data.kind ?? current.kind) === "group" && Number(data.seats ?? current.seats) < 2)
      return NextResponse.json({ error: "invalid_invitee_limit" }, { status: 400 });
    if (typeof data.scheduleId === "string") {
      const [sc] = await connection.select().from(schema.schedules)
        .where(and(eq(schema.schedules.id, data.scheduleId), eq(schema.schedules.userId, u.id)));
      if (!sc) return NextResponse.json({ error: "bad_schedule" }, { status: 400 });
    }
    const [saved] = Object.keys(data).length
      ? await connection.update(schema.eventTypes).set(data).where(and(eq(schema.eventTypes.id, id), isNull(schema.eventTypes.deletedAt))).returning()
      : [current];
    if (!saved) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ...saved, groupSettingsLocked });
  };
  try {
    const response = et.teamId ? await apply(et, db) : await db.transaction(async (tx: typeof db) => {
      // Same lock as reservations: either the edit commits before the first
      // booking, or it sees that booking and rejects protected-field changes.
      await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, u.id)).for("update");
      const [current] = await tx.select().from(schema.eventTypes)
        .where(and(eq(schema.eventTypes.id, id), eq(schema.eventTypes.userId, u.id)));
      if (!current || current.teamId || current.deletedAt) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return apply(current, tx);
    }, { isolationLevel: "read committed" });
    if (response.ok && et.kind === "managed") await propagateManaged(id);
    return response;
  } catch (error) {
    return isEventLinkConflict(error)
      ? NextResponse.json({ error: "slug_taken" }, { status: 409 })
      : NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const et = await load(id, u.id); if (!et) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (et.managedParentId) return NextResponse.json({ error: "managed" }, { status: 403 });
  const db = await getDb();
  const removed = await db.transaction(async (tx: typeof db) => {
    // Serialize with managed assignments and reservations, then take a fresh
    // snapshot of the assigned copies. Retain booking/reminder/provider records.
    const [current] = await tx.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, id)).for("update");
    if (!current || current.deletedAt) return false;
    await tx.update(schema.eventTypes).set({ active: false, deletedAt: new Date() }).where(and(isNull(schema.eventTypes.deletedAt),
      current.kind === "managed" ? or(eq(schema.eventTypes.id, id), eq(schema.eventTypes.managedParentId, id)) : eq(schema.eventTypes.id, id)));
    return true;
  }, { isolationLevel: "read committed" });
  return removed ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
