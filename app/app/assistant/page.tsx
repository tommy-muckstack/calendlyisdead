import { redirect } from "next/navigation";
import { eq, and, isNull } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { AssistantPanel } from "@/components/AssistantPanel";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await requireUser(); if (!u) redirect("/login"); const db = await getDb();
  const ets = (await db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.userId, u.id), isNull(schema.eventTypes.deletedAt)))).filter((e: any) => !e.teamId && e.active && ["one_on_one", "group"].includes(e.kind));
  return <AssistantPanel types={ets.map((e: any) => ({ slug: e.slug, title: e.title, durationMin: e.durationMin }))} llm={!!process.env.LLM_API_KEY} />;
}
