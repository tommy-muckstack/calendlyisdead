import { NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { CreateCollection } from "@/lib/contact-list-validation";
import { createContactCollection, listContactCollections } from "@/lib/contact-lists";
import { transferBody } from "@/lib/contact-transfer-http";
import { listFailure } from "@/lib/contact-list-http";
export const runtime = "nodejs";
export async function GET() {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in before viewing contact lists." }, { status: 401 });
  return NextResponse.json(await listContactCollections(user.id), { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in before creating contact lists." }, { status: 401 });
  try {
    const parsed = CreateCollection.safeParse(await transferBody(request, 70000));
    if (!parsed.success) return NextResponse.json({ error: "Enter a name and valid filters." }, { status: 400 });
    return NextResponse.json(await createContactCollection(user.id, parsed.data), { status: 201 });
  } catch (error) { return listFailure(error); }
}
