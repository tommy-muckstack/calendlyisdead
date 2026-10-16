import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { insertEventWithLink } from "@/lib/event-type-links";
import { EventCreation } from "@/lib/event-creation-validation";
import { createEventDraft, EventCreationError } from "@/lib/event-creation";
import { z } from "zod";
export const runtime = "nodejs";
const Create = z.object({ kind: z.enum(["one_on_one", "group"]).default("one_on_one") }).strict();
export async function POST(req?: Request) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let input: unknown = {};
  try { const text = req ? await req.text() : ""; if (text.length > 500_000) return NextResponse.json({ error: "too_large" }, { status: 413 }); if (text) input = JSON.parse(text); }
  catch { return NextResponse.json({ error: "invalid" }, { status: 400 }); }
  if (input && typeof input === "object" && "draftId" in input) {
    const parsed = EventCreation.safeParse(input);
    if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
    try { const result = await createEventDraft(u.id, parsed.data); return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers: { "Cache-Control": "private, no-store" } }); }
    catch (error) { return error instanceof EventCreationError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: "create_failed" }, { status: 500 }); }
  }
  const parsed = Create.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const db = await getDb();
    const [sc] = await db.select().from(schema.schedules).where(and(eq(schema.schedules.userId, u.id), eq(schema.schedules.isDefault, true)));
    const group = parsed.data.kind === "group";
    const et = await insertEventWithLink(db, { id: crypto.randomUUID(), userId: u.id, scheduleId: sc?.id,
      title: group ? "New group meeting" : "New meeting", durationMin: 30, kind: parsed.data.kind, seats: group ? 2 : 1 }, group ? "new-group-meeting" : "new-meeting");
    return NextResponse.json(et);
  } catch { return NextResponse.json({ error: "create_failed" }, { status: 500 }); }
}
