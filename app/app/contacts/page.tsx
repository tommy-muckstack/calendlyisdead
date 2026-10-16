import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { BP } from "@/lib/basepath";
import { ContactAddMenu } from "@/components/ContactImport";
import { ContactsTable } from "@/components/ContactsTable";
import { ContactFilters } from "@/lib/contact-validation";
import { listContacts } from "@/lib/contacts";
import { meetingZone } from "@/lib/meetings";
import { ContactFieldControl } from "@/components/ContactFieldEditor";
import { contactFieldSources, listContactCustomValues, listContactFields } from "@/lib/contact-custom-fields";
import { getDb, schema } from "@/lib/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { listContactCollections, contactListFailure } from "@/lib/contact-lists";
import { ContactLists } from "@/components/ContactLists";
import { EMPTY_RULES } from "@/lib/contact-view-validation";

export default async function Contacts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(); if (!user) redirect("/login");
  const raw = await searchParams, parsed = ContactFilters.safeParse(Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])));
  const filters = parsed.success ? parsed.data : ContactFilters.parse({});
  const collections = await listContactCollections(user.id), current = collections.find(collection => collection.id === filters.collection);
  let error = parsed.success ? "" : "Check your search, filters, sort order and page number.";
  const result = parsed.success ? await listContacts(user.id, filters).catch(cause => { error = contactListFailure(cause).error; return { rows: [], total: 0 }; }) : { rows: [], total: 0 };
  const [fields, sources, values] = await Promise.all([listContactFields(user.id), contactFieldSources(user.id), listContactCustomValues(user.id, result.rows.map(row => row.contact.id))]);
  const db = await getDb(), [count] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.contacts).where(and(eq(schema.contacts.userId, user.id), isNull(schema.contacts.deletedAt)));
  const pages = Math.max(1, Math.ceil(result.total / 25)), zone = meetingZone(user.timezone);
  const rules = filters.rules ?? (current?.kind === "view" ? current.rules : EMPTY_RULES);
  const scope = current || filters.rules ? { collectionId: current?.id, collectionVersion: current?.version, q: filters.q, rules: filters.rules } : undefined;
  const url = (page: number) => `/app/contacts?${new URLSearchParams({ q: filters.q, sort: filters.sort, page: String(page), ...(filters.collection ? { collection: filters.collection } : {}), ...(filters.rules ? { rules: JSON.stringify(filters.rules) } : {}) })}`;
  return <section className="contacts" aria-labelledby="contacts-title">
    <div className="contacts-heading"><h2 id="contacts-title">{current?.name ?? "All contacts"}</h2><ContactAddMenu fields={fields} sources={sources} /></div>
    <Link href="/app/contact-settings">Contacts settings</Link>{" · "}<Link href="/app/contacts/reminders">Reminders</Link>{" · "}<Link href="/app/contacts/automations">Contact automations</Link>
    <ContactFieldControl sources={sources} />
    <ContactLists key={`${current?.id}:${current?.version}:${JSON.stringify(rules)}`} collections={collections} current={current} rules={rules} fields={fields} timezone={zone} q={filters.q} sort={filters.sort} />
    <form className="contacts-filters" action={`${BP}/app/contacts`} method="get">
      {filters.collection && <input type="hidden" name="collection" value={filters.collection} />}{filters.rules && <input type="hidden" name="rules" value={JSON.stringify(filters.rules)} />}
      <label>Search contacts<input className="input" name="q" type="search" maxLength={200} defaultValue={filters.q} placeholder="Name, email, phone or company" /></label>
      <label>Sort by<select className="input" name="sort" defaultValue={filters.sort}><option value="name">Name</option><option value="updated">Recently updated</option></select></label>
      <button className="btn primary">Search</button><Link href="/app/contacts">Clear filters</Link>
    </form>
    {error && <p role="alert">{error}</p>}
    <p className="muted">{result.total} {result.total === 1 ? "contact" : "contacts"} · Meeting times shown in {zone}</p>
    {!error && !result.rows.length && <div className="contacts-empty"><h3>{filters.q || current || rules.conditions.length || result.total ? "No contacts found" : "No contacts yet"}</h3>
      <p>{filters.q || current || rules.conditions.length || result.total ? "Change your filters, add contacts to this list or choose another page." : "Add a contact to keep their details and meeting history together."}</p></div>}
    {!error && (result.rows.length > 0 || fields.length > 0) && <ContactsTable key={`${filters.q}:${filters.page}:${filters.sort}:${current?.id}:${current?.version}:${JSON.stringify(rules)}:${result.rows.map(row => `${row.contact.id}:${row.contact.version}`).join(",")}`} rows={result.rows} fields={fields} sources={sources} values={values} zone={zone} allTotal={scope ? result.total : Number(count.total)} collections={collections} current={current} scope={scope} />}
    {pages > 1 && <nav className="contacts-pagination" aria-label="Contacts pages">
      {filters.page > 1 && <Link className="btn" href={url(Math.min(pages, filters.page - 1))}>Previous</Link>}<span>Page {filters.page} of {pages}</span>
      {filters.page < pages && <Link className="btn" href={url(filters.page + 1)}>Next</Link>}
    </nav>}
  </section>;
}
