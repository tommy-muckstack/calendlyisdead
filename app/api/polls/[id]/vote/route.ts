import { NextRequest, NextResponse } from "next/server";
import { vote } from "@/lib/polls";
import { PollVoteInput } from "@/lib/poll-participation";
export const runtime = "nodejs";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const p = PollVoteInput.safeParse(await req.json().catch(() => null)); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { return NextResponse.json({ picks: await vote((await params).id, p.data) }); }
  catch (error) {
    const code = error instanceof Error && ["not_found", "closed", "already_voted", "full", "bad_option", "invalid"].includes(error.message) ? error.message : "unavailable";
    return NextResponse.json({ error: code }, { status: code === "not_found" ? 404 : code === "unavailable" ? 503 : 409 });
  }
}
