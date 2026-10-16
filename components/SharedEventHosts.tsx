"use client";
import { useState } from "react";
import type { SharedEventSettings, SharedHostDirectory } from "@/lib/shared-event-validation";
import { BP } from "@/lib/basepath";
export function SharedEventHosts({ kind, value, directory, onChange }: { kind: string; value?: SharedEventSettings; directory?: SharedHostDirectory | null; onChange(value: SharedEventSettings): void }) {
  const [search, setSearch] = useState("");
  if (!directory || !value) return <p>Create or join a workspace to add hosts. <a href={`${BP}/app/people`} target="_blank" rel="noreferrer">Open People</a>, then reload Scheduling after your membership is ready. Your event has not been created.</p>;
  const update = (membershipId: string, fields: Partial<SharedEventSettings["hosts"][number]>) => onChange({ ...value, hosts: value.hosts.map(h => h.membershipId === membershipId ? { ...h, ...fields } : h) });
  const remaining = directory.members.filter(m => !value.hosts.some(h => h.membershipId === m.membershipId) && `${m.name} ${m.email ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <>
    <p className="muted">{kind === "collective" ? "Invitees can book when all selected hosts are available." : "Each booking is assigned to one available host."}</p>
    {value.hosts.map(host => { const member = directory.members.find(m => m.membershipId === host.membershipId); return <div className="shared-host" key={host.membershipId}>
      <div className="shared-host-heading"><b>{member?.name ?? "Unavailable host"}{member?.isMe ? " (you)" : ""}</b><button className="btn" onClick={() => onChange({ ...value, hosts: value.hosts.filter(h => h.membershipId !== host.membershipId) })} aria-label={`Remove ${member?.name ?? "unavailable host"}`}>×</button></div>
      {!member && <p role="status">This host is no longer a member. Remove them or select their current membership before accepting bookings.</p>}
      {member && <><label className="f" htmlFor={`shared-schedule-${host.membershipId}`}>Availability schedule</label><select className="input" id={`shared-schedule-${host.membershipId}`} value={host.scheduleId ?? ""} onChange={event => update(host.membershipId, { scheduleId: event.target.value || null })}>
        <option value="">Use default schedule</option>{member.schedules.map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.name} · {schedule.timezone.replaceAll("_", " ")}</option>)}
      </select></>}
      {kind === "round_robin" && value.distribution === "availability" && <><label className="f" htmlFor={`shared-priority-${host.membershipId}`}>Host priority</label><select className="input" id={`shared-priority-${host.membershipId}`} value={host.priority} onChange={event => update(host.membershipId, { priority: Number(event.target.value) })}><option value={1}>1 — Low</option><option value={2}>2 — Medium</option><option value={3}>3 — High</option></select></>}
    </div>; })}
    {!value.hosts.length && <p role="status">Add at least one host before saving.</p>}
    <label className="f" htmlFor="shared-host-search">{kind === "collective" ? "Add co-host" : "Add rotating host"}</label><input id="shared-host-search" className="input" type="search" placeholder="Search by name or email" value={search} onChange={event => setSearch(event.target.value)} />
    <div className="shared-host-choices">{remaining.map(member => <button key={member.membershipId} className="btn" onClick={() => { onChange({ ...value, hosts: [...value.hosts, { membershipId: member.membershipId, scheduleId: null, priority: 2 }] }); setSearch(""); }}>+ {member.name}</button>)}</div>
    {!remaining.length && <p className="muted">No other matching members. Pending invitations become available after acceptance.</p>}
    {kind === "round_robin" && <>
      <label className="f" htmlFor="shared-distribution">Distribution method</label><select className="input" id="shared-distribution" value={value.distribution} onChange={event => onChange({ ...value, distribution: event.target.value as SharedEventSettings["distribution"] })}><option value="availability">Maximize for availability</option><option value="equal">Optimize for equal distribution</option></select>
      <p className="muted">{value.distribution === "equal" ? "Hosts three meetings ahead are unavailable until others catch up. Changing hosts or distribution resets the counts." : "Use any available host, favoring higher priority, then the host assigned a meeting least recently."}</p>
      <label className="f" htmlFor="shared-reschedule">Rescheduling preferences</label><select className="input" id="shared-reschedule" value={value.reschedule} onChange={event => onChange({ ...value, reschedule: event.target.value as SharedEventSettings["reschedule"] })}><option value="reassign">Reassign hosts through round robin</option><option value="same">Use the same host as the original meeting</option></select>
    </>}
  </>;
}
