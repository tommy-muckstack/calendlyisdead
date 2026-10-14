import { notFound } from "next/navigation";
import { loadEvent, getBooking } from "@/lib/booking";
import { BookingWidget } from "@/components/BookingWidget";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ team: string; slug: string }>; searchParams: Promise<{ reschedule?: string }> }) {
  const { team, slug } = await params; const { reschedule } = await searchParams;
  const ev = await loadEvent(`team:${team}`, slug); if (!ev) notFound();
  const prior = reschedule ? await getBooking(reschedule) : null;
  const et = ev.eventType;
  return <BookingWidget username={`team:${team}`} slug={slug} host={ev.ownerName} title={et.title} durationMin={et.durationMin} location={et.location} description={et.description}
    color={et.color} questions={et.questions ?? []} kindLabel={et.kind === "collective" ? `With ${ev.hosts.map(h => h.user.name).join(", ")}` : "With the next available teammate"}
    reschedule={prior && prior.booking.status === "confirmed" ? { uid: prior.booking.uid, name: prior.booking.inviteeName, email: prior.booking.inviteeEmail, start: prior.booking.start.toISOString() } : undefined} />;
}
