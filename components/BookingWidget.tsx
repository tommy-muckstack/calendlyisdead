"use client";
import { BP } from "@/lib/basepath";
import { loadSlotCalendar, readBookingQuery, type SlotCalendar } from "@/lib/booking-client";
import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ProfileAvatar } from "./ProfileAvatar";

type Props = { username: string; embed?: boolean; price?: string; seatsLeftNote?: string; kindLabel?: string; slug: string; host: string; hostImage?: string | null; title: string; durationMin: number; location: string; description: string; color: string; lockedTimezone?: string | null;
  reschedule?: { uid: string; name: string; email: string; start: string };
  questions: { id: string; label: string; type: "text" | "textarea" | "phone" | "select"; required: boolean; options?: string[] }[] };
const ZONES: string[] = (Intl as any).supportedValuesOf?.("timeZone") ?? ["UTC"];

export function BookingWidget(p: Props) {
  const router = useRouter(), path = usePathname(), q = useSearchParams();
  const { tz, month, date, slot, invalid } = readBookingQuery(q, Intl.DateTimeFormat().resolvedOptions().timeZone, DateTime.utc(), p.lockedTimezone);
  const zones = [...new Set(["UTC", tz, ...ZONES])];
  const [availability, setAvailability] = useState<{ url: string; slots: SlotCalendar | null; error: string; reload?: boolean }>({ url: "", slots: null, error: "" });
  const [retry, setRetry] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const nav = (o: Record<string, string | null>) => {
    const s = new URLSearchParams(q.toString()); for (const [k, v] of Object.entries({ tz, month, date, slot, ...o })) v === null ? s.delete(k) : s.set(k, v);
    router.push(`${path}?${s}`, { scroll: false });
  };
  const m = DateTime.fromFormat(month, "yyyy-MM", { zone: tz });
  const availabilityUrl = `${BP}/api/slots?${new URLSearchParams({ user: p.username, slug: p.slug,
    from: m.startOf("month").toISODate() ?? "", to: m.endOf("month").toISODate() ?? "", tz,
    ...(p.reschedule ? { exclude: p.reschedule.uid } : {}) })}`;
  const slots = availability.url === availabilityUrl ? availability.slots : null;
  const availabilityError = availability.url === availabilityUrl ? availability.error : "";
  const zoneChanged = availability.url === availabilityUrl && !!availability.reload;
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const failed = () => setAvailability({ url: availabilityUrl, slots: null, error: "We couldn’t load available times. Please try again." });
    setAvailability({ url: availabilityUrl, slots: null, error: "" });
    setChosen(null);
    const timeout = setTimeout(() => { if (active) failed(); controller.abort(); }, 20_000);
    loadSlotCalendar(availabilityUrl, controller.signal, tz).then(slots => {
      if (active && !controller.signal.aborted) setAvailability({ url: availabilityUrl, slots, error: "" });
    }).catch(error => { if (active && !controller.signal.aborted) {
      if (error instanceof Error && error.message === "booking_timezone_changed") setAvailability({ url: availabilityUrl, slots: null, error: "The event’s time zone has changed. Refresh this page to see current times.", reload: true });
      else failed();
    } }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [availabilityUrl, retry, tz]);
  const cells = useMemo(() => { const first = m.startOf("month"); const pad = first.weekday % 7; return [...Array(pad).fill(null), ...Array.from({ length: first.daysInMonth! }, (_, i) => first.plus({ days: i }))]; }, [month, tz]);
  const fmt = (iso: string, f: string) => DateTime.fromISO(iso).setZone(tz).toFormat(f);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy || zoneChanged) return;
    setBusy(true); setErr("");
    const fd = new FormData(e.currentTarget);
    const guests = String(fd.get("guests") ?? "").split(/[,\s]+/).filter(Boolean);
    try {
      const r = await fetch(BP + "/api/bookings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        username: p.username, slug: p.slug, start: slot, tz, name: fd.get("name"), email: fd.get("email"), notes: fd.get("notes"), guests, rescheduleUid: p.reschedule?.uid, embed: !!p.embed,
        answers: Object.fromEntries(p.questions.map(q => [q.id, String(fd.get(`q_${q.id}`) ?? "")])) }) });
      const j = await r.json();
      if (r.ok) {
        if (j.checkoutUrl) { location.href = j.checkoutUrl; return; }
        if (j.redirectUrl && !p.embed) { location.href = j.redirectUrl; return; }
        if (typeof j.uid !== "string" || !j.uid) throw new Error("invalid_booking_response");
        router.push(`/booking/${j.uid}?new=1${p.embed ? "&embed=1" : ""}`);
      }
      else if (r.status >= 500) throw new Error("booking_unconfirmed");
      else setErr(j.error === "slot_unavailable" ? "Someone just took that time. Pick another one." : String(j.error).startsWith("answer_") ? "Please answer the required questions." : "Please check your details and try again.");
    } catch {
      setErr("We couldn’t confirm your booking. Check for a confirmation before trying again.");
    } finally { setBusy(false); }
  }

  return <div className="card bk">
    <section className="info">
      {invalid && <p role="alert">This link contains an invalid date or time zone. Check the calendar and choose a time.</p>}
      {zoneChanged && <div><p role="alert">{availabilityError}</p><button className="btn" onClick={() => router.refresh()}>Refresh booking page</button></div>}
      {p.hostImage && <div style={{ marginBottom: 14 }}><ProfileAvatar name={p.host} image={p.hostImage} size={64} /></div>}
      <div className="muted" style={{ fontWeight: 600 }}>{p.host}</div>
      <h1 style={{ margin: "6px 0 14px", fontSize: 26 }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: p.color, marginRight: 10 }} />{p.title}</h1>
      <div className="muted">◷ {p.durationMin} min{p.kindLabel ? ` · ${p.kindLabel}` : ""}</div>
      {p.location && <div className="muted" style={{ marginTop: 6 }}>📍 {p.location}</div>}
      {p.price && <div className="muted" style={{ marginTop: 6 }} data-testid="price">💳 {p.price}, paid when you book</div>}
      {slot && <div style={{ marginTop: 10, fontWeight: 600 }}>▣ {fmt(slot, "h:mm a")} – {DateTime.fromISO(slot).plus({ minutes: p.durationMin }).setZone(tz).toFormat("h:mm a, cccc, LLLL d")}</div>}
      {slot && <p className="muted" data-testid="booking-timezone">{tz.replaceAll("_", " ")}</p>}
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
        {!slots && !availabilityError && <p className="muted" role="status">Loading open times…</p>}
        {availabilityError && !zoneChanged && <div><p role="alert">{availabilityError}</p><button className="btn" onClick={() => setRetry(value => value + 1)}>Retry available times</button></div>}
        {slots && !Object.values(slots).some(times => times.length > 0) && <p className="muted" role="status">No available times this month. Try another month.</p>}
        {p.lockedTimezone ? <div className="f">Time zone<p data-testid="booking-timezone">{tz.replaceAll("_", " ")}</p></div> : <>
          <label className="f" htmlFor="tz">Time zone</label>
          <select id="tz" className="input" value={tz} onChange={e => nav({ tz: e.target.value })}>{zones.map(z => <option key={z}>{z}</option>)}</select>
        </>}
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
      <button className="btn" disabled={busy} onClick={() => { setErr(""); setRetry(value => value + 1); nav({ slot: null }); }}>← Back</button>
      <h2 style={{ fontSize: 20 }}>Your details</h2>
      <form onSubmit={submit}>
        <label className="f" htmlFor="name">Name</label><input className="input" id="name" name="name" required defaultValue={p.reschedule?.name ?? q.get("name") ?? undefined} />
        <label className="f" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" required defaultValue={p.reschedule?.email ?? q.get("email") ?? undefined} />
        <label className="f" htmlFor="guests">Guest emails (optional)</label><input className="input" id="guests" name="guests" placeholder="comma separated" />
        {p.questions.map(q => <div key={q.id}>
          <label className="f" htmlFor={`q_${q.id}`}>{q.label}{q.required ? " *" : ""}</label>
          {q.type === "textarea" ? <textarea className="input" id={`q_${q.id}`} name={`q_${q.id}`} rows={3} required={q.required} />
            : q.type === "select" ? <select className="input" id={`q_${q.id}`} name={`q_${q.id}`} required={q.required} defaultValue=""><option value="" disabled>Choose one</option>{(q.options ?? []).map(o => <option key={o}>{o}</option>)}</select>
            : <input className="input" id={`q_${q.id}`} name={`q_${q.id}`} type={q.type === "phone" ? "tel" : "text"} required={q.required} />}
        </div>)}
        <label className="f" htmlFor="notes">Anything to prepare?</label><textarea className="input" id="notes" name="notes" rows={4} />
        {err && <p role="alert" style={{ color: "var(--warn)" }}>{err}</p>}
        {busy && <p role="status">Submitting your details…</p>}
        <button className="btn primary" style={{ marginTop: 16 }} disabled={busy || zoneChanged} aria-busy={busy}>{p.reschedule ? "Confirm new time" : p.price ? `Continue to payment (${p.price})` : "Book it"}</button>
      </form>
    </section>}
  </div>;
}
