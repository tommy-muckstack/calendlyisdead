import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createBooking } from "@/lib/booking";
export const runtime = "nodejs";
const Body = z.object({ username: z.string(), slug: z.string(), start: z.string(), name: z.string().min(1).max(200), email: z.string().email(), tz: z.string(),
  notes: z.string().max(5000).optional(), guests: z.array(z.string().email()).max(10).optional(), rescheduleUid: z.string().optional(), answers: z.record(z.string(), z.string()).optional() });
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  try { const b = await createBooking(parsed.data); return NextResponse.json({ uid: b.uid }); }
  catch (e: any) {
    const status = e.message === "not_found" ? 404 : e.message.startsWith("answer_") ? 400 : 409;
    return NextResponse.json({ error: e.message }, { status });
  }
}
