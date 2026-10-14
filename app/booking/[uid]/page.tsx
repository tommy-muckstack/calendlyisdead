import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { getBooking } from "@/lib/booking";
import { BrandFrame } from "@/components/BrandFrame";
import { formatMoney } from "@/lib/payments";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ uid: string }>; searchParams: Promise<{ new?: string; embed?: string }> }) {
  const { uid } = await params; const { new: isNew, embed } = await searchParams;
  const g = await getBooking(uid); if (!g) notFound();
  const { booking: b, eventType: et, hosts } = g;
  const s = DateTime.fromJSDate(b.start).setZone(b.inviteeTz), e = DateTime.fromJSDate(b.end).setZone(b.inviteeTz);
  const cancelled = b.status !== "confirmed";
  const pending = !cancelled && b.paymentStatus === "pending";
  return <BrandFrame user={g.user} embed={embed === "1"} booked={isNew && !cancelled && !pending ? uid : undefined}><main style={{ maxWidth: 560, margin: "60px auto", padding: 24 }}>
    <div className="card" style={{ padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 40 }}>{cancelled ? "✕" : "✓"}</div>
      <h1 data-testid="confirm-heading" style={{ marginTop: 8 }}>{cancelled ? "This booking was cancelled" : pending ? "Waiting for payment" : isNew ? "You're booked" : "Your booking"}</h1>
      {!cancelled && !pending && isNew && <p className="muted">We emailed a calendar invite to {b.inviteeEmail}.</p>}
      {pending && <p className="muted">Your time is held for 30 minutes. <Link href={`/pay/${uid}`}>Finish paying</Link></p>}
      {b.paymentStatus === "paid" && <p className="muted" data-testid="paid">Paid {formatMoney(b.amountCents, et.currency)}</p>}
      <div className="card" style={{ padding: 18, textAlign: "left", marginTop: 16 }}>
        <b>{et.title}</b> with {hosts.map((h: any) => h.name).join(", ")}
        <div className="muted" style={{ marginTop: 6 }}>{s.toFormat("cccc, LLLL d, yyyy")} · {s.toFormat("h:mm a")} – {e.toFormat("h:mm a")} ({b.inviteeTz})</div>
        {b.meetingUrl ? <div><a href={b.meetingUrl} data-testid="meeting-url">{b.meetingUrl}</a></div> : et.location && <div className="muted">{et.location}</div>}
      </div>
      {!cancelled && <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
        <Link className="btn" href={`/booking/${uid}/reschedule`}>Reschedule</Link>
        <Link className="btn danger" href={`/booking/${uid}/cancel`}>Cancel</Link></div>}
    </div>
  </main></BrandFrame>;
}
