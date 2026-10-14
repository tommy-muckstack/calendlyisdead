import { notFound, redirect } from "next/navigation";
import { getBooking } from "@/lib/booking";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params; const g = await getBooking(uid); if (!g) notFound();
  redirect(`/${g.user.username}/${g.eventType.slug}?reschedule=${uid}&tz=${encodeURIComponent(g.booking.inviteeTz)}`);
}
