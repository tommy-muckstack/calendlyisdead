import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { route, validateForm, safeUrl } from "@/lib/routing";
export const runtime = "nodejs";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const db = await getDb();
  const [f] = await db.select().from(schema.routingForms).where(eq(schema.routingForms.id, id));
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  let answers: Record<string, string>;
  try { answers = validateForm(f.fields, (await req.json())?.answers ?? {}); } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  const { action, ruleIndex } = route(f.rules, f.fallback, answers);
  await db.insert(schema.formResponses).values({ id: crypto.randomUUID(), formId: id, answers, routedTo: { ...action, ruleIndex } });
  if (action.type === "event") {
    const [owner, slug] = action.value.split("/");
    const base = owner.startsWith("team:") ? `/team/${owner.slice(5)}/${slug}` : `/${owner}/${slug}`;
    const q = new URLSearchParams(); if (answers.name) q.set("name", answers.name); if (answers.email) q.set("email", answers.email);
    return NextResponse.json({ redirect: `${base}${q.size ? `?${q}` : ""}` });
  }
  if (action.type === "url") return NextResponse.json({ redirect: safeUrl(action.value) });
  return NextResponse.json({ message: action.value });
}
