import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
export type ContactDB = Awaited<ReturnType<typeof getDb>>;
// Booking reservations acquire these locks first, in host-ID order. Manual
// contact changes and preferences use the same order to serialize deletion.
export async function lockContactOwner(db: ContactDB, userId: string) {
  const [owner] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).for("update");
  if (!owner) throw new Error("not_found");
}
