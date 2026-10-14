import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
export const runtime = "nodejs";
const R = z.array(z.object({ start: z.string().regex(/^\d\d:\d\d$/), end: z.string().regex(/^(\d\d:\d\d)$/) }).refine(r => r.start < r.end, "start must be before end"));
const Body = z.object({ timezone: z.string(), weekly: z.record(z.string(), R), overrides: z.record(z.string().regex(/^\d{4}-\d\d-\d\d$/), R) });
export async function PUT(req: NextRequest) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = Body.safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: "invalid", issues: p.error.issues }, { status: 400 });
  try { Intl.DateTimeFormat(undefined, { timeZone: p.data.timezone }); } catch { return NextResponse.json({ error: "bad_tz" }, { status: 400 }); }
  const db = await getDb();
  await db.update(schema.schedules).set(p.data as any).where(eq(schema.schedules.userId, u.id));
  await db.update(schema.users).set({ timezone: p.data.timezone }).where(eq(schema.users.id, u.id));
  return NextResponse.json({ ok: true });
}
