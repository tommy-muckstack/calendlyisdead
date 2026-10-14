import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { RoutingPanel } from "@/components/RoutingPanel";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await requireUser(); if (!u) redirect("/login"); const db = await getDb();
  const forms = await db.select().from(schema.routingForms).where(eq(schema.routingForms.userId, u.id));
  const counts = forms.length ? await db.select().from(schema.formResponses).where(inArray(schema.formResponses.formId, forms.map((f: any) => f.id))) : [];
  const mine = (await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.userId, u.id))).filter((e: any) => !e.teamId).map((e: any) => ({ value: `${u.username}/${e.slug}`, label: e.title }));
  const tm = await db.select().from(schema.teamMembers).where(eq(schema.teamMembers.userId, u.id));
  const ts = tm.length ? await db.select().from(schema.teams).where(inArray(schema.teams.id, tm.map((m: any) => m.teamId))) : [];
  const tets = ts.length ? await db.select().from(schema.eventTypes).where(inArray(schema.eventTypes.teamId, ts.map((t: any) => t.id))) : [];
  const targets = [...mine, ...tets.filter((e: any) => e.kind !== "managed").map((e: any) => { const t = ts.find((x: any) => x.id === e.teamId); return { value: `team:${t.slug}/${e.slug}`, label: `${t.name}: ${e.title}` }; })];
  return <RoutingPanel initial={forms.map((f: any) => ({ ...f, responses: counts.filter((c: any) => c.formId === f.id).length }))} targets={targets} />;
}
