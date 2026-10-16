import { redirect } from "next/navigation";
import { eq, and, isNull } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { baseUrl } from "@/lib/booking";
import { EmbedBuilder } from "@/components/EmbedBuilder";
import { listSharedEvents } from "@/lib/shared-events";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const u = await requireUser(); if (!u) redirect("/login"); const db = await getDb();
  const ets = (await db.select().from(schema.eventTypes).where(and(eq(schema.eventTypes.userId, u.id), isNull(schema.eventTypes.deletedAt)))).filter((e: typeof schema.eventTypes.$inferSelect) => !e.teamId && !e.sharedWorkspaceId && e.kind !== "one_off" && e.kind !== "poll" && e.kind !== "managed");
  const { event } = await searchParams;
  const shared = await listSharedEvents(u.id);
  const types = [...ets.map((e: typeof schema.eventTypes.$inferSelect) => ({ slug: e.slug, title: e.title, active: e.active })), ...shared.map(e => ({ slug: e.id, title: e.title, active: e.active, bookingPath: `/${e.bookingUsername}/${e.slug}` }))];
  return <EmbedBuilder key={event ?? "default"} base={baseUrl()} username={u.username!} types={types}
    initialSlug={types.some((e: { slug: string }) => e.slug === event) ? event : undefined} />;
}
