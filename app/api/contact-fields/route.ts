import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { CreateContactField } from "@/lib/contact-field-validation";
import { contactFieldSources, createContactField, customFieldFailure, listContactFields } from "@/lib/contact-custom-fields";
export const runtime = "nodejs";
export async function GET() {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ fields: await listContactFields(user.id), sources: await contactFieldSources(user.id) });
}
export async function POST(request: NextRequest) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = CreateContactField.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  try { return NextResponse.json(await createContactField(user.id, parsed.data.id, parsed.data), { status: 201 }); }
  catch (cause) { const failure = customFieldFailure(cause); return NextResponse.json({ error: failure.error }, { status: failure.status }); }
}
