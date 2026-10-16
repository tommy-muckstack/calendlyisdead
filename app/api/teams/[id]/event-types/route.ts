import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { isAdmin } from "@/lib/teams";
import { insertEventWithLink } from "@/lib/event-type-links";
export const runtime = "nodejs";
const Body = z.object({ kind: z.enum(["collective", "round_robin", "managed"]), title: z.string().min(1).max(120).default("Team meeting") });
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; if (!(await isAdmin(u.id, id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const p = Body.safeParse(await req.json()); if (!p.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const db = await getDb();
  try {
    const et = await db.transaction(async (tx: typeof db) => {
      const event = await insertEventWithLink(tx, { id: crypto.randomUUID(), userId: u.id, teamId: id, title: p.data.title, kind: p.data.kind, durationMin: 30,
        lockedFields: p.data.kind === "managed" ? ["title", "durationMin", "location", "description"] : [] }, p.data.title);
      if (p.data.kind !== "managed") {
        const members = await tx.select({ userId: schema.teamMembers.userId }).from(schema.teamMembers).where(eq(schema.teamMembers.teamId, id));
        if (members.length) await tx.insert(schema.eventTypeHosts).values(members.map((member: { userId: string }) => ({ eventTypeId: event.id, userId: member.userId, priority: 2 })));
      }
      return event;
    }, { isolationLevel: "read committed" });
    return NextResponse.json(et);
  } catch { return NextResponse.json({ error: "create_failed" }, { status: 500 }); }
}
