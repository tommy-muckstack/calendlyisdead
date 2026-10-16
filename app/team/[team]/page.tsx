import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, ne, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { teamMembers } from "@/lib/teams";
export const dynamic = "force-dynamic";
const KIND: Record<string, string> = { collective: "Everyone joins", round_robin: "Next available teammate" };
export default async function TeamPage({ params }: { params: Promise<{ team: string }> }) {
  const { team } = await params; const db = await getDb();
  const [t] = await db.select().from(schema.teams).where(eq(schema.teams.slug, team)); if (!t) notFound();
  const ets = await db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.teamId, t.id), eq(schema.eventTypes.active, true), eq(schema.eventTypes.secret, false), ne(schema.eventTypes.kind, "managed"), isNull(schema.eventTypes.deletedAt)));
  const ms = await teamMembers(t.id);
  return <main style={{ maxWidth: 720, margin: "60px auto", padding: 24 }}>
    <h1 style={{ marginBottom: 4 }}>{t.name}</h1>
    <p className="muted">{ms.map(m => m.user?.name).filter(Boolean).join(" · ")}</p>
    {ets.map(e => <Link key={e.id} href={`/team/${team}/${e.slug}`} className="card et" style={{ borderLeftColor: e.color, textDecoration: "none", color: "inherit" }}>
      <div><b>{e.title}</b><div className="muted">{e.durationMin} min · {KIND[e.kind] ?? ""}</div></div></Link>)}
  </main>;
}
