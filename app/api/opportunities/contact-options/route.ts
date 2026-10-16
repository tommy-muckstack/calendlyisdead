import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { OpportunityFilters } from "@/lib/opportunity-validation";
import { opportunityContacts } from "@/lib/opportunities";
import { opportunityFailure, opportunityUnauthorized, privateResponse } from "@/lib/opportunity-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const user = await requireUser(); if (!user) return opportunityUnauthorized(); const parsed = OpportunityFilters.pick({ q: true, page: true }).safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Review your contact search." }, { status: 400, ...privateResponse });
  try { return NextResponse.json(await opportunityContacts(user.id, parsed.data.q, parsed.data.page), privateResponse); } catch (error) { return opportunityFailure(error); }
}
