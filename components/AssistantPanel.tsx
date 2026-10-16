"use client";
import { BP } from "@/lib/basepath";
import { useState } from "react";
import { DateTime } from "luxon";
const SAMPLE = `From: Jordan Lee <jordan@example.com>
To: Demo Host <demo@calendlyisdead.local>
Subject: Re: Intro call

Hey! Would love to find 30 minutes next week. I'm on Pacific time.
Tuesday or Wednesday afternoon works best, or Thursday morning before 11.

Thanks,
Jordan`;
export function AssistantPanel({ types, llm }: { types: { slug: string; title: string; durationMin: number }[]; llm: boolean }) {
  const [thread, setThread] = useState(SAMPLE), [slug, setSlug] = useState(types[0]?.slug ?? ""), [r, setR] = useState<any>(null), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  async function run() {
    setBusy(true); setR(null);
    const res = await fetch(BP + "/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ thread, slug }) });
    setR(await res.json()); setBusy(false);
  }
  return <>
    <h2>Email assistant</h2>
    <p className="muted">Paste a scheduling thread. It reads who, how long, which days and what time zone, checks your real availability, and drafts a reply with one-click booking links. It never sends anything for you.
      {llm ? " Using your configured LLM." : " Running on the built-in parser (set LLM_API_KEY for an LLM)."}</p>
    <div className="card" style={{ padding: 18 }}>
      <label className="f" htmlFor="as-et">Book as</label>
      <select id="as-et" className="input" value={slug} onChange={e => setSlug(e.target.value)}>{types.map(t => <option key={t.slug} value={t.slug}>{t.title} ({t.durationMin} min)</option>)}</select>
      <label className="f" htmlFor="as-thread">Email thread</label>
      <textarea id="as-thread" className="input" rows={12} value={thread} onChange={e => setThread(e.target.value)} />
      <button className="btn primary" style={{ marginTop: 12 }} onClick={run} disabled={busy || !slug}>{busy ? "Reading…" : "Find times and draft reply"}</button>
    </div>
    {r && !r.error && <div className="card" style={{ padding: 18, marginTop: 16 }} data-testid="assistant-result">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="pill">{r.parsed.people.map((p: any) => p.name).join(", ") || "No other people found"}</span>
        <span className="pill">{r.parsed.durationMin ? `${r.parsed.durationMin} min asked` : "Length not mentioned"}</span>
        <span className="pill">{r.zone}</span><span className="pill">parser: {r.source}</span>
      </div>
      {r.durationMismatch && <p style={{ color: "var(--warn)" }}>They asked for {r.durationMismatch} min but &quot;{r.eventType.title}&quot; is {r.eventType.durationMin} min.</p>}
      <h3>Proposed times</h3>
      {r.slots.map((s: string, i: number) => <div key={s} className="row" style={{ justifyContent: "space-between", padding: "6px 0" }} data-testid="proposed">
        <span>{DateTime.fromISO(s).setZone(r.zone).toFormat("cccc, LLL d · h:mm a ZZZZ")}</span><a className="btn" href={r.links[i]} target="_blank">Book this</a></div>)}
      {!r.slots.length && <p className="muted">No overlap found in the next 3 weeks.</p>}
      <h3>Reply draft</h3>
      <pre className="code" data-testid="reply">{r.reply}</pre>
      <button className="btn" onClick={() => { navigator.clipboard?.writeText(r.reply); setCopied(true); }}>{copied ? "Copied" : "Copy reply"}</button>
    </div>}
    {r?.error && <p style={{ color: "var(--warn)" }}>Couldn&#39;t read that thread.</p>}
  </>;
}
