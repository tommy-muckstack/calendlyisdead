import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { createPoll } from "@/lib/polls";
export const runtime = "nodejs";
const Body = z.object({ title: z.string().min(1).max(120), durationMin: z.number().int().min(5).max(720), location: z.string().max(300).optional(), options: z.array(z.string()).min(2).max(40) });
export async function POST(req: NextRequest) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = Body.safeParse(await req.json()); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { return NextResponse.json({ id: await createPoll(u.id, p.data) }); } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
