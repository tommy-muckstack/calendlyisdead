import { NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { readLoginSettings } from "@/lib/login-settings-server";
export const runtime = "nodejs";
export async function GET() {
  const user = await requireUser();
  const headers = { "Cache-Control": "private, no-store" };
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  const result = await readLoginSettings(user);
  return NextResponse.json(result, { status: result.status === "error" ? 503 : 200, headers });
}
