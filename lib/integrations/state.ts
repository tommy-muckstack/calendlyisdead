import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { integrationState, integrations } from "./catalog";

export async function integrationStates(userId: string, destinationId: string | null) {
  const db = await getDb();
  // Do not select encrypted credentials, account addresses, or provider response bodies.
  const [connections, calendars] = await Promise.all([
    db.select({ id: schema.calendarConnections.id, provider: schema.calendarConnections.provider, status: schema.calendarConnections.status })
      .from(schema.calendarConnections).where(eq(schema.calendarConnections.userId, userId)),
    db.select({ id: schema.userCalendars.id, connectionId: schema.userCalendars.connectionId, canWrite: schema.userCalendars.canWrite })
      .from(schema.userCalendars).where(eq(schema.userCalendars.userId, userId)),
  ]);
  return Object.fromEntries(integrations.map(item => [item.id, integrationState(item, connections, calendars, destinationId)]));
}
