import { NextRequest, NextResponse } from "next/server";
import { confirmPayment } from "@/lib/booking";
import { stripeConfigured } from "@/lib/payments";
export const runtime = "nodejs";
/** Keyless demo checkout. Disabled as soon as real Stripe keys are configured. */
export async function POST(_: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  if (stripeConfigured()) return NextResponse.json({ error: "use_stripe" }, { status: 404 });
  const { uid } = await params;
  const r = await confirmPayment(uid, `demo_${Date.now().toString(36)}`);
  return "error" in r ? NextResponse.json(r, { status: r.error === "not_found" ? 404 : 409 }) : NextResponse.json(r);
}
