import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { DeleteContact, UpdateContact } from "@/lib/contact-validation";
import { contactFailure, deleteContact, getContact, updateContact } from "@/lib/contacts";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: NextRequest, { params }: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const contact = await getContact(user.id, (await params).id);
  return contact ? NextResponse.json(contact) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
export async function PATCH(request: NextRequest, { params }: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = UpdateContact.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  try { return NextResponse.json(await updateContact(user.id, (await params).id, parsed.data.version, parsed.data)); }
  catch (cause) { const failure = contactFailure(cause); return NextResponse.json({ error: failure.error }, { status: failure.status }); }
}
export async function DELETE(request: NextRequest, { params }: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = DeleteContact.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  try { await deleteContact(user.id, (await params).id, parsed.data.version); return new NextResponse(null, { status: 204 }); }
  catch (cause) { const failure = contactFailure(cause); return NextResponse.json({ error: failure.error }, { status: failure.status }); }
}
