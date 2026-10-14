"use client";
import { useEffect, useRef, useState } from "react";
type Field = { id: string; label: string; type: "text" | "email" | "select"; required: boolean; options?: string[] };
type Action = { type: "event" | "url" | "message"; value: string };
type Rule = { match: "all" | "any"; conditions: { fieldId: string; op: string; value: string }[]; action: Action };
type Form = { id: string; name: string; fields: Field[]; rules: Rule[]; fallback: Action; responses: number };
const OPS: Record<string, string> = { equals: "is", not_equals: "is not", contains: "contains", in: "is one of", gte: "≥", lte: "≤" };

export function RoutingPanel({ initial, targets }: { initial: Form[]; targets: { value: string; label: string }[] }) {
  const [list, setList] = useState(initial);
  return <>
    <div className="row" style={{ justifyContent: "space-between" }}><h1 style={{ margin: 0 }}>Routing forms</h1>
      <button className="btn primary" onClick={async () => { const f = await (await fetch("/api/forms", { method: "POST" })).json(); setList([...list, { ...f, responses: 0 }]); }}>+ New form</button></div>
    <p className="muted">Ask a few questions first, then send people to the right event type, a URL, or a message. Rules are checked top to bottom; the first match wins.</p>
    {list.map(f => <FormCard key={f.id} f={f} targets={targets} onDelete={() => setList(list.filter(x => x.id !== f.id))} />)}
  </>;
}

