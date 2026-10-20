import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { MyLinkPatch } from "@/lib/public-username";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
function uniqueConflict(error: unknown): boolean {
  return !!error && typeof error === "object" && (("code" in error && error.code === "23505") || ("cause" in error && uniqueConflict(error.cause)));
}
export async function GET() {
  const user = await requireUser(); if (!user) return reply({ error: "unauthorized" }, 401);
  try {
    const db = await getDb();
    const [saved] = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, user.id));
    return saved ? reply(saved) : reply({ error: "not_found" }, 404);
  } catch { return reply({ error: "load_failed" }, 500); }
}
export async function PATCH(req: NextRequest) {
  const user = await requireUser(); if (!user) return reply({ error: "unauthorized" }, 401);
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const source = new URL(origin);
      // Next.js may normalize req.url to its internal listening hostname.
      // The browser's Host header identifies the actual requested website.
      const host = new URL(`${source.protocol}//${req.headers.get("host") ?? new URL(req.url).host}`).host;
      if (!["http:", "https:"].includes(source.protocol) || source.origin !== origin || source.host !== host) return reply({ error: "forbidden" }, 403);
    } catch { return reply({ error: "forbidden" }, 403); }
  }
  const body = await req.text(); if (body.length > 4096) return reply({ error: "too_large" }, 413);
  let raw: unknown; try { raw = JSON.parse(body); } catch { return reply({ error: "invalid" }, 400); }
  const parsed = MyLinkPatch.safeParse(raw);
  if (!parsed.success) return reply({ error: "invalid" }, 400);
  const { username, expectedUsername } = parsed.data;
  try {
    const db = await getDb(), U = schema.users;
    const result = await db.transaction(async (tx: typeof db) => {
      const [current] = await tx.select({ username: U.username }).from(U).where(eq(U.id, user.id)).for("update");
      if (!current) return { error: "not_found", status: 404 };
      // An uncertain retry is successful only if the requested link is current.
      if (current.username === username) return { username };
      if (current.username !== expectedUsername) return { error: "link_changed", status: 409 };
      // The existing unique constraint arbitrates competing edits and signups.
      const [saved] = await tx.update(U).set({ username }).where(eq(U.id, user.id)).returning({ username: U.username });
      return saved;
    });
    return "error" in result ? reply({ error: result.error }, result.status) : reply(result);
  } catch (error) { return reply({ error: uniqueConflict(error) ? "link_taken" : "save_failed" }, uniqueConflict(error) ? 409 : 500); }
}
