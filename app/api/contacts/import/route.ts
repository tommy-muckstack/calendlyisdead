import { NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { ImportRequest } from "@/lib/contact-transfer-validation";
import { importContacts } from "@/lib/contact-transfer";
import { transferBody, transferFailure } from "@/lib/contact-transfer-http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in before importing contacts." }, { status: 401 });
  try {
    const parsed = ImportRequest.safeParse(await transferBody(request, 13 * 1024 * 1024));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    return NextResponse.json(await importContacts(user.id, parsed.data), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return transferFailure(error); }
}
