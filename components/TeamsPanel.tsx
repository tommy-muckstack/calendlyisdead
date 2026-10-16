"use client";
import { BP, withBase } from "@/lib/basepath";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EventTypeEditor, type ET } from "./EventTypesBoard";
import { setEventVisibility } from "@/lib/event-visibility-client";
import { withDateRangeLocks } from "@/lib/booking-date-range";
import { I } from "./app/icons";
type Member = { userId: string; role: string; name: string; email: string };
type TET = ET & { rrMode: string; hosts: { userId: string; priority: number }[]; assigned: string[] };
type Team = { id: string; name: string; slug: string; role: string; members: Member[]; eventTypes: TET[] };
const KIND: Record<string, string> = { collective: "Collective", round_robin: "Round robin", managed: "Managed" };
const LOCKABLE = ["title", "description", "durationMin", "startIntervalMin", "lockedTimezone", "location", "color", "questions", "bufferBeforeMin", "bufferAfterMin", "minNoticeMin", "dateRange", "maxPerDay", "maxPerWeek", "maxPerMonth"];
const LIMIT_LABELS: Record<string, string> = { maxPerDay: "Daily meeting limit", maxPerWeek: "Weekly meeting limit", maxPerMonth: "Monthly meeting limit", startIntervalMin: "Start time increments", lockedTimezone: "Booking time zone", dateRange: "Date range" };

