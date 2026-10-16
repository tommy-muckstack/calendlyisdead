"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { BP } from "@/lib/basepath";
import { OpportunityContact } from "@/lib/opportunity-validation";
const Results = z.object({ rows: z.array(OpportunityContact), page: z.number().int().positive(), total: z.number().int().nonnegative() });
type Contact = z.infer<typeof OpportunityContact>;
export function OpportunityContactPicker({ selected, contactId, disabled, onChange, onCreate }: { selected: Contact | null; contactId: string | null; disabled: boolean; onChange(contact: Contact): void; onCreate(): void }) {
  const [query, setQuery] = useState(""), [search, setSearch] = useState({ q: "", page: 1, attempt: 0 }), [results, setResults] = useState<z.infer<typeof Results> | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true; const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000); setLoading(true); setError("");
    void fetch(`${BP}/api/opportunities/contact-options?${new URLSearchParams({ q: search.q, page: String(search.page) })}`, { signal: controller.signal }).then(async response => { if (!response.ok) throw new Error(); const value = Results.parse(await response.json()); if (value.page !== search.page) throw new Error(); if (active) setResults(value); }).catch(() => { if (active) setError("Contacts could not load. Try again."); }).finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [search]);
  return <fieldset className="opportunity-contact-picker" disabled={disabled}><legend>Contact (required)</legend>
    <p>{selected ? `Selected: ${selected.name} · ${selected.email}` : contactId ? "Selected contact is no longer available. You can keep this link or choose a replacement." : "Choose the person this opportunity is for."}</p>
    <label htmlFor="opportunity-contact-search">Search contacts</label><div className="contact-list-actions"><input id="opportunity-contact-search" className="input" type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); setSearch({ q: query, page: 1, attempt: search.attempt + 1 }); } }} /><button className="btn" type="button" onClick={() => setSearch({ q: query, page: 1, attempt: search.attempt + 1 })}>Search contacts</button></div>
    {loading ? <p role="status">Loading contacts…</p> : error ? <div><p role="alert">{error}</p><button className="btn" type="button" onClick={() => setSearch({ ...search, attempt: search.attempt + 1 })}>Retry contacts</button></div> : results && <>
      <div className="opportunity-contact-options">{results.rows.map(contact => <label key={contact.id}><input type="radio" name="opportunity-contact" checked={contact.id === contactId} onChange={() => onChange(contact)} /><span>{contact.name}<small>{contact.email}</small></span></label>)}</div>
      {!results.rows.length && <p>No matching contacts.</p>}<div className="contact-list-actions"><button className="btn" type="button" disabled={search.page <= 1} onClick={() => setSearch({ ...search, page: search.page - 1 })}>Previous contacts</button><span>Page {search.page} of {Math.max(1, Math.ceil(results.total / 25))}</span><button className="btn" type="button" disabled={search.page * 25 >= results.total} onClick={() => setSearch({ ...search, page: search.page + 1 })}>Next contacts</button></div>
    </>}
    <button className="btn" type="button" onClick={onCreate}>+ Add contact</button><p className="muted">New contacts are saved immediately, even if you cancel this opportunity.</p>
  </fieldset>;
}
