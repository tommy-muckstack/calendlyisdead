import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { ContactValuesPatch } from "@/lib/contact-field-validation";
import { contactCustomValues, customFieldFailure, saveContactCustomValues } from "@/lib/contact-custom-fields";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: NextRequest, { params }: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json(await contactCustomValues(user.id, (await params).id)); }
  catch (cause) { const failure = customFieldFailure(cause); return NextResponse.json({ error: failure.error }, { status: failure.status }); }
}
export async function PATCH(request: NextRequest, { params }: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = ContactValuesPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { return NextResponse.json(await saveContactCustomValues(user.id, (await params).id, parsed.data.version, parsed.data.values, parsed.data.fieldVersions)); }
  catch (cause) { const failure = customFieldFailure(cause); return NextResponse.json({ error: failure.error }, { status: failure.status }); }
}