export function TeamsPanel({ teams, me, defaultTimezone = "UTC" }: { teams: Team[]; me: string; defaultTimezone?: string }) {
  const router = useRouter(); const [msg, setMsg] = useState("");
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<{ source: Team[]; values: Record<string, boolean> }>({ source: teams, values: {} });
  const [visibilityPending, setVisibilityPending] = useState<string | null>(null), visibilityBusy = useRef(false);
  const [visibilityError, setVisibilityError] = useState("");
  // Fresh server props replace confirmed local values after router.refresh().
  const visibleValues = visibility.source === teams ? visibility.values : {};
  const [editor, setEditor] = useState<{ et: ET; teamSlug: string } | null>(null);
  async function changeVisibility(et: TET, secret: boolean) {
    if (visibilityBusy.current) return;
    visibilityBusy.current = true; setVisibilityPending(et.id); setVisibilityError(""); setMsg("");
    try {
      await setEventVisibility(et.id, secret);
      setVisibility(current => ({ source: teams, values: { ...(current.source === teams ? current.values : {}), [et.id]: secret } }));
      setMsg(secret ? "Event type made secret" : "Event type made public"); router.refresh();
    } catch (error) { setVisibilityError(error instanceof Error ? error.message : "Visibility could not be confirmed. Try again."); }
    finally { visibilityBusy.current = false; setVisibilityPending(null); }
  }
  async function duplicate(et: TET, teamSlug: string) {
    if (duplicating) return;
    setDuplicating(et.id); setMsg("");
    try {
      const response = await fetch(`${BP}/api/event-types/${et.id}/duplicate`, { method: "POST" });
      if (!response.ok) throw new Error("duplicate_failed");
      const created = await response.json();
      if (!created?.id || typeof created.title !== "string") throw new Error("invalid_response");
      setEditor({ et: created, teamSlug }); router.refresh();
    } catch { setMsg("Duplication could not be confirmed. Reload the page before trying again."); }
    finally { setDuplicating(null); }
  }
  const call = async (url: string, method: string, body?: unknown) => { const r = await fetch(withBase(url), { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); router.refresh(); return r; };
  return <>
    <h2 style={{ marginTop: 0 }}>Teams</h2>
    {msg && <p role="status" className="card" style={{ padding: 12 }}>{msg}</p>}
    {visibilityError && <p role="alert" className="card" style={{ padding: 12 }}>{visibilityError}</p>}
    <form className="row" style={{ marginBottom: 24 }} onSubmit={async e => { e.preventDefault(); const fd = new FormData(e.currentTarget);
      const r = await call("/api/teams", "POST", { name: fd.get("name"), slug: fd.get("slug") }); setMsg(r.ok ? "Team created." : "That team link is taken or invalid."); }}>
      <input className="input" name="name" placeholder="Team name" aria-label="Team name" required style={{ maxWidth: 240 }} />
      <input className="input" name="slug" placeholder="team-link" aria-label="Team link" required pattern="[a-z0-9-]{2,40}" style={{ maxWidth: 200 }} />
      <button className="btn primary">Create team</button>
    </form>
    {teams.map(t => { const admin = ["owner", "admin"].includes(t.role); return <section key={t.id} className="card" style={{ padding: 22, marginBottom: 20 }} data-testid={`team-${t.slug}`}>
      <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>{t.name}</h2><a className="btn" href={`${BP}/team/${t.slug}`} target="_blank">Team page ↗</a></div>
      <h3>Members</h3>
      {t.members.map(m => <div key={m.userId} className="row" style={{ padding: "4px 0" }}><span style={{ flex: 1 }}>{m.name} <span className="muted">{m.email} · {m.role}</span></span>
        {admin && m.role !== "owner" && m.userId !== me && <button className="btn" onClick={() => call(`/api/teams/${t.id}/members/${m.userId}`, "DELETE")}>Remove</button>}</div>)}
      {admin && <form className="row" style={{ marginTop: 10 }} onSubmit={async e => { e.preventDefault(); const fd = new FormData(e.currentTarget);
        const r = await call(`/api/teams/${t.id}/invites`, "POST", { email: fd.get("email"), role: fd.get("role") }); setMsg(r.ok ? `Invite sent to ${fd.get("email")}.` : "Couldn't send that invite."); (e.target as HTMLFormElement).reset(); }}>
        <input className="input" name="email" type="email" required placeholder="teammate@company.com" aria-label="Invite email" style={{ maxWidth: 280 }} />
        <select className="input" name="role" aria-label="Invite role" style={{ width: 120 }}><option value="member">Member</option><option value="admin">Admin</option></select>
        <button className="btn">Send invite</button></form>}
      <h3>Team event types</h3>
      {t.eventTypes.map(e => { const secret = visibleValues[e.id] ?? e.secret; return <div key={e.id} className="card" style={{ padding: 14, marginBottom: 10 }} data-testid="team-et">
        <div className="row" style={{ justifyContent: "space-between" }}><b>{e.title}{secret && <span className="cs-secret" role="img" aria-label="Secret event" title="Hidden from your scheduling page. Anyone with the direct link can book.">{I.hidden(16)}</span>} <span className="muted" style={{ fontWeight: 400 }}>· {KIND[e.kind]} · {e.durationMin} min</span></b>
          <div className="row">{e.kind !== "managed" && <a className="btn" href={`${BP}/team/${t.slug}/${e.slug}`} target="_blank">View</a>}
            {admin && <button className="btn" onClick={() => setEditor({ et: e, teamSlug: t.slug })}>Edit</button>}
            {admin && e.kind !== "managed" && <button className="btn" disabled={!!visibilityPending} aria-busy={visibilityPending === e.id}
              onClick={() => { void changeVisibility(e, !secret); }}>{secret ? "Make public" : "Make secret"}</button>}
            {admin && <button className="btn" disabled={!!duplicating} onClick={() => { void duplicate(e, t.slug); }}>
              {duplicating === e.id ? "Duplicating…" : "Duplicate"}</button>}</div></div>
        {admin && e.kind !== "managed" && <>
          {e.kind === "round_robin" && <label className="f">Distribution <select className="input" aria-label={`Distribution for ${e.title}`} style={{ width: 260 }} value={e.rrMode}
            onChange={x => call(`/api/event-types/${e.id}`, "PATCH", { rrMode: x.target.value })}><option value="even">Spread evenly</option><option value="priority">By priority, then evenly</option></select></label>}
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>Hosts</div>
          {t.members.map(m => { const h = e.hosts.find(x => x.userId === m.userId); return <div key={m.userId} className="row" style={{ padding: "2px 0" }}>
            <label style={{ flex: 1 }}><input type="checkbox" checked={!!h} onChange={x => call(`/api/teams/${t.id}/event-types/${e.id}/hosts`, "PUT",
              { hosts: x.target.checked ? [...e.hosts, { userId: m.userId, priority: 2 }] : e.hosts.filter(y => y.userId !== m.userId) })} /> {m.name}</label>
            {h && e.kind === "round_robin" && <select className="input" aria-label={`Priority for ${m.name}`} style={{ width: 120 }} value={h.priority}
              onChange={x => call(`/api/teams/${t.id}/event-types/${e.id}/hosts`, "PUT", { hosts: e.hosts.map(y => y.userId === m.userId ? { ...y, priority: Number(x.target.value) } : y) })}>
              <option value={3}>High</option><option value={2}>Medium</option><option value={1}>Low</option></select>}
          </div>; })}</>}
        {admin && e.kind === "managed" && <>
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>Assigned to (each gets a copy in their own account)</div>
          {t.members.map(m => <label key={m.userId} style={{ display: "block" }}><input type="checkbox" checked={e.assigned.includes(m.userId)}
            onChange={x => call(`/api/teams/${t.id}/event-types/${e.id}/assign`, "POST", { userIds: x.target.checked ? [...e.assigned, m.userId] : e.assigned.filter(y => y !== m.userId) })} /> {m.name}</label>)}
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>Locked for members</div>
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>{LOCKABLE.map(f => <label key={f}><input type="checkbox" checked={withDateRangeLocks(e.lockedFields).includes(f)}
            onChange={x => call(`/api/event-types/${e.id}`, "PATCH", { lockedFields: x.target.checked ? [...e.lockedFields, f] : e.lockedFields.filter(y => y !== f && !(f === "dateRange" && y === "rangeDays")) })} /> {LIMIT_LABELS[f] ?? f}</label>)}</div>
          <label className="f">Template name <input className="input" aria-label={`Template name for ${e.title}`} defaultValue={e.title} onBlur={x => x.target.value !== e.title && call(`/api/event-types/${e.id}`, "PATCH", { title: x.target.value })} /></label>
          <label className="f">Duration <input className="input" type="number" aria-label={`Template duration for ${e.title}`} defaultValue={e.durationMin} onBlur={x => Number(x.target.value) !== e.durationMin && call(`/api/event-types/${e.id}`, "PATCH", { durationMin: Number(x.target.value) })} /></label>
        </>}
      </div>; })}
      {admin && <div className="row" style={{ marginTop: 8 }}>
        {(["collective", "round_robin", "managed"] as const).map(k => <button key={k} className="btn" onClick={() => call(`/api/teams/${t.id}/event-types`, "POST", { kind: k, title: `${KIND[k]} meeting` })}>+ {KIND[k]}</button>)}
      </div>}
    </section>; })}
    {editor && <EventTypeEditor key={editor.et.id} et={editor.et} username={`team/${editor.teamSlug}`} schedules={[]} defaultTimezone={defaultTimezone}
      onClose={() => setEditor(null)} onChange={et => setEditor(current => current ? { ...current, et } : null)}
      onSaved={() => { setMsg("Saved"); router.refresh(); }} onDelete={async () => {
        const response = await fetch(`${BP}/api/event-types/${editor.et.id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("delete_failed");
        setEditor(null); router.refresh();
      }} />}
  </>;
}
