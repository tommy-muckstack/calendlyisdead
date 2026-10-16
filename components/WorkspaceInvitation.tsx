"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BP } from "@/lib/basepath";
export function WorkspaceInvitation({ token, name, role }: { token: string; name: string; role: "admin" | "user" }) {
  const router = useRouter(), inFlight = useRef(false), mounted = useRef(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return <form onSubmit={async event => {
    event.preventDefault(); if (inFlight.current) return; inFlight.current = true; setBusy(true); setError("");
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${BP}/api/workspace/invitations/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), signal: controller.signal });
      const result = await response.json(); if (!mounted.current) return;
      if (!response.ok) { setError(result.error || "The invitation could not be accepted."); return; }
      router.replace("/app/people"); router.refresh();
    } catch { if (mounted.current) setError("Acceptance could not be confirmed. Try again; this will not create a second membership."); }
    finally { clearTimeout(timeout); inFlight.current = false; if (mounted.current) setBusy(false); }
  }}>
    <h1>Join {name}?</h1><p>You will join as {role === "admin" ? "an admin" : "a user"}. Your personal account and scheduling links stay in place.</p>
    <p>This invitation confirms access to the invited email address. Accept only if you recognize the workspace.</p>
    {error && <p role="alert">{error}</p>}
    <button className="btn primary" type="submit" disabled={busy}>{busy ? "Joining…" : "Accept invitation"}</button>
  </form>;
}
