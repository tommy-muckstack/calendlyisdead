import { DateTime, Duration } from "luxon";
import { CalendarProvider, ProviderError } from "./types";
import { buildIcs } from "../ics";
import type { Busy } from "../slots";
export type CaldavCreds = { serverUrl: string; username: string; password: string };
export const ICLOUD_URL = "https://caldav.icloud.com";

async function client(c: CaldavCreds) {
  const { createDAVClient } = await import("tsdav");
  try {
    return await createDAVClient({ serverUrl: c.serverUrl, credentials: { username: c.username, password: c.password }, authMethod: "Basic", defaultAccountType: "caldav" });
  } catch (e: any) { throw new ProviderError(401, `CalDAV login failed: ${e?.message ?? e}`); }
}

/** Minimal VEVENT reader: handles UTC, floating, TZID and all-day DTSTART/DTEND, DURATION, TRANSP, STATUS. */
export function parseBusy(ics: string, fallbackTz = "UTC"): Busy[] {
  const lines = ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out: Busy[] = []; let ev: Record<string, { params: string; value: string }> | null = null;
  const when = (p?: { params: string; value: string }) => {
    if (!p) return null;
    const tz = /TZID=([^;:]+)/.exec(p.params)?.[1] ?? fallbackTz;
    if (/VALUE=DATE(;|$)/.test(p.params) || /^\d{8}$/.test(p.value)) return DateTime.fromFormat(p.value, "yyyyMMdd", { zone: tz });
    if (p.value.endsWith("Z")) return DateTime.fromFormat(p.value, "yyyyMMdd'T'HHmmss'Z'", { zone: "utc" });
    return DateTime.fromFormat(p.value, "yyyyMMdd'T'HHmmss", { zone: tz });
  };
  for (const l of lines) {
    if (l === "BEGIN:VEVENT") { ev = {}; continue; }
    if (l === "END:VEVENT" && ev) {
      const s = when(ev.DTSTART);
      let e = when(ev.DTEND);
      if (!e && s && ev.DURATION) e = s.plus(Duration.fromISO(ev.DURATION.value));
      if (!e && s) e = /VALUE=DATE/.test(ev.DTSTART.params) ? s.plus({ days: 1 }) : s;
      const transparent = ev.TRANSP?.value === "TRANSPARENT" || ev.STATUS?.value === "CANCELLED";
      if (s?.isValid && e?.isValid && !transparent && e > s) out.push({ start: s.toUTC().toISO()!, end: e.toUTC().toISO()! });
      ev = null; continue;
    }
    if (!ev) continue;
    const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(l); if (m && !ev[m[1]]) ev[m[1]] = { params: m[2], value: m[3] };
  }
  return out;
}

export const caldav: CalendarProvider<CaldavCreds> = {
  id: "caldav",
  async listCalendars(c) {
    const cal = await client(c);
    const list = await cal.fetchCalendars();
    return list.filter((x: any) => !x.components || x.components.includes("VEVENT"))
      .map((x: any, i: number) => ({ externalId: x.url, name: typeof x.displayName === "string" ? x.displayName : `Calendar ${i + 1}`, isPrimary: i === 0, canWrite: true }));
  },
  async freeBusy(c, ids, from, to) {
    if (!ids.length) return [];
    const cal = await client(c);
    const out: Busy[] = [];
    for (const url of ids) {
      const objs = await cal.fetchCalendarObjects({ calendar: { url } as any, timeRange: { start: from.toISOString(), end: to.toISOString() }, expand: true });
      for (const o of objs) out.push(...parseBusy(String(o.data ?? "")));
    }
    return out.filter(b => new Date(b.end) > from && new Date(b.start) < to);
  },
  async createEvent(c, calUrl, e) {
    const cal = await client(c);
    const ics = buildIcs({ uid: `${e.uid}@calendlyisdead`, start: e.start, end: e.end, title: e.title, description: e.description, location: e.location,
      organizer: e.organizer, attendee: e.attendees[0], noMethod: true });
    const filename = `${e.uid}.ics`;
    const r = await cal.createCalendarObject({ calendar: { url: calUrl } as any, filename, iCalString: ics });
    if (!r.ok) throw new ProviderError(r.status, `CalDAV PUT failed: ${r.status}`);
    return { externalEventId: new URL(filename, calUrl.endsWith("/") ? calUrl : calUrl + "/").toString() };
  },
  async deleteEvent(c, _cal, objectUrl) {
    const cal = await client(c);
    const r = await cal.deleteCalendarObject({ calendarObject: { url: objectUrl, etag: "" } as any });
    if (!r.ok && r.status !== 404) throw new ProviderError(r.status, `CalDAV DELETE failed: ${r.status}`);
  },
};
