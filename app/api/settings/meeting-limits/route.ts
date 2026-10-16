import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { MeetingLimitsPatch, meetingLimits } from "@/lib/meeting-limits";
export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb(); const [saved] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  return saved ? NextResponse.json({ ...meetingLimits(saved), timezone: saved.timezone }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = MeetingLimitsPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const db = await getDb();
    // UPDATE takes the same user-row lock as booking reservations. There is no
    // target-user parameter: even admins can change only their own account.
    const [saved] = await db.update(schema.users).set(parsed.data).where(eq(schema.users.id, user.id)).returning();
    return saved ? NextResponse.json({ ...meetingLimits(saved), timezone: saved.timezone }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch { return NextResponse.json({ error: "save_failed" }, { status: 500 }); }
}
