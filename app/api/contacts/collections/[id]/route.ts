import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { DeleteCollection, UpdateCollection } from "@/lib/contact-list-validation";
import { deleteContactCollection, getContactCollection, updateContactCollection } from "@/lib/contact-lists";
import { transferBody } from "@/lib/contact-transfer-http";
import { listFailure } from "@/lib/contact-list-http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, context: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in to view this list or view." }, { status: 401 });
  const { id } = await context.params; if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "List or view not found." }, { status: 404 });
  try { return NextResponse.json(await getContactCollection(user.id, id), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return listFailure(error); }
}
export async function PATCH(request: Request, context: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in to change this list or view." }, { status: 401 });
  const { id } = await context.params; if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "List or view not found." }, { status: 404 });
  try {
    const parsed = UpdateCollection.safeParse(await transferBody(request, 70000));
    if (!parsed.success) return NextResponse.json({ error: "Enter a name and valid filters." }, { status: 400 });
    return NextResponse.json(await updateContactCollection(user.id, id, parsed.data));
  } catch (error) { return listFailure(error); }
}
export async function DELETE(request: Request, context: Context) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in to delete this list or view." }, { status: 401 });
  const { id } = await context.params; if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "List or view not found." }, { status: 404 });
  try {
    const parsed = DeleteCollection.safeParse(await transferBody(request, 1000));
    if (!parsed.success) return NextResponse.json({ error: "Reload this list or view before deleting." }, { status: 400 });
    await deleteContactCollection(user.id, id, parsed.data.version); return new NextResponse(null, { status: 204 });
  } catch (error) { return listFailure(error); }
}
