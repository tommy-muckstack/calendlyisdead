import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { downloadContactExport } from "@/lib/contact-transfer";
import { transferFailure } from "@/lib/contact-transfer-http";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in to your account, then open this download link again." }, { status: 401 });
  const { id } = await context.params; if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Export not found." }, { status: 404 });
  try { return new Response(await downloadContactExport(user.id, id), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="contacts.csv"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
  catch (error) { return transferFailure(error); }
}
