import { NextRequest, NextResponse } from "next/server";
import { demoEnabled } from "@/auth";
import { DEMO_USER_ID, DEMO_MATE_ID } from "@/lib/db";
import { DEMO_COOKIE, cookieOptions, signDemo } from "@/lib/isdead-auth/server";
export const runtime = "nodejs";
// Demo mode only (no Firebase needed). The UI offers just the demo host; ?who=mate exists for tests/team features.
export async function POST(req: NextRequest) {
  if (!demoEnabled()) return NextResponse.json({ error: "Demo mode is off" }, { status: 404 });
  const who = new URL(req.url).searchParams.get("who") ?? (await req.formData().catch(() => null))?.get("who");
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(DEMO_COOKIE, signDemo(who === "mate" ? DEMO_MATE_ID : DEMO_USER_ID), cookieOptions());
  return res;
}
