"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BP } from "@/lib/basepath";
import { ContactFieldData, ContactFieldDraft, CURRENCIES, EMPTY_FIELD, FIELD_TYPES, type ContactField, type FieldDraft, type FieldSource } from "@/lib/contact-field-validation";
const messages: Record<string, string> = { name_in_use: "A custom field with this name already exists.", field_limit: "You can have up to 10 custom fields. Delete a field before creating another.", changed: "This field changed elsewhere. Reload the saved field before trying again.", incompatible_values: "Existing values do not fit these changes. Keep the current type and options or update those values first.", invalid_source: "That event question is no longer available. Choose another question.", not_found: "This field is no longer available.", creation_conflict: "This field was already created. Close this editor and refresh Contacts to review it." };

export function ContactFieldEditor({ initial, sources, onClose, onSaved }: { initial?: ContactField; sources: FieldSource[]; onClose(): void; onSaved(): void }) {
  const [id] = useState(() => initial?.id ?? crypto.randomUUID()), [baseline, setBaseline] = useState<FieldDraft>(() => initial ? ContactFieldDraft.parse(initial) : { ...EMPTY_FIELD });
  const [draft, setDraft] = useState<FieldDraft>(() => initial ? ContactFieldDraft.parse(initial) : { ...EMPTY_FIELD }), [optionsText, setOptionsText] = useState(initial?.options.join("\n") ?? ""), [version, setVersion] = useState(initial?.version ?? 1);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), name = useRef<HTMLInputElement>(null), alert = useRef<HTMLParagraphElement>(null), inFlight = useRef(false), mounted = useRef(false), abort = useRef<AbortController | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline) || optionsText !== baseline.options.join("\n");
  useEffect(() => { mounted.current = true; const previous = document.activeElement, panel = dialog.current; panel?.showModal(); name.current?.focus(); return () => { mounted.current = false; abort.current?.abort(); panel?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  useEffect(() => { if (error && !busy) alert.current?.focus(); }, [error, busy]);
  useEffect(() => { if (!dirty && !busy) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, busy]);
  function close() { if (!inFlight.current && (!dirty || confirm("Discard unsaved custom field changes?"))) onClose(); }
  async function request(action: "save" | "reload" | "delete") {
    if (inFlight.current) return;
    const parsed = ContactFieldDraft.safeParse({ ...draft, options: ["tag", "multi_select"].includes(draft.type) ? optionsText.split("\n").map(value => value.trim()).filter(Boolean) : [] });
    if (action === "save" && !parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (action === "reload" && dirty && !confirm("Replace this draft with the saved custom field?")) return;
    if (action === "delete" && !confirm(`Delete ${baseline.name}? Its saved values will be removed from all your contacts.`)) return;
    inFlight.current = true; setBusy(true); setError("");
    const controller = new AbortController(); abort.current = controller; const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const method = action === "reload" ? "GET" : action === "delete" ? "DELETE" : initial ? "PATCH" : "POST";
      const response = await fetch(`${BP}/api/contact-fields${method === "POST" ? "" : `/${id}`}`, { method, signal: controller.signal, headers: { "Content-Type": "application/json" },
        ...(method === "GET" ? {} : { body: JSON.stringify(action === "delete" ? { version } : { ...parsed.data, ...(initial ? { version } : { id }) }) }) });
      if (action === "delete" && response.status === 204) { if (mounted.current) onSaved(); return; }
      const body = await response.json();
      if (!response.ok) { if (mounted.current) setConflict(body.error === "changed"); throw new Error(response.status === 401 ? "Sign in again before saving custom fields." : messages[body.error] ?? "unconfirmed"); }
      if (action === "delete") throw new Error("unconfirmed");
      const saved = ContactFieldData.parse(body); if (saved.id !== id || (action === "save" && JSON.stringify(ContactFieldDraft.parse(saved)) !== JSON.stringify(parsed.data))) throw new Error("unconfirmed");
      if (!mounted.current) return;
      if (action === "reload") { const data = ContactFieldDraft.parse(saved); setBaseline(data); setDraft(data); setOptionsText(data.options.join("\n")); setVersion(saved.version); setConflict(false); } else onSaved();
    } catch (cause) { if (mounted.current) setError(cause instanceof Error && (Object.values(messages).includes(cause.message) || cause.message.startsWith("Sign in")) ? cause.message : "The change could not be confirmed. Your draft is still here. Try again."); }
    finally { clearTimeout(timeout); inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const source = sources.find(source => source.id === draft.eventTypeId);
  return <dialog ref={dialog} className="contact-dialog" aria-labelledby="custom-field-title" onCancel={event => { event.preventDefault(); close(); }}><form noValidate onSubmit={event => { event.preventDefault(); void request("save"); }}>
    <header><h2 id="custom-field-title">{initial ? "Edit custom field" : "Create a custom field"}</h2><button className="btn" type="button" disabled={busy} onClick={close} aria-label="Close custom field editor">Close</button></header>
    <fieldset disabled={busy} aria-label="Custom field details"><div className="contact-form-grid">
      <div><label htmlFor="custom-field-name">Field name</label><input ref={name} id="custom-field-name" className="input" value={draft.name} maxLength={100} onChange={event => setDraft({ ...draft, name: event.target.value })} /></div>
      <div><label htmlFor="custom-field-type">Field type</label><select id="custom-field-type" className="input" value={draft.type} onChange={event => { const type = event.target.value as FieldDraft["type"]; setDraft({ ...draft, type, options: [], currency: type === "currency" ? "USD" : "", eventTypeId: null, questionId: null }); setOptionsText(""); }}>
        {Object.entries(FIELD_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></div>
      {["tag", "multi_select"].includes(draft.type) && <div><label htmlFor="custom-field-options">Options (one per line)</label><textarea id="custom-field-options" className="input" rows={5} value={optionsText} maxLength={10100} onChange={event => setOptionsText(event.target.value)} /></div>}
      {draft.type === "currency" && <div><label htmlFor="custom-field-currency">Currency</label><select id="custom-field-currency" className="input" value={draft.currency} onChange={event => setDraft({ ...draft, currency: event.target.value })}>{CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></div>}
      {draft.type === "invitee_question" && <><div><label htmlFor="custom-field-event">Event type</label><select id="custom-field-event" className="input" value={draft.eventTypeId ?? ""} onChange={event => setDraft({ ...draft, eventTypeId: event.target.value || null, questionId: null })}>
        <option value="">Choose an event type</option>{draft.eventTypeId && !source && <option value={draft.eventTypeId} disabled>Unavailable event type</option>}{sources.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}</select></div>
        <div><label htmlFor="custom-field-question">Invitee question</label><select id="custom-field-question" className="input" value={draft.questionId ?? ""} onChange={event => setDraft({ ...draft, questionId: event.target.value || null })}>
          <option value="">Choose a question</option>{draft.questionId && !source?.questions.some(question => question.id === draft.questionId) && <option disabled value={draft.questionId}>Unavailable question</option>}{source?.questions.map(question => <option key={question.id} value={question.id}>{question.label}</option>)}</select></div></>}
    </div></fieldset>
    {draft.type === "invitee_question" && <p className="muted">This field uses the latest available answer to the linked question. Changing the source updates matching contacts.</p>}
    {error && <p className="contact-error" role="alert" ref={alert} tabIndex={-1}>{error}</p>}{conflict && <button className="btn" type="button" disabled={busy} onClick={() => void request("reload")}>Reload saved field</button>}
    <footer>{initial && <button className="btn contact-delete" type="button" disabled={busy} onClick={() => void request("delete")}>Delete field</button>}<button className="btn" type="button" disabled={busy} onClick={close}>Cancel</button><button className="btn primary" disabled={busy || (!!initial && !dirty)}>{busy ? "Please wait…" : initial ? "Save changes" : "Create"}</button></footer>
  </form></dialog>;
}
export function ContactFieldControl({ field, sources }: { field?: ContactField; sources: FieldSource[] }) {
  const [open, setOpen] = useState(false), router = useRouter();
  return <><details className="contact-columns"><summary className="btn" aria-label={field ? `Manage ${field.name} column` : undefined}>{field ? "⋯" : "Columns"}</summary>
    <button className="btn" type="button" onClick={() => setOpen(true)}>{field ? "Edit custom field" : "+ Create a custom field"}</button></details>
    {open && <ContactFieldEditor initial={field} sources={sources} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); router.refresh(); }} />}</>;
}
