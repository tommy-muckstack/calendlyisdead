"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BP } from "@/lib/basepath";
import { EMPTY_OPPORTUNITY_AUTOMATION, OPPORTUNITY_VARIABLES, OpportunityAutomationData, OpportunityAutomationFields, OpportunityAutomationState, renderOpportunityName, sameOpportunityAutomation, type OpportunityAutomation, type OpportunityAutomationDraft, type OpportunityAutomationStateData } from "@/lib/opportunity-automation-validation";
import { OPPORTUNITY_STAGES } from "@/lib/opportunity-validation";
import { AutomationResponseError, useAutomationOperation } from "./useContactAutomationOperation";
import "@/app/app/contacts/contacts.css";

async function request(id: string | null, method: string, body: unknown, signal: AbortSignal) {
  const response = await fetch(`${BP}/api/opportunity-automations${id ? `/${encodeURIComponent(id)}` : ""}`, { method, signal, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (method === "DELETE" && response.status === 204) return null;
  const value = await response.json();
  if (!response.ok) throw new AutomationResponseError(typeof value.error === "string" ? value.error : "The change could not be confirmed. Try again.", response.status);
  if (method === "DELETE") throw new Error("Unconfirmed deletion");
  const parsed = OpportunityAutomationData.parse(value); if (id && parsed.id !== id) throw new Error("Unconfirmed automation"); return parsed;
}

export function OpportunityAutomationEditor({ initial, events, hostName, eventId, onClose, onSaved }: { initial?: OpportunityAutomation; events: OpportunityAutomationStateData["events"]; hostName: string; eventId?: string; onClose(): void; onSaved(value: OpportunityAutomation | null, close: boolean): void }) {
  const [baseline, setBaseline] = useState(initial), [draft, setDraft] = useState<OpportunityAutomationDraft>(initial ? OpportunityAutomationFields.parse(initial) : { ...EMPTY_OPPORTUNITY_AUTOMATION, eventTypeId: eventId ?? "" }), [message, setMessage] = useState("");
  const operation = useAutomationOperation(), id = useRef(initial?.id ?? crypto.randomUUID()), dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null), alert = useRef<HTMLParagraphElement>(null), name = useRef<HTMLInputElement>(null);
  const original = baseline ? OpportunityAutomationFields.parse(baseline) : { ...EMPTY_OPPORTUNITY_AUTOMATION, eventTypeId: eventId ?? "" }, dirty = JSON.stringify(draft) !== JSON.stringify(original), event = events.find(event => event.id === draft.eventTypeId);
  const update = <K extends keyof OpportunityAutomationDraft>(key: K, value: OpportunityAutomationDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  useEffect(() => { const before = document.activeElement, panel = dialog.current; panel?.showModal(); heading.current?.focus(); return () => { panel?.close(); if (before instanceof HTMLElement && before.isConnected) before.focus(); }; }, []);
  useEffect(() => { if (operation.error && !operation.busy) alert.current?.focus(); }, [operation.error, operation.busy]);
  useEffect(() => { if (!dirty && !operation.busy) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, operation.busy]);
  function close() { if (!operation.pending.current && (!dirty || confirm("Discard unsaved automation changes?"))) onClose(); }
  async function save(enabled = draft.enabled, closeAfter = true) {
    if (operation.pending.current) return;
    const toggle = baseline && !dirty && !closeAfter, parsed = OpportunityAutomationFields.safeParse({ ...draft, enabled });
    if (!parsed.success) { operation.setError(parsed.error.issues[0].message); return; }
    const fields = parsed.data, payload = baseline ? toggle ? { action: "toggle", enabled, version: baseline.version } : { ...fields, action: "save", version: baseline.version } : { ...fields, id: id.current };
    const result = await operation.run(async signal => { const saved = await request(baseline ? id.current : null, baseline ? "PATCH" : "POST", payload, signal); if (!saved || saved.id !== id.current || !sameOpportunityAutomation(saved, fields)) throw new Error("Unconfirmed settings"); return saved; });
    if (result) { setBaseline(result.value); setDraft(OpportunityAutomationFields.parse(result.value)); setMessage(enabled ? "Automation enabled for future bookings." : "Automation paused. Existing opportunities are kept."); onSaved(result.value, closeAfter); }
  }
  async function reload() {
    if (operation.pending.current || (dirty && !confirm("Replace this draft with the saved automation?"))) return;
    const result = await operation.run(signal => request(id.current, "GET", undefined, signal));
    if (result?.value) { setBaseline(result.value); setDraft(OpportunityAutomationFields.parse(result.value)); setMessage("Saved automation reloaded."); onSaved(result.value, false); }
  }
  async function remove() {
    if (!baseline || operation.pending.current || !confirm("Delete this automation? Existing opportunities, contacts and bookings will be kept.")) return;
    const result = await operation.run(signal => request(id.current, "DELETE", { version: baseline.version }, signal)); if (result) onSaved(null, true);
  }
  function insert(key: string) {
    if (!Object.hasOwn(OPPORTUNITY_VARIABLES, key)) return;
    const start = name.current?.selectionStart ?? draft.opportunityName.length, end = name.current?.selectionEnd ?? start, token = `{{${key}}}`, value = draft.opportunityName.slice(0, start) + token + draft.opportunityName.slice(end);
    if (value.length > 200) { operation.setError("Keep the opportunity name template within 200 characters."); return; }
    update("opportunityName", value); requestAnimationFrame(() => { name.current?.focus(); name.current?.setSelectionRange(start + token.length, start + token.length); });
  }
  return <dialog ref={dialog} className="contact-dialog" aria-labelledby="opportunity-automation-title" onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); event.stopPropagation(); close(); }}><form noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
    <header><h2 id="opportunity-automation-title" ref={heading} tabIndex={-1}>Create new opportunity</h2><button className="btn" type="button" disabled={operation.busy} onClick={close} aria-label="Close opportunity automation">Close</button></header>
    <fieldset disabled={operation.busy}><legend>Automation settings</legend><div className="contact-form-grid">
      <label>Automation name<input className="input" value={draft.name} maxLength={200} onChange={event => update("name", event.target.value)} /></label>
      <label>Event type<select className="input" value={draft.eventTypeId} onChange={event => update("eventTypeId", event.target.value)}><option value="">Choose an event type</option>{draft.eventTypeId && !event && <option value={draft.eventTypeId}>Event no longer available</option>}{events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
      <label>Stage<select className="input" value={draft.stage} onChange={event => update("stage", event.target.value as OpportunityAutomationDraft["stage"])}>{Object.entries(OPPORTUNITY_STAGES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Opportunity name<input ref={name} className="input" value={draft.opportunityName} maxLength={200} onChange={event => update("opportunityName", event.target.value)} /></label>
      <label>Insert variable<select className="input" value="" onChange={event => insert(event.target.value)}><option value="">Choose a variable</option>{Object.entries(OPPORTUNITY_VARIABLES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div></fieldset>
    <p className="muted">Example name for an invitee named Alex Example: <strong>{renderOpportunityName(draft.opportunityName, { hostName, inviteeName: "Alex Example", meetingName: event?.title ?? "" })}</strong></p>
    {draft.eventTypeId && !event && <p className="contact-error">This event is no longer available. Choose an event you host to save or enable this automation. You can still pause or delete it.</p>}
    {baseline && <label className="contact-automation-toggle"><input type="checkbox" role="switch" checked={baseline.enabled} disabled={operation.busy} onChange={event => void save(event.target.checked, false)} />Enable opportunity automation</label>}
    <p className="muted">Saved changes apply to new bookings only. Changing the switch also saves your draft. Existing opportunities are kept. New contact creation follows your Contacts settings.</p>
    {message && <p role="status">{message}</p>}{operation.error && <p role="alert" ref={alert} tabIndex={-1} className="contact-error">{operation.error}</p>}
    {operation.conflict && <button type="button" className="btn" disabled={operation.busy} onClick={() => void reload()}>Reload saved automation</button>}
    <footer>{baseline && <button className="btn contact-delete" type="button" disabled={operation.busy} onClick={() => void remove()}>Delete automation</button>}<button className="btn" type="button" disabled={operation.busy} onClick={close}>Cancel</button><button className="btn primary" disabled={operation.busy || (!!baseline && !dirty)}>{operation.busy ? "Saving…" : baseline ? "Save changes" : eventId ? "Enable" : "Save"}</button></footer>
  </form></dialog>;
}

export function OpportunityAutomationsPanel({ eventId, initial }: { eventId?: string; initial?: OpportunityAutomationStateData }) {
  const [state, setState] = useState(initial), [loading, setLoading] = useState(!initial), [error, setError] = useState(""), [reload, setReload] = useState(0), [query, setQuery] = useState(""), [search, setSearch] = useState(""), [page, setPage] = useState(1), [editing, setEditing] = useState<OpportunityAutomation | "new" | null>(null), [message, setMessage] = useState("");
  const firstLoad = useRef(true), heading = useRef<HTMLHeadingElement>(null);
  function closeEditor(refresh = false) {
    setEditing(null); if (refresh) { setPage(1); setReload(value => value + 1); }
    requestAnimationFrame(() => { if (refresh || document.activeElement === document.body) heading.current?.focus(); });
  }
  useEffect(() => {
    const useInitial = firstLoad.current && initial; firstLoad.current = false;
    if (useInitial) return;
    let active = true; const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000); setLoading(true); setError("");
    const params = new URLSearchParams({ page: String(page), q: query, ...(eventId ? { eventId } : {}) });
    void fetch(`${BP}/api/opportunity-automations?${params}`, { signal: controller.signal }).then(async response => { const value = await response.json(); if (!response.ok) throw new AutomationResponseError(value.error || "Automations could not load. Try again.", response.status); const data = OpportunityAutomationState.parse(value); if (data.page !== page || (eventId && data.rows.some(row => row.eventTypeId !== eventId))) throw new Error("Unconfirmed page"); if (active) setState(data); }).catch(cause => { if (active) setError(cause instanceof AutomationResponseError ? cause.message : "Automations could not load. Try again."); }).finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [eventId, initial, reload, page, query]);
  return <div className="contact-automation-panel"><div className="contact-automation-heading"><div><h3 ref={heading} tabIndex={-1}>Create new opportunity</h3><p className="muted">Create a contact-linked opportunity when someone books an event you host.</p></div><button className="btn" type="button" disabled={loading || !!error || !state?.events.length} onClick={() => setEditing("new")}>+ Add new automation</button></div>
    {!eventId && <form className="contacts-filters" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setPage(1); setReload(value => value + 1); }}><label>Search automations<input className="input" type="search" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} /></label><button className="btn" disabled={loading}>Search</button></form>}
    {message && <p role="status">{message}</p>}{loading && <p role="status">Loading opportunity automations…</p>}{error && <p role="alert" className="contact-error">{error}</p>}
    {(!loading && (error || !state)) && <button className="btn" type="button" onClick={() => setReload(value => value + 1)}>Retry opportunity automations</button>}
    {!loading && !error && state && <>{!state.events.length && <p>Create an event type in <Link href="/app">Scheduling</Link> to add an automation.</p>}{!state.rows.length && <p className="muted">{query ? "No matching automations." : page > 1 ? "No automations on this page." : "No opportunity automations yet."}</p>}
      <ul className="opportunity-automation-list">{state.rows.map(row => <li key={row.id}><div><strong>{row.name}</strong><p>{row.enabled ? "Enabled" : "Paused"} · {row.eventTitle ?? "Event no longer available"} · {OPPORTUNITY_STAGES[row.stage]}</p><p className="muted">{row.opportunityName}</p></div><button className="btn" type="button" aria-label={`Edit automation ${row.name}`} onClick={() => setEditing(row)}>Edit</button></li>)}</ul>
      {(state.total > 25 || page > 1) && <nav aria-label="Opportunity automation pages" className="contact-list-actions"><button className="btn" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(state.total / 25))}</span><button className="btn" type="button" disabled={page * 25 >= state.total} onClick={() => setPage(page + 1)}>Next</button></nav>}
    </>}
    {editing && state && <OpportunityAutomationEditor initial={editing === "new" ? undefined : editing} events={state.events} hostName={state.hostName} eventId={eventId} onClose={() => closeEditor()} onSaved={(value, close) => { setMessage(value ? value.enabled ? "Automation enabled for future bookings." : "Automation paused. Existing opportunities are kept." : "Automation deleted. Existing opportunities are kept."); if (close) closeEditor(true); else if (value) setState(current => {
      if (!current) return current;
      const existed = current.rows.some(row => row.id === value.id), visible = (!eventId || value.eventTypeId === eventId) && (!query || value.name.toLowerCase().includes(query.toLowerCase()));
      const rows = current.rows.filter(row => row.id !== value.id); if (visible) rows.push(value);
      return { ...current, rows: rows.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 25), total: Math.max(0, current.total + Number(visible) - Number(existed)) };
    }); }} />}
  </div>;
}
