import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { MembershipRequest } from "@/lib/contact-list-validation";
import { changeContactListMembers } from "@/lib/contact-lists";
import { transferBody } from "@/lib/contact-transfer-http";
import { listFailure } from "@/lib/contact-list-http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in before changing contact lists." }, { status: 401 });
  const { id } = await context.params; if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "List not found." }, { status: 404 });
  try {
    const parsed = MembershipRequest.safeParse(await transferBody(request, 120000));
    if (!parsed.success) return NextResponse.json({ error: "Choose contacts and a list to update." }, { status: 400 });
    return NextResponse.json(await changeContactListMembers(user.id, id, parsed.data));
  } catch (error) { return listFailure(error); }
}
