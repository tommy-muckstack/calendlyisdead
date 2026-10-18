"use client";
import { BP } from "@/lib/basepath";
import { useRouter } from "next/navigation";
import { PollBookingReview } from "./PollBookingReview";
import { useState } from "react";
import { DateTime } from "luxon";
import { pollParticipationError } from "@/lib/poll-participation";
import { PollVisibility } from "./PollVisibility";
type P = { id: string; title: string; status: string; showVotes: boolean; chosen: string | null; bookingUid: string | null; voters: number; tally: { option: string; count: number; names: string[]; best: boolean }[] };
export function PollsPanel({ initial, tz }: { initial: P[]; tz: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ id: string; option: string } | null>(null);
  const [title, setTitle] = useState("Team sync"), [dur, setDur] = useState(30), [loc, setLoc] = useState("Google Meet");
  const [opts, setOpts] = useState<string[]>(["", ""]), [err, setErr] = useState("");
  const [showVotes, setShowVotes] = useState(false), [creating, setCreating] = useState(false);
  const fmt = (iso: string) => DateTime.fromISO(iso).setZone(tz).toFormat("ccc LLL d, h:mm a");
  async function create() {
    if (creating) return; setErr(""); setCreating(true);
    const options = opts.filter(Boolean).map(o => DateTime.fromISO(o, { zone: tz }).toUTC().toISO());
    try {
      const r = await fetch(BP + "/api/polls", { method: "POST", signal: AbortSignal.timeout(20_000), headers: { "content-type": "application/json" }, body: JSON.stringify({ title, durationMin: dur, location: loc, options, showVotes }) });
      const body = await r.json(); if (r.ok && typeof body.id === "string") router.refresh(); else setErr(pollParticipationError(body.error));
    } catch { setErr("We couldn’t confirm the new poll. Refresh the list before trying again."); }
    finally { setCreating(false); }
  }
  return <>
    {selected && <PollBookingReview pollId={selected.id} option={selected.option} tz={tz} onClose={() => setSelected(null)} onBooked={() => { setSelected(null); router.refresh(); }} />}
    <h2>Meeting polls</h2>
    <p className="muted">Offer a few times, share the link, let people vote, then book the winner.</p>
    <div className="card" style={{ padding: 18, maxWidth: 560 }}>
      <label className="f" htmlFor="pl-title">Meeting name</label><input id="pl-title" className="input" value={title} onChange={e => setTitle(e.target.value)} />
      <label className="f" htmlFor="pl-dur">Duration (minutes)</label><input id="pl-dur" className="input" type="number" min={5} value={dur} onChange={e => setDur(Number(e.target.value))} />
      <label className="f" htmlFor="pl-loc">Location</label><input id="pl-loc" className="input" value={loc} onChange={e => setLoc(e.target.value)} />
      <label className="f">Times to offer ({tz})</label>
      {opts.map((o, i) => <input key={i} aria-label={`Option ${i + 1}`} className="input" style={{ marginBottom: 6 }} type="datetime-local" value={o} onChange={e => setOpts(opts.map((x, j) => j === i ? e.target.value : x))} />)}
      <button className="btn" disabled={opts.length >= 40 || creating} onClick={() => setOpts([...opts, ""])}>+ Add time</button>
      <p><label><input type="checkbox" checked={showVotes} disabled={creating} onChange={e => setShowVotes(e.target.checked)} /> Show votes on page</label></p>
      <p className="muted">When enabled, anyone with the link can see voter names and their selected times.</p>
      {err && <p role="alert" style={{ color: "var(--warn)" }}>{err}</p>}
      <div><button className="btn primary" disabled={creating} style={{ marginTop: 14 }} onClick={create}>{creating ? "Creating…" : "Create poll"}</button></div>
    </div>
    {initial.map(p => <div key={p.id} className="card" style={{ padding: 18, marginTop: 16 }} data-testid="poll">
      <div className="row" style={{ justifyContent: "space-between" }}><b>{p.title}</b><span className="pill">{p.status === "booked" ? "Booked" : p.status !== "open" ? "Closed" : `${p.voters} voted`}</span></div>
      <div className="muted" style={{ fontSize: 14, margin: "4px 0 10px" }}>Share: <a href={`${BP}/poll/${p.id}`} target="_blank">/poll/{p.id}</a></div>
      <PollVisibility id={p.id} showVotes={p.showVotes} open={p.status === "open"} />
      {p.tally.map(t => <div key={t.option} className="row" style={{ justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--line)" }}>
        <span>{t.best ? "★ " : ""}{fmt(t.option)} <span className="muted">· {t.count} {t.names.length ? `(${t.names.join(", ")})` : ""}</span></span>
        {p.status === "open" && <button className="btn" disabled={Date.parse(t.option) <= Date.now()} onClick={() => setSelected({ id: p.id, option: t.option })}>Book this time</button>}
        {p.chosen === t.option && <a className="btn" href={`${BP}/booking/${p.bookingUid}`}>View booking</a>}
      </div>)}
    </div>)}
  </>;
}
