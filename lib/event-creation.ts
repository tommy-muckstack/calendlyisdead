import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import { EventCreation } from "./event-creation-validation";
import { insertEventWithLink, isEventLinkConflict } from "./event-type-links";
type DB = Awaited<ReturnType<typeof getDb>>;
export class EventCreationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function createEventDraft(userId: string, raw: EventCreation) {
  const input = EventCreation.parse(raw), db = await getDb(), E = schema.eventTypes, R = schema.eventTypeCreations;
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  try {
    return await db.transaction(async (tx: DB) => {
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
        return { event: { ...event, groupSettingsLocked }, replayed: true };
      }
      if (input.settings.scheduleId) {
        const [schedule] = await tx.select({ id: schema.schedules.id }).from(schema.schedules).where(and(eq(schema.schedules.id, input.settings.scheduleId), eq(schema.schedules.userId, userId))).for("share");
        if (!schedule) throw new EventCreationError(400, "bad_schedule");
      }
      const [inserted] = await tx.insert(R).values({ id: input.draftId, userId, requestHash }).onConflictDoNothing().returning({ id: R.id });
      if (!inserted) throw new EventCreationError(409, "creation_conflict");
      const values = { ...input.settings, id: input.draftId, userId };
      const event = input.autoSlug ? await insertEventWithLink(tx, values, input.settings.slug)
        : (await tx.insert(E).values(values).returning())[0];
      return { event: { ...event, groupSettingsLocked: false }, replayed: false };
    }, { isolationLevel: "read committed" });
  } catch (error) {
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
