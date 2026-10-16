"use client";
import { useEffect, useRef, useState } from "react";
import { BP } from "@/lib/basepath";
import { AUTOMATION_FIELD_TYPES, FieldAutomationState, SaveFieldAutomation, fieldActionProblem, normalizeFieldAction, sameFieldActions, type ContactFieldAction, type FieldAutomationChange, type FieldAutomationData } from "@/lib/contact-field-automation-validation";
import { FIELD_TYPES, type ContactField } from "@/lib/contact-field-validation";
import { ContactFieldEditor } from "./ContactFieldEditor";
import { AutomationResponseError, useAutomationOperation } from "./useContactAutomationOperation";
import "@/app/app/contacts/contacts.css";
async function request(eventId: string, method: string, body: unknown, signal: AbortSignal) {
  const response = await fetch(`${BP}/api/event-types/${encodeURIComponent(eventId)}/contact-automations/fields`, { method, signal, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (method === "DELETE" && response.status === 204) return null;
  const value = await response.json(); if (!response.ok) throw new AutomationResponseError(typeof value.error === "string" ? value.error : "The change could not be confirmed. Try again.", response.status);
  if (method === "DELETE") throw new Error("Unconfirmed deletion");
  const state = FieldAutomationState.parse(value); if (state.automation.eventTypeId !== eventId) throw new Error("Unconfirmed event"); return state;
}
type Row = ContactFieldAction & { key: string };
const rowsFor = (actions: ContactFieldAction[]): Row[] => actions.map(action => ({ ...action, key: crypto.randomUUID() }));
const actionFor = ({ fieldId, type, value }: Row): ContactFieldAction => ({ fieldId, type, value });
export function ContactFieldAutomationEditor({ initial, onClose, onSaved }: { initial: FieldAutomationData; onClose(): void; onSaved(state: FieldAutomationData, close: boolean): void }) {
  const [baseline, setBaseline] = useState(initial.automation), [fields, setFields] = useState(initial.fields), [rows, setRows] = useState(() => rowsFor(initial.automation.actions)), [creating, setCreating] = useState(false), [message, setMessage] = useState("");
  const operation = useAutomationOperation(), dialog = useRef<HTMLDialogElement>(null), alert = useRef<HTMLParagraphElement>(null), heading = useRef<HTMLHeadingElement>(null), add = useRef<HTMLButtonElement>(null), focusAdd = useRef(false);
  const draft = rows.map(actionFor), dirty = !sameFieldActions(draft, baseline.actions), broken = baseline.actions.some(action => fieldActionProblem(action, fields));
  useEffect(() => { const previous = document.activeElement, panel = dialog.current; panel?.showModal(); heading.current?.focus(); return () => { panel?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  useEffect(() => { if (operation.error && !operation.busy) alert.current?.focus(); }, [operation.error, operation.busy]);
  useEffect(() => { if (focusAdd.current) { focusAdd.current = false; add.current?.focus(); } }, [rows.length]);
  useEffect(() => { if (!dirty && !operation.busy) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, operation.busy]);
  function close() { if (!operation.pending.current && (!dirty || confirm("Discard unsaved automation changes?"))) onClose(); }
  function update(key: string, value: Partial<ContactFieldAction>) { setRows(current => current.map(row => row.key === key ? { ...row, ...value } : row)); }
  function choose(key: string, id: string) { const field = fields.find(field => field.id === id), type = field?.type as ContactFieldAction["type"] ?? "text"; update(key, { fieldId: id, type, value: type === "tag" ? [] : "" }); }
  function accept(state: FieldAutomationData) { setBaseline(state.automation); setFields(state.fields); setRows(rowsFor(state.automation.actions)); }
  async function save(enabled = baseline.enabled, closeAfter = true) {
    if (operation.pending.current) return; const toggle = baseline.configured && !dirty && !closeAfter; let payload: FieldAutomationChange;
    try {
      payload = toggle ? { action: "toggle", enabled, version: baseline.version } : SaveFieldAutomation.parse({ action: "save", enabled, version: baseline.version, actions: draft.map(action => normalizeFieldAction(action, fields)), fieldVersions: Object.fromEntries(draft.map(action => [action.fieldId, fields.find(field => field.id === action.fieldId)?.version])) });
    } catch (cause) { operation.setError(cause instanceof Error && "issues" in cause ? "Choose at least one field, with a value, and use each field only once." : cause instanceof Error ? cause.message : "Review your fields."); return; }
    const result = await operation.run(async signal => { const state = await request(baseline.eventTypeId, "PATCH", payload, signal); if (!state?.automation.configured || state.automation.enabled !== enabled || (payload.action === "save" && !sameFieldActions(state.automation.actions, payload.actions))) throw new Error("Unconfirmed settings"); return state; });
    if (result) { accept(result.value); setMessage(enabled ? "Automation enabled for future bookings." : "Automation paused. Existing contact values are kept."); onSaved(result.value, closeAfter); }
  }
  async function reload() {
    if (dirty && !confirm("Replace this draft with the saved automation?")) return;
    const result = await operation.run(signal => request(baseline.eventTypeId, "GET", undefined, signal)); if (result?.value) { accept(result.value); setMessage("Saved automation and field definitions reloaded."); onSaved(result.value, false); }
  }
  async function remove() {
    if (!confirm("Delete this automation? Values already applied to contacts will be kept.")) return;
    const result = await operation.run(async signal => { await request(baseline.eventTypeId, "DELETE", { version: baseline.version }, signal); const state = await request(baseline.eventTypeId, "GET", undefined, signal); if (!state || state.automation.configured) throw new Error("Unconfirmed deletion"); return state; });
    if (result) onSaved(result.value, true);
  }
  function created(field?: ContactField) {
    if (!field) return; setFields(current => [...current, field]); setRows(current => { const value = { fieldId: field.id, type: field.type as ContactFieldAction["type"], value: field.type === "tag" ? [] : "" }, empty = current.find(row => !row.fieldId); return empty ? current.map(row => row.key === empty.key ? { ...row, ...value } : row) : [...current, { key: crypto.randomUUID(), ...value }]; }); setCreating(false);
  }
  return <dialog ref={dialog} className="contact-dialog" aria-labelledby="field-automation-title" onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); event.stopPropagation(); close(); }}><form noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
    <header><h2 id="field-automation-title" ref={heading} tabIndex={-1}>Add custom field</h2><button className="btn" type="button" aria-label="Close field automation" disabled={operation.busy} onClick={close}>Close</button></header>
    <p>When someone books <strong>{initial.eventTitle}</strong>, apply these values to their contact. Text and numbers replace existing values; tags are added to existing tags.</p>
    <fieldset disabled={operation.busy}><legend>Fields to apply</legend>{rows.map((row, index) => {
      const field = fields.find(field => field.id === row.fieldId), issue = row.fieldId && fieldActionProblem(row, fields), incompatible = field && field.type !== row.type;
      return <fieldset key={row.key} className="contact-automation-field"><legend>Field {index + 1}</legend><label htmlFor={`automation-field-${row.key}`}>Field name</label><select id={`automation-field-${row.key}`} className="input" value={row.fieldId} onChange={event => choose(row.key, event.target.value)}><option value="">Choose a field</option>
        {row.fieldId && (!field || !AUTOMATION_FIELD_TYPES.includes(field.type as ContactFieldAction["type"])) && <option value={row.fieldId}>Unavailable field</option>}{fields.filter(field => AUTOMATION_FIELD_TYPES.includes(field.type as ContactFieldAction["type"])).map(field => <option key={field.id} value={field.id} disabled={rows.some(other => other.key !== row.key && other.fieldId === field.id)}>{field.name} · {FIELD_TYPES[field.type]}</option>)}</select>
        {incompatible && <button className="btn" type="button" disabled={!AUTOMATION_FIELD_TYPES.includes(field.type as ContactFieldAction["type"])} onClick={() => choose(row.key, field.id)}>Use current field type</button>}
        {field && !incompatible && (row.type === "tag" ? <fieldset className="contact-multi"><legend>Tags to add</legend>{field.options.map(option => { const selected = Array.isArray(row.value) ? row.value : [row.value]; return <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={event => update(row.key, { value: event.target.checked ? [...selected, option] : selected.filter(value => value !== option) })} />{option}</label>; })}{(Array.isArray(row.value) ? row.value : [row.value]).filter(value => value && !field.options.includes(value)).map(value => <label key={value}><input type="checkbox" checked onChange={() => update(row.key, { value: (Array.isArray(row.value) ? row.value : [row.value]).filter(tag => tag !== value) })} />Unavailable tag: {value}</label>)}</fieldset> : <><label htmlFor={`automation-value-${row.key}`}>Value</label><input id={`automation-value-${row.key}`} className="input" inputMode={row.type === "number" ? "decimal" : undefined} maxLength={2000} value={typeof row.value === "string" ? row.value : ""} onChange={event => update(row.key, { value: event.target.value })} /></>)}
        {issue && <p className="contact-error">{issue}</p>}<button className="btn" type="button" aria-label={`Remove field ${index + 1}`} onClick={() => { focusAdd.current = true; setRows(current => current.filter(value => value.key !== row.key)); }}>Remove field</button>
      </fieldset>;
    })}<div className="contact-list-actions"><button ref={add} className="btn" type="button" disabled={rows.length >= 10} onClick={() => setRows(current => [...current, { key: crypto.randomUUID(), fieldId: "", type: "text", value: "" }])}>+ Add field</button><button className="btn" type="button" disabled={(rows.length >= 10 && !rows.some(row => !row.fieldId)) || fields.length >= 10} onClick={() => setCreating(true)}>+ Create a new field</button></div>
      {fields.length >= 10 && <p className="muted">All 10 custom field slots are in use. Manage existing fields in Contacts.</p>}<p className="muted">New fields are saved immediately, even if you cancel this automation.</p>
    </fieldset>
    {broken && <p className="contact-error">Some saved fields need attention. Future bookings apply the remaining valid fields.</p>}
    <label className="contact-automation-toggle"><input type="checkbox" role="switch" checked={baseline.enabled} disabled={operation.busy} onChange={event => void save(event.target.checked, false)} />Enable field automation</label>
    <p className="muted">Changing the switch also saves your selected fields and values. Changes apply to new bookings only; pausing or deleting keeps existing contact values.</p>
    {message && <p role="status">{message}</p>}{operation.error && <p role="alert" ref={alert} tabIndex={-1} className="contact-error">{operation.error}</p>}
    <button className="btn" type="button" disabled={operation.busy} onClick={() => void reload()}>Reload saved automation and fields</button>
    <footer>{baseline.configured && <button className="btn contact-delete" type="button" disabled={operation.busy} onClick={() => void remove()}>Delete field automation</button>}<button className="btn" type="button" disabled={operation.busy} onClick={close}>Cancel</button><button className="btn primary" disabled={operation.busy || (baseline.configured && !dirty)}>{operation.busy ? "Saving…" : "Save changes"}</button></footer>
  </form>{creating && <ContactFieldEditor sources={[]} allowedTypes={AUTOMATION_FIELD_TYPES} onClose={() => setCreating(false)} onSaved={created} />}</dialog>;
}
export function ContactFieldAutomationPanel({ eventId, initial }: { eventId: string; initial?: FieldAutomationData }) {
  const [state, setState] = useState(initial), [loading, setLoading] = useState(!initial), [error, setError] = useState(""), [reload, setReload] = useState(0), [open, setOpen] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    if (initial && reload === 0) return; let active = true; const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000); setLoading(true); setError("");
    void request(eventId, "GET", undefined, controller.signal).then(value => { if (active && value) setState(value); }).catch(cause => { if (active) setError(cause instanceof AutomationResponseError ? cause.message : "Field automations could not load. Try again."); }).finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [eventId, initial, reload]);
  if (loading) return <p role="status">Loading field automations…</p>;
  if (error || !state) return <div><p role="alert" className="contact-error">{error || "Field automations could not load."}</p><button className="btn" onClick={() => setReload(value => value + 1)}>Retry field automations</button></div>;
  const broken = state.automation.actions.some(action => fieldActionProblem(action, state.fields)), names = state.automation.actions.map(action => state.fields.find(field => field.id === action.fieldId)?.name ?? "Unavailable field");
  return <div className="contact-automation-panel"><div className="contact-automation-heading"><div><h3>Add custom field</h3><p className="muted">{state.automation.configured ? `${state.automation.enabled ? "Enabled" : "Paused"} · ${names.join(", ")}` : "Automatically set text and number values or add tags when contacts book."}</p></div><button className="btn" onClick={() => setOpen(true)}>{state.automation.configured ? "Edit field automation" : "+ Add field automation"}</button></div>
    {broken && <p className="contact-error" role="status">Needs attention: review unavailable or changed fields.</p>}{message && <p role="status">{message}</p>}
    {open && <ContactFieldAutomationEditor initial={state} onClose={() => setOpen(false)} onSaved={(value, closeAfter) => { setState(value); setMessage(!value.automation.configured ? "Field automation deleted. Existing values are kept." : value.automation.enabled ? "Field automation enabled." : "Field automation paused."); if (closeAfter) setOpen(false); }} />}
  </div>;
}
