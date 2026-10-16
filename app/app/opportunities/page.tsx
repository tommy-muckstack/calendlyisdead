import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { listOpportunities } from "@/lib/opportunities";
import { OPPORTUNITY_STAGES, OpportunityFilters, type Stage } from "@/lib/opportunity-validation";
import { OpportunitiesBoard, type OpportunityBoardData } from "@/components/OpportunitiesBoard";
export const dynamic = "force-dynamic";
export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(); if (!user) redirect("/login"); const params = await searchParams, parsed = OpportunityFilters.pick({ q: true, contactId: true }).safeParse(params);
  if (!parsed.success) return <section className="opportunities"><h2>Opportunities</h2><p role="alert">Choose a valid search or contact filter.</p><a href="?">Clear filters</a></section>;
  const { q, contactId } = parsed.data, stages = Object.keys(OPPORTUNITY_STAGES) as Stage[];
  const initial = Object.fromEntries(await Promise.all(stages.map(async stage => [stage, await listOpportunities(user.id, { q, contactId, stage, page: 1 })]))) as OpportunityBoardData;
  return <section className="opportunities"><OpportunitiesBoard key={`${q}:${contactId ?? ""}`} initial={initial} query={q} contactId={contactId} /></section>;
}
