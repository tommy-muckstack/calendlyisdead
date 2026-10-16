import { normalizeLocationPatch } from "./event-locations";
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import { EventCreation } from "./event-creation-validation";
import { sharedAccess, sharedEventDto, validateSharedHosts } from "./shared-events";
import { SharedEventError } from "./shared-event-validation";
import { insertEventWithLink, isEventLinkConflict } from "./event-type-links";
type DB = Awaited<ReturnType<typeof getDb>>;
export class EventCreationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function createEventDraft(userId: string, raw: EventCreation) {
  const input = EventCreation.parse(raw), db = await getDb(), E = schema.eventTypes, R = schema.eventTypeCreations;
  const { locations, ...legacySettings } = input.settings;
  const requestHash = createHash("sha256").update(JSON.stringify({ ...input, settings: locations === null ? legacySettings : { ...legacySettings, locations } })).digest("hex");
  try {
    return await db.transaction(async (tx: DB) => {
      if (input.shared) {
        const [workspace] = await tx.select().from(schema.workspaces).where(eq(schema.workspaces.id, input.shared.workspaceId)).for("update");
        const [member] = await tx.select().from(schema.workspaceMembers).where(and(eq(schema.workspaceMembers.workspaceId, input.shared.workspaceId), eq(schema.workspaceMembers.userId, userId)));
        if (!workspace || !member) throw new EventCreationError(409, "workspace_required");
      }
      const hosts = input.shared ? await validateSharedHosts(tx, input.shared, [userId]) : null;
      // Serialize drafts without blocking FK key-share checks from legacy
      // creation paths, which may already hold a candidate public-link key.
      const [owner] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).for("no key update");
      if (!owner) throw new EventCreationError(404, "not_found");
      const [receipt] = await tx.select().from(R).where(eq(R.id, input.draftId));
      if (receipt) {
        if (receipt.userId !== userId || receipt.requestHash !== requestHash) throw new EventCreationError(409, "creation_conflict");
        const [event] = await tx.select().from(E).where(and(eq(E.id, input.draftId), eq(E.userId, userId), isNull(E.deletedAt)));
        if (!event) throw new EventCreationError(410, "created_event_deleted");
        const groupSettingsLocked = event.kind === "group" && (await tx.select({ uid: schema.bookings.uid }).from(schema.bookings).where(eq(schema.bookings.eventTypeId, event.id)).limit(1)).length > 0;
        if (event.sharedWorkspaceId) {
          if (!(await sharedAccess(tx, event, userId))) throw new EventCreationError(409, "shared_access_changed");
          return { event: await sharedEventDto(tx, event, userId), replayed: true };
        }
        return { event: { ...event, groupSettingsLocked }, replayed: true };
      }
      if (input.settings.scheduleId) {
        const [schedule] = await tx.select({ id: schema.schedules.id }).from(schema.schedules).where(and(eq(schema.schedules.id, input.settings.scheduleId), eq(schema.schedules.userId, userId))).for("share");
        if (!schedule) throw new EventCreationError(400, "bad_schedule");
      }
      const [inserted] = await tx.insert(R).values({ id: input.draftId, userId, requestHash }).onConflictDoNothing().returning({ id: R.id });
      if (!inserted) throw new EventCreationError(409, "creation_conflict");
      const values = { ...normalizeLocationPatch({ location: "" }, input.settings), id: input.draftId, userId, ...(input.shared ? {
        sharedWorkspaceId: input.shared.workspaceId, secret: true, rrMode: input.shared.distribution === "equal" ? "even" : "priority", sharedReschedule: input.shared.reschedule,
      } : {}) };
      const event = input.autoSlug ? await insertEventWithLink(tx, values, input.settings.slug)
        : (await tx.insert(E).values(values).returning())[0];
      if (hosts) {
        await tx.insert(schema.eventTypeHosts).values(hosts.map(h => ({ ...h, eventTypeId: event.id })));
        return { event: await sharedEventDto(tx, event, userId), replayed: false };
      }
      return { event: { ...event, groupSettingsLocked: false }, replayed: false };
    }, { isolationLevel: "read committed" });
  } catch (error) {
    if (error instanceof SharedEventError) throw new EventCreationError(error.status, error.message);
    if (isEventLinkConflict(error)) throw new EventCreationError(409, "slug_taken");
    // A UUID already used outside this flow cannot be claimed by a new draft.
    let cause: unknown = error;
    const visited = new Set<unknown>();
    while (cause && typeof cause === "object" && !visited.has(cause)) {
      visited.add(cause);
      if ("code" in cause && cause.code === "23505") throw new EventCreationError(409, "creation_conflict");
      cause = "cause" in cause ? cause.cause : null;
    }
    throw error;
  }
}
