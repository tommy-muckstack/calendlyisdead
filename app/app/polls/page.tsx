import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { getPoll } from "@/lib/polls";
import { PollsPanel } from "@/components/PollsPanel";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await requireUser(); if (!u) redirect("/login"); const db = await getDb();
  const ps = await db.select().from(schema.polls).where(eq(schema.polls.userId, u.id)).orderBy(desc(schema.polls.createdAt));
  const full = await Promise.all(ps.map(async (p: any) => { const g = (await getPoll(p.id))!; return { id: p.id, title: p.title, status: p.status, chosen: p.chosen, bookingUid: p.bookingUid, voters: g.votes.length, tally: g.tally }; }));
  return <PollsPanel initial={full} tz={u.timezone} />;
}
