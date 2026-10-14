import { notFound, redirect } from "next/navigation";
import { getBooking } from "@/lib/booking";
import { formatMoney, stripeConfigured } from "@/lib/payments";
import { DemoPayButton } from "@/components/DemoPayButton";
export const dynamic = "force-dynamic";
export default async function Pay({ params, searchParams }: { params: Promise<{ uid: string }>; searchParams: Promise<{ embed?: string }> }) {
  const { uid } = await params; const { embed } = await searchParams;
  const g = await getBooking(uid); if (!g) notFound();
  if (g.booking.paymentStatus !== "pending" || stripeConfigured()) redirect(`/booking/${uid}`);
  return <main style={{ maxWidth: 460, margin: "60px auto", padding: 24 }}>
    <div className="card" style={{ padding: 28 }}>
      <div className="pill">Demo checkout · no card needed</div>
      <h1 style={{ fontSize: 24 }}>Pay for {g.eventType.title}</h1>
      <p className="muted">This instance has no Stripe keys, so payments are simulated. Add STRIPE_SECRET_KEY to take real (or test-mode) payments.</p>
      <div className="row" style={{ justifyContent: "space-between", margin: "18px 0", fontSize: 20 }}><span>Total</span><b data-testid="amount">{formatMoney(g.booking.amountCents, g.eventType.currency)}</b></div>
      <DemoPayButton uid={uid} embed={!!embed} />
      <p className="muted" style={{ fontSize: 13 }}>Unpaid bookings release their time after 30 minutes.</p>
    </div>
  </main>;
}