function ActionPicker({ a, onChange, targets, label }: { a: Action; onChange(a: Action): void; targets: { value: string; label: string }[]; label: string }) {
  return <div className="row" style={{ flexWrap: "wrap" }}>
    <select className="input" aria-label={`${label} type`} style={{ width: 170 }} value={a.type} onChange={e => onChange({ type: e.target.value as Action["type"], value: e.target.value === "event" ? targets[0]?.value ?? "" : "" })}>
      <option value="event">Book an event type</option><option value="url">Go to a URL</option><option value="message">Show a message</option></select>
    {a.type === "event" ? <select className="input" aria-label={`${label} event`} style={{ maxWidth: 320 }} value={a.value} onChange={e => onChange({ ...a, value: e.target.value })}>{targets.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
      : <input className="input" aria-label={`${label} value`} style={{ maxWidth: 420 }} value={a.value} placeholder={a.type === "url" ? "https://…" : "Message"} onChange={e => onChange({ ...a, value: e.target.value })} />}
  </div>;
}

function FormCard({ f, targets, onDelete }: { f: Form; targets: { value: string; label: string }[]; onDelete(): void }) {
  const [d, setD] = useState(f); const [st, setSt] = useState(""); const t = useRef<any>(null), first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } clearTimeout(t.current); t.current = setTimeout(async () => {
    const r = await fetch(`/api/forms/${d.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: d.name, fields: d.fields.map(x => x.type === "select" ? { ...x, options: (x.options ?? []).filter(Boolean) } : { ...x, options: undefined }), rules: d.rules, fallback: d.fallback }) });
    setSt(r.ok ? "Saved" : "Not saved: check URLs and choices"); }, 500); }, [d]);
  const setField = (i: number, n: Partial<Field>) => setD({ ...d, fields: d.fields.map((x, j) => j === i ? { ...x, ...n } : x) });
  const setRule = (i: number, n: Partial<Rule>) => setD({ ...d, rules: d.rules.map((x, j) => j === i ? { ...x, ...n } : x) });
  return <div className="card" style={{ padding: 20, marginTop: 16 }} data-testid="routing-form">
    <div className="row" style={{ justifyContent: "space-between" }}>
      <input className="input" aria-label="Form name" style={{ maxWidth: 340, fontWeight: 700 }} value={d.name} onChange={e => setD({ ...d, name: e.target.value })} />
      <span className="muted" role="status">{st}</span>
      <a className="btn" href={`/f/${d.id}`} target="_blank">Open form ↗</a></div>
    <p className="muted" style={{ fontSize: 13 }}>{f.responses} responses · share <code>/f/{d.id}</code></p>
    <h3>Questions</h3>
    {d.fields.map((x, i) => <div key={i} className="row" style={{ flexWrap: "wrap", marginBottom: 6 }}>
      <input className="input" aria-label={`Field ${i + 1} label`} style={{ maxWidth: 220 }} value={x.label} onChange={e => setField(i, { label: e.target.value })} />
      <input className="input" aria-label={`Field ${i + 1} key`} style={{ width: 110 }} value={x.id} onChange={e => setField(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} />
      <select className="input" aria-label={`Field ${i + 1} type`} style={{ width: 120 }} value={x.type} onChange={e => setField(i, { type: e.target.value as Field["type"] })}><option value="text">Text</option><option value="email">Email</option><option value="select">Choice</option></select>
      {x.type === "select" && <input className="input" aria-label={`Field ${i + 1} choices`} style={{ maxWidth: 240 }} placeholder="Choices, comma separated" value={(x.options ?? []).join(", ")} onChange={e => setField(i, { options: e.target.value.split(",").map(s => s.trim()) })} />}
      <label><input type="checkbox" checked={x.required} onChange={e => setField(i, { required: e.target.checked })} /> Required</label>
      <button className="btn" aria-label="Remove field" onClick={() => setD({ ...d, fields: d.fields.filter((_, j) => j !== i) })}>✕</button></div>)}
    <button className="btn" onClick={() => setD({ ...d, fields: [...d.fields, { id: `q${d.fields.length + 1}`, label: "New question", type: "text", required: false }] })}>+ Add question</button>
    <h3>Rules</h3>
    {d.rules.map((r, i) => <div key={i} className="card" style={{ padding: 12, marginBottom: 10 }} data-testid="rule">
      <div className="row"><b>If</b><select className="input" aria-label={`Rule ${i + 1} match`} style={{ width: 90 }} value={r.match} onChange={e => setRule(i, { match: e.target.value as Rule["match"] })}><option value="all">all</option><option value="any">any</option></select><span>of these are true</span>
        <span style={{ flex: 1 }} /><button className="btn" aria-label="Remove rule" onClick={() => setD({ ...d, rules: d.rules.filter((_, j) => j !== i) })}>✕</button></div>
      {r.conditions.map((c, k) => <div key={k} className="row" style={{ marginTop: 6 }}>
        <select className="input" aria-label={`Rule ${i + 1} condition ${k + 1} field`} style={{ width: 170 }} value={c.fieldId} onChange={e => setRule(i, { conditions: r.conditions.map((y, z) => z === k ? { ...y, fieldId: e.target.value } : y) })}>{d.fields.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        <select className="input" aria-label={`Rule ${i + 1} condition ${k + 1} operator`} style={{ width: 120 }} value={c.op} onChange={e => setRule(i, { conditions: r.conditions.map((y, z) => z === k ? { ...y, op: e.target.value } : y) })}>{Object.entries(OPS).map(([o, l]) => <option key={o} value={o}>{l}</option>)}</select>
        <input className="input" aria-label={`Rule ${i + 1} condition ${k + 1} value`} style={{ maxWidth: 200 }} value={c.value} onChange={e => setRule(i, { conditions: r.conditions.map((y, z) => z === k ? { ...y, value: e.target.value } : y) })} />
        <button className="btn" aria-label="Remove condition" onClick={() => setRule(i, { conditions: r.conditions.filter((_, z) => z !== k) })}>✕</button></div>)}
      <button className="btn" style={{ marginTop: 6 }} onClick={() => setRule(i, { conditions: [...r.conditions, { fieldId: d.fields[0]?.id ?? "", op: "equals", value: "" }] })}>+ Condition</button>
      <div style={{ marginTop: 8 }}><b>Then</b> <ActionPicker a={r.action} targets={targets} label={`Rule ${i + 1} action`} onChange={a => setRule(i, { action: a })} /></div>
    </div>)}
    <button className="btn" onClick={() => setD({ ...d, rules: [...d.rules, { match: "all", conditions: [{ fieldId: d.fields[0]?.id ?? "", op: "equals", value: "" }], action: targets[0] ? { type: "event", value: targets[0].value } : { type: "message", value: "" } }] })}>+ Add rule</button>
    <h3>Otherwise</h3><ActionPicker a={d.fallback} targets={targets} label="Fallback" onChange={a => setD({ ...d, fallback: a })} />
    <button className="btn danger" style={{ marginTop: 14 }} onClick={async () => { if (confirm("Delete form?")) { await fetch(`/api/forms/${d.id}`, { method: "DELETE" }); onDelete(); } }}>Delete form</button>
  </div>;
}
