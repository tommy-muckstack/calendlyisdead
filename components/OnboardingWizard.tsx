"use client";
import { useEffect, useRef, useState } from "react";
import { BP } from "@/lib/basepath";
import { ONBOARDING_ROLES, OnboardingData, OnboardingMutation, OnboardingTimezone } from "@/lib/onboarding-validation";
import { G } from "@/components/mk/icons";
import { I } from "@/components/app/icons";
type Props = {
  initial: OnboardingData;
  connections: { id: string; provider: string; accountEmail: string; status: string }[];
  available: { google: boolean; microsoft: boolean };
  calendarError?: boolean;
};
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const steps = ["role", "calendar", "availability"] as const;
const headings = { role: "How will you use CalendlyIsDead?", calendar: "Connect your calendar", availability: "Set your availability", complete: "Your account is ready" };

export function OnboardingWizard({ initial, connections, available, calendarError = false }: Props) {
  const [saved, setSaved] = useState(initial), [step, setStep] = useState(initial.step);
  const [role, setRole] = useState(initial.role), [timezone, setTimezone] = useState(initial.timezone ?? "UTC"), [weekly, setWeekly] = useState(initial.weekly);
  const [zones, setZones] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(""), [conflict, setConflict] = useState(false), [existing, setExisting] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null), alert = useRef<HTMLDivElement>(null), controller = useRef<AbortController | null>(null), leaving = useRef(false);
  const dirty = role !== saved.role || timezone !== (saved.timezone ?? "UTC") || JSON.stringify(weekly) !== JSON.stringify(saved.weekly);
  useEffect(() => {
    if (typeof Intl.supportedValuesOf === "function") setZones(Intl.supportedValuesOf("timeZone"));
    if (!initial.timezone) {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (OnboardingTimezone.safeParse(detected).success) setTimezone(detected);
    }
    return () => controller.current?.abort();
  }, [initial.timezone]);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (!leaving.current && (dirty || busy)) { event.preventDefault(); event.returnValue = ""; } };
    const confirmLeave = (event: Event) => {
      if (busy || (dirty && !window.confirm("Leave setup and discard your unsaved changes?"))) { event.preventDefault(); event.stopPropagation(); }
      else leaving.current = true;
    };
    const link = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (anchor.getAttribute("aria-disabled") === "true") { event.preventDefault(); event.stopPropagation(); return; }
      confirmLeave(event);
    };
    const signOut = (event: SubmitEvent) => {
      if (event.target instanceof HTMLFormElement && !event.target.closest(".onboarding-card")) confirmLeave(event);
    };
    window.addEventListener("beforeunload", guard); document.addEventListener("click", link, true); document.addEventListener("submit", signOut, true);
    return () => { window.removeEventListener("beforeunload", guard); document.removeEventListener("click", link, true); document.removeEventListener("submit", signOut, true); };
  }, [dirty, busy]);
  const done = () => { leaving.current = true; window.location.assign(BP + "/app"); };
  async function request(input?: OnboardingMutation) {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort; setBusy(true); setError(""); setConflict(false); setExisting(false);
    const timeout = window.setTimeout(() => abort.abort(), 15_000);
    try {
      const response = await fetch(BP + "/api/onboarding", { method: input ? "POST" : "GET", ...(input ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : {}), signal: abort.signal });
      const data = await response.json();
      if (!response.ok) { setConflict(response.status === 409); setExisting(data.code === "existing_setup"); throw new Error(typeof data.error === "string" ? data.error : "Could not save setup. Please try again."); }
      const result = OnboardingData.parse(data);
      if (input) {
        const expected = input.action === "role" ? "calendar" : input.action === "calendar" ? "availability" : "complete";
        if (result.version !== input.version + 1 || result.step !== expected ||
          (input.action === "role" && (result.role !== input.role || result.timezone !== input.timezone)) ||
          (input.action === "calendar" && result.calendarSkipped !== input.skip) ||
          (input.action === "finish" && (result.timezone !== input.timezone || JSON.stringify(result.weekly) !== JSON.stringify(input.weekly)))) throw new Error("The saved setup could not be confirmed. Please try again.");
      }
      if (result.step === "complete") { done(); return; }
      setSaved(result); setStep(result.step);
      if (!input) { setRole(result.role); setTimezone(result.timezone ?? "UTC"); setWeekly(result.weekly); }
    } catch (failure) {
      setError(abort.signal.aborted ? "Saving took too long. Your edits are still here; please try again." : failure instanceof Error && !(failure instanceof SyntaxError) && failure.name !== "ZodError" ? failure.message : "The saved setup could not be confirmed. Please try again.");
    } finally { window.clearTimeout(timeout); controller.current = null; setBusy(false); }
  }
  function submit(input: unknown) {
    const parsed = OnboardingMutation.safeParse(input);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your setup details."); return; }
    void request(parsed.data);
  }
  const connected = connections.filter(item => item.status === "ok");
  const back = () => { setError(""); setConflict(false); setStep(step === "availability" ? "calendar" : "role"); };
  return <main className="onboarding-card" aria-busy={busy}>
    <ol className="onboarding-progress" aria-label="Account setup progress">{steps.map((item, index) => <li key={item} aria-current={step === item ? "step" : undefined}><span>{index + 1}</span>{["Your role", "Calendar", "Availability"][index]}</li>)}</ol>
    <h1 ref={heading} tabIndex={-1}>{headings[step]}</h1>
    {error && <div className="onboarding-error" ref={alert} tabIndex={-1} role="alert">{error}{conflict && <button type="button" className="btn" disabled={busy} onClick={() => { if (!dirty || window.confirm("Discard your unsaved changes and reload saved setup?")) void request(); }}>Reload saved progress</button>}</div>}
    {existing && <button type="button" className="btn" disabled={busy} onClick={() => submit({ action: "keep_existing", version: saved.version })}>Keep existing setup</button>}
    <form onSubmit={event => { event.preventDefault(); if (step === "role") submit({ action: "role", role, timezone, version: saved.version }); else if (step === "availability") submit({ action: "finish", timezone, weekly, version: saved.version }); }}>
      <fieldset disabled={busy || conflict} className="onboarding-fields">
        {step === "role" && <><p>Choose the role that best fits your work.</p><div className="onboarding-roles">{ONBOARDING_ROLES.map(item => <label key={item}><input type="radio" name="role" value={item} checked={role === item} required onChange={() => setRole(item)} /><span>{item}</span></label>)}</div></>}
        {step === "calendar" && <>
          <p>Check for conflicts and add scheduled meetings to your calendar. You can connect a calendar later in Settings.</p>
          {calendarError && <p role="alert">The calendar connection was not completed. Try again or skip this step for now.</p>}
          {connections.length > 0 && <ul className="onboarding-connections">{connections.map(item => <li key={item.id}><b>{item.provider === "google" ? "Google Calendar" : item.provider === "microsoft" ? "Outlook Calendar" : "Calendar"}</b><span>{item.accountEmail}</span><span>{item.status === "ok" ? "Connected" : "Reconnect required"}</span></li>)}</ul>}
          <div className="onboarding-calendars">{(["google", "microsoft"] as const).map(provider => <div className="onboarding-provider" key={provider}>{provider === "google" ? <G /> : I.cal()}<b>{provider === "google" ? "Google Calendar" : "Outlook Calendar"}</b>{available[provider] ? <a className="btn" href={`${BP}/api/integrations/${provider}/connect`} onClick={event => { if (busy || conflict) event.preventDefault(); else leaving.current = true; }} aria-disabled={busy || conflict} tabIndex={busy || conflict ? -1 : undefined}>Connect</a> : <span>Connection unavailable</span>}</div>)}</div>
          {!available.google && !available.microsoft && <p>You can finish setup without connecting a calendar.</p>}
        </>}
        {step === "availability" && <>
          <p>Choose when people can book your first 30-minute meeting. You can change these hours later.</p>
          <label className="onboarding-zone">Time zone<select value={timezone} onChange={event => setTimezone(event.target.value)}>{[...new Set([timezone, "UTC", ...zones])].sort().map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select></label>
          <p className="onboarding-time-help">Use 24-hour time (HH:mm). Use 24:00 for the end of the day.</p>
          <div className="onboarding-hours">{days.map((day, index) => {
            const key = (index + 1) as keyof typeof weekly, ranges = weekly[key];
            const update = (next: typeof ranges) => setWeekly(previous => ({ ...previous, [key]: next }));
            return <div className="onboarding-day" key={day}><label className="onboarding-day-toggle"><input type="checkbox" checked={!!ranges.length} onChange={event => update(event.target.checked ? [{ start: "09:00", end: "17:00" }] : [])} />{day}</label><div className="onboarding-ranges">{!ranges.length && <span>Unavailable</span>}{ranges.map((range, position) => <div className="onboarding-range" key={position}><input aria-label={`${day} start ${position + 1}`} value={range.start} maxLength={5} placeholder="09:00" required onChange={event => update(ranges.map((value, i) => i === position ? { ...value, start: event.target.value } : value))} /><span aria-hidden="true">–</span><input aria-label={`${day} end ${position + 1}`} value={range.end} maxLength={5} placeholder="17:00" required onChange={event => update(ranges.map((value, i) => i === position ? { ...value, end: event.target.value } : value))} /><button className="btn" type="button" aria-label={`Remove ${day} hours ${position + 1}`} onClick={() => update(ranges.filter((_, i) => i !== position))}>{I.close()}</button></div>)}{ranges.length > 0 && ranges.length < 12 && <button type="button" className="btn" onClick={() => update([...ranges, { start: "", end: "" }])}>Add {day} hours</button>}</div></div>;
          })}</div>
          {Object.values(weekly).every(ranges => !ranges.length) && <p>No hours are selected. Your event will have no bookable times until you add availability.</p>}
        </>}
      </fieldset>
      <div className="onboarding-actions">
        {step !== "role" && <button className="btn" type="button" disabled={busy || conflict} onClick={back}>Back</button>}
        {step === "calendar" ? <><button className="btn" type="button" disabled={busy || conflict} onClick={() => submit({ action: "calendar", skip: true, version: saved.version })}>Skip for now</button>{connected.length > 0 && <button className="btn primary" type="button" disabled={busy || conflict} onClick={() => submit({ action: "calendar", skip: false, version: saved.version })}>Continue</button>}</> : <button className="btn primary" type="submit" disabled={busy || conflict}>{busy ? "Saving…" : step === "availability" ? "Finish setup" : "Continue"}</button>}
      </div>
    </form>
  </main>;
}
