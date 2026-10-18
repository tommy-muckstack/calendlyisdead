import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { setPollVisibility } from "@/lib/polls";
import { PollVisibilityInput } from "@/lib/poll-participation";
export const runtime = "nodejs";
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = PollVisibilityInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { return NextResponse.json(await setPollVisibility(user.id, (await params).id, parsed.data.showVotes)); }
  catch (error) {
    const code = error instanceof Error && ["not_found", "closed"].includes(error.message) ? error.message : "unavailable";
    return NextResponse.json({ error: code }, { status: code === "not_found" ? 404 : code === "closed" ? 409 : 503 });
  }
}
