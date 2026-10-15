import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { DateTime } from "luxon";
import Holidays from "date-holidays";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
export const runtime = "nodejs";
const ClockTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const R = z.array(z.object({ start: ClockTime, end: z.union([ClockTime, z.literal("24:00")]) }).refine(r => r.start < r.end, "start must be before end"));
const ScheduleDate = z.string().regex(/^\d{4}-\d\d-\d\d$/).refine(value => DateTime.fromISO(value, { zone: "UTC" }).isValid, "invalid calendar date");
const Body = z.object({ name: z.string().min(1).max(80), timezone: z.string().min(1), weekly: z.record(z.string().regex(/^[1-7]$/), R), overrides: z.record(ScheduleDate, R),
  holidayCountry: z.string().max(10).nullable(), isDefault: z.boolean() }).partial();
const countries = Object.keys(new Holidays().getCountries());
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const p = Body.safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: "invalid", issues: p.error.issues }, { status: 400 });
  if (p.data.timezone) try { Intl.DateTimeFormat(undefined, { timeZone: p.data.timezone }); } catch { return NextResponse.json({ error: "bad_tz" }, { status: 400 }); }
  if (p.data.holidayCountry && !countries.includes(p.data.holidayCountry)) return NextResponse.json({ error: "bad_country" }, { status: 400 });
  const db = await getDb(); const S = schema.schedules;
  if (p.data.isDefault) await db.update(S).set({ isDefault: false }).where(eq(S.userId, u.id));
  const r = await db.update(S).set(p.data as any).where(and(eq(S.id, id), eq(S.userId, u.id))).returning();
  return r.length ? NextResponse.json(r[0]) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const db = await getDb(); const S = schema.schedules;
  const mine = await db.select().from(S).where(eq(S.userId, u.id));
  const target = mine.find((s: any) => s.id === id); if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (mine.length === 1) return NextResponse.json({ error: "last_schedule" }, { status: 409 });
  const fallback = mine.find((s: any) => s.id !== id && s.isDefault) ?? mine.find((s: any) => s.id !== id);
  await db.update(schema.eventTypes).set({ scheduleId: fallback.id }).where(eq(schema.eventTypes.scheduleId, id));
  await db.delete(S).where(eq(S.id, id));
  if (target.isDefault) await db.update(S).set({ isDefault: true }).where(eq(S.id, fallback.id));
  return NextResponse.json({ ok: true, fallback: fallback.id });
}
