"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BP } from "@/lib/basepath";
import { CONTACT_LABELS } from "@/lib/contact-validation";
import { CSV_BYTES, csvLine, parseContactCSV } from "@/lib/contact-csv";
import { ImportRequest, ImportResult, type ImportInput, type TransferResult } from "@/lib/contact-transfer-validation";
import { ContactFieldData, type ContactField, type FieldSource } from "@/lib/contact-field-validation";
import { ContactFieldEditor } from "./ContactFieldEditor";
import { ContactEditorButton } from "./ContactEditor";

export function ContactImport({ fields: initial, sources, onClose }: { fields: ContactField[]; sources: FieldSource[]; onClose(): void }) {
  const [id] = useState(() => crypto.randomUUID()), [csv, setCSV] = useState(""), [rows, setRows] = useState<string[][]>([]), [mapping, setMapping] = useState<string[]>([]);
  const [fields, setFields] = useState(initial), [creating, setCreating] = useState(false), [policy, setPolicy] = useState<ImportInput["policy"]>("merge");
  const [step, setStep] = useState<"upload" | "map" | "duplicates" | "review">("upload"), [result, setResult] = useState<TransferResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [uncertain, setUncertain] = useState(false), [showIssues, setShowIssues] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null), alert = useRef<HTMLParagraphElement>(null), active = useRef(false), pending = useRef(false), abort = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; const before = document.activeElement, panel = dialog.current; panel?.showModal(); heading.current?.focus(); return () => { active.current = false; abort.current?.abort(); panel?.close(); if (before instanceof HTMLElement && before.isConnected) before.focus(); }; }, []);
  useEffect(() => { if (!busy) { if (error) alert.current?.focus(); else heading.current?.focus(); } }, [step, error, busy, result]);
  useEffect(() => { if ((!csv && !busy) || result?.committed) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [csv, busy, result]);
  function close() { if (!pending.current && (result?.committed || !csv || confirm(uncertain ? "The import may have completed. Close without confirming its result?" : "Discard this import? Custom fields already created will remain."))) onClose(); }
  async function upload(file?: File) {
    if (!file || pending.current) return; pending.current = true; setBusy(true); setError("");
    try {
      if (file.size > CSV_BYTES) throw new Error("Choose a CSV file smaller than 2 MB.");
      const value = await file.text(), parsed = parseContactCSV(value), used = new Set<string>();
      if (!active.current) return;
      setCSV(value); setRows(parsed); setMapping(parsed[0].map(label => {
        const clean = label.trim().toLowerCase(), options = [...Object.entries(CONTACT_LABELS), ...fields.map(f => [f.id, f.name])];
        const key = options.find(([key, name]) => !used.has(key) && (name.toLowerCase() === clean || key.toLowerCase() === clean))?.[0] ?? ""; if (key) used.add(key); return key;
      })); setStep("map"); setResult(null);
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : "The file could not be read."); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  async function review(commit = false) {
    if (pending.current) return;
    const input = ImportRequest.safeParse({ id, csv, mapping, policy, ...(commit ? { preview: result?.preview } : {}) });
    if (!input.success) { setError(input.error.issues[0].message); return; }
    if (commit && (!result || result.committed)) return;
    pending.current = true; setBusy(true); setError(""); if (commit) setUncertain(true);
    const controller = new AbortController(); abort.current = controller; const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${BP}/api/contacts/import`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify(input.data) });
      const body = await response.json();
      if (!response.ok) { if (active.current && response.status < 500) { setUncertain(false); if (response.status === 409) setResult(null); } throw new Error(typeof body.error === "string" ? body.error : "The import could not be confirmed. Try again."); }
      const saved = ImportResult.parse(body);
      if (saved.id !== id || saved.rows.length !== rows.length - 1 || saved.rows.some((r, i) => r.row !== i + 2) || (commit && (!saved.committed || saved.preview !== result?.preview))) throw new Error("The import result could not be confirmed. Try again.");
      if (active.current) { setResult(saved); setStep("review"); setUncertain(false); }
    } catch (cause) { if (active.current) setError(cause instanceof Error && cause.name === "Error" ? cause.message : "The import could not be confirmed. Your file and mapping are still here. Try again."); }
    finally { clearTimeout(timeout); pending.current = false; if (active.current) setBusy(false); }
  }
  async function reloadFields() {
    setCreating(false); if (pending.current) return; pending.current = true; setBusy(true);
    const controller = new AbortController(); abort.current = controller; const timeout = setTimeout(() => controller.abort(), 15000);
    try { const response = await fetch(`${BP}/api/contact-fields`, { signal: controller.signal }); if (!response.ok) throw new Error(); const body = await response.json(), saved = ContactFieldData.array().parse(body.fields); if (active.current) setFields(saved); }
    catch { if (active.current) setError("The field was saved, but the field list could not be refreshed. Reload fields to continue."); }
    finally { clearTimeout(timeout); pending.current = false; if (active.current) setBusy(false); }
  }
  function downloadSkipped() {
    if (!result) return;
    const body = "\uFEFF" + csvLine([...rows[0], "Import issue"]) + result.rows.filter(row => row.status === "skipped").map(row => csvLine([...rows[row.row - 1], row.issues.join("; ")])).join("");
    const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" })), link = document.createElement("a"); link.href = url; link.download = "skipped-contacts.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const skipped = result?.rows.filter(row => row.status === "skipped").length ?? 0, issues = result?.rows.filter(row => row.status !== "skipped" && row.issues.length) ?? [];
  return <dialog ref={dialog} className="contact-dialog contact-import" aria-labelledby="contact-import-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 ref={heading} tabIndex={-1} id="contact-import-title">{result?.committed ? "Import complete" : "Import contacts from a file"}</h2><button className="btn" disabled={busy} onClick={close} aria-label="Close contact import">Close</button></header>
    {!result?.committed && <p className="muted">{step === "upload" ? "1. Upload CSV" : step === "map" ? "2. Map your fields" : step === "duplicates" ? "3. Choose how to handle duplicates" : "4. Review import"}</p>}
    <fieldset disabled={busy || uncertain}>
      {step === "upload" && <><label htmlFor="contact-csv-file">CSV file</label><input id="contact-csv-file" type="file" accept=".csv,text/csv" onChange={event => void upload(event.target.files?.[0])} /><p>Include Name and Email address. Up to 1,000 contacts, 50 columns and 2 MB per file.</p></>}
      {step === "map" && <><p>Match each column to a contact field. Name and Email address are required.</p><div className="contact-csv-mapping">{rows[0]?.map((label, index) => <div key={index}><label htmlFor={`csv-column-${index}`}>{label}<small>Example: {rows[1][index] || "(empty)"}</small></label><select id={`csv-column-${index}`} className="input" value={mapping[index]} onChange={event => setMapping(mapping.map((value, i) => i === index ? event.target.value : value))}>
        <option value="">Exclude this field</option>{Object.entries(CONTACT_LABELS).map(([key, name]) => <option key={key} value={key} disabled={mapping.includes(key) && mapping[index] !== key}>{name}</option>)}{fields.map(field => <option key={field.id} value={field.id} disabled={mapping.includes(field.id) && mapping[index] !== field.id}>{field.name} (custom)</option>)}
      </select></div>)}</div><p className="muted">Dates: YYYY-MM-DD. Numbers and currency: plain decimals. Multi-select: a JSON list of option names.</p><button className="btn" onClick={() => setCreating(true)}>Create a custom field</button><button className="btn" onClick={() => void reloadFields()}>Reload fields</button></>}
      {step === "duplicates" && <><legend>Duplicate contacts</legend>{([ ["merge", "Merge with existing contact", "Fill empty fields; keep existing non-empty information."], ["overwrite", "Overwrite with new information from the form", "Replace mapped fields, including blank values. Keep unmapped fields."], ["skip", "Skip and don’t import this contact", "Keep existing contacts unchanged."] ] as const).map(([value, label, help]) => <label className="contact-import-policy" key={value}><input type="radio" name="duplicate-policy" value={value} checked={policy === value} onChange={() => setPolicy(value)} /><span>{label}<small>{help}</small></span></label>)}<p>Contacts match by email address. Repeated email addresses within this file are skipped after the first valid row.</p></>}
    </fieldset>
    {step === "review" && result && <><p role="status">{result.rows.length - skipped} contacts {result.committed ? "imported" : "to import"}; {skipped} skipped; {issues.length} with field issues.</p><div className="contacts-table-wrap" tabIndex={0} role="region" aria-label="Import results"><table className="contacts-table"><thead><tr><th>Row</th><th>Contact</th><th>Result</th><th>Issues</th></tr></thead><tbody>{result.rows.filter(row => !showIssues || (row.status !== "skipped" && row.issues.length)).map(row => <tr key={row.row}><td>{row.row}</td><td>{result.committed && row.contactId ? <Link href={`/app/contacts/${row.contactId}`}>{rows[row.row - 1][mapping.indexOf("name")]}</Link> : rows[row.row - 1][mapping.indexOf("name")]}</td><td>{row.status}</td><td>{row.issues.join("; ") || "—"}</td></tr>)}</tbody></table></div>
      {skipped > 0 && <button className="btn" onClick={downloadSkipped}>Download skipped contacts</button>}{issues.length > 0 && <button className="btn" onClick={() => setShowIssues(!showIssues)}>{showIssues ? "View all results" : "View contacts with issues"}</button>}</>}
    {error && <p className="contact-error" role="alert" tabIndex={-1} ref={alert}>{error}</p>}
    <footer>{result?.committed ? <button className="btn primary" onClick={onClose}>View contacts</button> : <>
      {step !== "upload" && <button className="btn" disabled={busy || uncertain} onClick={() => { setError(""); setResult(null); setStep(step === "map" ? "upload" : step === "duplicates" ? "map" : "duplicates"); }}>Back</button>}
      {step === "map" && <button className="btn primary" disabled={busy} onClick={() => { const parsed = ImportRequest.safeParse({ id, csv, mapping, policy }); if (parsed.success) { setError(""); setStep("duplicates"); } else setError(parsed.error.issues[0].message); }}>Continue</button>}
      {(step === "duplicates" || (step === "review" && !result)) && <button className="btn primary" disabled={busy} onClick={() => void review()}>{busy ? "Reviewing…" : "Review import"}</button>}
      {step === "review" && result && <button className="btn primary" disabled={busy} onClick={() => void review(true)}>{busy ? "Importing…" : uncertain ? "Confirm import result" : "Import contacts"}</button>}
    </>}</footer>
    {creating && <ContactFieldEditor sources={sources} onClose={() => setCreating(false)} onSaved={() => void reloadFields()} />}
  </dialog>;
}
export function ContactAddMenu({ fields, sources }: { fields: ContactField[]; sources: FieldSource[] }) {
  const [open, setOpen] = useState(false), router = useRouter();
  return <><details className="contact-columns"><summary className="btn primary">+ Add contact</summary><ContactEditorButton label="Create a contact" /><button className="btn" onClick={() => setOpen(true)}>Import contacts from a file</button></details>
    {open && <ContactImport fields={fields} sources={sources} onClose={() => { setOpen(false); router.refresh(); }} />}</>;
}
