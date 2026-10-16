import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { z } from "zod";
import { ChangeOpportunity, DeleteOpportunity } from "@/lib/opportunity-validation";
import { changeOpportunity, deleteOpportunity, getOpportunity } from "@/lib/opportunities";
import { opportunityFailure, opportunityUnauthorized, privateResponse } from "@/lib/opportunity-http";
import { transferBody } from "@/lib/contact-transfer-http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  const user = await requireUser(); if (!user) return opportunityUnauthorized(); const page = z.coerce.number().int().min(1).max(1000000).safeParse(request.nextUrl.searchParams.get("historyPage") ?? "1");
  if (!page.success) return NextResponse.json({ error: "Choose a valid history page." }, { status: 400, ...privateResponse });
  try { return NextResponse.json(await getOpportunity(user.id, (await context.params).id, page.data), privateResponse); } catch (error) { return opportunityFailure(error); }
}
export async function PATCH(request: Request, context: Context) {
  const user = await requireUser(); if (!user) return opportunityUnauthorized();
  try { const parsed = ChangeOpportunity.safeParse(await transferBody(request, 50000)); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400, ...privateResponse }); return NextResponse.json(await changeOpportunity(user.id, (await context.params).id, parsed.data), privateResponse); } catch (error) { return opportunityFailure(error); }
}
export async function DELETE(request: Request, context: Context) {
  const user = await requireUser(); if (!user) return opportunityUnauthorized();
  try { const parsed = DeleteOpportunity.safeParse(await transferBody(request, 1000)); if (!parsed.success) return NextResponse.json({ error: "Reload the opportunity before deleting." }, { status: 400, ...privateResponse }); await deleteOpportunity(user.id, (await context.params).id, parsed.data.version); return new NextResponse(null, { status: 204, ...privateResponse }); } catch (error) { return opportunityFailure(error); }
}
