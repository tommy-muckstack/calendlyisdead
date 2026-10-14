import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { runAssistant } from "@/lib/assistant-run";
export const runtime = "nodejs";
const Body = z.object({ thread: z.string().min(10).max(50_000), slug: z.string() });
export async function POST(req: NextRequest) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = Body.safeParse(await req.json()); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const r = await runAssistant(u as any, p.data.slug, p.data.thread);
  return r ? NextResponse.json(r) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
