"use client";
import { BP } from "@/lib/basepath";
import { useEffect, useRef, useState } from "react";
type W = { id: string; name: string; trigger: string; offsetMin: number; channel: string; recipient: string; subject: string; body: string; eventTypeIds: string[]; active: boolean };
const TRIG: Record<string, string> = { on_booked: "When a meeting is booked", before_start: "Before the meeting starts", after_end: "After the meeting ends", on_cancelled: "When a meeting is cancelled" };

export function WorkflowsPanel({ initial, eventTypes, vars }: { initial: W[]; eventTypes: { id: string; title: string }[]; vars: string[] }) {
  const [list, setList] = useState(initial);
  return <>
    <div className="row" style={{ justifyContent: "space-between" }}><h1 style={{ margin: 0 }}>Workflows</h1>
      <button className="btn primary" onClick={async () => { const w = await (await fetch(BP + "/api/workflows", { method: "POST" })).json(); setList([...list, w]); }}>+ New workflow</button></div>
    <p className="muted">Automatic emails and texts around your meetings. Variables: {vars.map(v => <code key={v} style={{ marginRight: 6 }}>{`{{${v}}}`}</code>)}</p>
    {list.map(w => <WorkflowCard key={w.id} w={w} eventTypes={eventTypes} onDelete={() => setList(list.filter(x => x.id !== w.id))} />)}
  </>;
}
function WorkflowCard({ w, eventTypes, onDelete }: { w: W; eventTypes: { id: string; title: string }[]; onDelete(): void }) {
  const [d, setD] = useState(w); const [st, setSt] = useState(""); const t = useRef<any>(null), first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } clearTimeout(t.current); t.current = setTimeout(async () => {
    const { id, ...body } = d as any; delete body.userId;
    const r = await fetch(`${BP}/api/workflows/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setSt(r.ok ? "Saved" : (await r.json()).error === "sms_to_host_unsupported" ? "Texts go to invitees only" : "Check the fields"); }, 500); }, [d]);
  const timed = d.trigger === "before_start" || d.trigger === "after_end";
  return <div className="card" style={{ padding: 20, marginTop: 16 }} data-testid="workflow">
    <div className="row" style={{ justifyContent: "space-between" }}>
      <input className="input" aria-label="Workflow name" style={{ maxWidth: 360, fontWeight: 700 }} value={d.name} onChange={e => setD({ ...d, name: e.target.value })} />
      <span className="muted" role="status">{st}</span></div>
    <div className="row" style={{ flexWrap: "wrap", marginTop: 12 }}>
      <select className="input" aria-label="Trigger" style={{ width: 260 }} value={d.trigger} onChange={e => setD({ ...d, trigger: e.target.value })}>{Object.entries(TRIG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {timed && <><input className="input" aria-label="Offset hours" type="number" min={0} step={0.25} style={{ width: 110 }} value={d.offsetMin / 60} onChange={e => setD({ ...d, offsetMin: Math.round(Number(e.target.value) * 60) })} /><span className="muted">hours</span></>}
      <select className="input" aria-label="Channel" style={{ width: 120 }} value={d.channel} onChange={e => setD({ ...d, channel: e.target.value, recipient: e.target.value === "sms" ? "invitee" : d.recipient })}><option value="email">Email</option><option value="sms">Text (SMS)</option></select>
      <select className="input" aria-label="Recipient" style={{ width: 130 }} value={d.recipient} onChange={e => setD({ ...d, recipient: e.target.value })}><option value="invitee">Invitee</option>{d.channel === "email" && <option value="host">Me (host)</option>}</select>
      <label><input type="checkbox" checked={d.active} onChange={e => setD({ ...d, active: e.target.checked })} /> On</label>
    </div>
    {d.channel === "sms" && <p className="muted" style={{ fontSize: 13 }}>Texts go to the number from a Phone question on the event type. Without Twilio keys, texts are logged instead of sent.</p>}
    <div className="muted" style={{ fontSize: 13, margin: "12px 0 4px" }}>Applies to (none checked = all event types)</div>
    <div className="row" style={{ flexWrap: "wrap" }}>{eventTypes.map(e => <label key={e.id}><input type="checkbox" checked={d.eventTypeIds.includes(e.id)}
      onChange={x => setD({ ...d, eventTypeIds: x.target.checked ? [...d.eventTypeIds, e.id] : d.eventTypeIds.filter(y => y !== e.id) })} /> {e.title}</label>)}</div>
    {d.channel === "email" && <><label className="f">Subject</label><input className="input" aria-label="Subject" value={d.subject} onChange={e => setD({ ...d, subject: e.target.value })} /></>}
    <label className="f">Message</label><textarea className="input" aria-label="Message" rows={5} value={d.body} onChange={e => setD({ ...d, body: e.target.value })} />
    <button className="btn danger" style={{ marginTop: 10 }} onClick={async () => { if (confirm("Delete workflow?")) { await fetch(`${BP}/api/workflows/${d.id}`, { method: "DELETE" }); onDelete(); } }}>Delete</button>
  </div>;
}
