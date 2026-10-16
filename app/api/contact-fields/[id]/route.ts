import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { DeleteContact } from "@/lib/contact-validation";
import { UpdateContactField } from "@/lib/contact-field-validation";
import { customFieldFailure, deleteContactField, listContactFields, updateContactField } from "@/lib/contact-custom-fields";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: NextRequest, { params }: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = (await params).id, field = (await listContactFields(user.id)).find(field => field.id === id);
  return field ? NextResponse.json(field) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
export async function PATCH(request: NextRequest, { params }: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = UpdateContactField.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  try { return NextResponse.json(await updateContactField(user.id, (await params).id, parsed.data.version, parsed.data)); }
  catch (cause) { const failure = customFieldFailure(cause); return NextResponse.json({ error: failure.error }, { status: failure.status }); }
}
export async function DELETE(request: NextRequest, { params }: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = DeleteContact.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { await deleteContactField(user.id, (await params).id, parsed.data.version); return new NextResponse(null, { status: 204 }); }
  catch (cause) { const failure = customFieldFailure(cause); return NextResponse.json({ error: failure.error }, { status: failure.status }); }
}
