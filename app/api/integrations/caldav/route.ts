import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { saveConnection } from "@/lib/calendars";
import { ICLOUD_URL } from "@/lib/calendars/caldav";
export const runtime = "nodejs";
const Body = z.object({ username: z.string().min(3).max(200), password: z.string().min(4).max(200), serverUrl: z.string().url().startsWith("https://").optional() });
export async function POST(req: NextRequest) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = Body.safeParse(await req.json()); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const creds = { serverUrl: p.data.serverUrl ?? ICLOUD_URL, username: p.data.username, password: p.data.password.replace(/\s/g, "") };
  try { const id = await saveConnection(u.id, "caldav", creds.username, creds); return NextResponse.json({ id }); }
  catch (e: any) { return NextResponse.json({ error: e.status === 401 ? "login_failed" : "connect_failed" }, { status: 400 }); }
}
