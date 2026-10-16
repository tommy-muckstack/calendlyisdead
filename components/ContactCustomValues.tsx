"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BP } from "@/lib/basepath";
import { ContactValuesData, displayFieldValue, normalizeFieldValue, type ContactValues, type FieldValueType } from "@/lib/contact-field-validation";
export function CustomValuesEditor({ contactId, initial, onClose, onSaved }: { contactId: string; initial: ContactValues; onClose(): void; onSaved(value: ContactValues): void }) {
  const [saved, setSaved] = useState(initial), [draft, setDraft] = useState(initial.values), [busy, setBusy] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState(false);
  const panel = useRef<HTMLDialogElement>(null), alert = useRef<HTMLParagraphElement>(null), inFlight = useRef(false), mounted = useRef(false), abort = useRef<AbortController | null>(null);
  const changed = saved.fields.filter(field => JSON.stringify(draft[field.id] ?? null) !== JSON.stringify(saved.values[field.id] ?? null)), dirty = changed.length > 0;
  useEffect(() => { mounted.current = true; const previous = document.activeElement, dialog = panel.current; dialog?.showModal(); dialog?.querySelector<HTMLElement>("input,textarea,select")?.focus(); return () => { mounted.current = false; abort.current?.abort(); dialog?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  useEffect(() => { if (error && !busy) alert.current?.focus(); }, [error, busy]);
  useEffect(() => { if (!dirty && !busy) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, busy]);
  function close() { if (!inFlight.current && (!dirty || confirm("Discard unsaved custom field values?"))) onClose(); }
  async function request(reload = false) {
    if (inFlight.current) return;
    const values: Record<string, FieldValueType> = {};
    if (!reload) { try { for (const field of changed) values[field.id] = normalizeFieldValue(field, draft[field.id] ?? null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Check your values."); return; } }
    if (reload && dirty && !confirm("Replace this draft with the saved custom field values?")) return;
    inFlight.current = true; setBusy(true); setError(""); const controller = new AbortController(); abort.current = controller; const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${BP}/api/contacts/${contactId}/custom-fields`, { method: reload ? "GET" : "PATCH", signal: controller.signal, headers: { "Content-Type": "application/json" },
        ...(reload ? {} : { body: JSON.stringify({ version: saved.version, values, fieldVersions: Object.fromEntries(changed.map(field => [field.id, field.version])) }) }) });
      if (response.status === 401) throw new Error("Sign in again before saving custom field values.");
      if (response.status === 409) { if (mounted.current) setConflict(true); throw new Error("These fields changed elsewhere. Reload the saved values before trying again."); }
      if (!response.ok) throw new Error("unconfirmed");
      const result = ContactValuesData.parse(await response.json()); if (result.contactId !== contactId || (!reload && (result.version < saved.version || Object.entries(values).some(([id, value]) => JSON.stringify(result.values[id] ?? null) !== JSON.stringify(value) || result.fields.find(field => field.id === id)?.version !== saved.fields.find(field => field.id === id)?.version)))) throw new Error("unconfirmed");
      if (!mounted.current) return;
      if (reload) { setSaved(result); setDraft(result.values); setConflict(false); } else onSaved(result);
    } catch (cause) { if (mounted.current) setError(cause instanceof Error && /^(Sign in|These fields)/.test(cause.message) ? cause.message : "The change could not be confirmed. Your values are still here. Try again."); }
    finally { clearTimeout(timeout); inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <dialog ref={panel} className="contact-dialog" aria-labelledby="custom-values-title" onCancel={event => { event.preventDefault(); close(); }}><form noValidate onSubmit={event => { event.preventDefault(); if (dirty) void request(); }}>
    <header><h2 id="custom-values-title">Edit custom field values</h2><button className="btn" type="button" disabled={busy} onClick={close}>Close</button></header>
    <fieldset disabled={busy} aria-label="Custom field values"><div className="contact-form-grid">{saved.fields.map(field => <div key={field.id}>
      {field.type === "multi_select" ? <fieldset className="contact-multi"><legend>{field.name}</legend>{field.options.map(option => <label key={option}><input type="checkbox" checked={Array.isArray(draft[field.id]) && (draft[field.id] as string[]).includes(option)} onChange={event => {
        const selected = Array.isArray(draft[field.id]) ? draft[field.id] as string[] : []; setDraft({ ...draft, [field.id]: event.target.checked ? [...selected, option] : selected.filter(value => value !== option) });
      }} />{option}</label>)}</fieldset> : <><label htmlFor={`value-${field.id}`}>{field.name}{field.type === "currency" ? ` (${field.currency})` : ""}</label>
        {field.type === "tag" ? <select id={`value-${field.id}`} className="input" value={typeof draft[field.id] === "string" ? draft[field.id] as string : ""} onChange={event => setDraft({ ...draft, [field.id]: event.target.value || null })}><option value="">Not set</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>
          : ["text", "invitee_question"].includes(field.type) ? <textarea id={`value-${field.id}`} className="input" rows={3} maxLength={2000} value={typeof draft[field.id] === "string" ? draft[field.id] as string : ""} onChange={event => setDraft({ ...draft, [field.id]: event.target.value })} />
          : <input id={`value-${field.id}`} className="input" type={field.type === "date" ? "date" : "text"} inputMode={["number", "currency"].includes(field.type) ? "decimal" : undefined} maxLength={2000}
            value={typeof draft[field.id] === "string" ? draft[field.id] as string : ""} onChange={event => setDraft({ ...draft, [field.id]: event.target.value })} />}
        {field.type === "invitee_question" && <p className="muted">Future booking answers can update this value.</p>}</>}
    </div>)}</div></fieldset>
    {error && <p className="contact-error" role="alert" ref={alert} tabIndex={-1}>{error}</p>}{conflict && <button className="btn" type="button" disabled={busy} onClick={() => void request(true)}>Reload saved values</button>}
    <footer><button className="btn" type="button" disabled={busy} onClick={close}>Cancel</button><button className="btn primary" disabled={busy || !dirty}>{busy ? "Please wait…" : "Save changes"}</button></footer>
  </form></dialog>;
}
export function ContactCustomValues({ contactId, initial }: { contactId: string; initial: ContactValues }) {
  const [open, setOpen] = useState(false), [value, setValue] = useState(initial), router = useRouter();
  if (!value.fields.length) return null;
  return <section aria-labelledby="contact-custom-title"><div className="contacts-heading"><h3 id="contact-custom-title">Custom fields</h3><button className="btn" onClick={() => setOpen(true)}>Edit custom field values</button></div>
    <dl className="contact-properties">{value.fields.map(field => <div key={field.id}><dt>{field.name}</dt><dd>{displayFieldValue(field, value.values[field.id])}</dd></div>)}</dl>
    {open && <CustomValuesEditor contactId={contactId} initial={value} onClose={() => setOpen(false)} onSaved={result => { setValue(result); setOpen(false); router.refresh(); }} />}</section>;
}
