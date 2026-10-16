import { normalizeLocationPatch, validLocationsForKind } from "./event-locations";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { SharedEventError, SharedEventSettings, type SharedHostDirectory } from "./shared-event-validation";
import { EventTypePatch } from "./event-type-validation";
import { insertEventWithLink } from "./event-type-links";
const { eventTypes: E, eventTypeHosts: H, workspaceMembers: M, workspaces: W, users: U, schedules: S } = schema;
type DB = Awaited<ReturnType<typeof getDb>>;
type Event = typeof E.$inferSelect;
type Member = typeof M.$inferSelect;
type HostRow = typeof H.$inferSelect;
const missing = (): never => { throw new SharedEventError(404, "not_found"); };
export async function sharedAccess(db: DB, event: Event, userId: string) {
  if (!event?.sharedWorkspaceId || event.deletedAt) return null;
  const [member]: Member[] = await db.select().from(M).where(and(eq(M.workspaceId, event.sharedWorkspaceId), eq(M.userId, userId)));
  if (!member) return null;
  const [host]: HostRow[] = await db.select().from(H).where(and(eq(H.eventTypeId, event.id), eq(H.membershipId, member.id), eq(H.userId, userId)));
  const admin = member.role !== "user";
  return host || admin ? { canDelete: admin || event.userId === userId, isHost: !!host } : null;
}
// Workspace -> event -> users is also used by reservations. Membership changes
// take workspace -> user, so removed/rejoined users cannot retain old access.
export async function lockSharedEvent(db: DB, id: string, userId: string) {
  const [probe]: Event[] = await db.select().from(E).where(eq(E.id, id));
  if (!probe?.sharedWorkspaceId) return missing();
  const [workspace] = await db.select({ id: W.id }).from(W).where(eq(W.id, probe.sharedWorkspaceId)).for("update");
  if (!workspace) return missing();
  const [event]: Event[] = await db.select().from(E).where(eq(E.id, id)).for("update");
  const access = await sharedAccess(db, event, userId);
  if (!access) return missing();
  return { event, access };
}
export async function sharedHostDirectory(userId: string): Promise<SharedHostDirectory | null> {
  const db = await getDb();
  return db.transaction(async (tx: DB) => {
    const [member]: Member[] = await tx.select().from(M).where(eq(M.userId, userId)); if (!member) return null;
    const [workspace] = await tx.select({ id: W.id }).from(W).where(eq(W.id, member.workspaceId)).for("share");
    const [current]: Member[] = await tx.select().from(M).where(eq(M.id, member.id)); if (!workspace || !current) return null;
    const members: { membershipId: string; userId: string; name: string | null; email: string | null }[] = await tx.select({ membershipId: M.id, userId: M.userId, name: U.name, email: U.email }).from(M).innerJoin(U, eq(U.id, M.userId)).where(eq(M.workspaceId, workspace.id)).orderBy(U.name, M.id);
    const schedules: typeof S.$inferSelect[] = await tx.select().from(S).where(inArray(S.userId, members.map(m => m.userId))).orderBy(S.name, S.id);
    return { workspaceId: workspace.id, members: members.map(m => ({ ...m, name: m.name || m.email || "Unnamed host", isMe: m.userId === userId,
      schedules: schedules.filter(s => s.userId === m.userId).map(s => ({ id: s.id, name: s.name, timezone: s.timezone, isDefault: s.isDefault })) })) };
  }, { isolationLevel: "read committed" });
}
/** Caller already holds workspace lock; pending invitations are never eligible. */
export async function validateSharedHosts(db: DB, settings: SharedEventSettings, additionalUserIds: string[] = []) {
  const members: Member[] = await db.select().from(M).where(and(eq(M.workspaceId, settings.workspaceId), inArray(M.id, settings.hosts.map(h => h.membershipId))));
  if (members.length !== settings.hosts.length) throw new SharedEventError(409, "hosts_changed");
  const ids = [...new Set([...members.map(m => m.userId), ...additionalUserIds])].sort();
  await db.select({ id: U.id }).from(U).where(inArray(U.id, ids)).orderBy(U.id).for("no key update");
  const schedules: typeof S.$inferSelect[] = await db.select().from(S).where(inArray(S.userId, ids)).for("share");
  return settings.hosts.map(h => {
    const member = members.find(m => m.id === h.membershipId)!;
    const schedule = schedules.find(s => s.userId === member.userId && (h.scheduleId ? s.id === h.scheduleId : s.isDefault));
    if (!schedule) throw new SharedEventError(400, "bad_host_schedule");
    return { ...h, userId: member.userId };
  });
}
export async function sharedEventDto(db: DB, event: Event, userId: string) {
  const hosts: HostRow[] = await db.select().from(H).where(eq(H.eventTypeId, event.id)).orderBy(H.userId);
  const [creator]: { username: string | null }[] = await db.select({ username: U.username }).from(U).where(eq(U.id, event.userId));
  const access = await sharedAccess(db, event, userId);
  return { ...event, groupSettingsLocked: false, bookingUsername: creator?.username ?? "", canEdit: !!access, canDelete: !!access?.canDelete, isHost: !!access?.isHost,
    shared: { workspaceId: event.sharedWorkspaceId!, hosts: hosts.map(h => ({ membershipId: h.membershipId!, scheduleId: h.scheduleId, priority: h.priority })), distribution: event.rrMode === "even" ? "equal" as const : "availability" as const, reschedule: event.sharedReschedule === "same" ? "same" as const : "reassign" as const } };
}
export async function listSharedEvents(userId: string) {
  const db = await getDb();
  return db.transaction(async (tx: DB) => {
    const [member]: Member[] = await tx.select().from(M).where(eq(M.userId, userId)); if (!member) return [];
    await tx.select({ id: W.id }).from(W).where(eq(W.id, member.workspaceId)).for("share");
    const events: Event[] = await tx.select().from(E).where(and(eq(E.sharedWorkspaceId, member.workspaceId), isNull(E.deletedAt))).orderBy(E.id);
    const result = [];
    for (const event of events) if (await sharedAccess(tx, event, userId)) result.push(await sharedEventDto(tx, event, userId));
    return result;
  }, { isolationLevel: "read committed" });
}
export async function updateSharedEvent(userId: string, id: string, version: number | undefined, patch: unknown, rawShared?: SharedEventSettings) {
  const db = await getDb(), parsedFields = EventTypePatch.parse(patch);
  return db.transaction(async (tx: DB) => {
    const { event } = await lockSharedEvent(tx, id, userId);
    const fields = normalizeLocationPatch(event, parsedFields);
    if (!validLocationsForKind(fields.locations ?? event.locations, event.kind)) throw new SharedEventError(400, "invalid_locations");
    if (version !== event.sharedVersion) throw new SharedEventError(409, "shared_event_changed");
    if (fields.kind !== undefined && fields.kind !== event.kind) throw new SharedEventError(409, "event_kind_locked");
    if (fields.scheduleId || fields.secret === false || fields.rrMode || (fields.seats !== undefined && fields.seats !== 1)) throw new SharedEventError(400, "shared_settings_required");
    const current = await sharedEventDto(tx, event, userId);
    const shared = SharedEventSettings.parse(rawShared ?? current.shared);
    if (shared.workspaceId !== event.sharedWorkspaceId) throw new SharedEventError(409, "hosts_changed");
    const hosts = rawShared ? await validateSharedHosts(tx, shared) : null;
    const hostIds = (value: SharedEventSettings) => value.hosts.map(h => h.membershipId).sort().join(",");
    const reset = hostIds(shared) !== hostIds(current.shared) || shared.distribution !== current.shared.distribution;
    const [saved]: Event[] = await tx.update(E).set({ ...fields, scheduleId: null, secret: true,
      ...(fields.rangeDays !== undefined ? { dateRange: null } : {}), rrMode: shared.distribution === "equal" ? "even" : "priority",
      sharedReschedule: shared.reschedule, sharedVersion: event.sharedVersion + 1, ...(reset ? { sharedRoundRobinResetAt: new Date() } : {}) }).where(eq(E.id, id)).returning();
    if (hosts) {
      await tx.delete(H).where(eq(H.eventTypeId, id));
      await tx.insert(H).values(hosts.map(h => ({ ...h, eventTypeId: id })));
    }
    return sharedEventDto(tx, saved, userId);
  }, { isolationLevel: "read committed" });
}
export async function deleteSharedEvent(userId: string, id: string) {
  const db = await getDb(); return db.transaction(async (tx: DB) => {
    const { event, access } = await lockSharedEvent(tx, id, userId); if (!access.canDelete) throw new SharedEventError(403, "forbidden");
    await tx.update(E).set({ active: false, deletedAt: new Date(), sharedVersion: event.sharedVersion + 1 }).where(eq(E.id, id));
  }, { isolationLevel: "read committed" });
}
export async function duplicateSharedEvent(userId: string, id: string) {
  const db = await getDb(); return db.transaction(async (tx: DB) => {
    const { event } = await lockSharedEvent(tx, id, userId), dto = await sharedEventDto(tx, event, userId);
    const hosts = await validateSharedHosts(tx, dto.shared, [userId]);
    const copy = await insertEventWithLink(tx, { ...event, id: crypto.randomUUID(), userId, sharedVersion: 1, sharedRoundRobinResetAt: new Date(), title: `${event.title.slice(0, 113)} (copy)` }, event.slug, "-copy");
    await tx.insert(H).values(hosts.map(h => ({ ...h, eventTypeId: copy.id })));
    return sharedEventDto(tx, copy, userId);
  }, { isolationLevel: "read committed" });
}
// Used by contacts without giving workspace administrators other hosts' data.
export const currentSharedHost = (userId: string) => sql`EXISTS (SELECT 1 FROM ${H} JOIN ${M} ON ${M.id} = ${H.membershipId} AND ${M.userId} = ${H.userId} WHERE ${H.eventTypeId} = ${E.id} AND ${H.userId} = ${userId} AND ${M.workspaceId} = ${E.sharedWorkspaceId})`;

