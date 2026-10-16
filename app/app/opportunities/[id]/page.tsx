import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getOpportunity, OpportunityError } from "@/lib/opportunities";
import { meetingZone } from "@/lib/meetings";
import { OpportunityDetails } from "@/components/OpportunityDetail";
export default async function OpportunityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ historyPage?: string }> }) {
  const user = await requireUser(); if (!user) redirect("/login"); const { id } = await params, page = z.coerce.number().int().min(1).max(1000000).safeParse((await searchParams).historyPage ?? "1");
  if (!page.success) return <section className="opportunities"><p role="alert">Choose a valid history page.</p><a href="?">First history page</a></section>;
  try { const initial = await getOpportunity(user.id, id, page.data); return <section className="opportunities"><OpportunityDetails key={`${initial.opportunity.version}:${page.data}`} initial={initial} historyPage={page.data} timezone={meetingZone(user.timezone)} /></section>; } catch (error) { if (error instanceof OpportunityError && error.status === 404) notFound(); throw error; }
}
