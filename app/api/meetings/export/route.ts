import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { exportHostMeetings, parseMeetingFilters } from "@/lib/meetings";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = parseMeetingFilters(req.nextUrl.searchParams);
  if (!parsed.success) return NextResponse.json({ error: "invalid_filters" }, { status: 400 });
  const rows = exportHostMeetings(user.id, user.timezone, parsed.data);
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async pull(controller) {
      try { const row = await rows.next(); if (row.done === true) controller.close(); else controller.enqueue(encoder.encode(row.value)); }
      catch (error) { controller.error(error); await rows.return(); }
    },
    async cancel() { await rows.return(); },
  }), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="meetings.csv"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