export async function loadSharedHosts(db: DB, event: Event, lockSchedules = false) {
  const [workspace] = await db.select({ id: W.id }).from(W).where(eq(W.id, event.sharedWorkspaceId!));
  if (!workspace) return null;
  const rows: HostRow[] = await db.select().from(H).where(eq(H.eventTypeId, event.id)).orderBy(H.userId);
  if (!rows.length) return null;
  const members: Member[] = await db.select().from(M).where(and(eq(M.workspaceId, workspace.id), inArray(M.id, rows.map(h => h.membershipId ?? ""))));
  if (rows.some(h => !members.some(m => m.id === h.membershipId && m.userId === h.userId))) return null;
  const users: typeof U.$inferSelect[] = await db.select().from(U).where(inArray(U.id, rows.map(h => h.userId)));
  const query = db.select().from(S).where(inArray(S.userId, rows.map(h => h.userId))).orderBy(S.id);
  const schedules: typeof S.$inferSelect[] = await (lockSchedules ? query.for("share") : query);
  const result = rows.map(h => ({ user: users.find(u => u.id === h.userId), schedule: schedules.find(s => s.userId === h.userId && (h.scheduleId ? s.id === h.scheduleId : s.isDefault)), priority: h.priority }));
  // Never silently turn a collective meeting into a subset of its selected hosts.
  if (result.some(h => !h.user || !h.schedule)) return null;
  return result.map(h => ({ ...h, user: h.user!, schedule: h.schedule! }));
}
