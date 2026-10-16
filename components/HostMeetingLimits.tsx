"use client";
import { useEffect, useState } from "react";
import { BP } from "@/lib/basepath";
import { HostLimitsResponse, LIMIT_FIELDS, LIMIT_LABELS } from "@/lib/meeting-limits";

export function HostMeetingLimits({ eventId }: { eventId: string }) {
  const [hosts, setHosts] = useState<ReturnType<typeof HostLimitsResponse.parse>["hosts"] | null>(null);
  const [error, setError] = useState(false); const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true; const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    setHosts(null); setError(false);
    void (async () => {
      try {
        const response = await fetch(`${BP}/api/event-types/${eventId}/host-limits`, { signal: controller.signal });
        if (!response.ok) throw new Error("unavailable");
        const data = HostLimitsResponse.parse(await response.json());
        if (current) setHosts(data.hosts);
      } catch { if (current) setError(true); }
      finally { clearTimeout(timer); }
    })();
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [eventId, retry]);
  return <section aria-label="Host meeting limits" className="card" style={{ padding: 14, marginTop: 16 }}>
    <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Host meeting limits</h3>
    <p className="muted">These limits apply across all event types. Each host manages their own limits.</p>
    {error ? <div role="alert">Host limits could not be loaded. <button className="btn" onClick={() => setRetry(n => n + 1)}>Retry</button></div>
      : hosts === null ? <p role="status">Loading host limits…</p>
        : hosts.length === 0 ? <p>No hosts assigned.</p> : hosts.map(host => <div key={host.id} style={{ marginTop: 12 }}>
          <b>{host.name}{host.isMe ? " (you)" : ""}</b>
          <p>{LIMIT_FIELDS.map(field => `${LIMIT_LABELS[field]}: ${host[field] ?? "No limit"}`).join(" · ")}</p>
          <p className="muted">{host.timezone}</p>
          {host.isMe && <a href={`${BP}/app/availability/advanced`} target="_blank" rel="noreferrer">Manage your meeting limits (new tab)</a>}
        </div>)}
  </section>;
}
