"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BP } from "@/lib/basepath";
import type { WorkspaceChange, WorkspaceData, WorkspaceRole } from "@/lib/workspace-validation";
import "./workspace-settings.css";
const roles: Record<WorkspaceRole, string> = { owner: "Owner", admin: "Admin", user: "User" };
export function WorkspaceSettings({ initial, me, section }: { initial: WorkspaceData | null; me: string; section: "people" | "workspace" }) {
  const [workspace, setWorkspace] = useState(initial), [tab, setTab] = useState<"active" | "pending">("active");
  const [name, setName] = useState(initial?.name ?? ""), [email, setEmail] = useState(""), [role, setRole] = useState<"admin" | "user">("user"), [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState(""), [link, setLink] = useState("");
  const inFlight = useRef(false), alive = useRef(true), alert = useRef<HTMLParagraphElement>(null), linkInput = useRef<HTMLInputElement>(null);
  const creationId = useRef<string>(null), invitationId = useRef<string>(null);
  const canManage = workspace?.role === "owner" || workspace?.role === "admin";
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  async function request(change?: WorkspaceChange) {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); setError(""); setStatus(""); setLink("");
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${BP}/api/workspace`, { method: change ? "POST" : "GET", headers: { "Content-Type": "application/json" }, ...(change ? { body: JSON.stringify(change) } : {}), signal: controller.signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not save this change.");
      if (!alive.current) return false;
      setWorkspace(result.workspace); setLink(result.invitationUrl ?? "");
      if (!change || change.action === "create" || change.action === "rename") setName(result.workspace?.name ?? "");
      setStatus(change ? change.action === "invite" || change.action === "resend" ? result.invitationUrl ? "Invitation saved. You can copy its link below. Check the delivery status in Pending invitations." : "Invitation already saved. Use Resend to get a new invitation link if needed." : "Workspace updated." : "People refreshed.");
      return true;
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error && cause.name !== "AbortError" && cause.message !== "Failed to fetch" ? cause.message : "The change could not be confirmed. Your entries are still here. Refresh People to check its status.");
      return false;
    } finally { clearTimeout(timeout); inFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault(); creationId.current ??= crypto.randomUUID();
    if (await request({ action: "create", id: creationId.current, name })) creationId.current = null;
  }
  async function invite(event: React.FormEvent) {
    event.preventDefault(); if (!workspace) return; invitationId.current ??= crypto.randomUUID();
    if (await request({ action: "invite", id: invitationId.current, email: email.trim(), role, version: workspace.version })) { invitationId.current = null; setEmail(""); setTab("pending"); }
  }
  const matches = (value: string) => value.toLowerCase().includes(search.trim().toLowerCase());
  const members = workspace?.members.filter(member => matches(`${member.name ?? ""} ${member.email ?? ""}`)) ?? [];
  const invitations = workspace?.invitations.filter(invitation => matches(invitation.email)) ?? [];
  return <div className="workspace-settings" aria-busy={busy}>
    {error && <p ref={alert} tabIndex={-1} role="alert">{error}</p>}
    <p role="status">{status}</p>
    <button type="button" className="btn workspace-refresh" onClick={() => void request()} disabled={busy}>Refresh People</button>
    {!workspace ? <form onSubmit={create}>
      <h1>Create your workspace</h1><p>Invite people to collaborate. Everyone keeps their personal account and scheduling links. All workspace features are free.</p>
      <fieldset disabled={busy}><label>Workspace name<input className="input" required maxLength={120} value={name} onChange={event => { setName(event.target.value); creationId.current = null; }} /></label><button type="submit" className="btn primary">Create workspace</button></fieldset>
      <p className="muted">Already invited? Open your invitation link and sign in with the email address it was sent to.</p>
    </form> : <>
      <h1>{workspace.name}</h1><p>Your role: {roles[workspace.role]}. Everyone has access for free.</p>
      {section === "workspace" ? <>
        {canManage ? <form onSubmit={event => { event.preventDefault(); void request({ action: "rename", name, version: workspace.version }); }}><fieldset disabled={busy}><label>Workspace name<input className="input" required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label><button className="btn primary" disabled={name.trim() === workspace.name}>Save changes</button></fieldset></form> : <p>Contact an owner or admin to update this workspace.</p>}
        <p><Link href="/app/people">Manage people and invitations</Link></p>
        {workspace.role === "owner" && <div className="workspace-danger"><h2>Delete workspace</h2><p>Remove other members first. Pending invitations will stop working. Personal accounts, meetings and scheduling links stay in place.</p><button className="btn" disabled={busy || workspace.members.length > 1} onClick={() => { if (window.confirm("Delete this workspace and cancel its pending invitations? Personal accounts and meetings will be kept.")) void request({ action: "disband", version: workspace.version }); }}>Delete workspace</button></div>}
      </> : <>
        {canManage && <form className="workspace-invite" onSubmit={invite}><h2>Invite people</h2><fieldset disabled={busy}><label>Email address<input className="input" type="email" required autoComplete="off" maxLength={254} value={email} onChange={event => { setEmail(event.target.value); invitationId.current = null; }} /></label><label>Role<select className="input" value={role} onChange={event => { setRole(event.target.value as "user" | "admin"); invitationId.current = null; }}><option value="user">User</option><option value="admin">Admin</option></select></label><button type="submit" className="btn primary">Send invitation</button></fieldset><p className="muted">Invitations do not expire. We’ll send one reminder after 7 days. Admins can revoke invitations at any time.</p></form>}
        {link && <div className="workspace-invitation-link"><label>Invitation link<input ref={linkInput} className="input" value={link} readOnly /></label><button className="btn" type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setStatus("Invitation link copied."); } catch { linkInput.current?.select(); setStatus("Select and copy the invitation link."); } }}>Copy invitation link</button><p>Share only with the invited person. Resending replaces this link.</p></div>}
        <div className="workspace-tabs" aria-label="People lists"><button className={tab === "active" ? "on" : ""} aria-pressed={tab === "active"} onClick={() => setTab("active")}>Active users ({workspace.members.length})</button>{canManage && <button className={tab === "pending" ? "on" : ""} aria-pressed={tab === "pending"} onClick={() => setTab("pending")}>Pending invitations ({workspace.invitations.length})</button>}</div>
        <label>Search people<input className="input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or email address" /></label>
        {tab === "active" || !canManage ? <ul className="workspace-people">{members.map(member => <li key={member.id}><div><b>{member.name || member.email || "Workspace member"}{member.userId === me ? " (you)" : ""}</b><span>{member.email}</span><span>{roles[member.role]}</span></div>{canManage && member.role !== "owner" && <MemberActions key={`${member.id}-${member.role}-${workspace.version}`} member={member} workspace={workspace} busy={busy} save={request} />}</li>)}</ul> : <ul className="workspace-people">{invitations.map(invitation => <li key={invitation.id}><div><b>{invitation.email}</b><span>{roles[invitation.role]} · {invitation.delivery === "sent" ? "Email sent" : invitation.delivery === "undelivered" ? "Email not delivered — copy a new link using Resend" : "Delivery not confirmed"}</span><span>{invitation.expiresAt ? `Expires ${new Date(invitation.expiresAt).toISOString().slice(0, 10)} (UTC) — resend to replace this older invitation` : "No expiration"}</span>{invitation.reminderDelivery && <span>{invitation.reminderDelivery === "sent" ? "Reminder email sent" : invitation.reminderDelivery === "undelivered" ? "Reminder email not delivered — use Resend to try again" : "Reminder delivery not confirmed"}</span>}</div><div className="workspace-row-actions"><button className="btn" disabled={busy} onClick={() => void request({ action: "resend", invitationId: invitation.id, version: workspace.version })}>Resend<span className="sr-only"> invitation to {invitation.email}</span></button><button className="btn" disabled={busy} onClick={() => { if (window.confirm(`Revoke the invitation to ${invitation.email}?`)) void request({ action: "revoke", invitationId: invitation.id, version: workspace.version }); }}>Revoke<span className="sr-only"> invitation to {invitation.email}</span></button></div></li>)}</ul>}
        {((tab === "active" || !canManage) ? !members.length : !invitations.length) && <p>{search ? "No people match your search." : "No pending invitations."}</p>}
        {!canManage && <p>Ask an owner or admin in this directory to invite people or change membership.</p>}
      </>}
    </>}
  </div>;
}
function MemberActions({ member, workspace, busy, save }: { member: WorkspaceData["members"][number]; workspace: WorkspaceData; busy: boolean; save: (change: WorkspaceChange) => Promise<boolean> }) {
  const [role, setRole] = useState(member.role);
  const label = member.name || member.email || "member";
  return <form className="workspace-row-actions" onSubmit={event => { event.preventDefault(); if (role === "owner" && !window.confirm(`Transfer ownership to ${label}? You will become an admin.`)) return; void save({ action: "role", userId: member.userId, role, version: workspace.version }); }}><label><span className="sr-only">Role for {label}</span><select className="input" value={role} disabled={busy} onChange={event => setRole(event.target.value as WorkspaceRole)}><option value="user">User</option><option value="admin">Admin</option>{workspace.role === "owner" && <option value="owner">Owner</option>}</select></label><button className="btn" disabled={busy || role === member.role}>Apply<span className="sr-only"> role for {label}</span></button><button type="button" className="btn" disabled={busy} onClick={() => { if (window.confirm(`Remove ${label} from this workspace? Their personal account and meetings will be kept.`)) void save({ action: "remove", userId: member.userId, version: workspace.version }); }}>Remove<span className="sr-only"> {label}</span></button></form>;
}
