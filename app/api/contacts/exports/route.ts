import { NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { ExportRequest } from "@/lib/contact-transfer-validation";
import { exportContacts } from "@/lib/contact-transfer";
import { transferBody, transferFailure } from "@/lib/contact-transfer-http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in before exporting contacts." }, { status: 401 });
  try {
    const parsed = ExportRequest.safeParse(await transferBody(request, 50000));
    if (!parsed.success) return NextResponse.json({ error: "Select contacts or all contacts." }, { status: 400 });
    return NextResponse.json(await exportContacts(user, parsed.data), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return transferFailure(error); }
}
