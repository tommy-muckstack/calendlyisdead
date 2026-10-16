"use client";
import { useEffect, useRef, useState } from "react";
import { BP } from "@/lib/basepath";
import { QuestionAutomationState, mappedFieldName, questionMappingProblem, type QuestionAutomationData, type QuestionAutomationChange } from "@/lib/contact-question-automation-validation";
import { AutomationResponseError, useAutomationOperation } from "./useContactAutomationOperation";
import "@/app/app/contacts/contacts.css";
async function request(eventId: string, method: string, body: unknown, signal: AbortSignal) {
  const response = await fetch(`${BP}/api/event-types/${encodeURIComponent(eventId)}/contact-automations/questions`, { method, signal, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (method === "DELETE" && response.status === 204) return null;
  const value = await response.json(); if (!response.ok) throw new AutomationResponseError(typeof value.error === "string" ? value.error : "The change could not be confirmed. Try again.", response.status);
  if (method === "DELETE") throw new Error("Unconfirmed deletion");
  const state = QuestionAutomationState.parse(value); if (state.automation.eventTypeId !== eventId) throw new Error("Unconfirmed event"); return state;
}
export function ContactQuestionAutomationEditor({ initial, onClose, onSaved }: { initial: QuestionAutomationData; onClose(): void; onSaved(value: QuestionAutomationData, close: boolean): void }) {
  const [state, setState] = useState(initial), [questionId, setQuestionId] = useState(initial.automation.questionId ?? ""), [newId, setNewId] = useState(() => crypto.randomUUID()), [message, setMessage] = useState("");
  const operation = useAutomationOperation(), dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null), alert = useRef<HTMLParagraphElement>(null);
  const baseline = state.automation, problem = questionMappingProblem(state), question = state.questions.find(question => question.id === questionId);
  const reuse = baseline.configured && !problem && questionId === baseline.questionId, dirty = questionId !== (baseline.questionId ?? ""), creates = !reuse;
  useEffect(() => { const previous = document.activeElement, panel = dialog.current; panel?.showModal(); heading.current?.focus(); return () => { panel?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  useEffect(() => { if (operation.error && !operation.busy) alert.current?.focus(); }, [operation.error, operation.busy]);
  useEffect(() => { if (!dirty && !operation.busy) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, operation.busy]);
  function close() { if (!operation.pending.current && (!dirty || confirm("Discard unsaved question mapping changes?"))) onClose(); }
  function accept(value: QuestionAutomationData) { setState(value); setQuestionId(value.automation.questionId ?? ""); setNewId(crypto.randomUUID()); }
  async function save(enabled = baseline.enabled, toggle = false) {
    if (operation.pending.current) return;
    const onlyToggle = toggle && baseline.configured && !dirty;
    if (!onlyToggle && (!question || (creates && state.fieldCount >= 10))) { operation.setError(!question ? "Choose an available invitee question." : "All 10 custom field slots are in use. Delete an unused field in Contacts first."); return; }
    const payload: QuestionAutomationChange = onlyToggle ? { action: "toggle", enabled, version: baseline.version } : { action: "save", enabled, version: baseline.version, questionId, fieldId: reuse ? baseline.fieldId! : newId };
    const result = await operation.run(async signal => {
      const value = await request(baseline.eventTypeId, "PATCH", payload, signal);
      if (!value?.automation.configured || value.automation.enabled !== enabled || (payload.action === "save" && (value.automation.questionId !== payload.questionId || value.automation.fieldId !== payload.fieldId || questionMappingProblem(value)))) throw new Error("Unconfirmed mapping"); return value;
    });
    if (result) { accept(result.value); setMessage(enabled ? "Question mapping enabled for new bookings." : "Question mapping paused. Existing values are kept."); onSaved(result.value, !toggle); }
  }
  async function reload() {
    if (dirty && !confirm("Replace this draft with the saved question mapping?")) return;
    const result = await operation.run(signal => request(baseline.eventTypeId, "GET", undefined, signal)); if (result?.value) { accept(result.value); setMessage("Saved mapping and questions reloaded."); onSaved(result.value, false); }
  }
  async function remove() {
    if (!confirm("Delete this question mapping? Its custom field and existing values will be kept.")) return;
    const result = await operation.run(async signal => { await request(baseline.eventTypeId, "DELETE", { version: baseline.version }, signal); const value = await request(baseline.eventTypeId, "GET", undefined, signal); if (!value || value.automation.configured) throw new Error("Unconfirmed deletion"); return value; });
    if (result) onSaved(result.value, true);
  }
  return <dialog ref={dialog} className="contact-dialog" aria-labelledby="question-automation-title" onCancel={event => { event.preventDefault(); close(); }}><form noValidate onSubmit={event => { event.preventDefault(); void save(baseline.configured ? baseline.enabled : true); }}>
    <header><h2 id="question-automation-title" tabIndex={-1} ref={heading}>Map an invitee question</h2><button className="btn" type="button" aria-label="Close question mapping" disabled={operation.busy} onClick={close}>Close</button></header>
    <p>Save a booking answer from <strong>{state.eventTitle}</strong> to a custom contact field.</p>
    <fieldset disabled={operation.busy}><legend>Invitee question</legend><label htmlFor="automation-question">Question to map</label><select id="automation-question" className="input" value={questionId} onChange={event => { setQuestionId(event.target.value); setNewId(crypto.randomUUID()); }}>
      <option value="">Choose a question</option>{questionId && !question && <option value={questionId} disabled>Unavailable question</option>}{state.questions.map(question => <option key={question.id} value={question.id}>{question.label}</option>)}</select>
      {!state.questions.length && <p>Add a question to the event&apos;s booking form, then reload this mapping.</p>}
      {question && <p>{reuse ? "Contact field" : "New contact field"}: <strong>{reuse ? state.field?.name : mappedFieldName(state.eventTitle, question.label)}</strong>{!reuse && " (a number is added if this name is already used)"}</p>}
    </fieldset>
    <p className="muted">One question can be mapped per event. A new mapping creates a new field. Changing the question keeps the old field and values. Only new bookings fill the selected field; an unanswered question keeps the previous value.</p>
    {state.fieldCount >= 10 && creates && <p className="contact-error">All 10 custom field slots are in use. Manage fields in Contacts before creating a replacement.</p>}
    {problem && <p className="contact-error">{problem}</p>}
    {baseline.configured && <label className="contact-automation-toggle"><input type="checkbox" role="switch" checked={baseline.enabled} disabled={operation.busy || (!baseline.enabled && !dirty && !!problem)} onChange={event => void save(event.target.checked, true)} />Enable question mapping</label>}
    {baseline.configured && <p className="muted">The switch saves your selected question immediately. Pausing or deleting keeps the custom field and existing values.</p>}
    {message && <p role="status">{message}</p>}{operation.error && <p role="alert" ref={alert} tabIndex={-1} className="contact-error">{operation.error}</p>}
    <button className="btn" type="button" disabled={operation.busy} onClick={() => void reload()}>Reload saved mapping and questions</button>
    <footer>{baseline.configured && <button className="btn contact-delete" type="button" disabled={operation.busy} onClick={() => void remove()}>Delete question mapping</button>}<button className="btn" type="button" disabled={operation.busy} onClick={close}>Cancel</button><button className="btn primary" disabled={operation.busy || (!!baseline.configured && !dirty && !creates)}>{operation.busy ? "Saving…" : baseline.configured ? "Save changes" : "Enable"}</button></footer>
  </form></dialog>;
}
export function ContactQuestionAutomationPanel({ eventId, initial }: { eventId: string; initial?: QuestionAutomationData }) {
  const [state, setState] = useState(initial), [loading, setLoading] = useState(!initial), [error, setError] = useState(""), [reload, setReload] = useState(0), [open, setOpen] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    if (initial && reload === 0) return; let active = true; const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000); setLoading(true); setError("");
    void request(eventId, "GET", undefined, controller.signal).then(value => { if (active && value) setState(value); }).catch(cause => { if (active) setError(cause instanceof AutomationResponseError ? cause.message : "Question mappings could not load. Try again."); }).finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [eventId, initial, reload]);
  if (loading) return <p role="status">Loading question mapping…</p>;
  if (error || !state) return <div><p role="alert" className="contact-error">{error || "Question mapping could not load."}</p><button className="btn" onClick={() => setReload(value => value + 1)}>Retry question mapping</button></div>;
  const problem = questionMappingProblem(state);
  return <div className="contact-automation-panel"><div className="contact-automation-heading"><div><h3>Invitee question</h3><p className="muted">{state.automation.configured ? `${state.automation.enabled ? "Enabled" : "Paused"} · ${state.field?.name ?? "Needs attention"}` : "Save one booking answer in a new custom contact field."}</p></div><button className="btn" onClick={() => setOpen(true)}>{state.automation.configured ? "Edit question mapping" : "+ Map a question"}</button></div>
    {problem && <p className="contact-error" role="status">{problem}</p>}{message && <p role="status">{message}</p>}
    {open && <ContactQuestionAutomationEditor initial={state} onClose={() => setOpen(false)} onSaved={(value, closeAfter) => { setState(value); setMessage(!value.automation.configured ? "Question mapping deleted. Its field and values are kept." : value.automation.enabled ? "Question mapping enabled." : "Question mapping paused."); if (closeAfter) setOpen(false); }} />}
  </div>;
}
