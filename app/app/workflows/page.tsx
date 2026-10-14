import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { WorkflowsPanel } from "@/components/WorkflowsPanel";
import { TEMPLATE_VARS } from "@/lib/workflows";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await requireUser(); if (!u) redirect("/login"); const db = await getDb();
  const ws = await db.select().from(schema.workflows).where(eq(schema.workflows.userId, u.id));
  const ets = (await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.userId, u.id))).map((e: any) => ({ id: e.id, title: e.title + (e.teamId ? " (team)" : "") }));
  return <WorkflowsPanel initial={ws} eventTypes={ets} vars={TEMPLATE_VARS} />;
}
