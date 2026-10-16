"use client";
import { useEffect, useRef, useState } from "react";
import { BP } from "@/lib/basepath";
import { ContactPreferences, ContactSettingsData, parseContactExclusions, type ContactSettings as Settings } from "@/lib/contact-settings-validation";
import "./contact-settings.css";

export function ContactSettings({ initial }: { initial: Settings }) {
  const [saved, setSaved] = useState(initial), [enabled, setEnabled] = useState(initial.bookingEnabled), [text, setText] = useState(initial.exclusions.join(", "));
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState(""), [conflict, setConflict] = useState(false);
  const inFlight = useRef(false), mounted = useRef(false), abort = useRef<AbortController | null>(null), alert = useRef<HTMLParagraphElement>(null);
  const dirty = enabled !== saved.bookingEnabled || text !== saved.exclusions.join(", ");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); }; }, []);
  useEffect(() => { if (error && !busy) alert.current?.focus(); }, [error, busy]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const leave = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.href === location.href || event.metaKey || event.ctrlKey) return;
      if (inFlight.current || !confirm("Discard unsaved contact settings?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn); document.addEventListener("click", leave, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", leave, true); };
  }, [dirty, busy]);
  function reset(value: Settings) { setSaved(value); setEnabled(value.bookingEnabled); setText(value.exclusions.join(", ")); setError(""); setConflict(false); }
  async function request(reload = false) {
    if (inFlight.current) return;
    const parsed = ContactPreferences.safeParse({ bookingEnabled: enabled, exclusions: parseContactExclusions(text) });
    if (!reload && !parsed.success) { setError("Enter up to 100 valid domains or email addresses, separated by commas or spaces."); return; }
    if (reload && dirty && !confirm("Replace this draft with the saved contact settings?")) return;
    setBusy(true); inFlight.current = true; setError(""); setStatus("");
    const controller = new AbortController(); abort.current = controller; const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${BP}/api/settings/contacts`, { method: reload ? "GET" : "PATCH", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, ...(reload ? {} : { body: JSON.stringify({ ...parsed.data, version: saved.version }) }) });
      if (response.status === 401) throw new Error("Sign in again before saving contact settings.");
      if (response.status === 409) { if (mounted.current) setConflict(true); throw new Error("These settings changed elsewhere. Reload the saved settings before trying again."); }
      if (!response.ok) throw new Error("unconfirmed");
      const confirmed = ContactSettingsData.parse(await response.json());
      if (!reload && (confirmed.bookingEnabled !== parsed.data.bookingEnabled || JSON.stringify(confirmed.exclusions) !== JSON.stringify(parsed.data.exclusions) || confirmed.version < saved.version)) throw new Error("unconfirmed");
      if (mounted.current) { reset(confirmed); setStatus(reload ? "Saved settings loaded" : "Changes saved"); }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error && /^(Sign in|These settings)/.test(cause.message) ? cause.message : reload ? "Saved settings could not be loaded. Your draft is still here." : "Saving could not be confirmed. Your changes are still here. Try again.");
    } finally { clearTimeout(timeout); inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <form className="contact-settings" noValidate onSubmit={event => { event.preventDefault(); if (dirty) void request(); }}>
    <fieldset disabled={busy}><legend>Automatically add a new contact when</legend>
      <label className="contact-settings-check"><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); setStatus(""); setError(""); }} />Someone books a meeting with you via CalendlyIsDead</label>
      <p className="muted">Existing contacts and their meeting history are kept when this is turned off.</p>
      <label htmlFor="contact-exclusions">Exclude domains and email addresses</label>
      <textarea id="contact-exclusions" className="input" rows={5} maxLength={25500} value={text} aria-describedby="contact-exclusion-help"
        onChange={event => { setText(event.target.value); setStatus(""); setError(""); }} placeholder="company.com, name@company.com" />
      <p id="contact-exclusion-help" className="muted">Separate entries with commas or spaces. Domains include their subdomains. You can still add these contacts manually.</p>
    </fieldset>
    {error && <p ref={alert} role="alert" tabIndex={-1}>{error}</p>}
    {conflict && <button className="btn" type="button" disabled={busy} onClick={() => void request(true)}>Reload saved settings</button>}
    <div className="contact-settings-actions"><button className="btn primary" disabled={busy || !dirty}>{busy ? "Please wait…" : "Save changes"}</button>
      <button className="btn" type="button" disabled={busy || !dirty} onClick={() => { reset(saved); setStatus(""); }}>Cancel changes</button></div>
    <p role="status" aria-live="polite">{busy ? "Please wait…" : status}</p>
  </form>;
}
