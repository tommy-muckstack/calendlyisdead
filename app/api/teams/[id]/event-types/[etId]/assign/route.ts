import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { assignManaged, isAdmin } from "@/lib/teams";
export const runtime = "nodejs";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; etId: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, etId } = await params; if (!(await isAdmin(u.id, id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const p = z.object({ userIds: z.array(z.string()).max(500) }).safeParse(await req.json()); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { return NextResponse.json({ assigned: await assignManaged(etId, p.data.userIds, id) }); } catch { return NextResponse.json({ error: "not_managed" }, { status: 400 }); }
}
