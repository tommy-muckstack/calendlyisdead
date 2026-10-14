import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { vote } from "@/lib/polls";
export const runtime = "nodejs";
const Body = z.object({ name: z.string().min(1).max(200), email: z.string().email(), picks: z.array(z.string()).max(40) });
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const p = Body.safeParse(await req.json()); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { return NextResponse.json({ picks: await vote((await params).id, p.data) }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.message === "not_found" ? 404 : 409 }); }
}
