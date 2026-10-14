"use client";
import { useEffect, useRef, useState } from "react";
type R = { start: string; end: string };
type S = { id: string; name: string; isDefault: boolean; timezone: string; weekly: Record<string, R[]>; overrides: Record<string, R[]>; holidayCountry: string | null };
const DAYS = [[7, "Sun"], [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"]] as const;
const ZONES: string[] = (Intl as any).supportedValuesOf?.("timeZone") ?? ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London"];

export function AvailabilityEditor({ schedules, countries }: { schedules: S[]; countries: [string, string][] }) {
  const [list, setList] = useState(schedules);
  const [curId, setCurId] = useState((schedules.find(x => x.isDefault) ?? schedules[0]).id);
  return <>
    <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }} role="tablist">
      {list.map(x => <button key={x.id} role="tab" aria-selected={x.id === curId} className={`btn ${x.id === curId ? "primary" : ""}`} onClick={() => setCurId(x.id)}>{x.name}{x.isDefault ? " · default" : ""}</button>)}
      <button className="btn" onClick={async () => { const r = await fetch("/api/schedules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "New schedule" }) });
        const n = await r.json(); setList([...list, { ...n, overrides: n.overrides ?? {}, holidayCountry: null }]); setCurId(n.id); }}>+ New schedule</button>
    </div>
    <ScheduleEditor key={curId} initial={list.find(x => x.id === curId)!} countries={countries} canDelete={list.length > 1}
      onSaved={n => setList(l => l.map(x => x.id === n.id ? n : n.isDefault ? { ...x, isDefault: false } : x))}
      onDeleted={() => { const rest = list.filter(x => x.id !== curId); setList(rest.some(x => x.isDefault) ? rest : rest.map((x, i) => i === 0 ? { ...x, isDefault: true } : x)); setCurId(rest[0].id); }} />
  </>;
}

function ScheduleEditor({ initial, countries, canDelete, onSaved, onDeleted }: { initial: S; countries: [string, string][]; canDelete: boolean; onSaved(s: S): void; onDeleted(): void }) {
  const [s, setS] = useState<S>(initial);
  const [status, setStatus] = useState("");
  const [ovDate, setOvDate] = useState("");
  const t = useRef<any>(null), first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    clearTimeout(t.current); setStatus("Saving…");
    t.current = setTimeout(async () => {
      const { id, ...body } = s;
      const r = await fetch(`/api/schedules/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      setStatus(r.ok ? "Saved" : "Couldn't save. Check that each start is before its end."); if (r.ok) onSaved(s);
    }, 600);
  }, [s]);
  const setDay = (k: string, v: R[]) => setS({ ...s, weekly: { ...s.weekly, [k]: v } });
  const setOv = (k: string, v: R[] | null) => { const o = { ...s.overrides }; if (v === null) delete o[k]; else o[k] = v; setS({ ...s, overrides: o }); };
  const Ranges = ({ rs, onSet }: { rs: R[]; onSet(v: R[]): void }) => <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {rs.map((r, i) => <div className="row" key={i} style={{ gap: 6 }}>
      <input className="input" style={{ width: 120 }} type="time" value={r.start} onChange={e => onSet(rs.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} />–
      <input className="input" style={{ width: 120 }} type="time" value={r.end} onChange={e => onSet(rs.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} />
      <button className="btn" aria-label="Remove hours" onClick={() => onSet(rs.filter((_, j) => j !== i))}>✕</button></div>)}
    <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => onSet([...rs, { start: "09:00", end: "17:00" }])}>+ Add hours</button>
  </div>;
  return <>
    <div className="row" style={{ justifyContent: "space-between" }}><h1 style={{ margin: 0 }}>Availability</h1><span className="muted" role="status">{status}</span></div>
    <div className="card" style={{ padding: 24, marginTop: 20 }}>
      <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}><label className="f" htmlFor="sname">Schedule name</label><input id="sname" className="input" value={s.name} onChange={e => setS({ ...s, name: e.target.value })} /></div>
        {!s.isDefault && <button className="btn" onClick={() => setS({ ...s, isDefault: true })}>Make default</button>}
        {canDelete && <button className="btn danger" onClick={async () => { if (!confirm("Delete this schedule? Event types using it move to another schedule.")) return;
          const r = await fetch(`/api/schedules/${s.id}`, { method: "DELETE" }); if (r.ok) onDeleted(); }}>Delete</button>}
      </div>
      <label className="f" htmlFor="tz">Time zone</label>
      <select id="tz" className="input" style={{ maxWidth: 360 }} value={s.timezone} onChange={e => setS({ ...s, timezone: e.target.value })}>{ZONES.map(z => <option key={z}>{z}</option>)}</select>
      <h3>Weekly hours</h3>
      {DAYS.map(([k, n]) => { const rs = s.weekly[k] ?? []; return <div key={k} className="row" style={{ alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid var(--line)" }}>
        <label style={{ width: 90, paddingTop: 10, fontWeight: 600 }}><input type="checkbox" checked={rs.length > 0} onChange={e => setDay(String(k), e.target.checked ? [{ start: "09:00", end: "17:00" }] : [])} /> {n}</label>
        {rs.length ? Ranges({ rs: rs, onSet: v => setDay(String(k), v) }) : <span className="muted" style={{ paddingTop: 10 }}>Unavailable</span>}
      </div>; })}
      <h3 style={{ marginTop: 28 }}>Holidays</h3>
      <p className="muted">Close on public holidays automatically. Date-specific hours below still win.</p>
      <select aria-label="Holiday calendar" className="input" style={{ maxWidth: 360 }} value={s.holidayCountry ?? ""} onChange={e => setS({ ...s, holidayCountry: e.target.value || null })}>
        <option value="">Don't block holidays</option>{countries.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      <h3 style={{ marginTop: 28 }}>Date-specific hours</h3>
      <p className="muted">Override your weekly hours on particular dates, or mark a day off.</p>
      <div className="row"><input className="input" type="date" style={{ width: 200 }} value={ovDate} onChange={e => setOvDate(e.target.value)} />
        <button className="btn" disabled={!ovDate} onClick={() => { setOv(ovDate, [{ start: "09:00", end: "12:00" }]); setOvDate(""); }}>Add hours</button>
        <button className="btn" disabled={!ovDate} onClick={() => { setOv(ovDate, []); setOvDate(""); }}>Mark unavailable</button></div>
      {Object.keys(s.overrides).sort().map(k => <div key={k} className="row" style={{ alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid var(--line)", marginTop: 8 }}>
        <b style={{ width: 120, paddingTop: 10 }}>{k}</b>
        {s.overrides[k].length ? Ranges({ rs: s.overrides[k], onSet: v => setOv(k, v) }) : <span className="muted" style={{ paddingTop: 10 }}>Unavailable all day</span>}
        <button className="btn" onClick={() => setOv(k, null)}>Remove</button></div>)}
    </div>
  </>;
}
