import { hasAutomaticMeet, normalizeLocationPatch, validLocationsForKind, withLocationLocks, canonicalLocations } from "@/lib/event-locations";
import { googleMeetHostsReady } from "@/lib/google-meet-setup";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { isAdmin, propagateManaged, LOCKABLE } from "@/lib/teams";
import { EventTypePatch } from "@/lib/event-type-validation";
import { isEventLinkConflict } from "@/lib/event-type-links";
import { BookingDateRangeSchema, withDateRangeLocks } from "@/lib/booking-date-range";
import { deleteSharedEvent, sharedAccess, updateSharedEvent } from "@/lib/shared-events";
import { SharedEventError, SharedEventSettings } from "@/lib/shared-event-validation";
export const runtime = "nodejs";
const Patch = EventTypePatch.extend({ lockedFields: z.array(z.enum(LOCKABLE)).optional(), shared: SharedEventSettings.optional(), sharedVersion: z.number().int().positive().optional() });

/** Who may edit: the owner of a personal type, or a team owner/admin for team types. */
async function load(id: string, userId: string) {
  const db = await getDb();
  const [et] = await db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.id, id), isNull(schema.eventTypes.deletedAt)));
  if (!et) return null;
  if (et.sharedWorkspaceId) return (await sharedAccess(db, et, userId)) ? et : null;
  if (et.teamId) return (await isAdmin(userId, et.teamId)) ? et : null;
  return et.userId === userId ? et : null;
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const p = Patch.safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: "invalid", issues: p.error.issues }, { status: 400 });
  if (p.data.rangeDays !== undefined && p.data.dateRange !== undefined)
    return NextResponse.json({ error: "ambiguous_date_range" }, { status: 400 });
  const et = await load(id, u.id); if (!et) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const db = await getDb();
  if (et.sharedWorkspaceId) {
    try { const { shared, sharedVersion } = p.data; const fields = EventTypePatch.parse(p.data);
      return NextResponse.json(await updateSharedEvent(u.id, id, sharedVersion, fields, shared));
    } catch (error) { return NextResponse.json({ error: error instanceof SharedEventError ? error.message : isEventLinkConflict(error) ? "slug_taken" : "save_failed" }, { status: error instanceof SharedEventError ? error.status : isEventLinkConflict(error) ? 409 : 500 }); }
  }
  if (p.data.shared || p.data.sharedVersion) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const apply = async (current: typeof schema.eventTypes.$inferSelect, connection: typeof db) => {
    const data: Record<string, unknown> = normalizeLocationPatch(current, p.data);
    if (!validLocationsForKind(data.locations === undefined ? current.locations : data.locations as typeof current.locations, String(data.kind ?? current.kind)))
      return NextResponse.json({ error: "invalid_locations" }, { status: 400 });
    // Older clients still set a rolling calendar count. Clear an explicit range
    // only for an intentional legacy range edit, never for unrelated saves.
    if (p.data.rangeDays !== undefined) data.dateRange = null;
    if (p.data.lockedFields) data.lockedFields = withLocationLocks(withDateRangeLocks(p.data.lockedFields));
    // Visibility belongs to each assigned event, not the managed template.
    if (current.kind === "managed" && "secret" in data)
      return NextResponse.json({ error: "managed_template_visibility" }, { status: 400 });
    if (current.managedParentId) {
      const locked = withLocationLocks(withDateRangeLocks(current.lockedFields ?? [])).filter(f => {
        if (!(f in data)) return false;
        // jsonb may reorder keys; compare the validated range representation.
        const value = f === "dateRange" && current.dateRange ? BookingDateRangeSchema.parse(current.dateRange) : current[f as keyof typeof current];
        return f === "locations" ? canonicalLocations(data.locations as typeof current.locations) !== canonicalLocations(current.locations) : JSON.stringify(data[f]) !== JSON.stringify(value);
      });
      if (locked.length) return NextResponse.json({ error: "locked", fields: locked }, { status: 403 });
      delete data.lockedFields;
    }
    if (!current.teamId) delete data.rrMode;
    if (current.kind !== "managed") delete data.lockedFields;
    const groupSettingsLocked = current.kind === "group" && (await connection.select({ uid: schema.bookings.uid })
      .from(schema.bookings).where(eq(schema.bookings.eventTypeId, id)).limit(1)).length > 0;
    if (groupSettingsLocked) {
      // Including kind prevents switching to one-on-one to bypass the field locks.
      const fields = (["durationMin", "location", "locations", "kind"] as const).filter(f => f in data && (f === "locations" ? canonicalLocations(data.locations as typeof current.locations) !== canonicalLocations(current.locations) : data[f] !== current[f]));
      if (fields.length) return NextResponse.json({ error: "group_settings_locked", fields,
        settings: { durationMin: current.durationMin, location: current.location, locations: current.locations, kind: current.kind } }, { status: 409 });
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
    // Templates are configured by an admin; each assigned host must connect their
    // own calendar before this option can accept a booking.
    if (current.kind !== "managed" && hasAutomaticMeet(data.locations === undefined ? current.locations : data.locations as typeof current.locations)) {
      const hosts = current.teamId ? await connection.select({ userId: schema.eventTypeHosts.userId }).from(schema.eventTypeHosts).where(eq(schema.eventTypeHosts.eventTypeId, id)) : [{ userId: current.userId }];
      if (!(await googleMeetHostsReady(connection, hosts.map(host => host.userId)))) return NextResponse.json({ error: "google_meet_not_configured" }, { status: 400 });
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
  if (et.sharedWorkspaceId) {
    try { await deleteSharedEvent(u.id, id); return NextResponse.json({ ok: true }); }
    catch (error) { return NextResponse.json({ error: error instanceof SharedEventError ? error.message : "delete_failed" }, { status: error instanceof SharedEventError ? error.status : 500 }); }
  }
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
