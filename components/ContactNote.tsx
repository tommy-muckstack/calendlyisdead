"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { BP } from "@/lib/basepath";
import { EMPTY_NOTE, NoteData, NoteFields, type ContactNote as Note, type NoteDraft } from "@/lib/contact-note-validation";
const messages: Record<string, string> = { changed: "This note changed elsewhere. Reload the saved note before trying again.", creation_conflict: "This note was already created with different details. Close this editor and refresh the timeline.", not_found: "This note or contact is no longer available.", no_reminder: "This note no longer has a reminder.", unauthorized: "Sign in again before changing notes." };
const same = (a: NoteDraft, b: NoteDraft) => a.title === b.title && a.body === b.body && a.reminderDate === b.reminderDate;
export function ContactNoteEditor({ contactId, initial, emailAvailable, onClose, onSaved }: { contactId: string; initial?: Note; emailAvailable: boolean; onClose(): void; onSaved(note: Note): void }) {
  const [id] = useState(() => initial?.id ?? crypto.randomUUID()), [draft, setDraft] = useState<NoteDraft>(() => initial ? NoteFields.parse(initial) : { ...EMPTY_NOTE });
  const [baseline, setBaseline] = useState(draft), [version, setVersion] = useState(initial?.version ?? 1), [reminder, setReminder] = useState(!!initial?.reminderDate);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), title = useRef<HTMLInputElement>(null), alert = useRef<HTMLParagraphElement>(null), pending = useRef(false), active = useRef(false), abort = useRef<AbortController | null>(null);
  const dirty = !same(draft, baseline) || reminder !== !!baseline.reminderDate;
  useEffect(() => { active.current = true; const before = document.activeElement, panel = dialog.current; panel?.showModal(); title.current?.focus(); return () => { active.current = false; abort.current?.abort(); panel?.close(); if (before instanceof HTMLElement && before.isConnected) before.focus(); }; }, []);
  useEffect(() => { if (error && !busy) alert.current?.focus(); }, [error, busy]);
  useEffect(() => { if (!dirty && !busy) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty, busy]);
  function close() { if (!pending.current && (!dirty || confirm("Discard unsaved note changes?"))) onClose(); }
  async function save(reload = false) {
    if (pending.current) return; const parsed = NoteFields.safeParse(draft);
    if (!reload && (!parsed.success || (reminder && !draft.reminderDate))) { setError(!parsed.success ? parsed.error.issues[0].message : "Choose a reminder date."); return; }
    if (reload && dirty && !confirm("Replace this draft with the saved note?")) return;
    pending.current = true; setBusy(true); setError(""); const controller = new AbortController(); abort.current = controller; const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const method = reload ? "GET" : initial ? "PATCH" : "POST", response = await fetch(`${BP}/api/contacts/${contactId}/notes${method === "POST" ? "" : `/${id}`}`, { method, signal: controller.signal, headers: { "Content-Type": "application/json" }, ...(reload ? {} : { body: JSON.stringify({ ...parsed.data, ...(initial ? { action: "edit", version } : { id }) }) }) });
      const body = await response.json(); if (!response.ok) { if (active.current) setConflict(body.error === "changed"); throw new Error(messages[body.error] ?? "unconfirmed"); }
      const saved = NoteData.parse(body); if (saved.id !== id || saved.contactId !== contactId || (!reload && !same(saved, parsed.data!))) throw new Error("unconfirmed");
      if (!active.current) return;
      if (reload) { const data = NoteFields.parse(saved); setDraft(data); setBaseline(data); setVersion(saved.version); setReminder(!!data.reminderDate); setConflict(false); } else onSaved(saved);
    } catch (cause) { if (active.current) setError(cause instanceof Error && Object.values(messages).includes(cause.message) ? cause.message : "The save could not be confirmed. Your note is still here. Try again."); }
    finally { clearTimeout(timeout); pending.current = false; if (active.current) setBusy(false); }
  }
  return <dialog ref={dialog} className="contact-dialog" aria-labelledby="contact-note-title" onCancel={event => { event.preventDefault(); close(); }}><form noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
    <header><h2 id="contact-note-title">{initial ? "Edit note" : "Add note"}</h2><button className="btn" type="button" disabled={busy} onClick={close} aria-label="Close note editor">Close</button></header>
    <fieldset disabled={busy}><label htmlFor="note-title">Title</label><input className="input" id="note-title" ref={title} value={draft.title} maxLength={200} onChange={event => setDraft({ ...draft, title: event.target.value })} />
      <label htmlFor="note-body">Note</label><textarea className="input" id="note-body" rows={7} maxLength={10000} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} />
      {reminder ? <div className="contact-note-reminder"><label htmlFor="note-reminder-date">Reminder date</label><input className="input" id="note-reminder-date" type="date" value={draft.reminderDate ?? ""} onChange={event => setDraft({ ...draft, reminderDate: event.target.value || null })} /><button className="btn" type="button" onClick={() => { setReminder(false); setDraft({ ...draft, reminderDate: null }); }}>Remove reminder</button></div> : <button className="btn" type="button" onClick={() => setReminder(true)}>Add reminder</button>}
    </fieldset>
    {reminder && <p className="muted">{emailAvailable ? "Reminder summaries are emailed at 5:00 a.m. in your account time zone." : "Email reminders are unavailable here. Due reminders remain on your Reminders page."}</p>}
    {error && <p className="contact-error" role="alert" tabIndex={-1} ref={alert}>{error}</p>}{conflict && <button type="button" className="btn" disabled={busy} onClick={() => void save(true)}>Reload saved note</button>}
    <footer><button className="btn" type="button" disabled={busy} onClick={close}>Cancel</button><button className="btn primary" disabled={busy || (!!initial && !dirty)}>{busy ? "Saving…" : "Save"}</button></footer>
  </form></dialog>;
}
export function ContactNoteComposer({ contactId, emailAvailable }: { contactId: string; emailAvailable: boolean }) {
  const [open, setOpen] = useState(false), router = useRouter(); return <><button className="btn" onClick={() => setOpen(true)}>Add note</button>{open && <ContactNoteEditor contactId={contactId} emailAvailable={emailAvailable} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); router.refresh(); }} />}</>;
}
export function ContactNoteCard({ initial, timezone, today, emailAvailable, initialOpen = false }: { initial: Note; timezone: string; today: string; emailAvailable: boolean; initialOpen?: boolean }) {
  const [note, setNote] = useState(initial), [open, setOpen] = useState(initialOpen), [deleted, setDeleted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState(false);
  const router = useRouter(), pending = useRef(false), active = useRef(false), abort = useRef<AbortController | null>(null), alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; abort.current?.abort(); }; }, []);
  useEffect(() => { if (error && !busy) alert.current?.focus(); }, [error, busy]);
  async function change(action: "complete" | "delete" | "reload") {
    if (pending.current || (action === "delete" && !confirm("Delete this note? It cannot be recovered."))) return;
    pending.current = true; setBusy(true); setError(""); const controller = new AbortController(); abort.current = controller; const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${BP}/api/contacts/${note.contactId}/notes/${note.id}`, { method: action === "reload" ? "GET" : action === "delete" ? "DELETE" : "PATCH", signal: controller.signal, headers: { "Content-Type": "application/json" }, ...(action === "reload" ? {} : { body: JSON.stringify({ version: note.version, ...(action === "complete" ? { action } : {}) }) }) });
      if (action === "delete" && response.status === 204) { if (active.current) { setDeleted(true); router.refresh(); } return; }
      const body = await response.json(); if (!response.ok) { if (active.current) setConflict(body.error === "changed"); throw new Error(messages[body.error] ?? "unconfirmed"); }
      if (action === "delete") throw new Error("unconfirmed"); const saved = NoteData.parse(body);
      if (saved.id !== note.id || saved.contactId !== note.contactId || (action === "complete" && (!saved.completedAt || saved.reminderDate !== note.reminderDate))) throw new Error("unconfirmed");
      if (active.current) { setNote(saved); setConflict(false); if (action !== "reload") router.refresh(); }
    } catch (cause) { if (active.current) setError(cause instanceof Error && Object.values(messages).includes(cause.message) ? cause.message : "The change could not be confirmed. Try again."); }
    finally { clearTimeout(timeout); pending.current = false; if (active.current) setBusy(false); }
  }
  if (deleted) return <p role="status">Note deleted.</p>;
  return <article id={`note-${note.id}`} className="contact-note" aria-label={note.title || "Contact note"}><header><div>{note.title && <h4>{note.title}</h4>}<time dateTime={note.updatedAt}>{note.updatedAt !== note.createdAt ? "Updated " : "Created "}{DateTime.fromISO(note.updatedAt).setZone(timezone).toFormat("LLL d, yyyy · h:mm a")}</time></div>
    <details className="contact-columns"><summary className="btn" aria-label={`Manage note ${note.title || "without title"}`}>⋮</summary><button className="btn" disabled={busy} onClick={() => setOpen(true)}>Edit</button><button className="btn contact-delete" disabled={busy} onClick={() => void change("delete")}>Delete</button></details></header>
    {note.body && <p className="contact-note-body">{note.body}</p>}{note.reminderDate && <div className="contact-note-reminder"><span>{note.completedAt ? "Complete" : note.reminderDate < today ? "Overdue" : note.reminderDate === today ? "Due today" : "Reminder"} · <time dateTime={note.reminderDate}>{note.reminderDate}</time></span>{!note.completedAt && <button className="btn" disabled={busy} onClick={() => void change("complete")}>{busy ? "Saving…" : "Complete"}</button>}</div>}
    {error && <p ref={alert} role="alert" tabIndex={-1} className="contact-error">{error}</p>}{conflict && <button className="btn" disabled={busy} onClick={() => void change("reload")}>Reload saved note</button>}
    {open && <ContactNoteEditor initial={note} contactId={note.contactId} emailAvailable={emailAvailable} onClose={() => setOpen(false)} onSaved={saved => { setNote(saved); setOpen(false); router.refresh(); }} />}
  </article>;
}
