"use client";
import { BP, withBase } from "@/lib/basepath";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
type Conn = { id: string; provider: string; accountEmail: string; status: string };
type Cal = { id: string; connectionId: string; name: string; isPrimary: boolean; canWrite: boolean; checkConflicts: boolean };
const LABEL: Record<string, string> = { google: "Google Calendar", microsoft: "Outlook / Microsoft 365", caldav: "iCloud Calendar", mock: "Demo calendar" };

export function CalendarsPanel({ conns, cals: initialCals, addToId, available, flash, initialIcloud = false }: { conns: Conn[]; cals: Cal[]; addToId: string | null; available: { google: boolean; microsoft: boolean; mock: boolean }; flash: string; initialIcloud?: boolean }) {
  const router = useRouter();
  const [cals, setCals] = useState(initialCals);
  useEffect(() => setCals(initialCals), [initialCals]);
  const [msg, setMsg] = useState(flash); const [icloud, setIcloud] = useState(initialIcloud); const [busy, setBusy] = useState(false);
  const call = async (url: string, method: string, body?: unknown) => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(withBase(url), { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) setMsg("The calendar change couldn't be saved. Please try again.");
      else router.refresh();
      return r;
    } catch { setMsg("Couldn't reach the server. Check your connection and try again."); return null; }
    finally { setBusy(false); }
  };
  return <>
    <h2 style={{ marginTop: 0 }}>Calendars</h2>
    <p className="muted">Connect the calendars we should check so nobody books over your existing plans, and pick where new bookings go.</p>
    {msg && <p role="status" className="card" style={{ padding: 12 }}>{msg}</p>}
    <div className="row" style={{ flexWrap: "wrap", margin: "16px 0 24px" }}>
      <a className="btn" href={BP + "/api/integrations/google/connect"} aria-disabled={!available.google || busy} onClick={e => { if (!available.google || busy) { e.preventDefault(); if (!available.google) setMsg("New Google Calendar connections are unavailable on this deployment."); } }}>+ Google Calendar</a>
      <a className="btn" href={BP + "/api/integrations/microsoft/connect"} aria-disabled={!available.microsoft || busy} onClick={e => { if (!available.microsoft || busy) { e.preventDefault(); if (!available.microsoft) setMsg("New Outlook connections are unavailable on this deployment."); } }}>+ Outlook</a>
      <button className="btn" disabled={busy} onClick={() => setIcloud(!icloud)} aria-expanded={icloud} aria-controls="icloud-connection">+ iCloud</button>
      {available.mock && <button className="btn" disabled={busy} onClick={async () => { const r = await call("/api/integrations/mock", "POST"); if (r?.ok) setMsg("Connected demo calendar."); }}>+ Demo calendar</button>}
    </div>
    {icloud && <form id="icloud-connection" className="card" style={{ padding: 20, marginBottom: 24, maxWidth: 460 }} onSubmit={async e => {
      e.preventDefault(); const fd = new FormData(e.currentTarget);
      const r = await call("/api/integrations/caldav", "POST", { username: fd.get("username"), password: fd.get("password") });
      if (r?.ok) { setIcloud(false); setMsg("Connected iCloud."); } else if (r) setMsg("iCloud didn't accept that. Use your Apple ID email and an app-specific password."); }}>
      <b>Connect iCloud</b>
      <p className="muted" style={{ fontSize: 14 }}>Apple needs an app-specific password. Create one at <a href="https://account.apple.com" target="_blank" rel="noreferrer">account.apple.com</a> → Sign-In and Security → App-Specific Passwords. We store it encrypted.</p>
      <label className="f" htmlFor="ic-user">Apple ID email</label><input id="ic-user" name="username" className="input" type="email" required autoComplete="off" />
      <label className="f" htmlFor="ic-pass">App-specific password</label><input id="ic-pass" name="password" className="input" type="password" required autoComplete="off" placeholder="xxxx-xxxx-xxxx-xxxx" />
      <button className="btn primary" style={{ marginTop: 12 }} disabled={busy}>Connect</button>
    </form>}
    {conns.length > 0 && <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <label className="f" htmlFor="addto" style={{ marginTop: 0 }}>Add new bookings to</label>
      <select id="addto" className="input" style={{ maxWidth: 420 }} value={addToId ?? ""} disabled={busy} onChange={e => call("/api/calendars/add-to", "PUT", { calendarId: e.target.value || null })}>
        <option value="">Don&#39;t add to a calendar</option>
        {cals.filter(c => c.canWrite).map(c => <option key={c.id} value={c.id}>{c.name} ({LABEL[conns.find(x => x.id === c.connectionId)?.provider ?? ""] ?? ""})</option>)}
      </select>
    </div>}
    {conns.map(c => <div key={c.id} className="card" style={{ padding: 20, marginBottom: 12 }} data-testid="connection">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><b>{LABEL[c.provider] ?? c.provider}</b> <span className="muted">{c.accountEmail}</span>
          {c.status !== "ok" && <span style={{ color: "var(--warn)", marginLeft: 8 }}>{c.status === "reauth" ? "Needs reconnecting" : "Last sync failed"}</span>}</div>
        <button className="btn danger" disabled={busy} onClick={() => confirm("Disconnect this calendar?") && call(`/api/integrations/connections/${c.id}`, "DELETE")}>Disconnect</button>
      </div>
      <div className="muted" style={{ fontSize: 13, margin: "12px 0 4px" }}>Check these for conflicts</div>
      {cals.filter(x => x.connectionId === c.id).map(x => <label key={x.id} style={{ display: "block", padding: "4px 0" }}>
        <input type="checkbox" checked={x.checkConflicts} disabled={busy} onChange={async e => { const v = e.target.checked; setCals(l => l.map(y => y.id === x.id ? { ...y, checkConflicts: v } : y)); const r = await call(`/api/calendars/${x.id}`, "PATCH", { checkConflicts: v }); if (!r?.ok) setCals(l => l.map(y => y.id === x.id ? { ...y, checkConflicts: x.checkConflicts } : y)); }} /> {x.name}{x.isPrimary ? " (primary)" : ""}
      </label>)}
    </div>)}
  </>;
}
