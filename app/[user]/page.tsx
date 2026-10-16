import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { BrandFrame } from "@/components/BrandFrame";
export const dynamic = "force-dynamic";
export default async function HostPage({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params; const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.username, user)); if (!u) notFound();
  const ets = (await db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.userId, u.id), eq(schema.eventTypes.active, true), isNull(schema.eventTypes.deletedAt)))).filter((e: any) => !e.teamId && e.kind !== "one_off" && e.kind !== "poll");
  return <BrandFrame user={u}><main style={{ maxWidth: 720, margin: "60px auto", padding: 24 }}>
    <h1>{u.name}</h1><p className="muted">Pick a meeting type to see open times.</p>
    {ets.map((e: any) => <Link key={e.id} href={`/${user}/${e.slug}`} className="card et" style={{ borderLeftColor: e.color, textDecoration: "none", color: "inherit" }}>
      <div><b>{e.title}</b><div className="muted">{e.durationMin} min</div></div></Link>)}
  </main></BrandFrame>;
}
