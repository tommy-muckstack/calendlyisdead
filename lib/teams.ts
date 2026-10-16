import { withLocationLocks } from "./event-locations";
import { BP } from "./basepath";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "./db";
import { sendMail } from "./email";
import { insertEventWithLink } from "./event-type-links";
import { withDateRangeLocks } from "./booking-date-range";
const { teams, teamMembers: tm, teamInvites: ti, eventTypes, eventTypeHosts: eth, users } = schema;
export const LOCKABLE = ["title", "description", "durationMin", "startIntervalMin", "lockedTimezone", "location", "locations", "color", "questions", "bufferBeforeMin", "bufferAfterMin", "minNoticeMin", "rangeDays", "dateRange", "maxPerDay", "maxPerWeek", "maxPerMonth"] as const;
const appUrl = () => process.env.APP_URL ?? process.env.AUTH_URL ?? `http://localhost:3000${BP}`;

export async function role(userId: string, teamId: string): Promise<string | null> {
  const db = await getDb();
  const [m] = await db.select().from(tm).where(and(eq(tm.teamId, teamId), eq(tm.userId, userId)));
  return m?.role ?? null;
}
export const isAdmin = async (userId: string, teamId: string) => ["owner", "admin"].includes((await role(userId, teamId)) ?? "");

export async function createTeam(userId: string, name: string, slug: string) {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(teams).values({ id, name, slug });
  await db.insert(tm).values({ teamId: id, userId, role: "owner" });
  return id;
}

export async function invite(teamId: string, email: string, r: "member" | "admin", by: { id: string; name: string | null }) {
  const db = await getDb();
  const [t] = await db.select().from(teams).where(eq(teams.id, teamId));
  const token = nanoid(32);
  await db.insert(ti).values({ token, teamId, email: email.toLowerCase(), role: r, invitedBy: by.id, expires: new Date(Date.now() + 7 * 864e5) });
  const url = `${appUrl()}/invite/${token}`;
  await sendMail({ to: email, subject: `${by.name ?? "A teammate"} invited you to ${t.name} on CalendlyIsDead`,
    text: `${by.name ?? "A teammate"} invited you to join ${t.name}.\n\nAccept: ${url}\n\nThis link expires in 7 days.` });
  return { token, url };
}

export async function acceptInvite(token: string, user: { id: string; email: string | null }) {
  const db = await getDb();
  const [inv] = await db.select().from(ti).where(eq(ti.token, token));
  if (!inv || inv.acceptedAt || +inv.expires < Date.now()) return { error: "invalid_or_expired" as const };
  if ((user.email ?? "").toLowerCase() !== inv.email) return { error: "wrong_account" as const, email: inv.email };
  await db.insert(tm).values({ teamId: inv.teamId, userId: user.id, role: inv.role }).onConflictDoNothing();
  await db.update(ti).set({ acceptedAt: new Date() }).where(eq(ti.token, token));
  return { teamId: inv.teamId };
}

/** Managed event types: copy the template into each member's own account. Locked fields follow the template; the rest the member may edit. */
export async function assignManaged(templateId: string, userIds: string[], teamId?: string) {
  const db = await getDb();
  return db.transaction(async (tx: typeof db) => {
    const [tpl] = await tx.select().from(eventTypes).where(and(eq(eventTypes.id, templateId), isNull(eventTypes.deletedAt))).for("update");
    if (!tpl || tpl.kind !== "managed" || (teamId && tpl.teamId !== teamId)) throw new Error("not_managed");
    const members = (await tx.select().from(tm).where(eq(tm.teamId, tpl.teamId))).map((m: any) => m.userId);
    const targets = [...new Set(userIds.filter(u => members.includes(u)))].sort();
    const children = await tx.select().from(eventTypes).where(and(eq(eventTypes.managedParentId, templateId), isNull(eventTypes.deletedAt)));
    for (const uid of targets) {
      if (children.some((c: any) => c.userId === uid)) continue;
      await insertEventWithLink(tx, { ...Object.fromEntries(LOCKABLE.map(f => [f, tpl[f]])), id: crypto.randomUUID(),
        userId: uid, title: tpl.title, kind: "one_on_one", managedParentId: templateId, lockedFields: tpl.lockedFields }, tpl.slug);
    }
    // unassign anyone no longer listed
    const drop = children.filter((c: any) => !targets.includes(c.userId)).map((c: any) => c.id);
    if (drop.length) await tx.update(eventTypes).set({ active: false, deletedAt: new Date() }).where(inArray(eventTypes.id, drop));
    return targets.length;
  }, { isolationLevel: "read committed" });
}

export async function propagateManaged(templateId: string) {
  const db = await getDb();
  const [tpl] = await db.select().from(eventTypes).where(and(eq(eventTypes.id, templateId), isNull(eventTypes.deletedAt)));
  if (!tpl || tpl.kind !== "managed") return 0;
  const patch: any = { lockedFields: withLocationLocks(withDateRangeLocks(tpl.lockedFields)) };
  for (const f of patch.lockedFields as string[]) if ((LOCKABLE as readonly string[]).includes(f)) patch[f] = tpl[f];
  const r = await db.update(eventTypes).set(patch).where(and(eq(eventTypes.managedParentId, templateId), isNull(eventTypes.deletedAt))).returning();
  return r.length;
}

export async function teamMembers(teamId: string) {
  const db = await getDb();
  const ms = await db.select().from(tm).where(eq(tm.teamId, teamId));
  const us = ms.length ? await db.select().from(users).where(inArray(users.id, ms.map((m: any) => m.userId))) : [];
  return ms.map((m: any) => ({ ...m, user: us.find((u: any) => u.id === m.userId) }));
}
export async function setHosts(eventTypeId: string, hosts: { userId: string; priority: number }[]) {
  const db = await getDb();
  await db.transaction(async (tx: typeof db) => {
    // A duplicate must observe either the old or new full host set, never the
    // temporary empty list between delete and insert. Also serialize deletion.
    const [event] = await tx.select().from(eventTypes).where(and(eq(eventTypes.id, eventTypeId), isNull(eventTypes.deletedAt))).for("update");
    if (!event) throw new Error("not_found");
    await tx.delete(eth).where(eq(eth.eventTypeId, eventTypeId));
    if (hosts.length) await tx.insert(eth).values(hosts.map(h => ({ eventTypeId, userId: h.userId, priority: h.priority })));
  }, { isolationLevel: "read committed" });
}
