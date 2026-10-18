"use client";
import { BP } from "@/lib/basepath";
import { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { pollParticipationError } from "@/lib/poll-participation";
export function PollVote({ id, tally, now: initialNow }: { id: string; tally: { option: string; count?: number; names?: string[] }[]; now: number }) {
  const [tz, setTz] = useState("UTC"), [now, setNow] = useState(initialNow);
  const [picks, setPicks] = useState<string[]>([]), [done, setDone] = useState(false), [err, setErr] = useState(""), [saving, setSaving] = useState(false);
  const inFlight = useRef(false), message = useRef<HTMLParagraphElement>(null);
  const activePicks = picks.filter(option => Date.parse(option) > now);
  useEffect(() => { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone); setNow(Date.now()); }, []);
  useEffect(() => {
    const next = Math.min(...tally.map(row => Date.parse(row.option)).filter(time => time > now));
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2_147_483_647, Math.max(1, next - Date.now())));
    return () => clearTimeout(timer);
  }, [now, tally]);
  useEffect(() => { if (done || err) message.current?.focus(); }, [done, err]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (inFlight.current) return;
    const fd = new FormData(e.currentTarget); inFlight.current = true; setSaving(true); setErr("");
    try {
      const response = await fetch(`${BP}/api/polls/${id}/vote`, { method: "POST", signal: AbortSignal.timeout(20_000), headers: { "content-type": "application/json" }, body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), picks: activePicks }) });
      const body = await response.json();
      if (response.ok && Array.isArray(body.picks)) setDone(true); else setErr(pollParticipationError(body.error));
    } catch { setErr("We couldn’t confirm your vote. Your choices are saved here; try sending the same vote again."); }
    finally { inFlight.current = false; setSaving(false); }
  }
  if (done) return <p data-testid="voted" role="status" tabIndex={-1} ref={message}>Thanks! Your vote is final. The organizer will book a time and send an invite.</p>;
  if (!tally.some(row => Date.parse(row.option) > now)) return <p data-testid="poll-closed" role="status">This poll is closed. The proposed times have passed.</p>;
  return <form onSubmit={submit} aria-busy={saving}>
    <p className="muted">Tick every time that works for you ({tz}). Votes cannot be changed after submission.</p>
    <fieldset disabled={saving} className="poll-vote-options"><legend>Times that work for you</legend>
      {tally.map(row => <div key={row.option} className="card poll-vote-option">
        <label className="row"><input type="checkbox" disabled={Date.parse(row.option) <= now} checked={activePicks.includes(row.option)} onChange={e => setPicks(e.target.checked ? [...picks, row.option] : picks.filter(x => x !== row.option))} />
          <span>{DateTime.fromISO(row.option).setZone(tz).toFormat("cccc, LLL d · h:mm a")}{Date.parse(row.option) <= now ? " (time passed)" : ""}</span></label>
        {row.count !== undefined && <details><summary>{row.count} {row.count === 1 ? "vote" : "votes"}</summary>{row.names?.length ? <ul>{row.names.map((name, index) => <li key={index}>{name}</li>)}</ul> : <p>No votes yet.</p>}</details>}
      </div>)}
      <label className="f" htmlFor="pv-name">Name</label><input className="input" id="pv-name" name="name" maxLength={200} autoComplete="name" required />
      <label className="f" htmlFor="pv-email">Email</label><input className="input" id="pv-email" name="email" type="email" maxLength={320} autoComplete="email" required />
    </fieldset>
    {err && <p className="poll-vote-error" role="alert" tabIndex={-1} ref={message}>{err}</p>}
    <button className="btn primary" style={{ marginTop: 14 }} disabled={saving || !activePicks.length}>{saving ? "Sending…" : "Send my vote"}</button>
  </form>;
}
