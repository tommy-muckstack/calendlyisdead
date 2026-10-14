import { NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { saveConnection } from "@/lib/calendars";
import { mockEnabled } from "@/lib/calendars/mock";
export const runtime = "nodejs";
export async function POST() {
  if (!mockEnabled()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ id: await saveConnection(u.id, "mock", "mock@calendlyisdead.local", { account: "mock" }) });
}
