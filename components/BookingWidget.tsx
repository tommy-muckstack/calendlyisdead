"use client";
import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Props = { username: string; slug: string; host: string; title: string; durationMin: number; location: string; description: string; color: string;
  reschedule?: { uid: string; name: string; email: string; start: string } };
const ZONES: string[] = (Intl as any).supportedValuesOf?.("timeZone") ?? ["UTC"];

export function BookingWidget(p: Props) {
  const router = useRouter(), path = usePathname(), q = useSearchParams();
  const [tz, setTz] = useState(q.get("tz") ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const month = q.get("month") ?? DateTime.now().setZone(tz).toFormat("yyyy-MM");
  const date = q.get("date"), slot = q.get("slot");
  const [slots, setSlots] = useState<Record<string, string[]> | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const nav = (o: Record<string, string | null>) => {
    const s = new URLSearchParams(q.toString()); for (const [k, v] of Object.entries(o)) v === null ? s.delete(k) : s.set(k, v);
    router.push(`${path}?${s}`, { scroll: false });
  };
  const m = DateTime.fromFormat(month, "yyyy-MM", { zone: tz });
  useEffect(() => {
    setSlots(null);
    const from = m.startOf("month").toISODate(), to = m.endOf("month").toISODate();
    fetch(`/api/slots?user=${p.username}&slug=${p.slug}&from=${from}&to=${to}&tz=${encodeURIComponent(tz)}${p.reschedule ? `&exclude=${p.reschedule.uid}` : ""}`)
      .then(r => r.json()).then(j => setSlots(j.slots ?? {}));
  }, [month, tz]);
  const cells = useMemo(() => { const first = m.startOf("month"); const pad = first.weekday % 7; return [...Array(pad).fill(null), ...Array.from({ length: first.daysInMonth! }, (_, i) => first.plus({ days: i }))]; }, [month, tz]);
  const fmt = (iso: string, f: string) => DateTime.fromISO(iso).setZone(tz).toFormat(f);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr("");
    const fd = new FormData(e.currentTarget);
    const guests = String(fd.get("guests") ?? "").split(/[,\s]+/).filter(Boolean);
    const r = await fetch("/api/bookings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      username: p.username, slug: p.slug, start: slot, tz, name: fd.get("name"), email: fd.get("email"), notes: fd.get("notes"), guests, rescheduleUid: p.reschedule?.uid }) });
    const j = await r.json(); setBusy(false);
    if (r.ok) router.push(`/booking/${j.uid}?new=1`);
    else setErr(j.error === "slot_unavailable" ? "Someone just took that time. Pick another one." : "Please check your details and try again.");
  }

  return <div className="card bk">
    <section className="info">
      <div className="muted" style={{ fontWeight: 600 }}>{p.host}</div>
      <h1 style={{ margin: "6px 0 14px", fontSize: 26 }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: p.color, marginRight: 10 }} />{p.title}</h1>
      <div className="muted">◷ {p.durationMin} min</div>
      {p.location && <div className="muted" style={{ marginTop: 6 }}>📍 {p.location}</div>}
      {slot && <div style={{ marginTop: 10, fontWeight: 600 }}>▣ {fmt(slot, "h:mm a")} – {DateTime.fromISO(slot).plus({ minutes: p.durationMin }).setZone(tz).toFormat("h:mm a, cccc, LLLL d")}</div>}
      {p.reschedule && <div className="card" style={{ padding: 12, marginTop: 16, background: "var(--brand-soft)" }}>Moving your booking from <b>{fmt(p.reschedule.start, "ccc LLL d, h:mm a")}</b></div>}
      {p.description && <p style={{ whiteSpace: "pre-wrap" }}>{p.description}</p>}
    </section>
    {!slot ? <section className="pick">
      <div className="cal">
        <h2 style={{ marginTop: 0, fontSize: 20 }}>Pick a day</h2>
        <div className="row" style={{ justifyContent: "space-between", margin: "8px 0" }}>
          <button className="btn" aria-label="Previous month" disabled={m <= DateTime.now().setZone(tz).startOf("month")} onClick={() => nav({ month: m.minus({ months: 1 }).toFormat("yyyy-MM"), date: null })}>‹</button>
          <b data-testid="month-label">{m.toFormat("LLLL yyyy")}</b>
          <button className="btn" aria-label="Next month" onClick={() => nav({ month: m.plus({ months: 1 }).toFormat("yyyy-MM"), date: null })}>›</button>
        </div>
        <div className="grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="dow">{d}</div>)}
          {cells.map((c, i) => { if (!c) return <div key={i} />; const k = c.toISODate()!; const open = !!slots?.[k]?.length;
            return <button key={k} className={`day ${open ? "open" : ""} ${date === k ? "sel" : ""}`} disabled={!open} aria-label={c.toFormat("cccc, LLLL d")} onClick={() => { setChosen(null); nav({ date: k }); }}>{c.day}</button>; })}
        </div>
        {!slots && <p className="muted">Loading open times…</p>}
        <label className="f" htmlFor="tz">Time zone</label>
        <select id="tz" className="input" value={tz} onChange={e => { setTz(e.target.value); nav({ tz: e.target.value }); }}>{ZONES.map(z => <option key={z}>{z}</option>)}</select>
      </div>
      {date && <div className="times" data-testid="times">
        <b style={{ marginBottom: 4 }}>{DateTime.fromISO(date).toFormat("cccc, LLLL d")}</b>
        {(slots?.[date] ?? []).map(s => <div key={s} className={`slot ${chosen === s ? "chosen" : ""}`}>
          <button className="t" onClick={() => setChosen(s)}>{fmt(s, "h:mm a")}</button>
          {chosen === s && <button className="go" onClick={() => nav({ slot: s })}>Next</button>}
        </div>)}
        {slots && !(slots[date] ?? []).length && <p className="muted">No times left on this day.</p>}
      </div>}
    </section> : <section style={{ padding: 28, maxWidth: 520 }}>
      <button className="btn" onClick={() => nav({ slot: null })}>← Back</button>
      <h2 style={{ fontSize: 20 }}>Your details</h2>
      <form onSubmit={submit}>
        <label className="f" htmlFor="name">Name</label><input className="input" id="name" name="name" required defaultValue={p.reschedule?.name} />
        <label className="f" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" required defaultValue={p.reschedule?.email} />
        <label className="f" htmlFor="guests">Guest emails (optional)</label><input className="input" id="guests" name="guests" placeholder="comma separated" />
        <label className="f" htmlFor="notes">Anything to prepare?</label><textarea className="input" id="notes" name="notes" rows={4} />
        {err && <p style={{ color: "var(--warn)" }}>{err}</p>}
        <button className="btn primary" style={{ marginTop: 16 }} disabled={busy}>{p.reschedule ? "Confirm new time" : "Book it"}</button>
      </form>
    </section>}
  </div>;
}
