"use client";
import { useEffect, useRef, useState } from "react";
import { BP } from "@/lib/basepath";
import { ContactAutomationState, SaveListAutomation, type AutomationState, type ListAutomationChange } from "@/lib/contact-automation-validation";
import { ContactCollectionEditor } from "./ContactCollectionEditor";
import "@/app/app/contacts/contacts.css";
import { AutomationResponseError, useAutomationOperation } from "./useContactAutomationOperation";
async function request(eventId: string, method: string, body: unknown, signal: AbortSignal) {
  const response = await fetch(`${BP}/api/event-types/${encodeURIComponent(eventId)}/contact-automations/lists`, { method, signal, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (response.status === 204 && method === "DELETE") return null;
  const value = await response.json(); if (!response.ok) throw new AutomationResponseError(typeof value.error === "string" ? value.error : "The change could not be confirmed. Try again.", response.status);
  if (method === "DELETE") throw new Error("Unconfirmed deletion");
  const state = ContactAutomationState.parse(value); if (state.automation.eventTypeId !== eventId) throw new Error("Unconfirmed event"); return state;
}
const sameIds = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
export function ContactListAutomationEditor({ initial, onClose, onSaved }: { initial: AutomationState; onClose(): void; onSaved(state: AutomationState, close: boolean): void }) {
  const [baseline, setBaseline] = useState(initial.automation), [lists, setLists] = useState(initial.lists), [selected, setSelected] = useState(initial.automation.listIds), [create, setCreate] = useState(false), [message, setMessage] = useState("");
  const operation = useAutomationOperation(), dialog = useRef<HTMLDialogElement>(null), alert = useRef<HTMLParagraphElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const dirty = !sameIds(selected, baseline.listIds), missing = selected.filter(id => !lists.some(list => list.id === id));
  useEffect(() => { const before = document.activeElement, panel = dialog.current; panel?.showModal(); heading.current?.focus(); return () => { panel?.close(); if (before instanceof HTMLElement && before.isConnected) before.focus(); }; }, []);
  useEffect(() => { if (operation.error && !operation.busy) alert.current?.focus(); }, [operation.error, operation.busy]);
  useEffect(() => { if (!dirty && !operation.busy) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, operation.busy]);
  function close() { if (!operation.pending.current && (!dirty || confirm("Discard unsaved automation changes?"))) onClose(); }
  async function save(enabled = baseline.enabled, closeAfter = true) {
    if (operation.pending.current) return; const toggle = baseline.configured && !dirty && !closeAfter;
    const payload: ListAutomationChange = toggle ? { action: "toggle", enabled, version: baseline.version } : { action: "save", enabled, listIds: selected, version: baseline.version };
    if (!toggle) { const parsed = SaveListAutomation.safeParse(payload); if (!parsed.success) { operation.setError(parsed.error.issues[0].message); return; } }
    const result = await operation.run(async signal => {
      const state = await request(baseline.eventTypeId, "PATCH", payload, signal);
      if (!state?.automation.configured || state.automation.enabled !== enabled || (payload.action === "save" && !sameIds(state.automation.listIds, selected))) throw new Error("Unconfirmed settings"); return state;
    });
    if (result) { setBaseline(result.value.automation); setSelected(result.value.automation.listIds); setLists(result.value.lists); setMessage(enabled ? "Automation enabled. Future bookings will add contacts to these lists." : "Automation paused. Existing list members are kept."); onSaved(result.value, closeAfter); }
  }
  async function reload() {
    if (dirty && !confirm("Replace this draft with the saved automation?")) return;
    const result = await operation.run(signal => request(baseline.eventTypeId, "GET", undefined, signal));
    if (result?.value) { setBaseline(result.value.automation); setSelected(result.value.automation.listIds); setLists(result.value.lists); setMessage("Saved settings reloaded."); onSaved(result.value, false); }
  }
  async function remove() {
    if (!confirm("Delete this automation? Contacts already added to lists will be kept.")) return;
    const result = await operation.run(async signal => {
      await request(baseline.eventTypeId, "DELETE", { version: baseline.version }, signal);
      const state = await request(baseline.eventTypeId, "GET", undefined, signal); if (!state || state.automation.configured) throw new Error("Unconfirmed deletion"); return state;
    });
    if (result) onSaved(result.value, true);
  }
  return <dialog ref={dialog} className="contact-dialog" aria-labelledby="contact-automation-title" onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); event.stopPropagation(); close(); }}><form noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
    <header><h2 id="contact-automation-title" ref={heading} tabIndex={-1}>Add contact to list</h2><button className="btn" type="button" disabled={operation.busy} onClick={close} aria-label="Close contact automation">Close</button></header>
    <p>When someone books <strong>{initial.eventTitle}</strong>, add their contact to the selected lists.</p>
    <fieldset disabled={operation.busy}><legend>Select lists</legend><div className="contact-automation-lists">{lists.map(list => <label key={list.id}><input type="checkbox" checked={selected.includes(list.id)} onChange={event => setSelected(event.target.checked ? [...selected, list.id] : selected.filter(id => id !== list.id))} />{list.name}</label>)}
      {missing.map((id, index) => <label key={id}><input type="checkbox" checked onChange={() => setSelected(selected.filter(value => value !== id))} />Unavailable list {index + 1} — remove or replace</label>)}</div>
      {!lists.length && <p className="muted">Create a list to start organizing these contacts.</p>}<button className="btn" type="button" onClick={() => setCreate(true)}>+ Create new list</button><p className="muted">A new list is saved immediately, even if you cancel this automation.</p>
    </fieldset>
    {missing.length > 0 && <p className="contact-error">{missing.length} selected {missing.length === 1 ? "list is" : "lists are"} unavailable. Future bookings will use the remaining available lists.</p>}
    <label className="contact-automation-toggle"><input type="checkbox" role="switch" checked={baseline.enabled} disabled={operation.busy} onChange={event => void save(event.target.checked, false)} />Enable automation</label>
    <p className="muted">Changing the switch also saves your selected lists. Saved changes apply to new bookings only; existing memberships are kept. This does not send messages.</p>
    {message && <p role="status">{message}</p>}{operation.error && <p role="alert" ref={alert} tabIndex={-1} className="contact-error">{operation.error}</p>}
    {(operation.conflict || missing.length > 0) && <button className="btn" type="button" disabled={operation.busy} onClick={() => void reload()}>Reload saved automation and lists</button>}
    <footer>{baseline.configured && <button className="btn contact-delete" type="button" disabled={operation.busy} onClick={() => void remove()}>Delete automation</button>}<button className="btn" type="button" disabled={operation.busy} onClick={close}>Cancel</button><button className="btn primary" disabled={operation.busy || (baseline.configured && !dirty)}>{operation.busy ? "Saving…" : "Save changes"}</button></footer>
  </form>{create && <ContactCollectionEditor kind="list" onClose={() => setCreate(false)} onSaved={list => { setLists([...lists, list]); setSelected([...selected, list.id]); setCreate(false); }} />}</dialog>;
}
export function ContactListAutomationPanel({ eventId, initial }: { eventId: string; initial?: AutomationState }) {
  const [state, setState] = useState(initial), [loading, setLoading] = useState(!initial), [error, setError] = useState(""), [reload, setReload] = useState(0), [open, setOpen] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    if (initial && reload === 0) return; let active = true; const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000); setLoading(true); setError("");
    void request(eventId, "GET", undefined, controller.signal).then(value => { if (active && value) setState(value); }).catch(cause => { if (active) setError(cause instanceof AutomationResponseError ? cause.message : "Contact automations could not load. Try again."); }).finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [eventId, initial, reload]);
  if (loading) return <p role="status">Loading contact automations…</p>;
  if (error || !state) return <div><p role="alert" className="contact-error">{error || "Contact automations could not load."}</p><button className="btn" onClick={() => setReload(value => value + 1)}>Retry contact automations</button></div>;
  const missing = state.automation.listIds.filter(id => !state.lists.some(list => list.id === id)), names = state.lists.filter(list => state.automation.listIds.includes(list.id)).map(list => list.name);
  return <div className="contact-automation-panel"><div className="contact-automation-heading"><div><h3>Add contact to list</h3><p className="muted">{state.automation.configured ? `${state.automation.enabled ? "Enabled" : "Paused"} · ${names.join(", ") || "No available lists"}` : "Automatically organize contacts when they book this event."}</p></div><button className="btn" onClick={() => setOpen(true)}>{state.automation.configured ? "Edit list automation" : "+ Add list automation"}</button></div>
    {missing.length > 0 && <p className="contact-error" role="status">Needs attention: {missing.length} selected {missing.length === 1 ? "list is" : "lists are"} no longer available.</p>}{message && <p role="status">{message}</p>}
    {open && <ContactListAutomationEditor initial={state} onClose={() => setOpen(false)} onSaved={(value, closeAfter) => { setState(value); setMessage(!value.automation.configured ? "Automation deleted. Existing memberships are kept." : value.automation.enabled ? "Automation enabled." : "Automation paused."); if (closeAfter) setOpen(false); }} />}
  </div>;
}
