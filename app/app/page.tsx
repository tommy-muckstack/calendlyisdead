import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { EventTypesBoard } from "@/components/EventTypesBoard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await requireUser(); if (!u) redirect("/login"); const db = await getDb();
  const ets = (await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.userId, u.id))).filter((e: any) => !e.teamId && e.kind !== "one_off" && e.kind !== "poll");
  const scs = await db.select({ id: schema.schedules.id, name: schema.schedules.name }).from(schema.schedules).where(eq(schema.schedules.userId, u.id));
  return <EventTypesBoard initial={ets} username={u.username!} schedules={scs} />;
}
