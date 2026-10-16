import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { runAssistant } from "@/lib/assistant-run";
export const runtime = "nodejs";
/**
 * Inbound-mail webhook (Resend inbound, Postmark, SES->Lambda, etc. map their payload to { to, from, subject, text }).
 * Address format: <username>+<event-slug>@your-inbound-domain. Returns the proposal and reply draft; it does not send mail.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INBOUND_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const m = await req.json().catch(() => null) as { to?: string; from?: string; subject?: string; text?: string } | null;
  if (!m?.to || !m.text) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const local = String(m.to).match(/([^<\s@]+)@/)?.[1] ?? ""; const [username, slug] = local.split("+");
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.username, username.toLowerCase()));
  if (!u) return NextResponse.json({ error: "unknown_user" }, { status: 404 });
  const ets = await db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.userId, u.id), isNull(schema.eventTypes.deletedAt)));
  const et = ets.find((e: any) => e.slug === slug) ?? ets.find((e: any) => e.active && e.kind === "one_on_one");
  if (!et) return NextResponse.json({ error: "no_event_type" }, { status: 404 });
  const r = await runAssistant(u, et.slug, `From: ${m.from ?? ""}\nSubject: ${m.subject ?? ""}\n\n${m.text}`);
  return NextResponse.json(r);
}
