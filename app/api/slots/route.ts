import { NextRequest, NextResponse } from "next/server";
import { slotsFor } from "@/lib/booking";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tz = p.get("tz") ?? "UTC";
  try { Intl.DateTimeFormat(undefined, { timeZone: tz }); } catch { return NextResponse.json({ error: "bad_tz" }, { status: 400 }); }
  const r = await slotsFor(p.get("user")!, p.get("slug")!, p.get("from")!, p.get("to")!, tz, undefined, p.get("exclude") ?? undefined);
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (r.calendarErrors.length && !Object.values(r.slots).some(times => times.length))
    return NextResponse.json({ error: "calendar_unavailable" }, { status: 503 });
  return NextResponse.json({ slots: r.slots, timezone: r.timezone });
}
