"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { BP } from "@/lib/basepath";
import { ExportResult } from "@/lib/contact-transfer-validation";
import type { ContactRecord } from "@/lib/contact-validation";
import { displayFieldValue, type ContactField, type FieldSource, type FieldValueType } from "@/lib/contact-field-validation";
import { ContactFieldControl } from "./ContactFieldEditor";
import type { ContactCollection, ContactSelectionScope } from "@/lib/contact-list-validation";
import { ContactListMembership } from "./ContactListMembership";
type Props = { rows: { contact: ContactRecord; nextMeeting: string | null; lastMeeting: string | null }[]; fields: ContactField[]; sources: FieldSource[]; values: Record<string, Record<string, FieldValueType>>; zone: string; allTotal: number; collections?: ContactCollection[]; current?: ContactCollection; scope?: ContactSelectionScope };
export function ContactsTable({ rows, fields, sources, values, zone, allTotal, collections = [], current, scope }: Props) {
  const [selected, setSelected] = useState<string[]>([]), [all, setAll] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [membership, setMembership] = useState<"add" | "remove" | null>(null), [listBusy, setListBusy] = useState(false), [message, setMessage] = useState("");
  const router = useRouter(), disabled = busy || listBusy || !!membership;
  const [result, setResult] = useState<ReturnType<typeof ExportResult.parse> | null>(null);
  const pending = useRef(false), requestId = useRef<string | null>(null), controller = useRef<AbortController | null>(null), active = useRef(false), alert = useRef<HTMLParagraphElement>(null), selectPage = useRef<HTMLInputElement>(null);
  const count = all ? allTotal : selected.length;
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (selectPage.current) selectPage.current.indeterminate = !all && selected.length > 0 && selected.length < rows.length; }, [all, selected, rows.length]);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  function change(ids: string[], every = false) { if (pending.current || listBusy || membership) return; setSelected(ids); setAll(every); requestId.current = null; setResult(null); setError(""); }
  async function download() {
    if (pending.current || !count) return; pending.current = true; setBusy(true); setError(""); requestId.current ??= crypto.randomUUID();
    const abort = new AbortController(); controller.current = abort; const timeout = setTimeout(() => abort.abort(), 30000);
    try {
      const response = await fetch(`${BP}/api/contacts/exports`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal, body: JSON.stringify({ id: requestId.current, ...(all ? { all: true, ...(scope ? { scope } : {}) } : { ids: selected }) }) });
      const body = await response.json(); if (!response.ok) { if (response.status === 410) requestId.current = null; throw new Error(typeof body.error === "string" ? body.error : "Export could not be confirmed. Try again."); }
      const saved = ExportResult.parse(body); if (saved.id !== requestId.current || (!all && saved.count !== selected.length)) throw new Error("Export could not be confirmed. Try again.");
      if (!active.current) return; setResult(saved);
      const link = document.createElement("a"); link.href = `${BP}/api/contacts/exports/${saved.id}`; link.download = "contacts.csv"; document.body.appendChild(link); link.click(); link.remove();
    } catch (cause) { if (active.current) setError(cause instanceof Error && cause.name === "Error" ? cause.message : "Export could not be confirmed. Your selection is still here. Try again."); }
    finally { clearTimeout(timeout); pending.current = false; if (active.current) setBusy(false); }
  }
  const date = (value: string | null) => value ? <time dateTime={value}>{DateTime.fromISO(value).setZone(zone).toFormat("LLL d, yyyy · h:mm a")}</time> : "—";
  return <><div className="contacts-table-wrap" role="region" aria-label="Contacts table" tabIndex={0}>
    <table className="contacts-table"><thead><tr><th scope="col"><input ref={selectPage} type="checkbox" aria-label="Select contacts on this page" disabled={disabled || !rows.length} checked={all || (!!rows.length && selected.length === rows.length)} onChange={event => change(event.target.checked ? rows.map(row => row.contact.id) : [])} /></th><th scope="col">Name</th><th scope="col">Phone</th><th scope="col">Company</th><th scope="col">Next meeting</th><th scope="col">Last meeting</th>{fields.map(field => <th key={field.id} scope="col">{field.name}<ContactFieldControl field={field} sources={sources} /></th>)}</tr></thead>
      <tbody>{rows.map(({ contact, nextMeeting, lastMeeting }) => <tr key={contact.id}><td><input type="checkbox" aria-label={`Select ${contact.name} (${contact.email})`} disabled={disabled} checked={all || selected.includes(contact.id)} onChange={event => change(event.target.checked ? [...selected, contact.id] : (all ? rows.map(row => row.contact.id) : selected).filter(id => id !== contact.id))} /></td>
        <th scope="row"><Link href={`/app/contacts/${contact.id}`}>{contact.name}</Link><span className="muted">{contact.email}</span></th><td>{contact.phone || "—"}</td><td>{contact.company || "—"}</td><td>{date(nextMeeting)}</td><td>{date(lastMeeting)}</td>{fields.map(field => <td key={field.id}>{displayFieldValue(field, values[contact.id]?.[field.id])}</td>)}
      </tr>)}</tbody></table></div>
    {message && <p role="status">{message}</p>}
    {count > 0 && <div className="contact-selection" role="region" aria-label="Selected contacts"><span>{count} selected{all ? scope ? " matching these filters across all pages" : " across all pages and filters" : ""}</span><button className="btn" disabled={disabled} onClick={() => change([], true)}>Select all {allTotal} contacts{scope ? " in this selection" : ""}</button><button className="btn" disabled={disabled} onClick={() => change([])}>Clear selection</button><button className="btn primary" disabled={disabled} onClick={() => void download()}>{busy ? "Exporting…" : "Export"}</button><button className="btn" disabled={disabled} onClick={() => setMembership("add")}>Add to list</button>{current?.kind === "list" && <button className="btn" disabled={disabled} onClick={() => setMembership("remove")}>Remove from list</button>}
      {error && <p role="alert" ref={alert} tabIndex={-1} className="contact-error">{error}</p>}
      {result && <p role="status">{result.count} contacts ready. <a href={`${BP}/api/contacts/exports/${result.id}`} download="contacts.csv">Download contacts</a> (expires in 24 hours). {result.email === "sent" ? "The download link was sent to your account email." : result.email === "pending" ? "Email delivery has not been confirmed. Use the download link here." : "Email delivery is unavailable. Use the download link here."}</p>}
    </div>}{membership && <ContactListMembership collections={collections} current={membership === "remove" ? current : undefined} selection={all ? { scope: scope ?? { q: "" } } : { ids: selected }} count={count} onBusy={setListBusy} onClose={() => setMembership(null)} onRefresh={() => { setMembership(null); setSelected([]); setAll(false); setResult(null); requestId.current = null; router.refresh(); }} onSaved={text => { setMembership(null); setMessage(text); setSelected([]); setAll(false); setResult(null); requestId.current = null; router.refresh(); }} />}</>;
}
