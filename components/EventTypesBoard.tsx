"use client";
import { BP } from "@/lib/basepath";
import { useEffect, useRef, useState } from "react";
type ET = { id: string; slug: string; title: string; description: string; durationMin: number; location: string; color: string;
  bufferBeforeMin: number; bufferAfterMin: number; minNoticeMin: number; rangeDays: number; active: boolean;
  scheduleId: string | null; maxPerDay: number | null; maxPerWeek: number | null; questions: Q[];
  kind: string; seats: number; managedParentId: string | null; lockedFields: string[]; priceCents: number; currency: string; redirectUrl: string | null };
type Q = { id: string; label: string; type: "text" | "textarea" | "phone" | "select"; required: boolean; options?: string[] };

type Sch = { id: string; name: string };
export function EventTypesBoard({ initial, username, schedules, owner }: { initial: ET[]; username: string; schedules: Sch[]; owner?: string }) {
  const [items, setItems] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const open = items.find(i => i.id === openId) ?? null;
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1400); };
  async function create() {
    const r = await fetch(BP + "/api/event-types", { method: "POST" }); const et = await r.json();
    setItems(x => [...x, et]); setOpenId(et.id);
  }
  useEffect(() => { const f = () => create(); addEventListener("cid:create-event-type", f); if (new URLSearchParams(location.search).get("new")) { history.replaceState(null, "", location.pathname); create(); } return () => removeEventListener("cid:create-event-type", f); }, []);
  const [q, setQ] = useState("");
  const shown = items.filter(i => !q || i.title.toLowerCase().includes(q.toLowerCase()));
  const sched = schedules.find(x => x.id === (shown[0]?.scheduleId ?? ""))?.name;
  return <>
    <div className="cs-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg><input placeholder="Search event types" aria-label="Search event types" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="cs-grp"><span className="cs-av">{(owner || username)[0]?.toUpperCase()}</span><b>{owner || username}</b>
      <a href={`${BP}/${username}`} target="_blank">View landing page <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></svg></a></div>
    {shown.map(et => <div key={et.id} className="cs-et" style={{ borderLeftColor: et.color, opacity: et.active ? 1 : .55 }} onClick={() => setOpenId(et.id)} data-testid="event-type">
      <input type="checkbox" aria-label={`Select ${et.title}`} onClick={e => e.stopPropagation()} />
      <div style={{ flex: 1 }}>
        <h3>{et.title}</h3>
        <p>{!et.location && <span className="cs-dot" />}{et.durationMin} min • {et.location || "No location set"} • {et.kind === "group" ? `Group (${et.seats} seats)` : "One-on-One"}{et.managedParentId ? " • Managed by your team" : ""}</p>
        <p>{sched ? `${sched}` : "Weekdays, 9 am - 5 pm"}</p>
      </div>
      <button className="cs-btn cs-outline" onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(`${location.origin}${BP}/${username}/${et.slug}`); flash("Link copied"); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>Copy link</button>
      <a className="cs-ibtn" aria-label={`View ${et.title}`} href={`${BP}/${username}/${et.slug}`} target="_blank" onClick={e => e.stopPropagation()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></svg></a>
    </div>)}
    {open && <Editor key={open.id} et={open} username={username} schedules={schedules} onClose={() => setOpenId(null)}
      onChange={n => setItems(x => x.map(i => i.id === n.id ? n : i))} onSaved={() => flash("Saved")}
      onDelete={async () => { await fetch(`${BP}/api/event-types/${open.id}`, { method: "DELETE" }); setItems(x => x.filter(i => i.id !== open.id)); setOpenId(null); }} />}
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
      const KEYS = ["title", "slug", "description", "durationMin", "location", "color", "bufferBeforeMin", "bufferAfterMin", "minNoticeMin", "rangeDays", "active", "scheduleId", "maxPerDay", "maxPerWeek", "questions", "kind", "seats", "priceCents", "currency", "redirectUrl"];
      const body: any = Object.fromEntries(KEYS.filter(k => k in d && !(d.lockedFields ?? []).includes(k)).map(k => [k, (d as any)[k]]));
      if (d.managedParentId) delete body.kind;
      if (body.questions) body.questions = body.questions.filter((q: Q) => q.label.trim()).map((q: Q) => q.type === "select" ? { ...q, options: (q.options ?? []).filter(Boolean) } : { ...q, options: undefined });
      const r = await fetch(`${BP}/api/event-types/${et.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) { setErr(""); onChange(await r.json()); onSaved(); } else { const j = await r.json(); setErr(j.error === "slug_taken" ? "That link is already used" : "Check the highlighted values"); }
    }, 600);
    return () => clearTimeout(timer.current);
  }, [d]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);
  const L = (k: string) => (d.lockedFields ?? []).includes(k) && !!d.managedParentId;
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
        {d.managedParentId && <p className="card" style={{ padding: 10, background: "var(--brand-soft)", fontSize: 14 }}>Your team manages this event type. Locked: {(d.lockedFields ?? []).join(", ") || "nothing"}.</p>}
        {S({ id: "basics", title: "Basics", summary: `${d.title} · ${d.durationMin} min`, children: <>
          <label className="f" htmlFor="et-title">Name</label><input id="et-title" disabled={L("title")} className="input" value={d.title} onChange={set("title")} />
          <label className="f" htmlFor="et-dur">Duration (minutes)</label><input id="et-dur" disabled={L("durationMin")} className="input" type="number" min={5} value={d.durationMin} onChange={set("durationMin")} />
          <label className="f" htmlFor="et-color">Color</label><input id="et-color" disabled={L("color")} type="color" value={d.color} onChange={set("color")} />
          {!d.managedParentId && <><label className="f" htmlFor="et-kind">Type</label>
          <select id="et-kind" className="input" value={d.kind} onChange={e => setD({ ...d, kind: e.target.value })}><option value="one_on_one">One-on-one</option><option value="group">Group (several invitees per time)</option></select></>}
          {d.kind === "group" && <><label className="f" htmlFor="et-seats">Seats per time</label><input id="et-seats" className="input" type="number" min={1} value={d.seats} onChange={set("seats")} /></>}
          <label className="f"><input type="checkbox" checked={d.active} onChange={set("active")} /> Accepting bookings</label></> })}
        {S({ id: "where", title: "Location", summary: d.location || "Not set", children: <>
          <input className="input" list="locs" aria-label="Location" disabled={L("location")} value={d.location} onChange={set("location")} placeholder="Zoom, Google Meet, phone, an address…" />
          <datalist id="locs"><option>Google Meet</option><option>Zoom</option><option>Phone call</option><option>In person</option></datalist></> })}
        {S({ id: "link", title: "Link and description", summary: `/${username}/${d.slug}`, children: <>
          <label className="f" htmlFor="et-slug">Link</label><input id="et-slug" className="input" value={d.slug} onChange={e => setD({ ...d, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
          <label className="f" htmlFor="et-desc">Description</label><textarea id="et-desc" disabled={L("description")} className="input" rows={4} value={d.description} onChange={set("description")} /></> })}
        {S({ id: "limits", title: "Limits and buffers", summary: `${d.minNoticeMin / 60}h notice · ${d.rangeDays} days ahead · buffers ${d.bufferBeforeMin}/${d.bufferAfterMin} min`, children: <>
          <label className="f" htmlFor="et-bb">Buffer before (min)</label><input id="et-bb" disabled={L("bufferBeforeMin")} className="input" type="number" min={0} value={d.bufferBeforeMin} onChange={set("bufferBeforeMin")} />
          <label className="f" htmlFor="et-ba">Buffer after (min)</label><input id="et-ba" disabled={L("bufferAfterMin")} className="input" type="number" min={0} value={d.bufferAfterMin} onChange={set("bufferAfterMin")} />
          <label className="f" htmlFor="et-mn">Minimum notice (min)</label><input id="et-mn" disabled={L("minNoticeMin")} className="input" type="number" min={0} value={d.minNoticeMin} onChange={set("minNoticeMin")} />
          <label className="f" htmlFor="et-rd">Bookable days into the future</label><input id="et-rd" disabled={L("rangeDays")} className="input" type="number" min={1} value={d.rangeDays} onChange={set("rangeDays")} /></> })}
        {S({ id: "avail", title: "Availability", summary: `${schedules.find(x => x.id === d.scheduleId)?.name ?? "Default schedule"}${d.maxPerDay ? ` · max ${d.maxPerDay}/day` : ""}${d.maxPerWeek ? ` · max ${d.maxPerWeek}/week` : ""}`, children: <>
          <label className="f" htmlFor="et-sched">Schedule</label>
          <select id="et-sched" className="input" value={d.scheduleId ?? ""} onChange={e => setD({ ...d, scheduleId: e.target.value || null })}>
            <option value="">Default schedule</option>{schedules.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <label className="f" htmlFor="et-mpd">Max bookings per day (blank = no limit)</label>
          <input id="et-mpd" disabled={L("maxPerDay")} className="input" type="number" min={1} value={d.maxPerDay ?? ""} onChange={e => setD({ ...d, maxPerDay: e.target.value ? Number(e.target.value) : null })} />
          <label className="f" htmlFor="et-mpw">Max bookings per week (blank = no limit)</label>
          <input id="et-mpw" disabled={L("maxPerWeek")} className="input" type="number" min={1} value={d.maxPerWeek ?? ""} onChange={e => setD({ ...d, maxPerWeek: e.target.value ? Number(e.target.value) : null })} /></> })}
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
        {S({ id: "pay", title: "Payment and confirmation", summary: `${d.priceCents ? `${(d.priceCents / 100).toFixed(2)} ${d.currency.toUpperCase()}` : "Free"}${d.redirectUrl ? " · redirects after booking" : ""}`, children: <>
          <label className="f" htmlFor="et-price">Price (0 = free)</label>
          <input id="et-price" className="input" type="number" min={0} step="0.01" value={(d.priceCents ?? 0) / 100} onChange={e => setD({ ...d, priceCents: Math.round(Number(e.target.value || 0) * 100) })} />
          <label className="f" htmlFor="et-cur">Currency</label>
          <select id="et-cur" className="input" value={d.currency ?? "usd"} onChange={e => setD({ ...d, currency: e.target.value })}>{["usd", "eur", "gbp", "cad", "aud"].map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}</select>
          <p className="muted" style={{ fontSize: 13 }}>Payments go through Stripe Checkout when STRIPE_SECRET_KEY is set; otherwise a demo checkout is shown.</p>
          <label className="f" htmlFor="et-redirect">Redirect after booking (optional)</label>
          <input id="et-redirect" className="input" placeholder="https://example.com/thanks" value={d.redirectUrl ?? ""} onChange={e => setD({ ...d, redirectUrl: e.target.value.trim() || null })} /></> })}
        <p className="muted" style={{ fontSize: 13 }}>Changes save automatically.</p>
        {!d.managedParentId && <button className="btn danger" onClick={() => confirm("Delete this event type?") && onDelete()}>Delete event type</button>}
      </div>
    </aside>
  </>;
}
