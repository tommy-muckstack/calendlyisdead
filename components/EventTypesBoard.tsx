"use client";
import { BP } from "@/lib/basepath";
import { I } from "@/components/app/icons";
import { EventTypeMenu, type EventTypeAction } from "./EventTypeMenu";
import { EventTypePatch } from "@/lib/event-type-validation";
import { HostMeetingLimits } from "./HostMeetingLimits";
import { START_INTERVAL_PRESETS, MIN_START_INTERVAL_MIN, MAX_START_INTERVAL_MIN } from "@/lib/start-increments";
import { setEventVisibility } from "@/lib/event-visibility-client";
import { BOOKING_TIMEZONES } from "@/lib/booking-timezone";
import { dateRangeSummary, effectiveDateRange, withDateRangeLocks, type BookingDateRange } from "@/lib/booking-date-range";
import { BookingDateRangeFields } from "./BookingDateRangeFields";
import { ContactFieldAutomationPanel } from "./ContactFieldAutomation";
import { ContactListAutomationPanel } from "./ContactListAutomation";
import { useEffect, useRef, useState } from "react";
export type ET = { id: string; slug: string; title: string; description: string; durationMin: number; startIntervalMin: number; location: string; color: string;
  bufferBeforeMin: number; bufferAfterMin: number; minNoticeMin: number; rangeDays: number; dateRange: BookingDateRange | null; active: boolean; secret: boolean; lockedTimezone: string | null;
  scheduleId: string | null; maxPerDay: number | null; maxPerWeek: number | null; maxPerMonth: number | null; questions: Q[];
  kind: string; seats: number; teamId?: string | null; managedParentId: string | null; lockedFields: string[]; priceCents: number; currency: string; redirectUrl: string | null; groupSettingsLocked?: boolean };
type Q = { id: string; label: string; type: "text" | "textarea" | "phone" | "select"; required: boolean; options?: string[] };

type Sch = { id: string; name: string; timezone?: string; isDefault?: boolean };
type PersonalKind = "one_on_one" | "group";
const NEW_EVENT_FIELDS = EventTypePatch.omit({ rrMode: true }).required();
const KIND_LABEL: Record<string, string> = { one_on_one: "One-on-one", group: "Group", collective: "Collective", round_robin: "Round robin", managed: "Managed", one_off: "Single-use link", poll: "Meeting poll" };
const EDITABLE_KEYS = ["title", "slug", "description", "durationMin", "startIntervalMin", "lockedTimezone", "location", "color", "bufferBeforeMin", "bufferAfterMin", "minNoticeMin", "dateRange", "active", "scheduleId", "maxPerDay", "maxPerWeek", "maxPerMonth", "questions", "kind", "seats", "priceCents", "currency", "redirectUrl"] as const;
function draftBody(d: ET) {
  return Object.fromEntries(EDITABLE_KEYS.filter(key =>
    !(d.managedParentId && withDateRangeLocks(d.lockedFields).includes(key)) &&
    !(key === "kind" && (d.managedParentId || d.teamId)) && !(key === "scheduleId" && d.teamId)
  ).map(key => [key, key === "questions" ? d.questions.map(q => q.type === "select" ? q : { ...q, options: undefined }) : d[key]]));
}
const FIELD_NAMES: Record<string, string> = { title: "Name", slug: "Link", description: "Description", durationMin: "Duration", startIntervalMin: "Start time increments", lockedTimezone: "Booking time zone",
  location: "Location", color: "Color", bufferBeforeMin: "Buffer before", bufferAfterMin: "Buffer after", minNoticeMin: "Minimum notice",
  dateRange: "Date range", scheduleId: "Schedule", maxPerDay: "Daily limit", maxPerWeek: "Weekly limit", maxPerMonth: "Monthly limit", questions: "Invitee questions",
  kind: "Type", seats: "Invitee limit", priceCents: "Price", currency: "Currency", redirectUrl: "Redirect URL" };
