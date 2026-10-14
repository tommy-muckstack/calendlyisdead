import { notFound } from "next/navigation";
import { loadEvent, getBooking } from "@/lib/booking";
import { BookingWidget } from "@/components/BookingWidget";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ user: string; slug: string }>; searchParams: Promise<{ reschedule?: string }> }) {
  const { user, slug } = await params; const { reschedule } = await searchParams;
  const ev = await loadEvent(user, slug); if (!ev) notFound();
  const prior = reschedule ? await getBooking(reschedule) : null;
  return <BookingWidget username={user} slug={slug} host={ev.user.name ?? user} title={ev.eventType.title} durationMin={ev.eventType.durationMin}
    location={ev.eventType.location} description={ev.eventType.description} color={ev.eventType.color}
    reschedule={prior && prior.booking.status === "confirmed" ? { uid: prior.booking.uid, name: prior.booking.inviteeName, email: prior.booking.inviteeEmail, start: prior.booking.start.toISOString() } : undefined} />;
}
