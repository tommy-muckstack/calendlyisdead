import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { validLogo } from "@/lib/branding";
export const runtime = "nodejs";
const Body = z.object({ brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(), logoUrl: z.string().max(280_000).nullable(), hideBranding: z.boolean() }).partial();
export async function PATCH(req: NextRequest) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = Body.safeParse(await req.json()); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (p.data.logoUrl && !validLogo(p.data.logoUrl)) return NextResponse.json({ error: "bad_logo" }, { status: 400 });
  const db = await getDb();
  const [r] = await db.update(schema.users).set(p.data).where(eq(schema.users.id, u.id)).returning();
  return NextResponse.json({ brandColor: r.brandColor, logoUrl: r.logoUrl, hideBranding: r.hideBranding });
}
