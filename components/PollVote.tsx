"use client";
import { track, EVENTS } from "@/lib/posthog";
import { BP } from "@/lib/basepath";
import { useState } from "react";
import { DateTime } from "luxon";
export function PollVote({ id, tally }: { id: string; tally: { option: string; count: number }[] }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [picks, setPicks] = useState<string[]>([]), [done, setDone] = useState(false), [err, setErr] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    const r = await fetch(`${BP}/api/polls/${id}/vote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), picks }) });
    if (r.ok) { track(EVENTS.app_poll_voted, { options: picks.length }); setDone(true); } else setErr("Couldn't save your vote.");
  }
  if (done) return <p data-testid="voted">Thanks! The organizer will book a time and send an invite.</p>;
  return <form onSubmit={submit}>
    <p className="muted">Tick every time that works for you ({tz}).</p>
    {tally.map(t => <label key={t.option} className="card row" style={{ padding: 12, marginBottom: 8, cursor: "pointer" }}>
      <input type="checkbox" checked={picks.includes(t.option)} onChange={e => setPicks(e.target.checked ? [...picks, t.option] : picks.filter(x => x !== t.option))} />
      <span style={{ flex: 1 }}>{DateTime.fromISO(t.option).setZone(tz).toFormat("cccc, LLL d · h:mm a")}</span><span className="muted">{t.count} yes</span></label>)}
    <label className="f" htmlFor="pv-name">Name</label><input className="input" id="pv-name" name="name" required />
    <label className="f" htmlFor="pv-email">Email</label><input className="input" id="pv-email" name="email" type="email" required />
    {err && <p style={{ color: "var(--warn)" }}>{err}</p>}
    <button className="btn primary" style={{ marginTop: 14 }} disabled={!picks.length}>Send my vote</button>
  </form>;
}
