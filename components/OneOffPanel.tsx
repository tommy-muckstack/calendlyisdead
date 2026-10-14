"use client";
import { useState } from "react";
type L = { id: string; slug: string; title: string; durationMin: number; used: boolean };
export function OneOffPanel({ username, bases, initial }: { username: string; bases: { id: string; title: string }[]; initial: L[] }) {
  const [links, setLinks] = useState(initial), [title, setTitle] = useState(""), [dur, setDur] = useState(30), [from, setFrom] = useState("");
  async function create() {
    const r = await fetch("/api/one-off", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, durationMin: dur, fromEventTypeId: from || undefined }) });
    const et = await r.json(); setLinks([{ id: et.id, slug: et.slug, title: et.title, durationMin: et.durationMin, used: false }, ...links]); setTitle("");
  }
  return <>
    <h1>One-off links</h1>
    <p className="muted">A private link that books exactly one meeting, then stops working.</p>
    <div className="card" style={{ padding: 18, maxWidth: 560 }}>
      <label className="f" htmlFor="oo-from">Copy settings from (optional)</label>
      <select id="oo-from" className="input" value={from} onChange={e => setFrom(e.target.value)}><option value="">Nothing, start fresh</option>{bases.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select>
      <label className="f" htmlFor="oo-title">Meeting name</label><input id="oo-title" className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Intro with Jordan" />
      <label className="f" htmlFor="oo-dur">Duration (minutes)</label><input id="oo-dur" className="input" type="number" min={5} value={dur} onChange={e => setDur(Number(e.target.value))} />
      <button className="btn primary" style={{ marginTop: 14 }} onClick={create}>Create one-off link</button>
    </div>
    <div style={{ marginTop: 18 }}>{links.map(l => <div key={l.id} className="card et" data-testid="one-off">
      <div style={{ flex: 1 }}><b>{l.title}</b><div className="muted" style={{ fontSize: 14 }}>{l.durationMin} min · {l.used ? "Used" : "Not used yet"} · /{username}/{l.slug}</div></div>
      <a className="btn" href={`/${username}/${l.slug}`} target="_blank">Open</a>
      <button className="btn" onClick={() => navigator.clipboard?.writeText(`${location.origin}/${username}/${l.slug}`)}>Copy link</button>
      <button className="btn danger" onClick={async () => { await fetch(`/api/one-off/${l.id}`, { method: "DELETE" }); setLinks(links.filter(x => x.id !== l.id)); }}>Remove</button>
    </div>)}</div>
  </>;
}
