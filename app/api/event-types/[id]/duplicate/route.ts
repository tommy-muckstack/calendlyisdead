import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { insertEventWithLink } from "@/lib/event-type-links";

import { duplicateSharedEvent } from "@/lib/shared-events";
import { SharedEventError } from "@/lib/shared-event-validation";
export const runtime = "nodejs";
const COPY_FIELDS = ["description", "durationMin", "startIntervalMin", "location", "color", "scheduleId", "bufferBeforeMin", "bufferAfterMin",
  "minNoticeMin", "rangeDays", "dateRange", "active", "secret", "lockedTimezone", "kind", "questions", "maxPerDay", "maxPerWeek", "maxPerMonth", "seats", "rrMode",
  "priceCents", "currency", "redirectUrl"] as const;

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params, db = await getDb(), E = schema.eventTypes;
  try {
    const [probe] = await db.select().from(E).where(eq(E.id, id));
    if (probe?.sharedWorkspaceId) return NextResponse.json(await duplicateSharedEvent(user.id, id), { status: 201 });
    return await db.transaction(async (tx: typeof db) => {
      const [candidate] = await tx.select().from(E).where(and(eq(E.id, id), isNull(E.deletedAt)));
      if (!candidate) return NextResponse.json({ error: "not_found" }, { status: 404 });
      if (candidate.teamId) {
        const [membership] = await tx.select().from(schema.teamMembers)
          .where(and(eq(schema.teamMembers.teamId, candidate.teamId), eq(schema.teamMembers.userId, user.id)));
        if (!membership || !["owner", "admin"].includes(membership.role)) return NextResponse.json({ error: "not_found" }, { status: 404 });
      } else if (candidate.userId !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
      // Keep team ownership/hosts; an assigned personal copy becomes independent.
      // Slug conflicts retry below. Avoid locking user rows just to copy settings:
      // reservations lock hosts, while inserting copied host links checks their FKs.
      if (candidate.teamId) await tx.select({ id: schema.teams.id }).from(schema.teams).where(eq(schema.teams.id, candidate.teamId)).for("no key update");
      const [source] = await tx.select().from(E).where(and(eq(E.id, id), isNull(E.deletedAt))).for("share");
      if (!source) return NextResponse.json({ error: "not_found" }, { status: 404 });
      if (!["one_on_one", "group", "collective", "round_robin", "managed"].includes(source.kind))
        return NextResponse.json({ error: "unsupported_event_type" }, { status: 400 });
      const copy = await insertEventWithLink(tx, { ...Object.fromEntries(COPY_FIELDS.map(key => [key, source[key]])),
        id: crypto.randomUUID(), userId: source.userId, teamId: source.teamId,
        title: `${source.title.slice(0, 113)} (copy)`, lockedFields: source.kind === "managed" ? source.lockedFields : [],
      }, source.slug, "-copy");
      if (source.teamId && source.kind !== "managed") {
        const hosts = await tx.select().from(schema.eventTypeHosts).where(eq(schema.eventTypeHosts.eventTypeId, id));
        if (hosts.length) await tx.insert(schema.eventTypeHosts).values(hosts.map((host: typeof schema.eventTypeHosts.$inferSelect) =>
          ({ eventTypeId: copy.id, userId: host.userId, priority: host.priority })));
      }
      return NextResponse.json({ ...copy, groupSettingsLocked: false }, { status: 201 });
    }, { isolationLevel: "read committed" });
  } catch (error) { return NextResponse.json({ error: error instanceof SharedEventError ? error.message : "duplicate_failed" }, { status: error instanceof SharedEventError ? error.status : 500 }); }
}
