import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DateTime } from "luxon";
import { requireUser } from "@/auth";
import { getHostMeeting, meetingZone } from "@/lib/meetings";
import "../meetings.css";
export default async function Meeting({ params }: { params: Promise<{ uid: string }> }) {
  const user = await requireUser(); if (!user) redirect("/login");
  const { uid } = await params, meeting = await getHostMeeting(user.id, uid); if (!meeting) notFound();
  const zone = meetingZone(user.timezone), start = DateTime.fromJSDate(meeting.start).setZone(zone), end = DateTime.fromJSDate(meeting.end).setZone(zone);
  return <section className="meetings" aria-labelledby="meeting-title">
    <Link href="/app/meetings?status=all">← Your meetings</Link>
    <h2 id="meeting-title">{meeting.title}</h2>
    <p><time dateTime={meeting.start.toISOString()}>{start.toFormat("cccc, LLLL d, yyyy · h:mm a")}</time> – <time dateTime={meeting.end.toISOString()}>{end.toFormat("h:mm a")}</time> ({zone})</p>
    <p>{meeting.status === "cancelled" ? "Cancelled" : "Scheduled"}</p>
    <dl className="meeting-details">
      <dt>Invitee</dt><dd>{meeting.inviteeName}<br />{meeting.inviteeEmail}</dd>
      <dt>Invitee timezone</dt><dd>{meeting.inviteeTz}</dd>
      <dt>Location</dt><dd>{meeting.location || "Not specified"}{meeting.meetingUrl && /^https?:\/\//i.test(meeting.meetingUrl) && <><br /><a href={meeting.meetingUrl} target="_blank" rel="noreferrer">Join meeting</a></>}</dd>
      {meeting.guests.length > 0 && <><dt>Guests</dt><dd>{meeting.guests.join(", ")}</dd></>}
      {meeting.notes && <><dt>Invitee notes</dt><dd className="meeting-text">{meeting.notes}</dd></>}
      {Object.entries(meeting.answers).map(([key, answer]) => <div className="meeting-answer" key={key}><dt>{meeting.questions.find(q => q.id === key)?.label || key}</dt><dd className="meeting-text">{answer}</dd></div>)}
      {meeting.cancelReason && <><dt>Cancellation reason</dt><dd className="meeting-text">{meeting.cancelReason}</dd></>}
    </dl>
    {meeting.status !== "cancelled" && <div className="meetings-actions"><Link className="btn" href={`/booking/${encodeURIComponent(uid)}/reschedule`}>Reschedule</Link><Link className="btn danger" href={`/booking/${encodeURIComponent(uid)}/cancel`}>Cancel meeting</Link></div>}
  </section>;
}
