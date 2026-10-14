import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { listOneOffs } from "@/lib/oneoff";
import { OneOffPanel } from "@/components/OneOffPanel";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await requireUser(); if (!u) redirect("/login"); const db = await getDb();
  const bases = (await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.userId, u.id))).filter((e: any) => !e.teamId && ["one_on_one", "group"].includes(e.kind));
  const links = (await listOneOffs(u.id)).filter((l: any) => l.active).map((l: any) => ({ id: l.id, slug: l.slug, title: l.title, durationMin: l.durationMin, used: !!l.usedAt }));
  return <OneOffPanel username={u.username!} bases={bases.map((b: any) => ({ id: b.id, title: b.title }))} initial={links} />;
}
