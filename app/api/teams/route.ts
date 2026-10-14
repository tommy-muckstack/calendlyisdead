import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { createTeam } from "@/lib/teams";
export const runtime = "nodejs";
const Body = z.object({ name: z.string().min(1).max(80), slug: z.string().regex(/^[a-z0-9-]{2,40}$/) });
export async function POST(req: NextRequest) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = Body.safeParse(await req.json()); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { return NextResponse.json({ id: await createTeam(u.id, p.data.name, p.data.slug) }); } catch { return NextResponse.json({ error: "slug_taken" }, { status: 409 }); }
}
