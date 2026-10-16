"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BP } from "@/lib/basepath";
import { PHOTO_TYPES, ProfileData, ProfilePatch, type Profile } from "@/lib/profile";
import { prepareProfilePhoto } from "@/lib/profile-photo-client";
import { ProfileAvatar } from "./ProfileAvatar";
import "./profile-settings.css";

const FIELDS = ["name", "welcomeMessage", "timezone", "image"] as const;
const LABELS: Record<string, string> = { name: "Name", welcomeMessage: "Welcome message", timezone: "Time zone", image: "Profile photo" };
export function ProfileSettings({ initial, zones }: { initial: Profile; zones: string[] }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial), [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(""), [status, setStatus] = useState(""), [search, setSearch] = useState("");
  const inFlight = useRef(false), mounted = useRef(true), photoVersion = useRef(0), alert = useRef<HTMLParagraphElement>(null);
  const dirty = FIELDS.some(field => draft[field] !== saved[field]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  useEffect(() => {
    if (!dirty && !busy && !preparing) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const leave = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.href === location.href || event.metaKey || event.ctrlKey) return;
      if (busy || !window.confirm("Discard your unsaved profile changes?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn); document.addEventListener("click", leave, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", leave, true); };
  }, [dirty, busy, preparing]);
  const change = (field: "name" | "welcomeMessage" | "timezone", value: string) => { setDraft(current => ({ ...current, [field]: value })); setError(""); setStatus(""); };
  async function choosePhoto(file?: File) {
    if (!file) return;
    const version = ++photoVersion.current; setPreparing(true); setError(""); setStatus("");
    try {
      const image = await prepareProfilePhoto(file);
      if (mounted.current && version === photoVersion.current) setDraft(current => ({ ...current, image }));
    } catch (cause) {
      if (mounted.current && version === photoVersion.current) setError(cause instanceof Error && /^(Choose|This image|Your browser)/.test(cause.message) ? cause.message : "This image could not be opened. Try a different photo.");
    } finally { if (mounted.current && version === photoVersion.current) setPreparing(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (inFlight.current || preparing || !dirty) return;
    const parsed = ProfilePatch.safeParse(Object.fromEntries(FIELDS.filter(field => draft[field] !== saved[field]).map(field => [field, draft[field]])));
    if (!parsed.success) { setError(`${LABELS[String(parsed.error.issues[0].path[0])] || "Profile"}: ${parsed.error.issues[0].message}`); return; }
    inFlight.current = true; setBusy(true); setError(""); setStatus("");
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      // Photos can exceed the browser's 64 KiB keepalive quota. Save while this
      // page is open; navigation/unload guards protect the pending draft.
      const response = await fetch(`${BP}/api/settings/profile`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data), signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in again before saving your profile." : result?.error === "invalid_photo" ? "Your photo could not be saved. Choose a valid image at least 90 × 90 pixels." : "save_failed");
      const profile = ProfileData.parse(result);
      if (["name", "welcomeMessage", "timezone"].some(key => key in parsed.data && profile[key as keyof Profile] !== parsed.data[key as keyof typeof parsed.data]) ||
        (parsed.data.image === null && profile.image !== null) || (parsed.data.image && !profile.image?.startsWith("data:image/png;base64,"))) throw new Error("unconfirmed_save");
      if (mounted.current) { setSaved(profile); setDraft(profile); setStatus("Changes saved"); router.refresh(); }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error && /^(Sign in|Your photo)/.test(cause.message) ? cause.message : "Saving could not be confirmed. Your changes are still here. Try again.");
    } finally { clearTimeout(timeout); inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const matches = zones.filter(zone => zone.replaceAll("_", " ").toLowerCase().includes(search.toLowerCase().trim()));
  const options = [...new Set([draft.timezone, ...matches])];
  return <form className="profile-settings" onSubmit={save} noValidate aria-labelledby="profile-general-title">
    <h1 id="profile-general-title">General</h1>
    <fieldset disabled={busy} aria-label="Profile details">
      <div className="profile-photo">
        <ProfileAvatar name={draft.name} image={draft.image} size={90} />
        <div><label htmlFor="profile-photo">Profile photo</label><input id="profile-photo" type="file" accept={PHOTO_TYPES.join(",")} disabled={preparing}
          onChange={event => { void choosePhoto(event.target.files?.[0]); event.target.value = ""; }} />
          <p className="muted">At least 90 × 90 pixels, smaller than 5 MB. Photos use a centered square crop.</p>
          {draft.image && <button type="button" className="btn" onClick={() => { photoVersion.current++; setPreparing(false); setDraft(current => ({ ...current, image: null })); setStatus(""); setError(""); }}>Remove photo</button>}
        </div>
      </div>
      <label htmlFor="profile-name">Name<input id="profile-name" className="input" autoComplete="name" value={draft.name} maxLength={120} onChange={event => change("name", event.target.value)} /></label>
      <label htmlFor="profile-welcome">Welcome message<textarea id="profile-welcome" className="input" rows={4} maxLength={1000} value={draft.welcomeMessage} onChange={event => change("welcomeMessage", event.target.value)} /></label>
      <p className="muted">Shown on your personal scheduling page. Leave blank to hide it.</p>
      <label htmlFor="profile-zone-search">Search time zones<input id="profile-zone-search" className="input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by city or region" /></label>
      <label htmlFor="profile-timezone">Time zone<select id="profile-timezone" className="input" value={draft.timezone} onChange={event => change("timezone", event.target.value)}>
        {options.map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
      </select></label>
      {matches.length === 0 && <p>No matching time zones. Your current time zone remains selected.</p>}
      <p className="muted">Used for your meetings and account meeting limits. Availability schedules have their own time zones.</p>
    </fieldset>
    {error && <p role="alert" tabIndex={-1} ref={alert}>{error}</p>}
    <div className="profile-actions"><button className="btn primary" type="submit" disabled={busy || preparing || !dirty}>{busy ? "Saving…" : "Save changes"}</button>
      <button className="btn" type="button" disabled={busy || (!dirty && !preparing)} onClick={() => { photoVersion.current++; setPreparing(false); setDraft(saved); setError(""); setStatus(""); }}>Cancel changes</button>
      {saved.username && <a href={`${BP}/${encodeURIComponent(saved.username)}`} target="_blank" rel="noreferrer">View scheduling page</a>}
    </div>
    <p role="status" aria-live="polite">{preparing ? "Preparing photo…" : busy ? "Saving…" : status}</p>
  </form>;
}
