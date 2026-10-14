import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { baseUrl } from "@/lib/booking";
import { EmbedBuilder } from "@/components/EmbedBuilder";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await requireUser(); if (!u) redirect("/login"); const db = await getDb();
  const ets = (await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.userId, u.id))).filter((e: any) => !e.teamId && e.active && e.kind !== "one_off" && e.kind !== "poll" && e.kind !== "managed");
  return <EmbedBuilder base={baseUrl()} username={u.username!} types={ets.map((e: any) => ({ slug: e.slug, title: e.title }))} />;
}