export function EventTypesBoard({ initial, username, schedules, owner, defaultTimezone = "UTC" }: { initial: ET[]; username: string; schedules: Sch[]; owner?: string; defaultTimezone?: string }) {
  const [items, setItems] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [boardError, setBoardError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const creationUncertainRef = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const open = items.find(i => i.id === openId) ?? null;
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1400); };
  async function create(kind: PersonalKind) {
    if (busyRef.current) return;
    if (creationUncertainRef.current) { setBoardError("Creation could not be confirmed. Reload to check your event types before creating another."); return; }
    busyRef.current = true; setBusy("create"); setBoardError("");
    const abort = new AbortController(); const timeout = setTimeout(() => abort.abort(), 15_000);
    try {
      const response = await fetch(BP + "/api/event-types", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }), signal: abort.signal });
      if (response.status === 401) { setBoardError("Sign in again to create an event type."); return; }
      if (!response.ok) throw new Error("create_failed");
      const et = await response.json();
      if (typeof et?.id !== "string" || !et.id || et.kind !== kind || !NEW_EVENT_FIELDS.safeParse(et).success ||
        (kind === "group" && et.seats < 2) || !Array.isArray(et.lockedFields)) throw new Error("invalid_response");
      setItems(x => [...x, et]); setQ(""); setOpenId(et.id);
    } catch {
      creationUncertainRef.current = true; setCreationUncertain(true);
      setBoardError("Creation could not be confirmed. Reload to check your event types before creating another.");
    } finally { clearTimeout(timeout); busyRef.current = false; setBusy(null); }
  }
  async function remove(et: ET) {
    const response = await fetch(`${BP}/api/event-types/${et.id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("delete_failed");
    setItems(x => x.filter(i => i.id !== et.id)); setOpenId(null); searchInput.current?.focus();
  }
  async function act(action: EventTypeAction, et: ET) {
    if (action === "edit") { setOpenId(et.id); return; }
    if (busyRef.current) return;
    if (action === "delete" && !confirm("Delete this event type? Scheduled meetings will remain unchanged.")) return;
    busyRef.current = true; setBusy(et.id); setBoardError("");
    try {
      if (action === "delete") { await remove(et); flash("Event type deleted"); return; }
      if (action === "visibility") {
        await setEventVisibility(et.id, !et.secret);
        setItems(items => items.map(item => item.id === et.id ? { ...item, secret: !et.secret } : item));
        flash(et.secret ? "Event type made public" : "Event type made secret"); return;
      }
      const response = await fetch(`${BP}/api/event-types/${et.id}${action === "duplicate" ? "/duplicate" : ""}`, {
        method: action === "duplicate" ? "POST" : "PATCH", headers: { "content-type": "application/json" },
        body: action === "toggle" ? JSON.stringify({ active: !et.active }) : undefined,
      });
      if (!response.ok) throw new Error("action_failed");
      const saved = await response.json();
      if (!saved?.id || typeof saved.title !== "string") throw new Error("invalid_response");
      if (action === "duplicate") { setItems(x => [...x, saved]); setQ(""); setOpenId(saved.id); flash("Event type duplicated"); }
      else { setItems(x => x.map(item => item.id === saved.id ? saved : item)); flash(saved.active ? "Event type turned on" : "Event type turned off"); }
    } catch (error) { setBoardError(action === "visibility" && error instanceof Error ? error.message : "The change could not be confirmed. Reload the page before trying again."); }
    finally { busyRef.current = false; setBusy(null); }
  }
  useEffect(() => {
    const f = (event: Event) => { const kind = (event as CustomEvent<PersonalKind>).detail; void create(kind === "group" ? "group" : "one_on_one"); };
    addEventListener("cid:create-event-type", f);
    const url = new URL(location.href), kind = url.searchParams.get("new");
    if (kind) {
      url.searchParams.delete("new"); history.replaceState(null, "", url.pathname + url.search + url.hash);
      if (["1", "one_on_one", "group"].includes(kind)) void create(kind === "group" ? "group" : "one_on_one");
    }
    return () => removeEventListener("cid:create-event-type", f);
  }, []);
  const [q, setQ] = useState("");
  const shown = items.filter(i => !q || i.title.toLowerCase().includes(q.toLowerCase()));
  const sched = schedules.find(x => x.id === (shown[0]?.scheduleId ?? ""))?.name;
  return <>
    {boardError && <p role="alert" className="cs-board-error">{boardError}</p>}
    {creationUncertain && <button className="cs-btn cs-outline" onClick={() => location.reload()}>Reload event types</button>}
    {busy && <p role="status" className="muted">{busy === "create" ? "Creating event type…" : "Updating event type…"}</p>}
    <div className="cs-search">{I.search(18)}<input ref={searchInput} placeholder="Search event types" aria-label="Search event types" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="cs-grp"><span className="cs-av">{(owner || username)[0]?.toUpperCase()}</span><b>{owner || username}</b>
      <a href={`${BP}/${username}`} target="_blank">View landing page {I.ext(14)}</a></div>
    {shown.map(et => <div key={et.id} className="cs-et" style={{ borderLeftColor: et.color, opacity: et.active ? 1 : .55 }} onClick={() => setOpenId(et.id)} data-testid="event-type">
      <input type="checkbox" aria-label={`Select ${et.title}`} onClick={e => e.stopPropagation()} />
      <div className="cs-et-copy">
        <h3><button className="cs-et-title" onClick={e => { e.stopPropagation(); setOpenId(et.id); }} aria-label={`Edit ${et.title}`}>{et.title}</button>{et.secret && <span className="cs-secret" role="img" aria-label="Secret event" title="Hidden from your scheduling page. Anyone with the direct link can book.">{I.hidden(16)}</span>}</h3>
        <p>{!et.location && <span className="cs-dot" />}{et.durationMin} min • {et.location || "No location set"} • {et.kind === "group" ? `Group (${et.seats} seats)` : "One-on-One"}{et.managedParentId ? " • Managed by your team" : ""}</p>
        <p>{sched ? `${sched}` : "Weekdays, 9 am - 5 pm"}</p>
      </div>
      <button className="cs-btn cs-outline" onClick={async e => {
        e.stopPropagation(); setBoardError("");
        try { await navigator.clipboard.writeText(`${location.origin}${BP}/${username}/${et.slug}`); flash("Link copied"); }
        catch { setBoardError("The link could not be copied. Open the booking page and copy its address."); }
      }}>{I.link(14)}Copy link</button>
      <a className="cs-ibtn" aria-label={`View ${et.title}`} href={`${BP}/${username}/${et.slug}`} target="_blank" onClick={e => e.stopPropagation()}>{I.ext(16)}</a>
      <EventTypeMenu title={et.title} active={et.active} secret={et.secret} managed={!!et.managedParentId} busy={!!busy}
        bookingUrl={`${BP}/${username}/${et.slug}`} embedUrl={`/app/embed?event=${encodeURIComponent(et.slug)}`}
        onAction={action => { void act(action, et); }} />
    </div>)}
    {open && <EventTypeEditor key={open.id} et={open} username={username} schedules={schedules} defaultTimezone={defaultTimezone} onClose={() => setOpenId(null)}
      onChange={n => setItems(x => x.map(i => i.id === n.id ? n : i))} onSaved={() => flash("Saved")}
      onDelete={() => remove(open)} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </>;
}

export function EventTypeEditor({ et, username, schedules, defaultTimezone = "UTC", onClose, onChange, onSaved, onDelete }: { et: ET; username: string; schedules: Sch[]; defaultTimezone?: string; onClose(): void; onChange(e: ET): void; onSaved(): void; onDelete(): Promise<void> }) {
  const [d, setD] = useState(et);
  const [baseline, setBaseline] = useState(et);
  const [zoneSearch, setZoneSearch] = useState("");
  const selectedZone = d.lockedTimezone ?? schedules.find(schedule => d.scheduleId ? schedule.id === d.scheduleId : schedule.isDefault)?.timezone ?? defaultTimezone;
  const bookingZones = [...new Set([selectedZone, ...BOOKING_TIMEZONES.filter(zone => zone.replaceAll("_", " ").toLowerCase().includes(zoneSearch.trim().toLowerCase()))])];
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null), closeButton = useRef<HTMLButtonElement>(null), errorMessage = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const panel = dialog.current;
    panel?.showModal();
    (nameInput.current?.disabled ? closeButton.current : nameInput.current)?.focus();
    return () => { panel?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const [sect, setSect] = useState<string>("basics");
  const [customInterval, setCustomInterval] = useState(!START_INTERVAL_PRESETS.includes(et.startIntervalMin));
  const [err, setErr] = useState("");
  const [groupLocked, setGroupLocked] = useState(et.groupSettingsLocked ?? false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveCount, setSaveCount] = useState(0);
  const requestPending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const dirty = JSON.stringify(draftBody(d)) !== JSON.stringify(draftBody(baseline));
  const pending = saving || deleting;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { if (err && !pending) errorMessage.current?.focus(); }, [err, pending]);
  useEffect(() => { if (saveCount) closeButton.current?.focus(); }, [saveCount]);
  function requestClose() {
    if (requestPending.current) return;
    if (!dirty || confirm("Discard unsaved changes?")) onClose();
  }
  async function save() {
    if (requestPending.current || !dirty) return;
    const body = draftBody(d);
    const parsed = EventTypePatch.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue.path[0] === "startIntervalMin" || issue.path[0] === "lockedTimezone") setSect("link");
      if (issue.path[0] === "dateRange" || issue.path[0] === "minNoticeMin") setSect("avail");
      setErr(`${FIELD_NAMES[String(issue.path[0])] ?? "Event settings"}: ${issue.message}`);
      return;
    }
    if (d.questions.some(q => !q.label.trim() || (q.type === "select" && !(q.options ?? []).length))) {
      setSect("questions"); setErr("Enter a label for every question and at least one choice for each choice question."); return;
    }
    if (d.kind === "group" && d.seats < 2) { setSect("basics"); setErr("Invitee limit must be at least 2."); return; }
    requestPending.current = true; setSaving(true); setErr("");
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 15_000);
    try {
      const response = await fetch(`${BP}/api/event-types/${et.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data), signal: abort.signal });
      const result = await response.json();
      if (!response.ok) {
        if (result?.error === "group_settings_locked" && result.settings?.kind === "group" &&
          typeof result.settings.durationMin === "number" && typeof result.settings.location === "string") {
          const settings = { kind: "group", durationMin: result.settings.durationMin, location: result.settings.location };
          setGroupLocked(true);
          // Refresh protected values without discarding unrelated draft edits.
          setD(current => ({ ...current, ...settings }));
          setBaseline(current => ({ ...current, ...settings }));
          setErr("This group event was booked. Its duration and location can no longer change. Your other edits are still here; save again to apply them.");
        } else if (result?.error === "slug_taken") { setSect("link"); setErr("That link is already used. Choose another link and save again."); }
        else if (result?.error === "unauthorized") setErr("Your session expired. Your edits have not been saved. Sign in again before saving.");
        else if (result?.error === "locked") setErr("Your team changed the locked settings. Your edits have not been saved. Copy your changes before reloading.");
        else if (result?.error === "event_kind_locked") setErr("An event type cannot be converted to another kind. Create a new event type instead.");
        else if (result?.error === "bad_schedule") { setSect("avail"); setErr("That schedule is no longer available. Choose another schedule and save again."); }
        else throw new Error("save_failed");
        return;
      }
      if (!result || result.id !== et.id || !Object.keys(body).every(key => Object.hasOwn(result, key)) ||
        !EventTypePatch.safeParse(Object.fromEntries(Object.keys(body).map(key => [key, result[key]]))).success) throw new Error("invalid_response");
      const saved: ET = { ...d, ...result };
      if (saved.groupSettingsLocked) setGroupLocked(true);
      setD(saved); setBaseline(saved); setSaveCount(count => count + 1); onChange(saved); onSaved();
    } catch {
      setErr("Saving could not be confirmed. Your edits are still here. Try saving again.");
    } finally {
      clearTimeout(timeout); controller.current = null; requestPending.current = false; setSaving(false);
    }
  }
  const L = (k: string) => ((d.lockedFields ?? []).includes(k) && !!d.managedParentId) ||
    (groupLocked && ["durationMin", "location", "kind"].includes(k));
  const set = (k: keyof ET) => (e: any) => setD({ ...d, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const S = ({ id, title, summary, children }: any) => <div className="sect">
    <button onClick={() => setSect(sect === id ? "" : id)} aria-expanded={sect === id}><span><b>{title}</b><small>{summary}</small></span><span>{sect === id ? "–" : "+"}</span></button>
    {sect === id && <div style={{ paddingBottom: 16 }}>{children}</div>}
  </div>;
  return <dialog ref={dialog} className="pane" aria-label="Edit event type" aria-modal="true"
    onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); requestClose(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose();
    }}>
      <header><b>Edit event type</b><button ref={closeButton} className="btn" disabled={pending} onClick={requestClose} aria-label="Close">✕</button></header>
      <div className="body">
        {err && <p ref={errorMessage} role="alert" tabIndex={-1} style={{ color: "var(--warn)" }}>{err}</p>}
        {groupLocked && <p id="group-settings-lock" className="muted" role="status">This group event has bookings. Duration, location and event type are locked. Create a new event type to use different settings.</p>}
        {d.managedParentId && <p className="card" style={{ padding: 10, background: "var(--brand-soft)", fontSize: 14 }}>Your team manages this event type. Locked: {(d.lockedFields ?? []).join(", ") || "nothing"}.</p>}
        <fieldset className="editor-fields" disabled={pending} aria-label="Event settings">
        {S({ id: "basics", title: "Basics", summary: `${d.title} · ${d.durationMin} min`, children: <>
          <label className="f" htmlFor="et-title">Name</label><input ref={nameInput} id="et-title" disabled={L("title")} className="input" value={d.title} onChange={set("title")} />
          <label className="f" htmlFor="et-dur">Duration (minutes)</label><input id="et-dur" disabled={L("durationMin")} aria-describedby={groupLocked ? "group-settings-lock" : undefined} className="input" type="number" min={5} value={d.durationMin} onChange={set("durationMin")} />
          <label className="f" htmlFor="et-color">Color</label><input id="et-color" disabled={L("color")} type="color" value={d.color} onChange={set("color")} />
          <p className="muted" data-testid="event-kind">{KIND_LABEL[d.kind] ?? "Event type"} · To use another kind, create a new event type.</p>
          {d.kind === "group" && <><label className="f" htmlFor="et-seats">Invitee limit</label><input id="et-seats" className="input" type="number" min={2} max={9999} value={d.seats} onChange={set("seats")} /><p className="muted">Applies to new meetings. Edit a scheduled meeting&#39;s limit from its meeting details.</p></>}
          <label className="f"><input type="checkbox" checked={d.active} onChange={set("active")} /> Accepting bookings</label></> })}
        {S({ id: "where", title: "Location", summary: d.location || "Not set", children: <>
          <input className="input" list="locs" aria-label="Location" disabled={L("location")} aria-describedby={groupLocked ? "group-settings-lock" : undefined} value={d.location} onChange={set("location")} placeholder="Zoom, Google Meet, phone, an address…" />
          <datalist id="locs"><option>Google Meet</option><option>Zoom</option><option>Phone call</option><option>In person</option></datalist></> })}
        {S({ id: "link", title: "Booking page options", summary: `/${username}/${d.slug} · ${Number.isFinite(d.startIntervalMin) ? `${d.startIntervalMin} min` : "Custom"} increments`, children: <>
          <label className="f" htmlFor="et-slug">Link</label><input id="et-slug" className="input" value={d.slug} onChange={e => setD({ ...d, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
          <label className="f" htmlFor="et-start-interval">Start time increments</label>
          <select id="et-start-interval" className="input" disabled={L("startIntervalMin")} value={customInterval ? "custom" : String(d.startIntervalMin)} aria-describedby="et-start-help" onChange={event => {
            const custom = event.target.value === "custom"; setCustomInterval(custom);
            if (!custom) setD({ ...d, startIntervalMin: Number(event.target.value) });
          }}>
            {START_INTERVAL_PRESETS.map(value => <option key={value} value={value}>{value} minutes</option>)}<option value="custom">Custom</option>
          </select>
          {customInterval && <><label className="f" htmlFor="et-custom-interval">Custom increment (minutes)</label>
            <input id="et-custom-interval" className="input" type="number" min={MIN_START_INTERVAL_MIN} max={MAX_START_INTERVAL_MIN} step={1} disabled={L("startIntervalMin")}
              value={Number.isNaN(d.startIntervalMin) ? "" : d.startIntervalMin} onChange={event => setD({ ...d, startIntervalMin: event.target.value === "" ? NaN : Number(event.target.value) })} /></>}
          <p className="muted" id="et-start-help">Choose how often available start times appear. Meeting duration stays the same.</p>
          <label className="f"><input type="checkbox" checked={d.lockedTimezone !== null} disabled={L("lockedTimezone")} onChange={event => setD({ ...d, lockedTimezone: event.target.checked ? selectedZone : null })} /> Lock the timezone</label>
          {d.lockedTimezone !== null && <>
            <label className="f" htmlFor="et-zone-search">Search time zones</label><input id="et-zone-search" className="input" type="search" disabled={L("lockedTimezone")} value={zoneSearch} onChange={event => setZoneSearch(event.target.value)} placeholder="Search by city or region" />
            <label className="f" htmlFor="et-booking-zone">Booking time zone</label><select id="et-booking-zone" className="input" disabled={L("lockedTimezone")} value={d.lockedTimezone} onChange={event => setD({ ...d, lockedTimezone: event.target.value })}>
              {bookingZones.map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
            </select>
          </>}
          <p className="muted">{d.lockedTimezone ? "Invitees see times in this zone. Your availability schedule stays the same." : "Automatically show times in each invitee’s time zone."}</p>
        </> })}
        {S({ id: "description", title: "Description", summary: d.description ? d.description.slice(0, 80) + (d.description.length > 80 ? "…" : "") : "No description", children: <>
          <label className="f" htmlFor="et-desc">Description</label><textarea id="et-desc" disabled={L("description")} className="input" rows={4} value={d.description} onChange={set("description")} /></> })}
        {S({ id: "limits", title: "Limits and buffers", summary: `Buffers ${d.bufferBeforeMin}/${d.bufferAfterMin} min${d.maxPerDay ? ` · ${d.maxPerDay}/day` : ""}${d.maxPerWeek ? ` · ${d.maxPerWeek}/week` : ""}${d.maxPerMonth ? ` · ${d.maxPerMonth}/month` : ""}`, children: <>
          <label className="f" htmlFor="et-bb">Buffer before (min)</label><input id="et-bb" disabled={L("bufferBeforeMin")} className="input" type="number" min={0} value={d.bufferBeforeMin} onChange={set("bufferBeforeMin")} />
          <label className="f" htmlFor="et-ba">Buffer after (min)</label><input id="et-ba" disabled={L("bufferAfterMin")} className="input" type="number" min={0} value={d.bufferAfterMin} onChange={set("bufferAfterMin")} />
          <label className="f" htmlFor="et-mpd">Max bookings per day (blank = no limit)</label>
          <input id="et-mpd" disabled={L("maxPerDay")} className="input" type="number" min={1} value={d.maxPerDay ?? ""} onChange={e => setD({ ...d, maxPerDay: e.target.value ? Number(e.target.value) : null })} />
          <label className="f" htmlFor="et-mpw">Max bookings per week (blank = no limit)</label>
          <input id="et-mpw" disabled={L("maxPerWeek")} className="input" type="number" min={1} value={d.maxPerWeek ?? ""} onChange={e => setD({ ...d, maxPerWeek: e.target.value ? Number(e.target.value) : null })} />
          <label className="f" htmlFor="et-mpm">Max bookings per month (blank = no limit)</label>
          <input id="et-mpm" disabled={L("maxPerMonth")} className="input" type="number" min={1} max={2147483647} value={d.maxPerMonth ?? ""} onChange={e => setD({ ...d, maxPerMonth: e.target.value ? Number(e.target.value) : null })} />
          <p className="muted">Meeting limits apply across this event type’s hosts. A group session counts once, even when several invitees join.</p>
          <HostMeetingLimits eventId={et.id} /></> })}
        {S({ id: "avail", title: "Availability", summary: `${schedules.find(x => x.id === d.scheduleId)?.name ?? "Default schedule"} · ${dateRangeSummary(effectiveDateRange(d))} · ${d.minNoticeMin / 60}h notice`, children: <>
          <BookingDateRangeFields value={effectiveDateRange(d)} disabled={L("dateRange") || L("rangeDays")} onChange={dateRange => setD({ ...d, dateRange })} />
          <p className="muted">{d.teamId ? "Dates use the event creator’s default schedule time zone." : "Dates use your selected availability schedule’s time zone."}</p>
          <label className="f" htmlFor="et-mn">Minimum notice (min)</label><input id="et-mn" disabled={L("minNoticeMin")} className="input" type="number" min={0} value={d.minNoticeMin} onChange={set("minNoticeMin")} />
          {d.teamId ? <p className="muted">Uses each host&#39;s default availability schedule.</p> : <><label className="f" htmlFor="et-sched">Schedule</label>
          <select id="et-sched" className="input" value={d.scheduleId ?? ""} onChange={e => setD({ ...d, scheduleId: e.target.value || null })}>
            <option value="">Default schedule</option>{schedules.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></>}
        </> })}
        {S({ id: "questions", title: "Invitee questions", summary: `Name, email${(d.questions ?? []).length ? ` + ${(d.questions ?? []).length} more` : ""}`, children: <>
          {(d.questions ?? []).map((q, i) => { const up = (n: Partial<Q>) => setD({ ...d, questions: d.questions.map((x, j) => j === i ? { ...x, ...n } : x) });
            return <div key={q.id} className="card" style={{ padding: 12, marginBottom: 10 }} data-testid="question">
              <input aria-label={`Question ${i + 1}`} className="input" value={q.label} placeholder="Your question" onChange={e => up({ label: e.target.value })} />
              <div className="row" style={{ marginTop: 8 }}>
                <select aria-label={`Question ${i + 1} type`} className="input" style={{ width: 150 }} value={q.type} onChange={e => up({ type: e.target.value as Q["type"] })}>
                  <option value="text">Short answer</option><option value="textarea">Paragraph</option><option value="phone">Phone</option><option value="select">Choice</option></select>
                <label><input type="checkbox" checked={q.required} onChange={e => up({ required: e.target.checked })} /> Required</label>
                <button className="btn" aria-label="Remove question" onClick={() => setD({ ...d, questions: d.questions.filter((_, j) => j !== i) })}>✕</button>
              </div>
              {q.type === "select" && <input aria-label={`Question ${i + 1} choices`} className="input" style={{ marginTop: 8 }} placeholder="Choices, comma separated"
                value={(q.options ?? []).join(", ")} onChange={e => up({ options: e.target.value.split(",").map(x => x.trim()) })} />}
            </div>; })}
          <button className="btn" onClick={() => setD({ ...d, questions: [...(d.questions ?? []), { id: `q${Date.now().toString(36)}`, label: "", type: "text", required: false }] })}>+ Add question</button></> })}
        {S({ id: "contact-automations", title: "Contact automations", summary: "Organize contacts when they book", children: <><ContactListAutomationPanel eventId={et.id} /><ContactFieldAutomationPanel eventId={et.id} /></> })}
        {S({ id: "pay", title: "Payment and confirmation", summary: `${d.priceCents ? `${(d.priceCents / 100).toFixed(2)} ${d.currency.toUpperCase()}` : "Free"}${d.redirectUrl ? " · redirects after booking" : ""}`, children: <>
          <label className="f" htmlFor="et-price">Price (0 = free)</label>
          <input id="et-price" className="input" type="number" min={0} step="0.01" value={(d.priceCents ?? 0) / 100} onChange={e => setD({ ...d, priceCents: Math.round(Number(e.target.value || 0) * 100) })} />
          <label className="f" htmlFor="et-cur">Currency</label>
          <select id="et-cur" className="input" value={d.currency ?? "usd"} onChange={e => setD({ ...d, currency: e.target.value })}>{["usd", "eur", "gbp", "cad", "aud"].map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}</select>
          <p className="muted" style={{ fontSize: 13 }}>Payments go through Stripe Checkout when STRIPE_SECRET_KEY is set; otherwise a demo checkout is shown.</p>
          <label className="f" htmlFor="et-redirect">Redirect after booking (optional)</label>
          <input id="et-redirect" className="input" placeholder="https://example.com/thanks" value={d.redirectUrl ?? ""} onChange={e => setD({ ...d, redirectUrl: e.target.value.trim() || null })} /></> })}
        {!d.managedParentId && <button className="btn danger" disabled={deleting} onClick={async () => {
          if (requestPending.current) return;
          if (!confirm("Delete this event type? Scheduled meetings will remain unchanged.")) return;
          requestPending.current = true; setDeleting(true);
          try { await onDelete(); }
          catch { setErr("Deletion could not be confirmed. Reload the page before trying again."); }
          finally { requestPending.current = false; setDeleting(false); }
        }}>{deleting ? "Deleting…" : "Delete event type"}</button>}
        </fieldset>
      </div>
      <footer className="editor-actions">
        <span className="muted" role="status">{saving ? "Saving…" : dirty ? "Unsaved changes" : saveCount ? "Changes saved" : ""}</span>
        <button className="btn" disabled={pending} onClick={requestClose}>Cancel</button>
        <button className="btn primary" disabled={pending || !dirty} onClick={() => { void save(); }}>Save changes</button>
      </footer>
    </dialog>;
}
