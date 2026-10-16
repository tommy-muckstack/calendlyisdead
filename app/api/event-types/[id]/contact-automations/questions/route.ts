import { NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { DeleteListAutomation } from "@/lib/contact-automation-validation";
import { ChangeQuestionAutomation } from "@/lib/contact-question-automation-validation";
import { ContactAutomationError } from "@/lib/contact-automation-store";
import { changeContactQuestionAutomation, deleteContactQuestionAutomation, readContactQuestionAutomation } from "@/lib/contact-question-automations";
import { transferBody } from "@/lib/contact-transfer-http";
import { ContactTransferError } from "@/lib/contact-transfer";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
function failure(error: unknown) {
  const known = error instanceof ContactAutomationError || error instanceof ContactTransferError;
  return NextResponse.json({ error: known ? error.message : "The automation change could not be confirmed. Try again." }, { status: known ? error.status : 500, headers: { "Cache-Control": "private, no-store" } });
}
export async function GET(_: Request, context: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in to view contact automations." }, { status: 401 });
  const { id } = await context.params;
  try { return NextResponse.json(await readContactQuestionAutomation(user.id, id), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return failure(error); }
}
export async function PATCH(request: Request, context: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in to change contact automations." }, { status: 401 });
  const { id } = await context.params;
  try {
    const parsed = ChangeQuestionAutomation.safeParse(await transferBody(request, 50000));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    return NextResponse.json(await changeContactQuestionAutomation(user.id, id, parsed.data));
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, context: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in to delete contact automations." }, { status: 401 });
  const { id } = await context.params;
  try {
    const parsed = DeleteListAutomation.safeParse(await transferBody(request, 1000)); if (!parsed.success) return NextResponse.json({ error: "Reload the automation before deleting." }, { status: 400 });
    await deleteContactQuestionAutomation(user.id, id, parsed.data.version); return new NextResponse(null, { status: 204 });
  } catch (error) { return failure(error); }
}
