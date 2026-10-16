"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BP } from "@/lib/basepath";
import { BOOKING_TIMEZONES } from "@/lib/booking-timezone";
import { CONTACT_LABELS, ContactData, ContactFields, EMPTY_CONTACT, type ContactDraft, type ContactRecord } from "@/lib/contact-validation";

const fields = Object.keys(CONTACT_LABELS) as (keyof ContactDraft)[];
function failureMessage(code: string, status: number) {
  if (status === 401) return "Sign in again before saving contacts.";
  if (code === "email_in_use") return "A contact with this email address already exists.";
  if (code === "changed") return "This contact changed elsewhere. Reload the saved contact before trying again.";
  if (code === "creation_conflict") return "This contact was already created. Open the saved contact to review it.";
  if (status === 404) return "This contact is no longer available. Return to Contacts and refresh the list.";
  return "Saving could not be confirmed. Your changes are still here. Try again.";
}

export function ContactEditor({ initial, onClose, onSaved, onDeleted }: {
  initial?: ContactRecord; onClose(): void; onSaved(contact: ContactRecord): void; onDeleted(): void;
}) {
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [baseline, setBaseline] = useState<ContactDraft>(() => initial ? ContactFields.parse(initial) : { ...EMPTY_CONTACT });
  const [draft, setDraft] = useState<ContactDraft>(() => ({ ...(initial ?? EMPTY_CONTACT) }));
  const [version, setVersion] = useState(initial?.version ?? 1), [zoneSearch, setZoneSearch] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState("");
  const dialog = useRef<HTMLDialogElement>(null), name = useRef<HTMLInputElement>(null), alert = useRef<HTMLParagraphElement>(null);
  const inFlight = useRef(false), abort = useRef<AbortController | null>(null), mounted = useRef(false);
  const dirty = fields.some(field => draft[field] !== baseline[field]);
  useEffect(() => {
    mounted.current = true; const previous = document.activeElement, panel = dialog.current;
    panel?.showModal(); name.current?.focus();
    return () => { mounted.current = false; abort.current?.abort(); panel?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { if (error && !busy) alert.current?.focus(); }, [error, busy]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  function close() { if (!inFlight.current && (!dirty || confirm("Discard unsaved contact changes?"))) onClose(); }
  async function request(action: "save" | "delete" | "reload") {
    if (inFlight.current) return;
    const parsed = ContactFields.safeParse(draft);
    if (action === "save" && !parsed.success) { const issue = parsed.error.issues[0]; setError(`${CONTACT_LABELS[String(issue.path[0]) as keyof ContactDraft] ?? "Contact"}: ${issue.message}`); return; }
    if (action === "delete" && !confirm(`Delete ${baseline.name}? Their meetings will be kept.`)) return;
    if (action === "reload" && dirty && !confirm("Replace this draft with the saved contact?")) return;
    inFlight.current = true; setBusy(true); setError(""); setConflict("");
    const controller = new AbortController(); abort.current = controller; const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const method = action === "reload" ? "GET" : action === "delete" ? "DELETE" : initial ? "PATCH" : "POST";
      const response = await fetch(`${BP}/api/contacts${method === "POST" ? "" : `/${id}`}`, {
        method, signal: controller.signal, headers: { "Content-Type": "application/json" },
        ...(method === "GET" ? {} : { body: JSON.stringify(action === "delete" ? { version } : { ...parsed.data, ...(initial ? { version } : { id }) }) }),
      });
      if (action === "delete" && response.status === 204) { if (mounted.current) onDeleted(); return; }
      const body = await response.json();
      if (!response.ok) { if (mounted.current) setConflict(body?.error ?? ""); throw new Error(failureMessage(body?.error, response.status)); }
      if (action === "delete") throw new Error("unconfirmed_delete");
      const saved = ContactData.parse(body);
      if (saved.id !== id || (action === "save" && fields.some(field => saved[field] !== parsed.data[field]))) throw new Error("unconfirmed");
      if (!mounted.current) return;
      if (action === "reload") { setBaseline(ContactFields.parse(saved)); setDraft(saved); setVersion(saved.version); }
      else onSaved(saved);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error && /^(Sign in|A contact|This contact)/.test(cause.message) ? cause.message
        : action === "delete" ? "Deletion could not be confirmed. Try again or refresh Contacts to check." : action === "reload" ? "The saved contact could not be loaded. Your draft is still here." : failureMessage("", 0));
    } finally { clearTimeout(timeout); inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const zones = [...new Set([draft.timezone, ...BOOKING_TIMEZONES.filter(zone => zone.replaceAll("_", " ").toLowerCase().includes(zoneSearch.trim().toLowerCase()))])].filter(Boolean);
  return <dialog ref={dialog} className="contact-dialog" aria-labelledby="contact-editor-title" onCancel={event => { event.preventDefault(); close(); }}>
    <form noValidate onSubmit={event => { event.preventDefault(); void request("save"); }}>
      <header><h2 id="contact-editor-title">{initial ? "Edit contact" : "Add contact"}</h2><button className="btn" type="button" disabled={busy} onClick={close} aria-label="Close contact editor">Close</button></header>
      <fieldset disabled={busy} aria-label="Contact details"><div className="contact-form-grid">
        {fields.map(field => <div key={field}>
          <label htmlFor={`contact-${field}`}>{CONTACT_LABELS[field]}{field === "name" || field === "email" ? " (required)" : ""}</label>
          {field === "timezone" ? <>
            <input className="input" type="search" aria-label="Search time zones" value={zoneSearch} onChange={event => setZoneSearch(event.target.value)} placeholder="Search time zones" />
            <select id="contact-timezone" className="input" value={draft.timezone} onChange={event => setDraft({ ...draft, timezone: event.target.value })}><option value="">Not set</option>{zones.map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select>
          </> : <input id={`contact-${field}`} ref={field === "name" ? name : undefined} className="input" required={field === "name" || field === "email"}
            type={field === "email" ? "email" : field === "phone" ? "tel" : field === "linkedIn" ? "url" : "text"}
            value={draft[field]} maxLength={field === "linkedIn" ? 500 : field === "email" ? 254 : field === "name" ? 200 : field === "phone" ? 60 : field === "country" ? 100 : 150}
            onChange={event => setDraft({ ...draft, [field]: event.target.value })} />}
        </div>)}
      </div></fieldset>
      {initial && <p className="muted">Existing meeting invitations keep the email address used when booked.</p>}
      {error && <p className="contact-error" role="alert" tabIndex={-1} ref={alert}>{error}</p>}
      {conflict === "changed" && <button className="btn" type="button" disabled={busy} onClick={() => void request("reload")}>Reload saved contact</button>}
      {conflict === "creation_conflict" && <Link href={`/app/contacts/${id}`} onClick={event => {
        if (inFlight.current || (dirty && !confirm("Discard this draft and open the saved contact?"))) event.preventDefault();
      }}>Open saved contact</Link>}
      <footer>{initial && <button type="button" className="btn contact-delete" disabled={busy} onClick={() => void request("delete")}>Delete contact</button>}
        <button type="button" className="btn" disabled={busy} onClick={close}>Cancel</button>
        <button className="btn primary" disabled={busy || (!!initial && !dirty)}>{busy ? "Please wait…" : initial ? "Save changes" : "Save contact"}</button>
      </footer>
    </form>
  </dialog>;
}

export function ContactEditorButton({ contact, label }: { contact?: ContactRecord; label?: string }) {
  const [open, setOpen] = useState(false); const router = useRouter();
  return <><button className={`btn${contact ? "" : " primary"}`} onClick={() => setOpen(true)}>{label ?? (contact ? "Edit contact" : "+ Add contact")}</button>
    {open && <ContactEditor initial={contact} onClose={() => setOpen(false)} onSaved={saved => { setOpen(false); router.push(`/app/contacts/${saved.id}`); router.refresh(); }}
      onDeleted={() => { setOpen(false); router.push("/app/contacts"); router.refresh(); }} />}</>;
}
