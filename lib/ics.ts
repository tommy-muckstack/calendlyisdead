import ical, { ICalCalendarMethod, ICalEventStatus } from "ical-generator";
export function buildIcs(o: { uid: string; start: Date; end: Date; title: string; description: string; location: string; organizer: { name: string; email: string }; attendee: { name: string; email: string }; cancelled?: boolean; sequence?: number; noMethod?: boolean }) {
  const cal = ical({ prodId: { company: "CalendlyIsDead", product: "scheduler" }, ...(o.noMethod ? {} : { method: o.cancelled ? ICalCalendarMethod.CANCEL : ICalCalendarMethod.REQUEST }) });
  cal.createEvent({ id: o.uid, start: o.start, end: o.end, summary: o.title, description: o.description, location: o.location,
    organizer: o.organizer, attendees: [{ ...o.attendee, rsvp: true }], sequence: o.sequence ?? 0,
    status: o.cancelled ? ICalEventStatus.CANCELLED : ICalEventStatus.CONFIRMED });
  return cal.toString();
}
