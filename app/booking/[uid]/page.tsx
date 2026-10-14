import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { getBooking } from "@/lib/booking";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ uid: string }>; searchParams: Promise<{ new?: string }> }) {
  const { uid } = await params; const { new: isNew } = await searchParams;
  const g = await getBooking(uid); if (!g) notFound();
  const { booking: b, eventType: et, hosts } = g;
  const s = DateTime.fromJSDate(b.start).setZone(b.inviteeTz), e = DateTime.fromJSDate(b.end).setZone(b.inviteeTz);
  const cancelled = b.status !== "confirmed";
  return <main style={{ maxWidth: 560, margin: "60px auto", padding: 24 }}>
    <div className="card" style={{ padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 40 }}>{cancelled ? "✕" : "✓"}</div>
      <h1 data-testid="confirm-heading" style={{ marginTop: 8 }}>{cancelled ? "This booking was cancelled" : isNew ? "You're booked" : "Your booking"}</h1>
      {!cancelled && isNew && <p className="muted">We emailed a calendar invite to {b.inviteeEmail}.</p>}
      <div className="card" style={{ padding: 18, textAlign: "left", marginTop: 16 }}>
        <b>{et.title}</b> with {hosts.map((h: any) => h.name).join(", ")}
        <div className="muted" style={{ marginTop: 6 }}>{s.toFormat("cccc, LLLL d, yyyy")} · {s.toFormat("h:mm a")} – {e.toFormat("h:mm a")} ({b.inviteeTz})</div>
        {b.meetingUrl ? <div><a href={b.meetingUrl}>{b.meetingUrl}</a></div> : et.location && <div className="muted">{et.location}</div>}
      </div>
      {!cancelled && <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
        <Link className="btn" href={`/booking/${uid}/reschedule`}>Reschedule</Link>
        <Link className="btn danger" href={`/booking/${uid}/cancel`}>Cancel</Link></div>}
    </div>
  </main>;
}
