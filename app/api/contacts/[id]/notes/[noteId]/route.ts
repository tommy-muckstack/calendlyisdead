import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { DeleteNote, PatchNote } from "@/lib/contact-note-validation";
import { completeContactReminder, deleteContactNote, editContactNote, getContactNote } from "@/lib/contact-notes";
import { noteBody, noteFailure } from "@/lib/contact-note-http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; noteId: string }> };
export async function GET(_: NextRequest, { params }: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 }); const { id, noteId } = await params;
  try { return NextResponse.json(await getContactNote(user.id, id, noteId), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return noteFailure(error); }
}
export async function PATCH(request: NextRequest, { params }: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 }); const { id, noteId } = await params;
  const parsed = PatchNote.safeParse(await noteBody(request)); if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  try { const input = parsed.data; return NextResponse.json(input.action === "complete" ? await completeContactReminder(user.id, id, noteId, input.version) : await editContactNote(user.id, id, noteId, input.version, input)); } catch (error) { return noteFailure(error); }
}
export async function DELETE(request: NextRequest, { params }: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 }); const { id, noteId } = await params;
  const parsed = DeleteNote.safeParse(await noteBody(request)); if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try { await deleteContactNote(user.id, id, noteId, parsed.data.version); return new NextResponse(null, { status: 204 }); } catch (error) { return noteFailure(error); }
}
