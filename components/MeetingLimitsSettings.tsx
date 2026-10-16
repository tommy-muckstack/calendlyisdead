"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BP } from "@/lib/basepath";
import { LIMIT_FIELDS, LIMIT_LABELS, MeetingLimitsSchema, type MeetingLimits } from "@/lib/meeting-limits";

type Draft = Record<keyof MeetingLimits, string | null>;
const asDraft = (limits: MeetingLimits) => Object.fromEntries(LIMIT_FIELDS.map(field => [field, limits[field] === null ? null : String(limits[field])])) as Draft;
function changes(draft: Draft, saved: MeetingLimits, uncertain: Set<keyof MeetingLimits>): Partial<MeetingLimits> | null {
  const parsed = MeetingLimitsSchema.safeParse(Object.fromEntries(LIMIT_FIELDS.map(field => [field, draft[field] === null ? null : draft[field]?.trim() ? Number(draft[field]) : NaN])));
  if (!parsed.success) return null;
  const patch = Object.fromEntries(LIMIT_FIELDS.filter(field => uncertain.has(field) || parsed.data[field] !== saved[field]).map(field => [field, parsed.data[field]]));
  return Object.keys(patch).length ? patch : null;
}

export function MeetingLimitsSettings({ initial, timezone }: { initial: MeetingLimits; timezone: string }) {
  const [saved, setSaved] = useState(initial); const [draft, setDraft] = useState(() => asDraft(initial));
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  const [period, setPeriod] = useState<keyof MeetingLimits>("meetingLimitPerDay");
  const active = useRef(false), mounted = useRef(true), failed = useRef(false);
  const latest = useRef(draft), confirmed = useRef(initial);
  const uncertain = useRef(new Set<keyof MeetingLimits>());
  const persist = useCallback(async function save(patch: Partial<MeetingLimits>): Promise<void> {
    if (active.current || failed.current) return;
    active.current = true; if (mounted.current) setPending(true);
    for (const field of LIMIT_FIELDS) if (field in patch) uncertain.current.add(field);
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
    let success = false;
    try {
      const response = await fetch(`${BP}/api/settings/meeting-limits`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch), signal: controller.signal, keepalive: true });
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in again to save your meeting limits." : "save_failed");
      const result = await response.json();
      const values = MeetingLimitsSchema.parse(Object.fromEntries(LIMIT_FIELDS.map(field => [field, result?.[field]])));
      if (LIMIT_FIELDS.some(field => field in patch && values[field] !== patch[field])) throw new Error("unconfirmed_save");
      for (const field of LIMIT_FIELDS) if (field in patch) uncertain.current.delete(field);
      confirmed.current = { ...confirmed.current, ...patch }; success = true;
      if (mounted.current) setSaved(confirmed.current);
    } catch (cause) {
      failed.current = true;
      if (mounted.current) setError(cause instanceof Error && cause.message.startsWith("Sign in") ? cause.message : "Save could not be confirmed. Your changes are still here. Please retry.");
    } finally {
      clearTimeout(timeout); active.current = false;
      if (mounted.current) setPending(false);
      else if (success) {
        // Client navigation may unmount the page during a save. Finish the latest
        // valid queued edit in order, without cancelling the in-flight request.
        const remaining = changes(latest.current, confirmed.current, uncertain.current);
        if (remaining) void save(remaining);
      }
    }
  }, []);
  const flush = useCallback(() => { const patch = changes(latest.current, confirmed.current, uncertain.current); if (patch) void persist(patch); }, [persist]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; flush(); }; }, [flush]);
  const invalid = LIMIT_FIELDS.filter(field => draft[field] !== null &&
    (!draft[field]?.trim() || !MeetingLimitsSchema.shape[field].safeParse(Number(draft[field])).success));
  const dirty = pending || invalid.length > 0 || changes(draft, saved, uncertain.current) !== null;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { flush(); event.preventDefault(); event.returnValue = ""; };
    const leave = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.href === location.href || event.metaKey || event.ctrlKey) return;
      if (!window.confirm("Some meeting limit changes are not saved yet. Leave this page?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn); document.addEventListener("click", leave, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", leave, true); };
  }, [dirty, flush]);

  useEffect(() => {
    if (pending || error) return;
    const patch = changes(draft, saved, uncertain.current); if (!patch) return;
    const timer = setTimeout(() => { void persist(patch); }, 500);
    return () => clearTimeout(timer);
  }, [draft, saved, pending, error, retry, persist]);

  const change = (next: Draft) => { latest.current = next; failed.current = false; setDraft(next); setError(""); };
  const available = LIMIT_FIELDS.filter(field => draft[field] === null);
  const next = available.includes(period) ? period : available[0];
  return <section aria-labelledby="advanced-availability-title" style={{ maxWidth: 640 }}>
    <h1 id="advanced-availability-title">Advanced availability</h1>
    <h2>Meeting limits</h2>
    <p>Limit how many meetings can be booked with you across all event types.</p>
    <p className="muted">Changes save automatically. Limits use {timezone}; weeks start on Monday. Existing meetings stay booked.</p>
    {LIMIT_FIELDS.filter(field => draft[field] !== null).map(field => <div key={field} style={{ margin: "20px 0" }}>
      <label className="f" htmlFor={field}>{LIMIT_LABELS[field]} meeting limit</label>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <input id={field} className="input" type="number" min={1} max={2147483647} step={1} value={draft[field] ?? ""}
          style={{ width: 140, maxWidth: "100%" }} aria-invalid={invalid.includes(field) || undefined} aria-describedby={invalid.includes(field) ? `${field}-error` : undefined}
          onChange={event => change({ ...draft, [field]: event.target.value })} />
        <button className="btn" type="button" aria-label={`Remove ${LIMIT_LABELS[field].toLowerCase()} meeting limit`} onClick={() => change({ ...draft, [field]: null })}>Remove</button>
      </div>
      {invalid.includes(field) && <p id={`${field}-error`} role="alert">Enter a whole number from 1 to 2147483647.</p>}
    </div>)}
    {next && <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
      <label htmlFor="limit-period">Limit period</label>
      <select id="limit-period" className="input" style={{ width: "auto" }} value={next} onChange={event => setPeriod(event.target.value as keyof MeetingLimits)}>
        {available.map(field => <option key={field} value={field}>{LIMIT_LABELS[field]}</option>)}
      </select>
      <button className="btn" onClick={() => change({ ...draft, [next]: "" })}>+ Add a meeting limit</button>
    </div>}
    {LIMIT_FIELDS.every(field => draft[field] === null) && <p>No account meeting limits.</p>}
    <p role="status" aria-live="polite">{pending ? "Saving…" : error || invalid.length ? "Changes not saved" : dirty ? "Waiting to save…" : "All changes saved"}</p>
    {error && <div role="alert"><p>{error}</p><button className="btn" onClick={() => { failed.current = false; setError(""); setRetry(n => n + 1); }}>Retry saving</button></div>}
  </section>;
}
