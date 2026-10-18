"use client";
import { useRef, useState } from "react";
import { BP } from "@/lib/basepath";
import { pollParticipationError } from "@/lib/poll-participation";
export function PollVisibility({ id, showVotes, open }: { id: string; showVotes: boolean; open: boolean }) {
  const [checked, setChecked] = useState(showVotes), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const inFlight = useRef(false);
  async function save(next: boolean) {
    if (inFlight.current) return; inFlight.current = true; setSaving(true); setError("");
    try {
      const response = await fetch(`${BP}/api/polls/${id}`, { method: "PATCH", signal: AbortSignal.timeout(20_000), headers: { "content-type": "application/json" }, body: JSON.stringify({ showVotes: next }) });
      const body = await response.json();
      if (response.ok && typeof body.showVotes === "boolean") setChecked(body.showVotes); else setError(pollParticipationError(body.error));
    } catch { setError("We couldn’t confirm the visibility change. Refresh the page to check its saved setting."); }
    finally { inFlight.current = false; setSaving(false); }
  }
  return <div><label><input type="checkbox" checked={checked} disabled={saving || !open} onChange={e => void save(e.target.checked)} /> Show votes on page</label>
    {saving && <span role="status"> Saving…</span>}{error && <p role="alert">{error}</p>}</div>;
}
