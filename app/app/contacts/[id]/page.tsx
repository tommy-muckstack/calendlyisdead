import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DateTime } from "luxon";
import { requireUser } from "@/auth";
import { ContactEditorButton } from "@/components/ContactEditor";
import { CONTACT_LABELS, type ContactDraft } from "@/lib/contact-validation";
import { getContact } from "@/lib/contacts";
import { meetingZone } from "@/lib/meetings";
import { contactCustomValues } from "@/lib/contact-custom-fields";
import { ContactCustomValues } from "@/components/ContactCustomValues";
import { ContactNoteCard, ContactNoteComposer } from "@/components/ContactNote";
import { ContactNoteError, contactTimeline, getContactNote } from "@/lib/contact-notes";
import { TimelineFilters } from "@/lib/contact-note-validation";
import { emailConfigured } from "@/lib/email";

export default async function ContactDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; tab?: string; note?: string }> }) {
  const user = await requireUser(); if (!user) redirect("/login");
  const { id } = await params, contact = await getContact(user.id, id); if (!contact) notFound();
  const custom = await contactCustomValues(user.id, id);
  const parsed = TimelineFilters.safeParse(await searchParams), filters = parsed.success ? parsed.data : TimelineFilters.parse({}), { page, tab } = filters;
  const history = parsed.success ? await contactTimeline(user.id, id, tab, page) : { rows: [], total: 0 }, zone = meetingZone(user.timezone), today = DateTime.now().setZone(zone).toISODate()!, emailAvailable = emailConfigured();
  const selected = filters.note ? await getContactNote(user.id, id, filters.note).catch(error => { if (error instanceof ContactNoteError && error.status === 404) return null; throw error; }) : null;
  const pages = Math.max(1, Math.ceil(history.total / 25)), url = (page: number) => `/app/contacts/${id}?${new URLSearchParams({ tab, page: String(page) })}`;
  return <section className="contacts" aria-labelledby="contact-title">
    <Link href="/app/contacts">← Contacts</Link>
    <div className="contacts-heading"><div><h2 id="contact-title">{contact.name}</h2><p className="muted">{contact.email}</p></div><ContactEditorButton contact={contact} /></div>
    <dl className="contact-properties">{(Object.keys(CONTACT_LABELS) as (keyof ContactDraft)[]).filter(field => field !== "name" && field !== "email").map(field => <div key={field}>
      <dt>{CONTACT_LABELS[field]}</dt><dd>{field === "linkedIn" && contact.linkedIn ? <a href={contact.linkedIn} target="_blank" rel="noopener noreferrer">{contact.linkedIn}</a> : contact[field] || "Not set"}</dd>
    </div>)}</dl>
    <ContactCustomValues key={`${custom.version}:${custom.fields.map(field => `${field.id}-${field.version}`).join()}`} contactId={id} initial={custom} />
    <div className="contacts-heading"><h3>Timeline</h3><ContactNoteComposer contactId={id} emailAvailable={emailAvailable} /><Link href="/app/contacts/reminders">Reminders</Link></div>
    <nav className="contact-timeline-tabs" aria-label="Contact timeline"><Link aria-current={tab === "all" ? "page" : undefined} href={`/app/contacts/${id}?tab=all`}>All</Link><Link aria-current={tab === "notes" ? "page" : undefined} href={`/app/contacts/${id}?tab=notes`}>Notes</Link><Link aria-current={tab === "meetings" ? "page" : undefined} href={`/app/contacts/${id}?tab=meetings`}>Meetings</Link></nav>
    <p className="muted">{history.total} {history.total === 1 ? "entry" : "entries"} · Times shown in {zone}</p>
    {!parsed.success && <p role="alert">Choose a valid timeline tab, note or page.</p>}{filters.note && !selected && <p role="alert">This note is no longer available.</p>}
    {selected && <ContactNoteCard key={selected.id} initial={selected} timezone={zone} today={today} emailAvailable={emailAvailable} initialOpen />}
    {parsed.success && !history.rows.length && <p>{history.total ? "No entries on this page." : tab === "notes" ? "No notes yet. Add a note to remember important details." : tab === "meetings" ? "No meetings with this contact yet." : "No timeline entries yet."}</p>}
    <ul className="contact-timeline">{history.rows.map(item => item.kind === "note" ? (item.note.id === selected?.id ? null : <li key={item.note.id}><ContactNoteCard key={item.note.version} initial={item.note} timezone={zone} today={today} emailAvailable={emailAvailable} /></li>) : <li key={item.meeting.uid}><Link className="contact-timeline-meeting" href={`/app/meetings/${encodeURIComponent(item.meeting.uid)}`}>
      <strong>{item.meeting.title}</strong><time dateTime={item.meeting.start}>{DateTime.fromISO(item.meeting.start).setZone(zone).toFormat("cccc, LLL d, yyyy · h:mm a")}</time>
      <span>{item.meeting.status === "cancelled" ? "Cancelled" : new Date(item.meeting.end) < new Date() ? "Past" : "Upcoming"}</span><span className="muted">{item.meeting.inviteeEmail}</span>
    </Link></li>)}</ul>
    {pages > 1 && <nav className="contacts-pagination" aria-label="Timeline pages">
      {page > 1 && <Link className="btn" href={url(Math.min(pages, page - 1))}>Previous</Link>}<span>Page {page} of {pages}</span>
      {page < pages && <Link className="btn" href={url(page + 1)}>Next</Link>}
    </nav>}
  </section>;
}
