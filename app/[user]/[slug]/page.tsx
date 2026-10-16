import { notFound } from "next/navigation";
import { loadEvent, getBooking } from "@/lib/booking";
import { BookingWidget } from "@/components/BookingWidget";
import { BrandFrame } from "@/components/BrandFrame";
import { recordView } from "@/lib/analytics";
import { formatMoney } from "@/lib/payments";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ user: string; slug: string }>; searchParams: Promise<{ reschedule?: string; embed?: string; primary?: string }> }) {
  const { user, slug } = await params; const { reschedule, embed, primary } = await searchParams;
  const ev = await loadEvent(user, slug); if (!ev) notFound();
  const prior = reschedule ? await getBooking(reschedule) : null;
  if (!reschedule) await recordView(ev.eventType.id);
  const brandUser = ev.ownerUser ?? ev.hosts[0]?.user;
  return <BrandFrame user={brandUser} embed={embed === "1"} primary={primary}><BookingWidget embed={embed === "1"} price={ev.eventType.priceCents > 0 ? formatMoney(ev.eventType.priceCents, ev.eventType.currency) : undefined} username={user} slug={slug} host={ev.ownerName} kindLabel={ev.eventType.kind === "group" ? `Group, up to ${ev.eventType.seats}` : undefined} title={ev.eventType.title} durationMin={ev.eventType.durationMin}
    hostImage={ev.ownerUser?.image} location={ev.eventType.location} description={ev.eventType.description} color={ev.eventType.color} questions={ev.eventType.questions ?? []}
    reschedule={prior && prior.booking.status === "confirmed" ? { uid: prior.booking.uid, name: prior.booking.inviteeName, email: prior.booking.inviteeEmail, start: prior.booking.start.toISOString() } : undefined} /></BrandFrame>;
}
