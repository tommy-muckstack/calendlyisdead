import { NextRequest, NextResponse } from "next/server";
import { cancelBooking } from "@/lib/booking";
export const runtime = "nodejs";
export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params; const { reason } = await req.json().catch(() => ({}));
  const r = await cancelBooking(uid, String(reason ?? "").slice(0, 1000));
  return r ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
