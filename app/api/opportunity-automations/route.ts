import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { CreateOpportunityAutomation, OpportunityAutomationFilters } from "@/lib/opportunity-automation-validation";
import { createOpportunityAutomation, listOpportunityAutomations } from "@/lib/opportunity-automations";
import { opportunityFailure, opportunityUnauthorized, privateResponse } from "@/lib/opportunity-http";
import { transferBody } from "@/lib/contact-transfer-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const user = await requireUser(); if (!user) return opportunityUnauthorized(); const parsed = OpportunityAutomationFilters.safeParse(Object.fromEntries(request.nextUrl.searchParams)); if (!parsed.success) return NextResponse.json({ error: "Review the automation filters." }, { status: 400, ...privateResponse });
  try { return NextResponse.json(await listOpportunityAutomations(user.id, parsed.data), privateResponse); } catch (error) { return opportunityFailure(error); }
}
export async function POST(request: Request) {
  const user = await requireUser(); if (!user) return opportunityUnauthorized();
  try { const parsed = CreateOpportunityAutomation.safeParse(await transferBody(request, 10000)); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400, ...privateResponse }); return NextResponse.json(await createOpportunityAutomation(user.id, parsed.data.id, parsed.data), { status: 201, ...privateResponse }); } catch (error) { return opportunityFailure(error); }
}
