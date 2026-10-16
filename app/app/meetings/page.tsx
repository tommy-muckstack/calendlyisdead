import Link from "next/link";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { requireUser } from "@/auth";
import { BP } from "@/lib/basepath";
import { hostMeetingTypes, listHostMeetings, MeetingFilters, meetingQuery, meetingZone, parseMeetingFilters } from "@/lib/meetings";
import "./meetings.css";
export default async function Meetings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(); if (!user) redirect("/login");
  const raw = await searchParams;
  const params = new URLSearchParams(Object.entries(raw).flatMap(([key, value]) => value === undefined ? [] : [[key, Array.isArray(value) ? value[0] : value]]));
  const parsed = parseMeetingFilters(params), filters = parsed.success ? parsed.data : MeetingFilters.parse({});
  const [result, types] = await Promise.all([parsed.success ? listHostMeetings(user.id, user.timezone, filters) : Promise.resolve({ rows: [], total: 0 }), hostMeetingTypes(user.id)]);
  const zone = meetingZone(user.timezone), pages = Math.max(1, Math.ceil(result.total / 25));
  let previousDay = "";
  return <section className="meetings" aria-labelledby="meetings-title">
    <div className="meetings-heading"><h2 id="meetings-title">Your meetings</h2>{parsed.success && <a className="btn" href={`${BP}/api/meetings/export?${meetingQuery(filters)}`}>Export CSV</a>}</div>
    <form className="meetings-filters" action={`${BP}/app/meetings`} method="get">
      <label>Search<input className="input" type="search" name="q" defaultValue={filters.q} maxLength={200} placeholder="Name, email or event type" /></label>
      <label>Show<select className="input" name="status" defaultValue={filters.status}><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="cancelled">Cancelled</option><option value="all">All meetings</option></select></label>
      <label>Event type<select className="input" name="eventType" defaultValue={filters.eventType}><option value="">All event types</option>{types.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
      <label>From<input className="input" type="date" name="from" defaultValue={filters.from} /></label>
      <label>Through<input className="input" type="date" name="to" defaultValue={filters.to} /></label>
      <button className="btn primary" type="submit">Apply filters</button><Link href="/app/meetings">Clear filters</Link>
    </form>
    {!parsed.success && <p role="alert">Check your filters. Use valid dates, put the start before the end, and enter a positive page number.</p>}
    <p className="muted">{result.total} {result.total === 1 ? "meeting" : "meetings"} · Times shown in {zone}</p>
    {parsed.success && result.rows.length === 0 && <div className="meetings-empty"><h3>{result.total ? "No meetings on this page" : "No meetings found"}</h3><p>Choose another date range or clear your filters.</p><Link href="/app/meetings?status=all">View all meetings</Link></div>}
    <ul className="meetings-list">{result.rows.map(meeting => {
      const start = DateTime.fromJSDate(meeting.start).setZone(zone), end = DateTime.fromJSDate(meeting.end).setZone(zone), day = start.toISODate()!;
      const heading = previousDay !== day; previousDay = day;
      return <li key={meeting.uid}>{heading && <h3 className="meetings-day">{start.toFormat("cccc, LLLL d, yyyy")}</h3>}
        <Link className="meetings-row" href={`/app/meetings/${encodeURIComponent(meeting.uid)}`}>
          <span><time dateTime={meeting.start.toISOString()}>{start.toFormat("h:mm a")}</time> – <time dateTime={meeting.end.toISOString()}>{end.toFormat("h:mm a")}</time></span>
          <span><strong>{meeting.title}</strong><span className="muted">{meeting.inviteeName} · {meeting.inviteeEmail}</span></span>
          <span className="meetings-status">{meeting.status === "cancelled" ? "Cancelled" : "Scheduled"}</span>
        </Link></li>;
    })}</ul>
    {pages > 1 && <nav className="meetings-pagination" aria-label="Meetings pages">
      {filters.page > 1 && <Link className="btn" href={`/app/meetings?${meetingQuery(filters, Math.min(filters.page - 1, pages))}`}>Previous</Link>}
      <span>Page {filters.page} of {pages}</span>
      {filters.page < pages && <Link className="btn" href={`/app/meetings?${meetingQuery(filters, filters.page + 1)}`}>Next</Link>}
    </nav>}
  </section>;
}
