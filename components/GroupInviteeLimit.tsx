"use client";
import { useRef, useState } from "react";
import { BP } from "@/lib/basepath";

export function GroupInviteeLimit({ uid, initial }: { uid: string; initial: { inviteeLimit: number; booked: number } }) {
  const [session, setSession] = useState(initial), [draft, setDraft] = useState(String(initial.inviteeLimit));
  const [saving, setSaving] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (saving) return;
    const inviteeLimit = Number(draft);
    if (!Number.isInteger(inviteeLimit) || inviteeLimit < Math.max(2, session.booked) || inviteeLimit > 9999) {
      setError(`Enter a whole number from ${Math.max(2, session.booked)} to 9,999.`); return;
    }
    setSaving(true); setError("");
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${BP}/api/meetings/${encodeURIComponent(uid)}/invitee-limit`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ inviteeLimit }), signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.error === "below_invitee_count" && Number.isInteger(result.minimum)) {
          setSession(value => ({ ...value, booked: result.minimum }));
          setError(`${result.minimum} invitees are already booked. The limit cannot be lower than that.`);
        } else setError(response.status === 404 ? "This group meeting is no longer available. Reload the page to check its status." : "The limit could not be saved. Please try again.");
        return;
      }
      if (!Number.isInteger(result.inviteeLimit) || result.inviteeLimit < 2 || result.inviteeLimit > 9999
        || !Number.isInteger(result.booked) || result.booked < 0 || result.booked > result.inviteeLimit) throw new Error("invalid_response");
      setSession(result); setNotice("Invitee limit updated."); dialog.current?.close();
    } catch { setError("We couldn't confirm the update. Reload the page to check the current limit, or try again."); }
    finally { clearTimeout(timeout); setSaving(false); }
  }
  return <section className="group-invitees" aria-labelledby="group-invitees-heading">
    <h3 id="group-invitees-heading">Invitees</h3>
    <p>{session.booked} of {session.inviteeLimit} spots filled</p>
    <button className="btn" onClick={() => { setDraft(String(session.inviteeLimit)); setError(""); setNotice(""); dialog.current?.showModal(); }}>Edit invitee limit</button>
    <p role="status">{notice}</p>
    <dialog ref={dialog} className="meeting-dialog" aria-labelledby="invitee-limit-title" onCancel={event => { if (saving) event.preventDefault(); }}>
      <form onSubmit={save} aria-busy={saving}>
        <h3 id="invitee-limit-title">Edit invitee limit</h3>
        <p>This limit applies to this meeting.</p>
        <label className="f" htmlFor="meeting-invitee-limit">Invitee limit</label>
        <input id="meeting-invitee-limit" className="input" type="number" required min={Math.max(2, session.booked)} max={9999} step={1}
          value={draft} onChange={event => setDraft(event.target.value)} disabled={saving} autoFocus aria-describedby={error ? "invitee-limit-error" : undefined} />
        {error && <p id="invitee-limit-error" role="alert">{error}</p>}
        <div className="meetings-actions">
          <button type="button" className="btn" disabled={saving} onClick={() => dialog.current?.close()}>Cancel</button>
          <button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Apply"}</button>
        </div>
      </form>
    </dialog>
  </section>;
}
