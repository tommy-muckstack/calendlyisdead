"use client";
import { useState } from "react";
export function DemoPayButton({ uid, embed }: { uid: string; embed: boolean }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  return <>
    <button className="btn primary" style={{ width: "100%" }} disabled={busy} onClick={async () => {
      setBusy(true); const r = await fetch(`/api/bookings/${uid}/demo-pay`, { method: "POST" });
      if (r.ok) location.href = `/booking/${uid}?new=1&paid=1${embed ? "&embed=1" : ""}`; else { setBusy(false); setErr("This hold expired. Please book again."); }
    }}>Pay (demo)</button>
    {err && <p style={{ color: "var(--warn)" }}>{err}</p>}
  </>;
}
