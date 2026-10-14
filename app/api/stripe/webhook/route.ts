import { NextRequest, NextResponse } from "next/server";
import { confirmPayment, cancelBooking } from "@/lib/booking";
import { verifyStripeSignature } from "@/lib/payments";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 404 });
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret)) return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  const evt = JSON.parse(raw);
  const s = evt.data?.object ?? {};
  const uid = s.metadata?.bookingUid ?? s.client_reference_id;
  if (!uid) return NextResponse.json({ ignored: true });
  if (evt.type === "checkout.session.completed" && s.payment_status === "paid") return NextResponse.json(await confirmPayment(uid, String(s.payment_intent ?? s.id)));
  if (evt.type === "checkout.session.expired") { await cancelBooking(uid, "payment_expired"); return NextResponse.json({ ok: true }); }
  return NextResponse.json({ ignored: true });
}
