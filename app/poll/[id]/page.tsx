import { notFound } from "next/navigation";
import { getPoll } from "@/lib/polls";
import { BrandFrame } from "@/components/BrandFrame";
import { PollVote } from "@/components/PollVote";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const g = await getPoll((await params).id); if (!g) notFound();
  return <BrandFrame user={g.host}><main style={{ maxWidth: 620, margin: "60px auto", padding: 24 }}>
    <div className="card" style={{ padding: 28 }}>
      <div className="muted" style={{ fontWeight: 600 }}>{g.host.name} asks</div>
      <h1 style={{ margin: "6px 0" }}>{g.poll.title}</h1>
      <div className="muted">◷ {g.poll.durationMin} min{g.poll.location ? ` · ${g.poll.location}` : ""}</div>
      {g.poll.status === "booked" ? <p data-testid="poll-closed">This poll is closed. The meeting is booked.</p>
        : <PollVote id={g.poll.id} tally={g.tally.map(t => ({ option: t.option, count: t.count }))} />}
    </div>
  </main></BrandFrame>;
}
