import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "./db";

type EventInput = Omit<typeof schema.eventTypes.$inferInsert, "slug">;

/** Allocate in the actual public URL namespace; the index arbitrates races. */
export async function insertEventWithLink(connection: Awaited<ReturnType<typeof getDb>>, values: EventInput, base: string, tag = "") {
  const E = schema.eventTypes;
  const team = values.teamId != null;
  const predicate = and(isNull(E.deletedAt), team ? isNotNull(E.teamId) : isNull(E.teamId));
  const rows = await connection.select({ slug: E.slug }).from(E)
    .where(and(predicate, team ? eq(E.teamId, values.teamId!) : eq(E.userId, values.userId)));
  const taken = new Set(rows.map((row: { slug: string }) => row.slug));
  const normalized = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "meeting";
  for (let n = 1; ; n++) {
    const suffix = tag + (n === 1 ? "" : `-${n}`);
    const slug = normalized.slice(0, 60 - suffix.length).replace(/-+$/, "") + suffix;
    if (taken.has(slug)) continue;
    const [event] = await connection.insert(E).values({ ...values, slug }).onConflictDoNothing({
      target: team ? [E.teamId, E.slug] : [E.userId, E.slug], where: predicate,
    }).returning();
    if (event) return event as typeof E.$inferSelect;
    taken.add(slug);
  }
}

/** Drizzle wraps driver errors; don't mislabel unrelated failures as taken links. */
export function isEventLinkConflict(error: unknown): boolean {
  const visited = new Set<unknown>();
  while (error && typeof error === "object" && !visited.has(error)) {
    visited.add(error);
    const detail = error as { code?: string; constraint?: string; constraint_name?: string; cause?: unknown };
    const constraint = detail.constraint ?? detail.constraint_name;
    if (detail.code === "23505" && ["event_types_current_personal_slug", "event_types_current_team_slug"].includes(constraint ?? "")) return true;
    error = detail.cause;
  }
  return false;
}
