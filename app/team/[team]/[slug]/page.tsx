import { notFound } from "next/navigation";
import { loadEvent, getBooking } from "@/lib/booking";
import { BookingWidget } from "@/components/BookingWidget";
import { BrandFrame } from "@/components/BrandFrame";
import { recordView } from "@/lib/analytics";
import { formatMoney } from "@/lib/payments";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ team: string; slug: string }>; searchParams: Promise<{ reschedule?: string; embed?: string; primary?: string }> }) {
  const { team, slug } = await params; const { reschedule, embed, primary } = await searchParams;
  const ev = await loadEvent(`team:${team}`, slug); if (!ev) notFound();
  const prior = reschedule ? await getBooking(reschedule) : null;
  if (!reschedule) await recordView(ev.eventType.id);
  const brandUser = ev.ownerUser ?? ev.hosts[0]?.user;
  const et = ev.eventType;
  return <BrandFrame user={brandUser} embed={embed === "1"} primary={primary}><BookingWidget embed={embed === "1"} price={ev.eventType.priceCents > 0 ? formatMoney(ev.eventType.priceCents, ev.eventType.currency) : undefined} username={`team:${team}`} slug={slug} host={ev.ownerName} title={et.title} durationMin={et.durationMin} location={et.location} description={et.description}
    color={et.color} questions={et.questions ?? []} lockedTimezone={et.lockedTimezone} kindLabel={et.kind === "collective" ? `With ${ev.hosts.map(h => h.user.name).join(", ")}` : "With the next available teammate"}
    reschedule={prior && prior.booking.eventTypeId === ev.eventType.id && prior.booking.status === "confirmed" ? { uid: prior.booking.uid, name: prior.booking.inviteeName, email: prior.booking.inviteeEmail, start: prior.booking.start.toISOString() } : undefined} /></BrandFrame>;
}
