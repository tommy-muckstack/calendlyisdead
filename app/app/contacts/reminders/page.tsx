import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { ReminderFilters } from "@/lib/contact-note-validation";
import { listContactReminders } from "@/lib/contact-notes";
import { meetingZone } from "@/lib/meetings";
import { emailConfigured } from "@/lib/email";
import { ContactNoteCard } from "@/components/ContactNote";
export default async function Reminders({ searchParams }: { searchParams: Promise<{ bucket?: string; page?: string }> }) {
  const user = await requireUser(); if (!user) redirect("/login");
  const parsed = ReminderFilters.safeParse(await searchParams), filters = parsed.success ? parsed.data : ReminderFilters.parse({}), zone = meetingZone(user.timezone);
  const result = await listContactReminders(user.id, zone, filters.bucket, filters.page), pages = Math.max(1, Math.ceil(result.total / 25)), emailAvailable = emailConfigured();
  const url = (page: number) => `/app/contacts/reminders?${new URLSearchParams({ bucket: filters.bucket, page: String(page) })}`;
  return <section className="contacts" aria-labelledby="reminders-title"><Link href="/app/contacts">← Contacts</Link><h2 id="reminders-title">Reminders</h2><p className="muted">Dates use your account time zone: {zone}.</p>
    {!emailAvailable && <p>Email reminders are unavailable here. You can manage and complete your reminders on this page.</p>}
    <nav className="contact-timeline-tabs" aria-label="Reminder filters">{([ ["due", "Due and overdue"], ["upcoming", "Upcoming"], ["all", "All reminders"] ] as const).map(([bucket, label]) => <Link key={bucket} href={`/app/contacts/reminders?bucket=${bucket}`} aria-current={filters.bucket === bucket ? "page" : undefined}>{label}</Link>)}</nav>
    {!parsed.success && <p role="alert">Choose a valid reminder filter or page.</p>}<p>{result.total} {result.total === 1 ? "reminder" : "reminders"}</p>
    {!result.rows.length && <p>{result.total ? "No reminders on this page." : filters.bucket === "upcoming" ? "No upcoming reminders." : filters.bucket === "all" ? "No reminders yet. Add one to a contact note." : "No reminders due. You're all caught up."}</p>}
    <ul className="contact-timeline">{result.rows.map(row => <li key={row.note.id}><Link href={`/app/contacts/${row.note.contactId}?tab=notes`}>{row.name}</Link><ContactNoteCard key={row.note.version} initial={row.note} timezone={zone} today={result.today} emailAvailable={emailAvailable} /></li>)}</ul>
    {pages > 1 && <nav className="contacts-pagination" aria-label="Reminder pages">{filters.page > 1 && <Link className="btn" href={url(Math.min(pages, filters.page - 1))}>Previous</Link>}<span>Page {filters.page} of {pages}</span>{filters.page < pages && <Link className="btn" href={url(filters.page + 1)}>Next</Link>}</nav>}
  </section>;
}
