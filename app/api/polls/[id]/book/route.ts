import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { PollBookInput } from "@/lib/poll-booking-contract";
import { bookPoll } from "@/lib/polls";
export const runtime = "nodejs";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = PollBookInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { return NextResponse.json({ uid: await bookPoll(u.id, (await params).id, parsed.data.option, parsed.data) }); }
  catch (error) {
    const code = error instanceof Error ? error.message : "booking_unconfirmed";
    const safe = ["not_found", "closed", "bad_option", "no_votes", "too_many_invitees", "slot_unavailable", "calendar_unavailable", "invalid", "review_required", "review_changed"].includes(code) ? code : "booking_unconfirmed";
    return NextResponse.json({ error: safe }, { status: safe === "not_found" ? 404 : safe === "calendar_unavailable" || safe === "booking_unconfirmed" ? 503 : 409 });
  }
}
