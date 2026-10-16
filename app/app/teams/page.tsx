import { redirect } from "next/navigation";
import { eq, inArray, and, isNull } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { teamMembers } from "@/lib/teams";
import { TeamsPanel } from "@/components/TeamsPanel";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await requireUser(); if (!u) redirect("/login"); const db = await getDb();
  const mine = await db.select().from(schema.teamMembers).where(eq(schema.teamMembers.userId, u.id));
  const ts = mine.length ? await db.select().from(schema.teams).where(inArray(schema.teams.id, mine.map((m: any) => m.teamId))) : [];
  const data = await Promise.all(ts.map(async (t: any) => {
    const ets = await db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.teamId, t.id), isNull(schema.eventTypes.deletedAt)));
    const hosts = ets.length ? await db.select().from(schema.eventTypeHosts).where(inArray(schema.eventTypeHosts.eventTypeId, ets.map((e: any) => e.id))) : [];
    const kids = ets.length ? await db.select().from(schema.eventTypes).where(and(inArray(schema.eventTypes.managedParentId, ets.map((e: any) => e.id)), isNull(schema.eventTypes.deletedAt))) : [];
    return { id: t.id, name: t.name, slug: t.slug, role: mine.find((m: any) => m.teamId === t.id).role,
      members: (await teamMembers(t.id)).map(m => ({ userId: m.userId, role: m.role, name: m.user?.name ?? m.user?.email, email: m.user?.email })),
      eventTypes: ets.map((e: any) => ({ ...e,
        hosts: hosts.filter((h: any) => h.eventTypeId === e.id).map((h: any) => ({ userId: h.userId, priority: h.priority })),
        assigned: kids.filter((k: any) => k.managedParentId === e.id).map((k: any) => k.userId) })) };
  }));
  return <TeamsPanel teams={data} me={u.id} defaultTimezone={u.timezone} />;
}
