import { CalendarProvider, Tokens, ProviderError, j, type ConferenceResult } from "./types";
const API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_SCOPES = "openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
export const googleOAuth = {
  configured: () => !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  authUrl(state: string, redirectUri: string) {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    Object.entries({ client_id: process.env.AUTH_GOOGLE_ID!, redirect_uri: redirectUri, response_type: "code", scope: GOOGLE_SCOPES,
      access_type: "offline", prompt: "consent", include_granted_scopes: "true", state }).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  },
  async token(body: Record<string, string>): Promise<Tokens & { id_token?: string }> {
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.AUTH_GOOGLE_ID!, client_secret: process.env.AUTH_GOOGLE_SECRET!, ...body }), signal: AbortSignal.timeout(10_000) });
    const t = await j(r);
    return { access_token: t.access_token, refresh_token: t.refresh_token, id_token: t.id_token, expires_at: Math.floor(Date.now() / 1000) + (t.expires_in ?? 3600) };
  },
  exchange(code: string, redirectUri: string) { return this.token({ code, redirect_uri: redirectUri, grant_type: "authorization_code" }); },
  refresh(rt: string) { return this.token({ refresh_token: rt, grant_type: "refresh_token" }); },
  emailFromIdToken(idt?: string) { try { return JSON.parse(Buffer.from(idt!.split(".")[1], "base64url").toString()).email ?? ""; } catch { return ""; } },
};
const h = (t: Tokens) => ({ authorization: `Bearer ${t.access_token}`, "content-type": "application/json" });

type GoogleConference = { hangoutLink?: string; status?: string; conferenceData?: { createRequest?: { status?: { statusCode?: string } }; entryPoints?: { entryPointType?: string; uri?: string }[] } };
export function googleConferenceResult(event: GoogleConference): ConferenceResult {
  if (event.status === "cancelled" || event.conferenceData?.createRequest?.status?.statusCode === "failure") return { conferenceStatus: "failed" };
  const link = event.hangoutLink ?? event.conferenceData?.entryPoints?.find(point => point.entryPointType === "video")?.uri;
  if (link) {
    try { const url = new URL(link); if (url.protocol === "https:" && url.hostname === "meet.google.com" && !url.username && !url.password) return { conferenceStatus: "ready", meetingUrl: link }; } catch { /* Invalid provider data must not become a join link. */ }
    return { conferenceStatus: "failed" };
  }
  return { conferenceStatus: event.conferenceData?.createRequest?.status?.statusCode === "success" ? "failed" : "pending" };
}

/** Read the existing event: polling must never insert another event or conference. */
export async function readGoogleConference(t: Tokens, calendarId: string, eventId: string): Promise<ConferenceResult> {
  const response = await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { headers: h(t), signal: AbortSignal.timeout(10_000) });
  if (response.status === 404 || response.status === 410) return { conferenceStatus: "failed" };
  return googleConferenceResult(await j(response));
}

export const google: CalendarProvider<Tokens> = {
  id: "google",
  async listCalendars(t) {
    const out = []; let page: string | undefined;
    do {
      const d = await j(await fetch(`${API}/users/me/calendarList?maxResults=250${page ? `&pageToken=${page}` : ""}`, { headers: h(t) }));
      for (const c of d.items ?? []) out.push({ externalId: c.id, name: c.summaryOverride ?? c.summary, isPrimary: !!c.primary, canWrite: ["owner", "writer"].includes(c.accessRole) });
      page = d.nextPageToken;
    } while (page);
    return out;
  },
  async freeBusy(t, ids, from, to) {
    if (!ids.length) return [];
    const d = await j(await fetch(`${API}/freeBusy`, { method: "POST", headers: h(t), body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: ids.map(id => ({ id })) }) }));
    return Object.values<any>(d.calendars ?? {}).flatMap(c => c.busy ?? []);
  },
  async createEvent(t, cal, e) {
    const body: any = { summary: e.title, description: e.description, location: e.location, iCalUID: `${e.uid}@calendlyisdead`,
      start: { dateTime: e.start.toISOString() }, end: { dateTime: e.end.toISOString() }, attendees: e.attendees.map(a => ({ email: a.email, displayName: a.name })) };
    if (e.wantsMeet) body.conferenceData = { createRequest: { requestId: e.uid, conferenceSolutionKey: { type: "hangoutsMeet" } } };
    // sendUpdates=none: we send our own confirmation + .ics, so Google shouldn't send a second invite
    const d = await j(await fetch(`${API}/calendars/${encodeURIComponent(cal)}/events?sendUpdates=none${e.wantsMeet ? "&conferenceDataVersion=1" : ""}`, { method: "POST", headers: h(t), body: JSON.stringify(body) }));
    if (typeof d.id !== "string" || !d.id) throw new ProviderError(502, "Google Calendar did not return an event identifier");
    return { externalEventId: d.id, ...(e.wantsMeet ? googleConferenceResult(d) : { meetingUrl: d.hangoutLink }) };
  },
  async deleteEvent(t, cal, id) {
    const r = await fetch(`${API}/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(id)}?sendUpdates=none`, { method: "DELETE", headers: h(t) });
    if (!r.ok && r.status !== 404 && r.status !== 410) await j(r);
  },
};
