import { NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { ChangeOpportunityAutomation } from "@/lib/opportunity-automation-validation";
import { DeleteOpportunity } from "@/lib/opportunity-validation";
import { changeOpportunityAutomation, deleteOpportunityAutomation, getOpportunityAutomation } from "@/lib/opportunity-automations";
import { opportunityFailure, opportunityUnauthorized, privateResponse } from "@/lib/opportunity-http";
import { transferBody } from "@/lib/contact-transfer-http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, context: Context) {
  const user = await requireUser(); if (!user) return opportunityUnauthorized(); try { return NextResponse.json(await getOpportunityAutomation(user.id, (await context.params).id), privateResponse); } catch (error) { return opportunityFailure(error); }
}
export async function PATCH(request: Request, context: Context) {
  const user = await requireUser(); if (!user) return opportunityUnauthorized(); try { const parsed = ChangeOpportunityAutomation.safeParse(await transferBody(request, 10000)); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400, ...privateResponse }); return NextResponse.json(await changeOpportunityAutomation(user.id, (await context.params).id, parsed.data), privateResponse); } catch (error) { return opportunityFailure(error); }
}
export async function DELETE(request: Request, context: Context) {
  const user = await requireUser(); if (!user) return opportunityUnauthorized(); try { const parsed = DeleteOpportunity.safeParse(await transferBody(request, 1000)); if (!parsed.success) return NextResponse.json({ error: "Reload the automation before deleting." }, { status: 400, ...privateResponse }); await deleteOpportunityAutomation(user.id, (await context.params).id, parsed.data.version); return new NextResponse(null, { status: 204, ...privateResponse }); } catch (error) { return opportunityFailure(error); }
}
