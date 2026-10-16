"use client";
import { useEffect, useRef, useState } from "react";
import { BP } from "@/lib/basepath";
import { CollectionData, CollectionFields, type ContactCollection } from "@/lib/contact-list-validation";
import { EMPTY_RULES, type ContactRuleSet } from "@/lib/contact-view-validation";

class ListResponseError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function collectionRequest(path: string, method: string, data: unknown, signal: AbortSignal) {
  const response = await fetch(`${BP}/api/contacts/collections${path}`, { method, signal, headers: { "Content-Type": "application/json" }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  if (response.status === 204) return null;
  const body = await response.json(); if (!response.ok) throw new ListResponseError(typeof body.error === "string" ? body.error : "The change could not be confirmed. Try again.", response.status);
  return body;
}
export function useListOperation() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState(false);
  const pending = useRef(false), active = useRef(false), controller = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, []);
  async function run<T>(job: (signal: AbortSignal) => Promise<T>): Promise<{ value: T } | null> {
    if (pending.current) return null; pending.current = true; setBusy(true); setError("");
    const abort = new AbortController(); controller.current = abort; const timeout = setTimeout(() => abort.abort(), 30000);
    try { const value = await job(abort.signal); if (!active.current) return null; setConflict(false); return { value }; }
    catch (cause) { if (active.current) { setError(cause instanceof ListResponseError ? cause.message : "The change could not be confirmed. Your choices are still here. Try again."); setConflict(cause instanceof ListResponseError && cause.status === 409); } return null; }
    finally { clearTimeout(timeout); pending.current = false; if (active.current) setBusy(false); }
  }
  return { busy, error, conflict, pending, run, setError };
}
export function ContactCollectionEditor({ initial, kind, rules, onClose, onSaved, onDeleted }: { initial?: ContactCollection; kind: "list" | "view"; rules?: ContactRuleSet; onClose(): void; onSaved(value: ContactCollection): void; onDeleted?(): void }) {
  const [id] = useState(() => initial?.id ?? crypto.randomUUID()), [name, setName] = useState(initial?.name ?? ""), [savedRules, setRules] = useState(rules ?? initial?.rules ?? EMPTY_RULES), [version, setVersion] = useState(initial?.version ?? 1);
  const [baseline, setBaseline] = useState({ name: initial?.name ?? "", rules: initial?.rules ?? EMPTY_RULES });
  const operation = useListOperation(), dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null), alert = useRef<HTMLParagraphElement>(null);
  const dirty = name !== baseline.name || JSON.stringify(savedRules) !== JSON.stringify(baseline.rules);
  useEffect(() => { const before = document.activeElement, panel = dialog.current; panel?.showModal(); input.current?.focus(); return () => { panel?.close(); if (before instanceof HTMLElement && before.isConnected) before.focus(); }; }, []);
  useEffect(() => { if (operation.error && !operation.busy) alert.current?.focus(); }, [operation.error, operation.busy]);
  useEffect(() => { if (!dirty && !operation.busy) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, operation.busy]);
  function close() { if (!operation.pending.current && (!dirty || confirm("Discard unsaved list or view changes?"))) onClose(); }
  async function save(reload = false) {
    const parsed = CollectionFields.safeParse({ name, kind, rules: savedRules });
    if (!reload && !parsed.success) { operation.setError(parsed.error.issues[0].message); return; }
    if (reload && dirty && !confirm("Replace these changes with the saved list or view?")) return;
    const result = await operation.run(async signal => {
      const body = await collectionRequest(reload || initial ? `/${id}` : "", reload ? "GET" : initial ? "PATCH" : "POST", reload ? undefined : { ...parsed.data, ...(initial ? { version } : { id }) }, signal);
      const value = CollectionData.parse(body);
      if (value.id !== id || value.kind !== kind || (!reload && (value.name !== parsed.data!.name || JSON.stringify(value.rules) !== JSON.stringify(parsed.data!.rules)))) throw new Error("Unconfirmed response"); return value;
    });
    if (!result) return;
    if (reload) { setName(result.value.name); setRules(result.value.rules); setBaseline({ name: result.value.name, rules: result.value.rules }); setVersion(result.value.version); }
    else onSaved(result.value);
  }
  async function remove() {
    if (!confirm(`Delete this ${kind}? Contacts and their history will be kept.`)) return;
    const result = await operation.run(async signal => { if (await collectionRequest(`/${id}`, "DELETE", { version }, signal) !== null) throw new Error("Unconfirmed deletion"); });
    if (result) onDeleted?.();
  }
  return <dialog ref={dialog} className="contact-dialog" aria-labelledby="collection-title" onCancel={event => { event.preventDefault(); close(); }}><form noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
    <header><h2 id="collection-title">{initial ? `Edit ${kind}` : `Create ${kind}`}</h2><button className="btn" type="button" disabled={operation.busy} onClick={close} aria-label="Close list or view editor">Close</button></header>
    <fieldset disabled={operation.busy}><label htmlFor="collection-name">{kind === "list" ? "List name" : "View name"}</label><input ref={input} className="input" id="collection-name" value={name} maxLength={200} onChange={event => setName(event.target.value)} /></fieldset>
    <p className="muted">{kind === "view" ? `This view updates automatically using ${savedRules.conditions.length} saved conditions. Search text is not saved.` : "Lists contain contacts you add. Removing a list does not delete its contacts."}</p>
    {operation.error && <p role="alert" tabIndex={-1} ref={alert} className="contact-error">{operation.error}</p>}
    {operation.conflict && initial && <button className="btn" type="button" disabled={operation.busy} onClick={() => void save(true)}>Reload saved {kind}</button>}
    <footer>{initial && onDeleted && <button className="btn contact-delete" type="button" disabled={operation.busy} onClick={() => void remove()}>Delete {kind}</button>}<button className="btn" type="button" disabled={operation.busy} onClick={close}>Cancel</button><button className="btn primary" disabled={operation.busy || (!!initial && !dirty)}>{operation.busy ? "Saving…" : initial ? "Save" : `Create ${kind}`}</button></footer>
  </form></dialog>;
}
