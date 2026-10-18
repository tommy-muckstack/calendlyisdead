"use client";
import { track, trackNow, EVENTS } from "@/lib/posthog";
import { BP, withBase } from "@/lib/basepath";
import { useState } from "react";
type F = { id: string; label: string; type: "text" | "email" | "select"; required: boolean; options?: string[] };
export function PublicForm({ id, name, fields }: { id: string; name: string; fields: F[] }) {
  const [msg, setMsg] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  if (msg) return <><h1 style={{ marginTop: 0 }}>Thanks</h1><p data-testid="form-message">{msg}</p></>;
  return <form onSubmit={async e => { e.preventDefault(); setBusy(true); setErr("");
    const fd = new FormData(e.currentTarget); const answers = Object.fromEntries(fields.map(f => [f.id, String(fd.get(f.id) ?? "")]));
    const r = await fetch(`${BP}/api/forms/${id}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) }); const j = await r.json(); setBusy(false);
    if (!r.ok) return setErr("Please check the highlighted answers.");
    await trackNow(EVENTS.app_routing_form_submitted, { routed: j.redirect ? "redirect" : "message" });
    if (j.redirect) location.href = withBase(j.redirect); else setMsg(j.message); }}>
    <h1 style={{ marginTop: 0 }}>{name}</h1>
    {fields.map(f => <div key={f.id}><label className="f" htmlFor={`f_${f.id}`}>{f.label}{f.required ? " *" : ""}</label>
      {f.type === "select" ? <select className="input" id={`f_${f.id}`} name={f.id} required={f.required} defaultValue=""><option value="" disabled>Choose one</option>{(f.options ?? []).map(o => <option key={o}>{o}</option>)}</select>
        : <input className="input" id={`f_${f.id}`} name={f.id} type={f.type === "email" ? "email" : "text"} required={f.required} />}</div>)}
    {err && <p style={{ color: "var(--warn)" }}>{err}</p>}
    <button className="btn primary" style={{ marginTop: 16 }} disabled={busy}>Continue</button>
  </form>;
}
