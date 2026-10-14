import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { invite, isAdmin } from "@/lib/teams";
export const runtime = "nodejs";
const Body = z.object({ email: z.string().email(), role: z.enum(["member", "admin"]).default("member") });
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; if (!(await isAdmin(u.id, id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const p = Body.safeParse(await req.json()); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const r = await invite(id, p.data.email, p.data.role, u);
  return NextResponse.json({ ok: true, ...(process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1" ? { url: r.url } : {}) });
}
