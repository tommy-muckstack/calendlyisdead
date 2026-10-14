"use client";
import { useEffect, useRef, useState } from "react";
type ET = { id: string; slug: string; title: string; description: string; durationMin: number; location: string; color: string;
  bufferBeforeMin: number; bufferAfterMin: number; minNoticeMin: number; rangeDays: number; active: boolean;
  scheduleId: string | null; maxPerDay: number | null; maxPerWeek: number | null; questions: Q[] };
type Q = { id: string; label: string; type: "text" | "textarea" | "phone" | "select"; required: boolean; options?: string[] };

type Sch = { id: string; name: string };
export function EventTypesBoard({ initial, username, schedules }: { initial: ET[]; username: string; schedules: Sch[] }) {
  const [items, setItems] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const open = items.find(i => i.id === openId) ?? null;
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1400); };
  async function create() {
    const r = await fetch("/api/event-types", { method: "POST" }); const et = await r.json();
    setItems(x => [...x, et]); setOpenId(et.id);
  }
  return <>
    <div className="row" style={{ justifyContent: "space-between", marginBottom: 20 }}>
      <h1 style={{ margin: 0 }}>Event types</h1>
      <button className="btn primary" onClick={create}>+ New event type</button>
    </div>
    {items.map(et => <div key={et.id} className="card et" style={{ borderLeftColor: et.color, opacity: et.active ? 1 : .55 }} onClick={() => setOpenId(et.id)} data-testid="event-type">
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{et.title}</div>
        <div className="muted" style={{ fontSize: 14 }}>{et.durationMin} min · {et.location || "No location"} · One-on-one</div>
      </div>
      <button className="btn" onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(`${location.origin}/${username}/${et.slug}`); flash("Link copied"); }}>Copy link</button>
      <a className="btn" href={`/${username}/${et.slug}`} target="_blank" onClick={e => e.stopPropagation()}>View</a>
    </div>)}
    {open && <Editor key={open.id} et={open} username={username} schedules={schedules} onClose={() => setOpenId(null)}
      onChange={n => setItems(x => x.map(i => i.id === n.id ? n : i))} onSaved={() => flash("Saved")}
      onDelete={async () => { await fetch(`/api/event-types/${open.id}`, { method: "DELETE" }); setItems(x => x.filter(i => i.id !== open.id)); setOpenId(null); }} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </>;
}

