import { NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
export const runtime = "nodejs";
export async function POST() {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const [f] = await db.insert(schema.routingForms).values({ id: crypto.randomUUID().slice(0, 8), userId: u.id, name: "New routing form",
    fields: [{ id: "name", label: "Name", type: "text", required: true }, { id: "email", label: "Email", type: "email", required: true }], rules: [],
    fallback: { type: "message", value: "Thanks! We'll be in touch." } }).returning();
  return NextResponse.json(f);
}
