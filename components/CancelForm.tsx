"use client";
import { track, trackNow, EVENTS } from "@/lib/posthog";
import { BP } from "@/lib/basepath";
import { useState } from "react";
export function CancelForm({ uid }: { uid: string }) {
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false);
  return <>
    <h1 style={{ marginTop: 0 }}>Cancel this meeting?</h1>
    <label className="f" htmlFor="reason">Reason (shared with the host)</label>
    <textarea id="reason" className="input" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
    <button className="btn danger" style={{ marginTop: 14 }} disabled={busy} onClick={async () => {
      setBusy(true); const r = await fetch(`${BP}/api/bookings/${uid}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) }); if (r.ok) await trackNow(EVENTS.app_booking_cancelled, { has_reason: !!reason.trim() });
      location.href = `${BP}/booking/${uid}`; }}>Yes, cancel it</button>
  </>;
}
