"use client";
import { useEffect, useRef, useState } from "react";
import { BP } from "@/lib/basepath";
import { CURRENCIES } from "@/lib/contact-field-validation";
import { EMPTY_OPPORTUNITY, OPPORTUNITY_STAGES, OpportunityDetail, OpportunityFields, sameOpportunity, type OpportunityDetailData, type OpportunityDraft } from "@/lib/opportunity-validation";
import { AutomationResponseError, useAutomationOperation } from "./useContactAutomationOperation";
import { ContactEditor } from "./ContactEditor";
import { OpportunityContactPicker } from "./OpportunityContactPicker";
export async function opportunityRequest(id: string, method: string, body: unknown, signal: AbortSignal) {
  const response = await fetch(`${BP}/api/opportunities${method === "POST" ? "" : `/${id}`}`, { method, signal, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (method === "DELETE" && response.status === 204) return null;
  const value = await response.json(); if (!response.ok) throw new AutomationResponseError(typeof value?.error === "string" ? value.error : "The opportunity could not be saved.", response.status);
  if (method === "DELETE") throw new Error("Unconfirmed deletion"); const result = OpportunityDetail.parse(value); if (result.opportunity.id !== id) throw new Error("Unconfirmed opportunity"); return result;
}
export function OpportunityEditor({ initial, onClose, onSaved }: { initial?: OpportunityDetailData; onClose(): void; onSaved(value: OpportunityDetailData): void }) {
  const [id] = useState(() => initial?.opportunity.id ?? crypto.randomUUID()), [baseline, setBaseline] = useState(initial), [draft, setDraft] = useState<OpportunityDraft>(() => initial ? OpportunityFields.parse(initial.opportunity) : { ...EMPTY_OPPORTUNITY }), [contact, setContact] = useState(initial?.contact ?? null);
  const [creatingContact, setCreatingContact] = useState(false);
  const operation = useAutomationOperation(), dialog = useRef<HTMLDialogElement>(null), name = useRef<HTMLInputElement>(null), alert = useRef<HTMLParagraphElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline ? OpportunityFields.parse(baseline.opportunity) : EMPTY_OPPORTUNITY);
  useEffect(() => { const previous = document.activeElement, panel = dialog.current; panel?.showModal(); name.current?.focus(); return () => { panel?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  useEffect(() => { if (operation.error && !operation.busy) alert.current?.focus(); }, [operation.error, operation.busy]);
  useEffect(() => { if (!dirty && !operation.busy) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, operation.busy]);
  function close() { if (!operation.pending.current && (!dirty || confirm("Discard unsaved opportunity changes?"))) onClose(); }
  async function save() {
    if (operation.pending.current) return; const parsed = OpportunityFields.safeParse(draft);
    if (!parsed.success) { operation.setError(parsed.error.issues[0].message); return; } if (!draft.contactId && !baseline) { operation.setError("Choose a contact."); return; }
    const result = await operation.run(async signal => { const value = await opportunityRequest(id, initial ? "PATCH" : "POST", { ...parsed.data, ...(baseline ? { action: "edit", version: baseline.opportunity.version } : { id }) }, signal); if (!value || !sameOpportunity(value.opportunity, parsed.data)) throw new Error("Unconfirmed fields"); return value; }); if (result) onSaved(result.value);
  }
  async function reload() {
    if (dirty && !confirm("Replace this draft with the saved opportunity?")) return;
    const result = await operation.run(signal => opportunityRequest(id, "GET", undefined, signal)); if (result?.value) { setBaseline(result.value); setDraft(OpportunityFields.parse(result.value.opportunity)); setContact(result.value.contact); }
  }
  function update<K extends keyof OpportunityDraft>(field: K, value: OpportunityDraft[K]) { setDraft(current => ({ ...current, [field]: value })); }
  return <dialog ref={dialog} className="contact-dialog opportunity-editor" aria-labelledby="opportunity-editor-title" onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); close(); }}><form noValidate onSubmit={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); void save(); }}>
    <header><h2 id="opportunity-editor-title">{initial ? "Edit opportunity" : "Add opportunity"}</h2><button className="btn" type="button" aria-label="Close opportunity editor" disabled={operation.busy} onClick={close}>Close</button></header>
    <fieldset disabled={operation.busy}><legend>Opportunity details</legend><div className="contact-form-grid">
      <div><label htmlFor="opportunity-name">Opportunity name (required)</label><input id="opportunity-name" className="input" ref={name} value={draft.name} maxLength={200} onChange={event => update("name", event.target.value)} /></div>
      <div><label htmlFor="opportunity-stage">Stage</label><select id="opportunity-stage" className="input" value={draft.stage} onChange={event => update("stage", event.target.value as OpportunityDraft["stage"])}>{Object.entries(OPPORTUNITY_STAGES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <div><label htmlFor="opportunity-amount">Value amount</label><input id="opportunity-amount" className="input" inputMode="decimal" maxLength={30} value={draft.amount} onChange={event => update("amount", event.target.value)} /></div>
      <div><label htmlFor="opportunity-currency">Currency</label><select id="opportunity-currency" className="input" value={draft.currency} onChange={event => update("currency", event.target.value)}>{CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></div>
      <div><label htmlFor="opportunity-close-date">Close date</label><input id="opportunity-close-date" type="date" className="input" value={draft.closeDate} onChange={event => update("closeDate", event.target.value)} /></div>
      <div><label htmlFor="opportunity-source">Source</label><input id="opportunity-source" className="input" maxLength={500} value={draft.source} onChange={event => update("source", event.target.value)} /></div>
      <div className="opportunity-notes-input"><label htmlFor="opportunity-notes">Notes</label><textarea id="opportunity-notes" className="input" rows={5} maxLength={10000} value={draft.notes} onChange={event => update("notes", event.target.value)} /></div>
    </div></fieldset>
    <OpportunityContactPicker selected={contact} contactId={draft.contactId} disabled={operation.busy} onCreate={() => setCreatingContact(true)} onChange={value => { setContact(value); update("contactId", value.id); }} />
    {operation.error && <p role="alert" tabIndex={-1} ref={alert} className="contact-error">{operation.error}</p>}{baseline && <button className="btn" type="button" disabled={operation.busy} onClick={() => void reload()}>Reload saved opportunity</button>}
    <footer><button className="btn" type="button" disabled={operation.busy} onClick={close}>Cancel</button><button className="btn primary" disabled={operation.busy || (!!baseline && !dirty)}>{operation.busy ? "Saving…" : "Save"}</button></footer>
  </form>{creatingContact && <ContactEditor onClose={() => setCreatingContact(false)} onDeleted={() => setCreatingContact(false)} onSaved={value => { setContact(value); update("contactId", value.id); setCreatingContact(false); }} />}</dialog>;
}
