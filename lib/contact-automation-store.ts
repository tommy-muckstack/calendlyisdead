import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { schema } from "./db";
import type { ContactDB } from "./contact-store";
const { eventTypes: E, eventTypeHosts: H } = schema;
export class ContactAutomationError extends Error { constructor(message: string, public status = 409) { super(message); } }
// Each host manages their own contacts and lists, including their own copy of
// an assigned event. A team administrator does not gain access to others' lists.
export const availableAutomationEvents = (userId: string) => and(isNull(E.deletedAt), ne(E.kind, "managed"), ne(E.kind, "poll"), or(and(isNull(E.teamId), eq(E.userId, userId)), sql`EXISTS (SELECT 1 FROM ${H} WHERE ${H.eventTypeId} = ${E.id} AND ${H.userId} = ${userId})`));
export async function contactAutomationEvent(db: ContactDB, userId: string, eventTypeId: string, lock = false) {
  const query = db.select({ id: E.id, title: E.title }).from(E).where(and(eq(E.id, eventTypeId), availableAutomationEvents(userId)));
  const [event] = await (lock ? query.for("key share") : query);
  if (!event) throw new ContactAutomationError("Contact automations are available to this event's hosts. The event may also have been removed.", 404); return event;
}
