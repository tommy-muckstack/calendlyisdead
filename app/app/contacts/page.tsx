import Link from "next/link";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { requireUser } from "@/auth";
import { BP } from "@/lib/basepath";
import { ContactEditorButton } from "@/components/ContactEditor";
import { ContactFilters } from "@/lib/contact-validation";
import { listContacts } from "@/lib/contacts";
import { meetingZone } from "@/lib/meetings";

export default async function Contacts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(); if (!user) redirect("/login");
  const raw = await searchParams, parsed = ContactFilters.safeParse(Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])));
  const filters = parsed.success ? parsed.data : ContactFilters.parse({});
  const result = parsed.success ? await listContacts(user.id, filters) : { rows: [], total: 0 };
  const pages = Math.max(1, Math.ceil(result.total / 25)), zone = meetingZone(user.timezone);
  const url = (page: number) => `/app/contacts?${new URLSearchParams({ q: filters.q, sort: filters.sort, page: String(page) })}`;
  const date = (value: string | null) => value ? <time dateTime={value}>{DateTime.fromISO(value).setZone(zone).toFormat("LLL d, yyyy · h:mm a")}</time> : "—";
  return <section className="contacts" aria-labelledby="contacts-title">
    <div className="contacts-heading"><h2 id="contacts-title">All contacts</h2><ContactEditorButton /></div>
    <form className="contacts-filters" action={`${BP}/app/contacts`} method="get">
      <label>Search contacts<input className="input" name="q" type="search" maxLength={200} defaultValue={filters.q} placeholder="Name, email, phone or company" /></label>
      <label>Sort by<select className="input" name="sort" defaultValue={filters.sort}><option value="name">Name</option><option value="updated">Recently updated</option></select></label>
      <button className="btn primary">Search</button><Link href="/app/contacts">Clear filters</Link>
    </form>
    {!parsed.success && <p role="alert">Check your search, sort order and page number.</p>}
    <p className="muted">{result.total} {result.total === 1 ? "contact" : "contacts"} · Meeting times shown in {zone}</p>
    {parsed.success && !result.rows.length && <div className="contacts-empty"><h3>{filters.q || result.total ? "No contacts found" : "No contacts yet"}</h3>
      <p>{filters.q || result.total ? "Clear your filters or choose another page." : "Add a contact to keep their details and meeting history together."}</p></div>}
    {result.rows.length > 0 && <div className="contacts-table-wrap" role="region" aria-label="Contacts table" tabIndex={0}>
      <table className="contacts-table"><thead><tr><th scope="col">Name</th><th scope="col">Phone</th><th scope="col">Company</th><th scope="col">Next meeting</th><th scope="col">Last meeting</th></tr></thead>
        <tbody>{result.rows.map(({ contact, nextMeeting, lastMeeting }) => <tr key={contact.id}>
          <th scope="row"><Link href={`/app/contacts/${contact.id}`}>{contact.name}</Link><span className="muted">{contact.email}</span></th>
          <td>{contact.phone || "—"}</td><td>{contact.company || "—"}</td><td>{date(nextMeeting)}</td><td>{date(lastMeeting)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {pages > 1 && <nav className="contacts-pagination" aria-label="Contacts pages">
      {filters.page > 1 && <Link className="btn" href={url(Math.min(pages, filters.page - 1))}>Previous</Link>}<span>Page {filters.page} of {pages}</span>
      {filters.page < pages && <Link className="btn" href={url(filters.page + 1)}>Next</Link>}
    </nav>}
  </section>;
}
