import type { Busy } from "../slots";
export type Tokens = { access_token: string; refresh_token?: string; expires_at?: number /* epoch s */ };
export type ExtCalendar = { externalId: string; name: string; isPrimary: boolean; canWrite: boolean };
export type NewEvent = { uid: string; title: string; description: string; location: string; start: Date; end: Date;
  organizer: { name: string; email: string }; attendees: { name: string; email: string }[]; wantsMeet?: boolean };
export type Created = { externalEventId: string; meetingUrl?: string };
export interface CalendarProvider<S = any> {
  id: "google" | "microsoft" | "caldav" | "mock";
  listCalendars(s: S): Promise<ExtCalendar[]>;
  freeBusy(s: S, calendarIds: string[], from: Date, to: Date): Promise<Busy[]>;
  createEvent(s: S, calendarId: string, e: NewEvent): Promise<Created>;
  deleteEvent(s: S, calendarId: string, externalEventId: string): Promise<void>;
}
export class ProviderError extends Error { constructor(public status: number, msg: string) { super(msg); } }
export async function j(r: Response) {
  if (!r.ok) throw new ProviderError(r.status, `${r.status} ${await r.text().catch(() => "")}`.slice(0, 500));
  return r.status === 204 ? null : r.json();
}
