import { LocationSelectionSchema } from "@/lib/event-locations";
import { BP } from "@/lib/basepath";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createBooking, baseUrl, getBooking } from "@/lib/booking";
import { createCheckout, stripeConfigured } from "@/lib/payments";
export const runtime = "nodejs";
const Body = z.object({ username: z.string(), slug: z.string(), start: z.string(), name: z.string().min(1).max(200), email: z.string().email(), tz: z.string(),
  notes: z.string().max(5000).optional(), guests: z.array(z.string().email()).max(10).optional(), rescheduleUid: z.string().optional(), answers: z.record(z.string(), z.string()).optional(),
  locationSelection: LocationSelectionSchema.optional(), embed: z.boolean().optional() });
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  try {
    const b = await createBooking(parsed.data);
    const g = await getBooking(b.uid);
    const et = g!.eventType;
    let checkoutUrl: string | undefined;
    if (b.paymentStatus === "pending") {
      const e = parsed.data.embed ? "&embed=1" : "";
      checkoutUrl = stripeConfigured()
        ? (await createCheckout({ uid: b.uid, title: et.title, amountCents: b.amountCents, currency: et.currency, email: b.inviteeEmail,
            successUrl: `${baseUrl()}/booking/${b.uid}?new=1&paid=1${e}`, cancelUrl: `${baseUrl()}/booking/${b.uid}/cancel?unpaid=1${e}` })).url
        : `${BP}/pay/${b.uid}${e ? "?embed=1" : ""}`;
    }
    let redirectUrl: string | undefined;
    if (et.redirectUrl && !checkoutUrl) {
      const u = new URL(et.redirectUrl);
      u.searchParams.set("invitee_name", b.inviteeName); u.searchParams.set("invitee_email", b.inviteeEmail); u.searchParams.set("event_start", b.start.toISOString());
      redirectUrl = u.toString();
    }
    return NextResponse.json({ uid: b.uid, checkoutUrl, redirectUrl });
  } catch (e: any) {
    const status = e.message === "calendar_unavailable" ? 503 : e.message === "not_found" ? 404 : (e.message.startsWith("answer_") || e.message.startsWith("location_")) ? 400 : e.message.startsWith("stripe") ? 502 : 409;
    return NextResponse.json({ error: e.message }, { status });
  }
}
