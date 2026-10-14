import { CalendarProvider, Tokens, j } from "./types";
const G = "https://graph.microsoft.com/v1.0";
const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
export const MS_SCOPES = "offline_access openid email User.Read Calendars.ReadWrite";
export const msOAuth = {
  configured: () => !!(process.env.AUTH_MICROSOFT_ID && process.env.AUTH_MICROSOFT_SECRET),
  authUrl(state: string, redirectUri: string) {
    const u = new URL(`${AUTH}/authorize`);
    Object.entries({ client_id: process.env.AUTH_MICROSOFT_ID!, redirect_uri: redirectUri, response_type: "code", scope: MS_SCOPES, response_mode: "query", state })
      .forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  },
  async token(body: Record<string, string>): Promise<Tokens> {
    const t = await j(await fetch(`${AUTH}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.AUTH_MICROSOFT_ID!, client_secret: process.env.AUTH_MICROSOFT_SECRET!, scope: MS_SCOPES, ...body }) }));
    return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (t.expires_in ?? 3600) };
  },
  exchange(code: string, redirectUri: string) { return this.token({ code, redirect_uri: redirectUri, grant_type: "authorization_code" }); },
  refresh(rt: string) { return this.token({ refresh_token: rt, grant_type: "refresh_token" }); },
  async email(t: Tokens) { const me = await j(await fetch(`${G}/me`, { headers: h(t) })); return me.mail ?? me.userPrincipalName ?? ""; },
};
const h = (t: Tokens) => ({ authorization: `Bearer ${t.access_token}`, "content-type": "application/json", prefer: 'outlook.timezone="UTC"' });
const utc = (s: string) => new Date(/Z|[+-]\d\d:\d\d$/.test(s) ? s : s + "Z").toISOString();

export const microsoft: CalendarProvider<Tokens> = {
  id: "microsoft",
  async listCalendars(t) {
    const out = []; let url: string | undefined = `${G}/me/calendars?$top=100`;
    while (url) { const d: any = await j(await fetch(url, { headers: h(t) }));
      for (const c of d.value ?? []) out.push({ externalId: c.id, name: c.name, isPrimary: !!c.isDefaultCalendar, canWrite: c.canEdit !== false });
      url = d["@odata.nextLink"]; }
    return out;
  },
  async freeBusy(t, ids, from, to) {
    const busy = [];
    for (const id of ids) {
      let url: string | undefined = `${G}/me/calendars/${encodeURIComponent(id)}/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$select=start,end,showAs,isCancelled&$top=500`;
      while (url) { const d: any = await j(await fetch(url, { headers: h(t) }));
        for (const e of d.value ?? []) if (!e.isCancelled && e.showAs !== "free" && e.showAs !== "workingElsewhere") busy.push({ start: utc(e.start.dateTime), end: utc(e.end.dateTime) });
        url = d["@odata.nextLink"]; }
    }
    return busy;
  },
  async createEvent(t, cal, e) {
    // No attendees on the Graph event: Outlook would email its own invite on top of ours. The invitee is listed in the body.
    const body = { subject: e.title, body: { contentType: "text", content: `${e.description}\n\nInvitee: ${e.attendees.map(a => `${a.name} <${a.email}>`).join(", ")}` },
      start: { dateTime: e.start.toISOString().replace("Z", ""), timeZone: "UTC" }, end: { dateTime: e.end.toISOString().replace("Z", ""), timeZone: "UTC" },
      location: { displayName: e.location }, transactionId: e.uid };
    const d = await j(await fetch(`${G}/me/calendars/${encodeURIComponent(cal)}/events`, { method: "POST", headers: h(t), body: JSON.stringify(body) }));
    return { externalEventId: d.id, meetingUrl: d.onlineMeeting?.joinUrl };
  },
  async deleteEvent(t, _cal, id) {
    const r = await fetch(`${G}/me/events/${encodeURIComponent(id)}`, { method: "DELETE", headers: h(t) });
    if (!r.ok && r.status !== 404) await j(r);
  },
};
