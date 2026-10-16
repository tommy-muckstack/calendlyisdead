import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DateTime } from "luxon";
import { z } from "zod";
import { requireUser } from "@/auth";
import { ContactEditorButton } from "@/components/ContactEditor";
import { CONTACT_LABELS, type ContactDraft } from "@/lib/contact-validation";
import { contactHistory, getContact } from "@/lib/contacts";
import { meetingZone } from "@/lib/meetings";
import { contactCustomValues } from "@/lib/contact-custom-fields";
import { ContactCustomValues } from "@/components/ContactCustomValues";

export default async function ContactDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser(); if (!user) redirect("/login");
  const { id } = await params, contact = await getContact(user.id, id); if (!contact) notFound();
  const custom = await contactCustomValues(user.id, id);
  const parsed = z.coerce.number().int().min(1).max(100000).safeParse((await searchParams).page ?? 1), page = parsed.success ? parsed.data : 1;
  const history = parsed.success ? await contactHistory(user.id, id, page) : { rows: [], total: 0 }, zone = meetingZone(user.timezone);
  const pages = Math.max(1, Math.ceil(history.total / 25));
  return <section className="contacts" aria-labelledby="contact-title">
    <Link href="/app/contacts">← Contacts</Link>
    <div className="contacts-heading"><div><h2 id="contact-title">{contact.name}</h2><p className="muted">{contact.email}</p></div><ContactEditorButton contact={contact} /></div>
    <dl className="contact-properties">{(Object.keys(CONTACT_LABELS) as (keyof ContactDraft)[]).filter(field => field !== "name" && field !== "email").map(field => <div key={field}>
      <dt>{CONTACT_LABELS[field]}</dt><dd>{field === "linkedIn" && contact.linkedIn ? <a href={contact.linkedIn} target="_blank" rel="noopener noreferrer">{contact.linkedIn}</a> : contact[field] || "Not set"}</dd>
    </div>)}</dl>
    <ContactCustomValues key={`${custom.version}:${custom.fields.map(field => `${field.id}-${field.version}`).join()}`} contactId={id} initial={custom} />
    <h3>Meeting history</h3><p className="muted">{history.total} {history.total === 1 ? "meeting" : "meetings"} · Times shown in {zone}</p>
    {!parsed.success && <p role="alert">Choose a valid meeting-history page.</p>}
    {parsed.success && history.rows.length === 0 && <p>{history.total ? "No meetings on this page." : "No meetings with this contact yet."}</p>}
    <ul className="contact-history">{history.rows.map(meeting => <li key={meeting.uid}><Link href={`/app/meetings/${encodeURIComponent(meeting.uid)}`}>
      <strong>{meeting.title}</strong><time dateTime={meeting.start.toISOString()}>{DateTime.fromJSDate(meeting.start).setZone(zone).toFormat("cccc, LLL d, yyyy · h:mm a")}</time>
      <span>{meeting.status === "cancelled" ? "Cancelled" : meeting.end < new Date() ? "Past" : "Upcoming"}</span><span className="muted">{meeting.inviteeEmail}</span>
    </Link></li>)}</ul>
    {pages > 1 && <nav className="contacts-pagination" aria-label="Meeting history pages">
      {page > 1 && <Link className="btn" href={`/app/contacts/${id}?page=${Math.min(pages, page - 1)}`}>Previous</Link>}<span>Page {page} of {pages}</span>
      {page < pages && <Link className="btn" href={`/app/contacts/${id}?page=${page + 1}`}>Next</Link>}
    </nav>}
  </section>;
}