function Editor({ et, username, schedules, onClose, onChange, onSaved, onDelete }: { et: ET; username: string; schedules: Sch[]; onClose(): void; onChange(e: ET): void; onSaved(): void; onDelete(): void }) {
  const [d, setD] = useState(et);
  const [sect, setSect] = useState<string>("basics");
  const [err, setErr] = useState("");
  const timer = useRef<any>(null), first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { id: _id, ...body } = d as any; delete body.userId; delete body.kind; if (!body.scheduleId) delete body.scheduleId;
      body.questions = (body.questions ?? []).filter((q: Q) => q.label.trim()).map((q: Q) => q.type === "select" ? { ...q, options: (q.options ?? []).filter(Boolean) } : { ...q, options: undefined });
      const r = await fetch(`/api/event-types/${et.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) { setErr(""); onChange(await r.json()); onSaved(); } else { const j = await r.json(); setErr(j.error === "slug_taken" ? "That link is already used" : "Check the highlighted values"); }
    }, 600);
    return () => clearTimeout(timer.current);
  }, [d]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);
  const set = (k: keyof ET) => (e: any) => setD({ ...d, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const S = ({ id, title, summary, children }: any) => <div className="sect">
    <button onClick={() => setSect(sect === id ? "" : id)} aria-expanded={sect === id}><span><b>{title}</b><small>{summary}</small></span><span>{sect === id ? "–" : "+"}</span></button>
    {sect === id && <div style={{ paddingBottom: 16 }}>{children}</div>}
  </div>;
  return <>
    <div className="scrim" onClick={onClose} />
    <aside className="pane" role="dialog" aria-label="Edit event type">
      <header><b>Edit event type</b><button className="btn" onClick={onClose} aria-label="Close">✕</button></header>
      <div className="body">
        {err && <p style={{ color: "var(--warn)" }}>{err}</p>}
        {S({ id: "basics", title: "Basics", summary: `${d.title} · ${d.durationMin} min`, children: <>
          <label className="f" htmlFor="et-title">Name</label><input id="et-title" className="input" value={d.title} onChange={set("title")} />
          <label className="f" htmlFor="et-dur">Duration (minutes)</label><input id="et-dur" className="input" type="number" min={5} value={d.durationMin} onChange={set("durationMin")} />
          <label className="f" htmlFor="et-color">Color</label><input id="et-color" type="color" value={d.color} onChange={set("color")} />
          <label className="f"><input type="checkbox" checked={d.active} onChange={set("active")} /> Accepting bookings</label></> })}
        {S({ id: "where", title: "Location", summary: d.location || "Not set", children: <>
          <input className="input" list="locs" value={d.location} onChange={set("location")} placeholder="Zoom, Google Meet, phone, an address…" />
          <datalist id="locs"><option>Google Meet</option><option>Zoom</option><option>Phone call</option><option>In person</option></datalist></> })}
        {S({ id: "link", title: "Link and description", summary: `/${username}/${d.slug}`, children: <>
          <label className="f" htmlFor="et-slug">Link</label><input id="et-slug" className="input" value={d.slug} onChange={e => setD({ ...d, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
          <label className="f" htmlFor="et-desc">Description</label><textarea id="et-desc" className="input" rows={4} value={d.description} onChange={set("description")} /></> })}
        {S({ id: "limits", title: "Limits and buffers", summary: `${d.minNoticeMin / 60}h notice · ${d.rangeDays} days ahead · buffers ${d.bufferBeforeMin}/${d.bufferAfterMin} min`, children: <>
          <label className="f" htmlFor="et-bb">Buffer before (min)</label><input id="et-bb" className="input" type="number" min={0} value={d.bufferBeforeMin} onChange={set("bufferBeforeMin")} />
          <label className="f" htmlFor="et-ba">Buffer after (min)</label><input id="et-ba" className="input" type="number" min={0} value={d.bufferAfterMin} onChange={set("bufferAfterMin")} />
          <label className="f" htmlFor="et-mn">Minimum notice (min)</label><input id="et-mn" className="input" type="number" min={0} value={d.minNoticeMin} onChange={set("minNoticeMin")} />
          <label className="f" htmlFor="et-rd">Bookable days into the future</label><input id="et-rd" className="input" type="number" min={1} value={d.rangeDays} onChange={set("rangeDays")} /></> })}
        {S({ id: "avail", title: "Availability", summary: `${schedules.find(x => x.id === d.scheduleId)?.name ?? "Default schedule"}${d.maxPerDay ? ` · max ${d.maxPerDay}/day` : ""}${d.maxPerWeek ? ` · max ${d.maxPerWeek}/week` : ""}`, children: <>
          <label className="f" htmlFor="et-sched">Schedule</label>
          <select id="et-sched" className="input" value={d.scheduleId ?? ""} onChange={e => setD({ ...d, scheduleId: e.target.value || null })}>
            <option value="">Default schedule</option>{schedules.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <label className="f" htmlFor="et-mpd">Max bookings per day (blank = no limit)</label>
          <input id="et-mpd" className="input" type="number" min={1} value={d.maxPerDay ?? ""} onChange={e => setD({ ...d, maxPerDay: e.target.value ? Number(e.target.value) : null })} />
          <label className="f" htmlFor="et-mpw">Max bookings per week (blank = no limit)</label>
          <input id="et-mpw" className="input" type="number" min={1} value={d.maxPerWeek ?? ""} onChange={e => setD({ ...d, maxPerWeek: e.target.value ? Number(e.target.value) : null })} /></> })}
        {S({ id: "questions", title: "Invitee questions", summary: `Name, email${(d.questions ?? []).length ? ` + ${(d.questions ?? []).length} more` : ""}`, children: <>
          {(d.questions ?? []).map((q, i) => { const up = (n: Partial<Q>) => setD({ ...d, questions: d.questions.map((x, j) => j === i ? { ...x, ...n } : x) });
            return <div key={q.id} className="card" style={{ padding: 12, marginBottom: 10 }} data-testid="question">
              <input aria-label={`Question ${i + 1}`} className="input" value={q.label} placeholder="Your question" onChange={e => up({ label: e.target.value })} />
              <div className="row" style={{ marginTop: 8 }}>
                <select aria-label={`Question ${i + 1} type`} className="input" style={{ width: 150 }} value={q.type} onChange={e => up({ type: e.target.value as Q["type"] })}>
                  <option value="text">Short answer</option><option value="textarea">Paragraph</option><option value="phone">Phone</option><option value="select">Choice</option></select>
                <label><input type="checkbox" checked={q.required} onChange={e => up({ required: e.target.checked })} /> Required</label>
                <button className="btn" aria-label="Remove question" onClick={() => setD({ ...d, questions: d.questions.filter((_, j) => j !== i) })}>✕</button>
              </div>
              {q.type === "select" && <input aria-label={`Question ${i + 1} choices`} className="input" style={{ marginTop: 8 }} placeholder="Choices, comma separated"
                value={(q.options ?? []).join(", ")} onChange={e => up({ options: e.target.value.split(",").map(x => x.trim()) })} />}
            </div>; })}
          <button className="btn" onClick={() => setD({ ...d, questions: [...(d.questions ?? []), { id: `q${Date.now().toString(36)}`, label: "", type: "text", required: false }] })}>+ Add question</button></> })}
        <p className="muted" style={{ fontSize: 13 }}>Changes save automatically.</p>
        <button className="btn danger" onClick={() => confirm("Delete this event type?") && onDelete()}>Delete event type</button>
      </div>
    </aside>
  </>;
}
