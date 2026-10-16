import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { listOpportunityAutomations } from "@/lib/opportunity-automations";
import { OpportunityAutomationsPanel } from "@/components/OpportunityAutomations";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser(); if (!user) redirect("/login");
  const initial = await listOpportunityAutomations(user.id, { page: 1, q: "" });
  return <section className="opportunities"><Link href="/app/opportunities">← Opportunities</Link><h2>Opportunity automations</h2><OpportunityAutomationsPanel initial={initial} /></section>;
}
