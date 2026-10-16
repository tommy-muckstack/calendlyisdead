import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { ContactFilters, CreateContact } from "@/lib/contact-validation";
import { contactFailure, createContact, listContacts } from "@/lib/contacts";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = ContactFilters.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  return NextResponse.json(await listContacts(user.id, parsed.data));
}
export async function POST(request: NextRequest) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = CreateContact.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  try { return NextResponse.json(await createContact(user.id, parsed.data.id, parsed.data), { status: 201 }); }
  catch (cause) { const failure = contactFailure(cause); return NextResponse.json({ error: failure.error }, { status: failure.status }); }
}
