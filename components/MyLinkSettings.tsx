"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BP } from "@/lib/basepath";
import { MyLinkData, MyLinkPatch, type MyLink } from "@/lib/public-username";
import "./my-link-settings.css";

export function MyLinkSettings({ initial, base }: { initial: MyLink; base: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial), [draft, setDraft] = useState(initial.username ?? "");
  const [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  const inFlight = useRef(false), mounted = useRef(true), focusInput = useRef(false), alert = useRef<HTMLParagraphElement>(null), input = useRef<HTMLInputElement>(null);
  const dirty = draft !== (saved.username ?? ""), currentUrl = saved.username ? `${base}/${encodeURIComponent(saved.username)}` : "";
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  useEffect(() => { if (!busy && focusInput.current) { focusInput.current = false; input.current?.focus(); } }, [busy]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const leave = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.href === location.href || event.metaKey || event.ctrlKey) return;
      if (busy || !window.confirm("Discard your unsaved link changes?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn); document.addEventListener("click", leave, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", leave, true); };
  }, [dirty, busy]);
  async function request(reload = false) {
    if (inFlight.current || (!reload && (!dirty || conflict))) return;
    const parsed = MyLinkPatch.safeParse({ username: draft, expectedUsername: saved.username });
    if (!reload && !parsed.success) { setError(parsed.error.issues[0].message); return; }
    inFlight.current = true; setBusy(true); setError(""); setStatus("");
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${BP}/api/settings/my-link`, { method: reload ? "GET" : "PATCH", cache: "no-store", signal: controller.signal,
        ...(reload ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) }) });
      const result = await response.json();
      if (!response.ok) {
        if (result?.error === "link_changed" && mounted.current) setConflict(true);
        throw new Error(response.status === 401 ? "Sign in again before changing your link." : result?.error === "link_taken" ? "This link is already in use. Choose another link." : result?.error === "link_changed" ? "Your link changed in another session. Load the current link before editing again." : "request_failed");
      }
      const link = MyLinkData.parse(result);
      if (!reload && link.username !== parsed.data.username) throw new Error("unconfirmed_save");
      if (mounted.current) {
        setSaved(link); setDraft(link.username ?? ""); setConflict(false);
        setStatus(reload ? "Current link loaded." : "Changes saved. Share your new link and update your existing links and embeds.");
        focusInput.current = true; router.refresh();
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error && /^(Sign in|This link|Your link)/.test(cause.message) ? cause.message : reload ? "Your current link could not be loaded. Try again." : "Saving could not be confirmed. Your draft is still here. Try again.");
    } finally { clearTimeout(timeout); inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function copy() {
    setStatus(""); setError("");
    try { await navigator.clipboard.writeText(currentUrl); if (mounted.current) setStatus("Link copied."); }
    catch { if (mounted.current) setError("The link could not be copied. Select and copy the current link below."); }
  }
  return <form className="my-link-settings" onSubmit={event => { event.preventDefault(); void request(); }} noValidate aria-labelledby="my-link-title">
    <h3 id="my-link-title">Customize your link</h3>
    <p>Choose the address people use to reach your scheduling page.</p>
    <label htmlFor="my-link-username">Your link</label>
    <div className="my-link-field"><span>{base}/</span><input ref={input} id="my-link-username" className="input" value={draft} maxLength={60} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" disabled={busy}
      aria-describedby="my-link-help my-link-warning" onChange={event => { setDraft(event.target.value); setError(""); setStatus(""); }} /></div>
    <p id="my-link-help" className="muted">Use 1–60 lowercase letters, numbers or hyphens.</p>
    <p id="my-link-warning" className="my-link-warning">Changing this link also changes the event links under it. Old links won’t redirect. Update any links and embeds you’ve already shared.</p>
    {error && <p role="alert" tabIndex={-1} ref={alert}>{error}</p>}
    <div className="my-link-actions"><button className="btn primary" type="submit" disabled={busy || !dirty || conflict}>{busy ? conflict ? "Loading…" : "Saving…" : "Save changes"}</button>
      {conflict ? <button type="button" className="btn" disabled={busy} onClick={() => { void request(true); }}>Discard draft and load current link</button>
        : <button type="button" className="btn" disabled={busy || !dirty} onClick={() => { setDraft(saved.username ?? ""); setError(""); setStatus(""); input.current?.focus(); }}>Cancel changes</button>}
    </div>
    <p role="status" aria-live="polite">{busy ? conflict ? "Loading current link…" : "Saving…" : status}</p>
    {currentUrl && <div className="my-link-current"><span>Current link</span><a href={`${BP}/${encodeURIComponent(saved.username!)}`} target="_blank" rel="noreferrer">{currentUrl}</a>
      <button type="button" className="btn" disabled={busy} onClick={() => { void copy(); }}>Copy link</button></div>}
  </form>;
}
