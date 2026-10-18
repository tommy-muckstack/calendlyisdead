import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { createPoll } from "@/lib/polls";
import { PollCreateInput } from "@/lib/poll-participation";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = PollCreateInput.safeParse(await req.json().catch(() => null)); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { return NextResponse.json({ id: await createPoll(u.id, p.data) }); }
  catch (error) { const code = error instanceof Error && ["invalid", "invalid_options"].includes(error.message) ? error.message : "unavailable";
    return NextResponse.json({ error: code }, { status: code === "unavailable" ? 503 : 400 }); }
}
