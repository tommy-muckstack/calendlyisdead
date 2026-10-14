import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { defaultWeekly } from "@/lib/slots";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { name } = await req.json().catch(() => ({}));
  const db = await getDb();
  const [sc] = await db.insert(schema.schedules).values({ id: crypto.randomUUID(), userId: u.id, name: String(name || "New schedule").slice(0, 80), timezone: u.timezone, weekly: defaultWeekly(), overrides: {}, isDefault: false }).returning();
  return NextResponse.json(sc);
}
