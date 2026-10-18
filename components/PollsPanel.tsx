"use client";
import { track, trackNow, EVENTS } from "@/lib/posthog";
import { BP } from "@/lib/basepath";
import { useState } from "react";
import { DateTime } from "luxon";
type P = { id: string; title: string; status: string; chosen: string | null; bookingUid: string | null; voters: number; tally: { option: string; count: number; names: string[]; best: boolean }[] };
export function PollsPanel({ initial, tz }: { initial: P[]; tz: string }) {
  const [title, setTitle] = useState("Team sync"), [dur, setDur] = useState(30), [loc, setLoc] = useState("Google Meet");
  const [opts, setOpts] = useState<string[]>(["", ""]), [err, setErr] = useState("");
  const fmt = (iso: string) => DateTime.fromISO(iso).setZone(tz).toFormat("ccc LLL d, h:mm a");
  async function create() {
    setErr("");
    const options = opts.filter(Boolean).map(o => DateTime.fromISO(o, { zone: tz }).toUTC().toISO());
    const r = await fetch(BP + "/api/polls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, durationMin: dur, location: loc, options }) });
    if (r.ok) { await trackNow(EVENTS.app_poll_created, { options: options.length, duration_min: dur }); location.reload(); } else setErr("Add at least two times.");
  }
  async function book(id: string, option: string) {
    const r = await fetch(`${BP}/api/polls/${id}/book`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ option }) });
    if (r.ok) { await trackNow(EVENTS.app_poll_booked); location.reload(); } else setErr("That time is no longer free.");
  }
  return <>
    <h2>Meeting polls</h2>
    <p className="muted">Offer a few times, share the link, let people vote, then book the winner.</p>
    <div className="card" style={{ padding: 18, maxWidth: 560 }}>
      <label className="f" htmlFor="pl-title">Meeting name</label><input id="pl-title" className="input" value={title} onChange={e => setTitle(e.target.value)} />
      <label className="f" htmlFor="pl-dur">Duration (minutes)</label><input id="pl-dur" className="input" type="number" min={5} value={dur} onChange={e => setDur(Number(e.target.value))} />
      <label className="f" htmlFor="pl-loc">Location</label><input id="pl-loc" className="input" value={loc} onChange={e => setLoc(e.target.value)} />
      <label className="f">Times to offer ({tz})</label>
      {opts.map((o, i) => <input key={i} aria-label={`Option ${i + 1}`} className="input" style={{ marginBottom: 6 }} type="datetime-local" value={o} onChange={e => setOpts(opts.map((x, j) => j === i ? e.target.value : x))} />)}
      <button className="btn" onClick={() => setOpts([...opts, ""])}>+ Add time</button>
      {err && <p style={{ color: "var(--warn)" }}>{err}</p>}
      <div><button className="btn primary" style={{ marginTop: 14 }} onClick={create}>Create poll</button></div>
    </div>
    {initial.map(p => <div key={p.id} className="card" style={{ padding: 18, marginTop: 16 }} data-testid="poll">
      <div className="row" style={{ justifyContent: "space-between" }}><b>{p.title}</b><span className="pill">{p.status === "booked" ? "Booked" : `${p.voters} voted`}</span></div>
      <div className="muted" style={{ fontSize: 14, margin: "4px 0 10px" }}>Share: <a href={`${BP}/poll/${p.id}`} target="_blank">/poll/{p.id}</a></div>
      {p.tally.map(t => <div key={t.option} className="row" style={{ justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--line)" }}>
        <span>{t.best ? "★ " : ""}{fmt(t.option)} <span className="muted">· {t.count} {t.names.length ? `(${t.names.join(", ")})` : ""}</span></span>
        {p.status === "open" && t.count > 0 && <button className="btn" onClick={() => book(p.id, t.option)}>Book this time</button>}
        {p.chosen === t.option && <a className="btn" href={`${BP}/booking/${p.bookingUid}`}>View booking</a>}
      </div>)}
    </div>)}
  </>;
}
