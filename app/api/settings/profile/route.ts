import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { ProfilePatch, profileData } from "@/lib/profile";
import { normalizeProfilePhoto } from "@/lib/profile-photo";
export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb(); const [saved] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  return saved ? NextResponse.json(profileData(saved)) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
export async function PATCH(req: NextRequest) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = ProfilePatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  if (parsed.data.image) try { parsed.data.image = await normalizeProfilePhoto(parsed.data.image); }
  catch { return NextResponse.json({ error: "invalid_photo" }, { status: 400 }); }
  try {
    const db = await getDb();
    // Name/photo/welcome/zone are app preferences, not Firebase login identity.
    // The user-row update serializes timezone changes with booking-limit checks.
    const [saved] = await db.update(schema.users).set(parsed.data).where(eq(schema.users.id, user.id)).returning();
    return saved ? NextResponse.json(profileData(saved)) : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch { return NextResponse.json({ error: "save_failed" }, { status: 500 }); }
}
