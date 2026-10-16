import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getBooking } from "@/lib/booking";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params; const g = await getBooking(uid); if (!g) notFound();
  if (g.eventType.deletedAt) return <main style={{ maxWidth: 520, margin: "64px auto", padding: 24 }}>
    <h1>This event type is no longer available</h1>
    <p>Your meeting has not been changed. Contact your host to arrange a different time.</p>
    <Link href={`/booking/${uid}`}>Back to meeting details</Link>
  </main>;
  const base = g.team ? `/team/${g.team.slug}` : `/${g.user.username}`;
  redirect(`${base}/${g.eventType.slug}?reschedule=${uid}&tz=${encodeURIComponent(g.booking.inviteeTz)}`);
}
