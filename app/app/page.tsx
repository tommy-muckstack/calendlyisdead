import { redirect } from "next/navigation";
import { eq, and, isNull } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { EventTypesBoard } from "@/components/EventTypesBoard";
import { getLockedGroupEventIds } from "@/lib/group-sessions";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await requireUser(); if (!u) redirect("/login"); const db = await getDb();
  const [types, scs, lockedGroups] = await Promise.all([
    db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.userId, u.id), isNull(schema.eventTypes.deletedAt))),
    db.select({ id: schema.schedules.id, name: schema.schedules.name }).from(schema.schedules).where(eq(schema.schedules.userId, u.id)),
    getLockedGroupEventIds(u.id),
  ]);
  const ets = types.filter((e: typeof schema.eventTypes.$inferSelect) => !e.teamId && e.kind !== "one_off" && e.kind !== "poll")
    .map((e: typeof schema.eventTypes.$inferSelect) => ({ ...e, groupSettingsLocked: lockedGroups.has(e.id) }));
  return <EventTypesBoard initial={ets} username={u.username!} schedules={scs} owner={(u as any).name || undefined} />;
}
