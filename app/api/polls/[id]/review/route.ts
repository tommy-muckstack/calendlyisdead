import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { reviewPollBooking } from "@/lib/polls";
import { PollReviewInput } from "@/lib/poll-booking-contract";
export const runtime = "nodejs";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = PollReviewInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { return NextResponse.json(await reviewPollBooking(user.id, (await params).id, parsed.data.option, parsed.data.extraInvitees)); }
  catch (error) {
    const code = error instanceof Error ? error.message : "unavailable";
    const safe = ["not_found", "closed", "bad_option", "no_votes", "too_many_invitees", "slot_unavailable", "calendar_unavailable", "invalid"].includes(code) ? code : "unavailable";
    return NextResponse.json({ error: safe }, { status: safe === "not_found" ? 404 : safe === "calendar_unavailable" ? 503 : 409 });
  }
}
