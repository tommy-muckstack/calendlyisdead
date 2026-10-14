import fs from "node:fs";
import path from "node:path";
import { DateTime } from "luxon";
import { CalendarProvider } from "./types";
/** Keyless stand-in used in dev, demo and tests. Persists to .data/mock-calendar.json so tests can inspect writes.
 *  "Work" calendar: busy 12:00-13:00 America/New_York every weekday. "Personal": busy nothing, writable. */
type Store = { events: { calendarId: string; id: string; title: string; start: string; end: string }[] };
const file = () => path.resolve(process.cwd(), process.env.PGLITE_DIR ? path.dirname(process.env.PGLITE_DIR) : ".data", "mock-calendar.json");
export const readMock = (): Store => { try { return JSON.parse(fs.readFileSync(file(), "utf8")); } catch { return { events: [] }; } };
const write = (s: Store) => { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(s, null, 2)); };
export const mockEnabled = () => process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1" || process.env.CALENDAR_MOCK === "1";

export const mock: CalendarProvider<{ account: string }> = {
  id: "mock",
  async listCalendars() { return [{ externalId: "work", name: "Work (mock)", isPrimary: true, canWrite: true }, { externalId: "personal", name: "Personal (mock)", isPrimary: false, canWrite: true }]; },
  async freeBusy(_s, ids, from, to) {
    const out = [];
    if (ids.includes("work")) for (let d = DateTime.fromJSDate(from).setZone("America/New_York").startOf("day"); d < DateTime.fromJSDate(to); d = d.plus({ days: 1 }))
      if (d.weekday <= 5) out.push({ start: d.set({ hour: 12 }).toUTC().toISO()!, end: d.set({ hour: 13 }).toUTC().toISO()! });
    for (const e of readMock().events) if (ids.includes(e.calendarId) && new Date(e.end) > from && new Date(e.start) < to) out.push({ start: e.start, end: e.end });
    return out;
  },
  async createEvent(_s, cal, e) {
    const s = readMock(); const id = `mock-${e.uid}`;
    s.events.push({ calendarId: cal, id, title: e.title, start: e.start.toISOString(), end: e.end.toISOString() }); write(s);
    return { externalEventId: id, meetingUrl: e.wantsMeet ? `https://meet.example.invalid/${e.uid}` : undefined };
  },
  async deleteEvent(_s, _cal, id) { const s = readMock(); s.events = s.events.filter(x => x.id !== id); write(s); },
};
