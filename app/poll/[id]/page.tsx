import { notFound } from "next/navigation";
import { getPublicPoll } from "@/lib/polls";
import { BrandFrame } from "@/components/BrandFrame";
import { PollVote } from "@/components/PollVote";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const g = await getPublicPoll((await params).id); if (!g) notFound();
  return <BrandFrame user={g.host}><main style={{ maxWidth: 620, margin: "60px auto", padding: 24 }}>
    <div className="card" style={{ padding: 28 }}>
      <div className="muted" style={{ fontWeight: 600 }}>{g.host.name} asks</div>
      <h1 style={{ margin: "6px 0" }}>{g.poll.title}</h1>
      <div className="muted">◷ {g.poll.durationMin} min{g.poll.location ? ` · ${g.poll.location}` : ""}</div>
      {g.poll.status !== "open" ? <p data-testid="poll-closed">{g.poll.status === "booked" ? "This poll is closed. The meeting is booked." : "This poll is closed. The proposed times have passed."}</p>
        : g.full ? <p data-testid="poll-full">This poll has reached its limit of 40 participants.</p>
        : <PollVote id={g.poll.id} tally={g.tally} now={Date.now()} />}
    </div>
  </main></BrandFrame>;
}
