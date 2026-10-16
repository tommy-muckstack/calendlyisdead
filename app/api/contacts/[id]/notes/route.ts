import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { CreateNote, TimelineFilters } from "@/lib/contact-note-validation";
import { contactTimeline, createContactNote } from "@/lib/contact-notes";
import { noteBody, noteFailure } from "@/lib/contact-note-http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = TimelineFilters.safeParse({ page: request.nextUrl.searchParams.get("page") ?? 1 }); if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { return NextResponse.json(await contactTimeline(user.id, (await params).id, "notes", parsed.data.page), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return noteFailure(error); }
}
export async function POST(request: NextRequest, { params }: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = CreateNote.safeParse(await noteBody(request)); if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  try { return NextResponse.json(await createContactNote(user.id, (await params).id, parsed.data.id, parsed.data), { status: 201 }); } catch (error) { return noteFailure(error); }
}
