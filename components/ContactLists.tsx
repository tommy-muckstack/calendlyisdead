"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ContactCollection } from "@/lib/contact-list-validation";
import type { ContactField } from "@/lib/contact-field-validation";
import { EMPTY_RULES, type ContactRuleSet } from "@/lib/contact-view-validation";
import { ContactCollectionEditor } from "./ContactCollectionEditor";
import { ContactViewFilters } from "./ContactViewFilters";
export function ContactLists({ collections, current, rules, fields, timezone, q, sort }: { collections: ContactCollection[]; current?: ContactCollection; rules: ContactRuleSet; fields: ContactField[]; timezone: string; q: string; sort: string }) {
  const router = useRouter(), [filters, setFilters] = useState(false), [edit, setEdit] = useState<{ kind: "list" | "view"; initial?: ContactCollection; rules?: ContactRuleSet } | null>(null);
  const changed = current?.kind === "view" && JSON.stringify(rules) !== JSON.stringify(current.rules);
  function openCollection(value: ContactCollection) { setEdit(null); router.push(`/app/contacts?collection=${value.id}`); router.refresh(); }
  return <div className="contact-lists">
    <nav className="contact-collection-tabs" aria-label="Contact lists and views"><Link className="btn" href="/app/contacts" aria-current={!current ? "page" : undefined}>All contacts</Link>{collections.map(collection => <Link key={collection.id} className="btn" href={`/app/contacts?collection=${collection.id}`} aria-current={current?.id === collection.id ? "page" : undefined}>{collection.name}<span className="muted"> · {collection.kind === "list" ? "List" : "View"}</span></Link>)}</nav>
    <div className="contact-list-actions"><button className="btn" onClick={() => setFilters(true)}>Filter{rules.conditions.length ? ` (${rules.conditions.length})` : ""}</button>
      {rules.conditions.length > 0 && current?.kind !== "list" && <button className="btn" onClick={() => setEdit({ kind: "view", rules })}>Save as view</button>}
      {changed && <button className="btn primary" onClick={() => setEdit({ kind: "view", initial: current, rules })}>Save view</button>}
      <button className="btn" onClick={() => setEdit({ kind: "view", rules: EMPTY_RULES })}>+ Create new view</button>
      <button className="btn" onClick={() => setEdit({ kind: "list" })}>+ Create new list</button>
      {collections.length > 0 && <details className="contact-columns"><summary className="btn">Manage lists and views</summary>{collections.map(collection => <button className="btn" key={collection.id} onClick={() => setEdit({ kind: collection.kind, initial: collection })}>Edit {collection.name}</button>)}</details>}
    </div>
    {changed && <p role="status">These filters have not been saved to the view.</p>}
    {filters && <ContactViewFilters initial={rules} fields={fields} timezone={timezone} onClose={() => setFilters(false)} onApply={applied => { const params = new URLSearchParams({ q, sort, rules: JSON.stringify(applied) }); if (current) params.set("collection", current.id); setFilters(false); router.push(`/app/contacts?${params}`); }} />}
    {edit && <ContactCollectionEditor {...edit} onClose={() => setEdit(null)} onSaved={openCollection} onDeleted={() => { setEdit(null); router.push("/app/contacts"); router.refresh(); }} />}
  </div>;
}
