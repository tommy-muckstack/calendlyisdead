import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { createOneOff } from "@/lib/oneoff";
export const runtime = "nodejs";
const Body = z.object({ title: z.string().max(120).default(""), durationMin: z.number().int().min(5).max(720).default(30), location: z.string().max(300).optional(), fromEventTypeId: z.string().optional() });
export async function POST(req: NextRequest) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = Body.safeParse(await req.json()); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { return NextResponse.json(await createOneOff(u.id, p.data)); }
  catch (error) { if (error instanceof Error && error.message === "shared_single_use_unsupported") return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
}
