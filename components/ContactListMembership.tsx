"use client";
import { useEffect, useRef, useState } from "react";
import { CollectionData, MembershipResult, type ContactCollection, type ContactSelectionScope } from "@/lib/contact-list-validation";
import { ContactCollectionEditor, collectionRequest, useListOperation } from "./ContactCollectionEditor";
export function ContactListMembership({ collections, current, selection, count, onClose, onSaved, onBusy, onRefresh }: { collections: ContactCollection[]; current?: ContactCollection; selection: { ids: string[] } | { scope: ContactSelectionScope }; count: number; onClose(): void; onSaved(message: string): void; onBusy(value: boolean): void; onRefresh(): void }) {
  const [lists, setLists] = useState(collections.filter(value => value.kind === "list")), [targetId, setTargetId] = useState(current?.id ?? collections.find(value => value.kind === "list")?.id ?? ""), [create, setCreate] = useState(false);
  const operation = useListOperation(), dialog = useRef<HTMLDialogElement>(null), alert = useRef<HTMLParagraphElement>(null), requestId = useRef<string | null>(null);
  const action = current ? "remove" : "add", target = lists.find(value => value.id === targetId);
  useEffect(() => { const before = document.activeElement, panel = dialog.current; panel?.showModal(); return () => { panel?.close(); if (before instanceof HTMLElement && before.isConnected) before.focus(); }; }, []);
  useEffect(() => { onBusy(operation.busy); return () => onBusy(false); }, [operation.busy, onBusy]);
  useEffect(() => { if (operation.error && !operation.busy) alert.current?.focus(); }, [operation.error, operation.busy]);
  async function reload() {
    const result = await operation.run(async signal => CollectionData.array().parse(await collectionRequest("", "GET", undefined, signal)));
    if (result) { setLists(result.value.filter(list => list.kind === "list")); requestId.current = null; }
  }
  async function save() {
    if (!target || operation.pending.current) return; requestId.current ??= crypto.randomUUID();
    const result = await operation.run(async signal => {
      const value = MembershipResult.parse(await collectionRequest(`/${target.id}/members`, "POST", { id: requestId.current, version: target.version, action, ...selection }, signal));
      if (value.id !== requestId.current || value.collectionId !== target.id || value.action !== action || ("ids" in selection && value.selectedCount !== selection.ids.length)) throw new Error("Unconfirmed membership"); return value;
    });
    if (result) onSaved(`${result.value.changedCount} contacts ${action === "add" ? "added to" : "removed from"} ${target.name}. ${result.value.selectedCount} contacts checked.`);
  }
  return <dialog ref={dialog} className="contact-dialog" aria-labelledby="membership-title" onCancel={event => { event.preventDefault(); if (!operation.pending.current) onClose(); }}><form onSubmit={event => { event.preventDefault(); void save(); }}>
    <header><h2 id="membership-title">{current ? "Remove from list" : "Add to list"}</h2><button className="btn" type="button" disabled={operation.busy} onClick={onClose} aria-label="Close list selection">Close</button></header>
    <p>{count} contacts selected. {"scope" in selection ? "The action includes all contacts matching this selection when you confirm, across every page." : "Only the checked contacts are included."}</p>
    {current ? <p>Remove the selected contacts from <strong>{current.name}</strong>? Their details, history and other lists will be kept.</p> : <fieldset disabled={operation.busy}><label htmlFor="membership-list">List<select className="input" id="membership-list" value={targetId} onChange={event => { setTargetId(event.target.value); requestId.current = null; }}>{!target && <option value="">Choose a list</option>}{lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label><button className="btn" type="button" onClick={() => setCreate(true)}>+ Create new list</button></fieldset>}
    {operation.error && <p role="alert" tabIndex={-1} ref={alert} className="contact-error">{operation.error}</p>}{operation.conflict && <><button className="btn" type="button" disabled={operation.busy} onClick={() => void reload()}>Reload lists</button><button className="btn" type="button" disabled={operation.busy} onClick={onRefresh}>Clear selection and refresh</button></>}
    <footer><button className="btn" type="button" disabled={operation.busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={operation.busy || !target}>{operation.busy ? "Saving…" : current ? "Remove from list" : "Add to list"}</button></footer>
  </form>{create && <ContactCollectionEditor kind="list" onClose={() => setCreate(false)} onSaved={saved => { setLists([...lists, saved]); setTargetId(saved.id); requestId.current = null; setCreate(false); }} />}</dialog>;
}
