import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { ContactSettingsPatch } from "@/lib/contact-settings-validation";
import { readContactSettings, saveContactSettings } from "@/lib/contact-settings";
export const runtime = "nodejs";
export async function GET() {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await readContactSettings(user.id));
}
export async function PATCH(request: NextRequest) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = ContactSettingsPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { return NextResponse.json(await saveContactSettings(user.id, parsed.data)); }
  catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    return NextResponse.json({ error: code === "changed" ? "changed" : "save_failed" }, { status: code === "changed" ? 409 : 500 });
  }
}
