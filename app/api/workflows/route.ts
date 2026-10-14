import { NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
export const runtime = "nodejs";
export async function POST() {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const [w] = await db.insert(schema.workflows).values({ id: crypto.randomUUID(), userId: u.id, name: "Reminder 24 hours before", trigger: "before_start", offsetMin: 1440, channel: "email", recipient: "invitee",
    subject: "Reminder: {{event.name}} {{event.date}}", body: "Hi {{invitee.first_name}},\n\nThis is a reminder that {{event.name}} with {{host.name}} is on {{event.date}} at {{event.time}}.\n\nWhere: {{event.location}}\nNeed to change it? {{reschedule_url}}", eventTypeIds: [] }).returning();
  return NextResponse.json(w);
}
