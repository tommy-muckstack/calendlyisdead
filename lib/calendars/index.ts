import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { seal, open } from "../crypto";
import { google, googleOAuth, readGoogleConference, updateGoogleConferenceLocation } from "./google";
import { microsoft, msOAuth } from "./microsoft";
import { caldav } from "./caldav";
import { mock } from "./mock";
import type { CalendarProvider, ExtCalendar, NewEvent, Tokens, ConferenceResult } from "./types";
import type { Busy } from "../slots";
const { calendarConnections: cc, userCalendars: uc, users } = schema;

export const providers: Record<string, CalendarProvider> = { google, microsoft, caldav, mock };

/** Decrypt a connection's secret, refreshing OAuth tokens that expire within 2 minutes. */
export async function secretFor(conn: any) {
  let s = open(conn.secret);
  if ((conn.provider === "google" || conn.provider === "microsoft") && (s as Tokens).expires_at && (s as Tokens).expires_at! - 120 < Date.now() / 1000 && s.refresh_token) {
    const fresh = conn.provider === "google" ? await googleOAuth.refresh(s.refresh_token) : await msOAuth.refresh(s.refresh_token);
    s = { ...s, ...fresh, refresh_token: fresh.refresh_token ?? s.refresh_token };
    const db = await getDb(); await db.update(cc).set({ secret: seal(s), status: "ok" }).where(eq(cc.id, conn.id));
  }
  return s;
}

export async function saveConnection(userId: string, provider: string, accountEmail: string, secret: unknown) {
  const p = providers[provider];
  const cals = await p.listCalendars(secret);
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(cc).values({ id, userId, provider, accountEmail, secret: seal(secret) });
  await syncCalendars(userId, id, cals);
  return id;
}

async function syncCalendars(userId: string, connectionId: string, cals: ExtCalendar[]) {
  const db = await getDb();
  for (const c of cals) await db.insert(uc).values({ id: crypto.randomUUID(), connectionId, userId, externalId: c.externalId, name: c.name, isPrimary: c.isPrimary, canWrite: c.canWrite,
    checkConflicts: c.isPrimary }).onConflictDoNothing();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u.addToCalendarId) {
    const [first] = await db.select().from(uc).where(and(eq(uc.connectionId, connectionId), eq(uc.isPrimary, true)));
    if (first?.canWrite) await db.update(users).set({ addToCalendarId: first.id }).where(eq(users.id, userId));
  }
}

/** Busy times from every calendar the host marked "check for conflicts". Any failed selected calendar makes the host unavailable; callers must check errors. */
export async function externalBusy(userId: string, from: Date, to: Date): Promise<{ busy: Busy[]; errors: string[] }> {
  const db = await getDb();
  const cals = await db.select().from(uc).where(and(eq(uc.userId, userId), eq(uc.checkConflicts, true)));
  if (!cals.length) return { busy: [], errors: [] };
  const conns = await db.select().from(cc).where(eq(cc.userId, userId));
  const busy: Busy[] = [], errors: string[] = [];
  if (cals.some(cal => !conns.some(conn => conn.id === cal.connectionId))) errors.push("calendar_unavailable");
  await Promise.all(conns.map(async (conn: any) => {
    const ids = cals.filter((c: any) => c.connectionId === conn.id).map((c: any) => c.externalId);
    if (!ids.length) return;
    try {
      busy.push(...await providers[conn.provider].freeBusy(await secretFor(conn), ids, from, to));
      if (conn.status !== "ok") await db.update(cc).set({ status: "ok" }).where(eq(cc.id, conn.id));
    }
    catch (e: any) {
      errors.push("calendar_unavailable");
      // Provider bodies may contain private calendar details. Keep the error bounded.
      console.warn("[calendar] selected calendar conflict check failed");
      await db.update(cc).set({ status: e.status === 401 || e.status === 403 ? "reauth" : "error" }).where(eq(cc.id, conn.id));
    }
  }));
  return { busy: errors.length ? [] : busy, errors };
}

async function addTo(userId: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u?.addToCalendarId) return null;
  const [cal] = await db.select().from(uc).where(and(eq(uc.id, u.addToCalendarId), eq(uc.userId, userId), eq(uc.canWrite, true))); if (!cal) return null;
  const [conn] = await db.select().from(cc).where(and(eq(cc.id, cal.connectionId), eq(cc.userId, userId))); if (!conn) return null;
  return { cal, conn };
}

export async function writeEvent(userId: string, e: NewEvent) {
  const t = await addTo(userId); if (!t) return null;
  if (e.wantsMeet && t.conn.provider !== "google") return { conferenceStatus: "failed" as const, externalCalendarId: t.cal.id, externalEventId: undefined, meetingUrl: undefined };
  try {
    const r = await providers[t.conn.provider].createEvent(await secretFor(t.conn), t.cal.externalId, e);
    return { externalCalendarId: t.cal.id, ...r };
  } catch (err: any) { console.warn(`[calendar] write failed: ${err.message}`); return t.conn.provider === "google" && e.wantsMeet ? { conferenceStatus: "failed" as const, externalCalendarId: t.cal.id, externalEventId: undefined, meetingUrl: undefined } : null; }
}

export async function readCalendarConference(userId: string, calendarId: string, eventId: string): Promise<ConferenceResult> {
  const db = await getDb();
  const [cal] = await db.select().from(uc).where(and(eq(uc.id, calendarId), eq(uc.userId, userId)));
  if (!cal) return { conferenceStatus: "failed" };
  const [conn] = await db.select().from(cc).where(and(eq(cc.id, cal.connectionId), eq(cc.userId, userId), eq(cc.provider, "google")));
  if (!conn) return { conferenceStatus: "failed" };
  return readGoogleConference(await secretFor(conn), cal.externalId, eventId);
}

export async function updateCalendarConferenceLocation(userId: string, calendarId: string, eventId: string, meetingUrl: string): Promise<"updated" | "cancelled"> {
  const db = await getDb();
  // Use the original event's destination, never the user's newly selected calendar.
  const [cal] = await db.select().from(uc).where(and(eq(uc.id, calendarId), eq(uc.userId, userId), eq(uc.canWrite, true)));
  if (!cal) return "cancelled";
  const [conn] = await db.select().from(cc).where(and(eq(cc.id, cal.connectionId), eq(cc.userId, userId), eq(cc.provider, "google")));
  if (!conn) return "cancelled";
  return updateGoogleConferenceLocation(await secretFor(conn), cal.externalId, eventId, meetingUrl);
}

export async function removeEvent(userCalendarId: string | null, externalEventId: string | null) {
  if (!userCalendarId || !externalEventId) return;
  const db = await getDb();
  const [cal] = await db.select().from(uc).where(eq(uc.id, userCalendarId)); if (!cal) return;
  const [conn] = await db.select().from(cc).where(eq(cc.id, cal.connectionId)); if (!conn) return;
  try { await providers[conn.provider].deleteEvent(await secretFor(conn), cal.externalId, externalEventId); }
  catch (err: any) { console.warn(`[calendar] delete failed: ${err.message}`); }
}
