import { NextRequest, NextResponse } from "next/server";
import { processDue } from "@/lib/workflows";
export const runtime = "nodejs";
const devish = () => process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1";
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!(secret ? req.headers.get("authorization") === `Bearer ${secret}` : devish())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const at = req.nextUrl.searchParams.get("now");
  const now = at && devish() ? new Date(at) : new Date(); // time travel only outside production, for tests and demos
  return NextResponse.json(await processDue(now));
}
