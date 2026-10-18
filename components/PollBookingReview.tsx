"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { BP } from "@/lib/basepath";
import { PollBookingReviewData, PollInvitee, pollBookingError, type PollBookingReview as Review, type PollInviteeInput } from "@/lib/poll-booking-contract";

export function PollBookingReview({ pollId, option, tz, onClose, onBooked }: { pollId: string; option: string; tz: string; onClose: () => void; onBooked: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null), alert = useRef<HTMLParagraphElement>(null);
  const request = useRef<AbortController | null>(null), mounted = useRef(false), booking = useRef(false);
  const [review, setReview] = useState<Review | null>(null), [extra, setExtra] = useState<PollInviteeInput[]>([]);
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [error, setError] = useState("");
  const [checking, setChecking] = useState(false), [saving, setSaving] = useState(false);
  const load = useCallback(async (invitees: PollInviteeInput[]) => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setChecking(true); setReview(null); setError("");
    const timeout = setTimeout(() => {
      if (mounted.current && request.current === controller) { setChecking(false); setError("The calendar check took too long. Try again."); controller.abort(); }
    }, 20_000);
    try {
      const response = await fetch(`${BP}/api/polls/${pollId}/review`, { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ option, extraInvitees: invitees }) });
      const body = await response.json();
      if (!mounted.current || controller.signal.aborted) return;
      if (!response.ok) { setError(pollBookingError(body.error)); return; }
      setReview(PollBookingReviewData.parse(body));
    } catch { if (mounted.current && !controller.signal.aborted) setError("We couldn’t check this meeting. Your invitee list is saved here. Try again."); }
    finally { clearTimeout(timeout); if (mounted.current && !controller.signal.aborted) setChecking(false); }
  }, [pollId, option]);
  useEffect(() => {
    mounted.current = true; const before = document.activeElement, panel = dialog.current;
    panel?.showModal(); heading.current?.focus(); void load([]);
    return () => { mounted.current = false; request.current?.abort(); panel?.close(); if (before instanceof HTMLElement && before.isConnected) before.focus(); };
  }, [load]);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  const changeExtra = (next: PollInviteeInput[]) => { setExtra(next); void load(next); };
  function add(event: React.FormEvent) {
    event.preventDefault(); if (saving || checking) return;
    const parsed = PollInvitee.safeParse({ name, email });
    if (!parsed.success) { setError(pollBookingError("invalid")); return; }
    if (review?.invitees.some(invitee => invitee.email === parsed.data.email) || extra.some(invitee => invitee.email === parsed.data.email)) { setError("This invitee is already included."); return; }
    setName(""); setEmail(""); changeExtra([...extra, parsed.data]);
  }
  async function book() {
    if (!review || checking || booking.current) return;
    booking.current = true; setSaving(true); setError("");
    try {
      const response = await fetch(`${BP}/api/polls/${pollId}/book`, { method: "POST", signal: AbortSignal.timeout(20_000), headers: { "content-type": "application/json" },
        body: JSON.stringify({ option, extraInvitees: extra, reviewKey: review.reviewKey }) });
      const body = await response.json(); if (!mounted.current) return;
      if (!response.ok) { setReview(null); setError(pollBookingError(body.error)); return; }
      if (typeof body.uid !== "string" || !body.uid) throw new Error("Invalid booking response");
      onBooked();
    } catch { if (mounted.current) { setReview(null); setError("We couldn’t confirm the booking. Check the poll for a booking before trying again."); } }
    finally { booking.current = false; if (mounted.current) setSaving(false); }
  }
  const pending = checking || saving;
  return <dialog ref={dialog} className="poll-booking-review" aria-labelledby="poll-booking-heading" onCancel={event => { if (booking.current) event.preventDefault(); else onClose(); }}>
    <h2 id="poll-booking-heading" ref={heading} tabIndex={-1}>Book meeting</h2>
    <p>{DateTime.fromISO(option).setZone(tz).toFormat("cccc, LLLL d · h:mm a ZZZZ")}</p>
    {checking && <p role="status">Checking calendars and invitees…</p>}
    {review && <>
      <h3>{review.title}</h3><p>{review.durationMin} minutes{review.location ? ` · ${review.location}` : ""}</p>
      {review.externalConflict && <p className="poll-booking-warning" role="status">This time conflicts with an event on your connected calendar. You can still book this meeting.</p>}
      <h3>Invitees ({review.invitees.length})</h3>
      <ul>{review.invitees.map(invitee => <li key={invitee.email}><span>{invitee.name}<br /><span className="muted">{invitee.email}</span></span>
        {extra.some(added => added.email.toLowerCase() === invitee.email) && <button className="btn" type="button" disabled={pending} aria-label={`Remove ${invitee.name}`} onClick={() => changeExtra(extra.filter(added => added.email.toLowerCase() !== invitee.email))}>Remove</button>}</li>)}</ul>
    </>}
    {!review && extra.length > 0 && <ul aria-label="Additional invitees">{extra.map(invitee => <li key={invitee.email}><span>{invitee.name}<br />{invitee.email}</span><button className="btn" disabled={pending} type="button" aria-label={`Remove ${invitee.name}`} onClick={() => changeExtra(extra.filter(added => added.email !== invitee.email))}>Remove</button></li>)}</ul>}
    <form onSubmit={add}>
      <fieldset disabled={pending || extra.length >= 40}><legend>Add invitee</legend>
        <label htmlFor="poll-invitee-name">Name</label><input id="poll-invitee-name" className="input" value={name} onChange={event => setName(event.target.value)} maxLength={200} required />
        <label htmlFor="poll-invitee-email">Email</label><input id="poll-invitee-email" className="input" type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={320} required />
        <button className="btn" type="submit">Add invitee</button>
      </fieldset>
    </form>
    {(name || email) && <p className="muted">Choose Add invitee to include the details above, or clear them to continue.</p>}
    {error && <p role="alert" ref={alert} tabIndex={-1}>{error}</p>}
    {!review && !pending && <button className="btn" type="button" onClick={() => void load(extra)}>Review again</button>}
    <footer><button className="btn" type="button" disabled={saving} onClick={onClose}>Cancel</button>
      <button className="btn primary" type="button" disabled={pending || !review || !!name || !!email} onClick={() => void book()}>{saving ? "Booking…" : "Book Meeting"}</button></footer>
  </dialog>;
}
