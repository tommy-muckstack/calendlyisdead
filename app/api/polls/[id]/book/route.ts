import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { bookPoll } from "@/lib/polls";
export const runtime = "nodejs";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { option } = await req.json().catch(() => ({}));
  try { return NextResponse.json({ uid: await bookPoll(u.id, (await params).id, String(option)) }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.message === "not_found" ? 404 : 409 }); }
}
