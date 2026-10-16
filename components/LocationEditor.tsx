"use client";
import { useEffect, useRef, useState } from "react";
import { locationLabel, supportsLocationChoices, VIDEO_LABELS, type LocationOption } from "@/lib/event-locations";

function LocationIcon({ kind }: { kind: LocationOption["kind"] }) {
  const drawing = kind === "phone" ? <path d="m5 3 4 1 1 4-2 2c1.5 3 3 4.5 6 6l2-2 4 1 1 4c-1 3-5 3-10-1S1 7 5 3Z" />
    : kind === "video" ? <><rect x="3" y="6" width="12" height="12" rx="2" /><path d="m15 10 6-3v10l-6-3" /></>
    : kind === "in_person" ? <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>
    : kind === "invitee" ? <><path d="M5 3h14v14h-9l-5 4Z" /><path d="M10 8a2 2 0 1 1 3 2c-1 1-1 1-1 2m0 2v.1" /></>
    : <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>;
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{drawing}</svg>;
}
type Choice = { kind: LocationOption["kind"]; label: string; provider?: keyof typeof VIDEO_LABELS };
const choices: Choice[] = [
  { kind: "video", label: "Zoom", provider: "zoom" }, { kind: "phone", label: "Phone call" }, { kind: "in_person", label: "In-person" },
  { kind: "video", label: "Google Meet", provider: "google_meet" }, { kind: "custom", label: "Custom" }, { kind: "invitee", label: "Ask invitee" },
  { kind: "video", label: "Microsoft Teams", provider: "teams" }, { kind: "video", label: "Webex", provider: "webex" }, { kind: "video", label: "GoTo Meeting", provider: "gotomeeting" },
];
export function LocationEditor({ value, legacy, kind, disabled, onChange }: { value: LocationOption[] | null; legacy: string; kind: string; disabled?: boolean; onChange: (value: LocationOption[]) => void }) {
  const [all, setAll] = useState(false), root = useRef<HTMLFieldSetElement>(null), focus = useRef<string | null>(null);
  const options = value ?? [], multiple = supportsLocationChoices(kind);
  useEffect(() => { if (focus.current) { if (focus.current === "picker") root.current?.querySelector<HTMLButtonElement>(".location-tile, .location-config button")?.focus(); else document.getElementById(focus.current)?.focus(); focus.current = null; } }, [value]);
  const update = (index: number, option: LocationOption) => onChange(options.map((old, i) => i === index ? option : old));
  function add(choice: Choice) {
    const id = crypto.randomUUID(); let option: LocationOption;
    if (choice.kind === "video") option = { id, kind: "video", provider: choice.provider!, url: "" };
    else if (choice.kind === "in_person") option = { id, kind: "in_person", address: "", notes: "" };
    else if (choice.kind === "phone") option = { id, kind: "phone", direction: kind === "group" ? "invitee_calls" : "host_calls", phone: "" };
    else if (choice.kind === "custom") option = { id, kind: "custom", details: "", showBeforeBooking: true };
    else option = { id, kind: "invitee", prompt: "Where would you like to meet?" };
    focus.current = `location-${id}`; onChange([...options, option]); setAll(false);
  }
  return <fieldset ref={root} className="location-editor" disabled={disabled}>
    <legend className="sr-only">Meeting locations</legend>
    {value === null && legacy && <div className="location-current"><p>Current location: <strong>{legacy}</strong></p><p className="muted">Choose an option below to replace it.</p><button type="button" className="btn" onClick={() => onChange([])}>Remove location</button></div>}
    {options.map((option, index) => <section className="location-config" key={option.id}>
      <div className="location-config-heading"><h3><LocationIcon kind={option.kind} />{locationLabel(option)}</h3><button type="button" className="btn" aria-label={`Remove location ${index + 1}: ${locationLabel(option)}`} onClick={() => { focus.current = "picker"; onChange(options.filter((_, i) => i !== index)); }}>Remove</button></div>
      {option.kind === "video" && <><label className="f" htmlFor={`location-${option.id}`}>Meeting link</label><input id={`location-${option.id}`} className="input" type="url" maxLength={1000} value={option.url} onChange={e => update(index, { ...option, url: e.target.value })} placeholder="https://" /><p className="muted">Paste a meeting link from {VIDEO_LABELS[option.provider]}. This link will be shared after booking. Automatic link creation is not configured by this option.</p></>}
      {option.kind === "phone" && <>
        <label className="f" htmlFor={`location-${option.id}`}>Who will place the call?</label><select id={`location-${option.id}`} className="input" value={option.direction} onChange={e => update(index, { ...option, direction: e.target.value as typeof option.direction, phone: "" })}>
          {kind !== "group" && <option value="host_calls">I will call my invitee</option>}<option value="invitee_calls">My invitee will call me</option>
        </select>
        {option.direction === "invitee_calls" ? <><label className="f" htmlFor={`phone-${option.id}`}>Your phone number</label><input id={`phone-${option.id}`} className="input" type="tel" maxLength={40} value={option.phone} onChange={e => update(index, { ...option, phone: e.target.value })} /><p className="muted">Your number will be provided after booking.</p></> : <p className="muted">Invitees must provide their phone number when booking.</p>}
      </>}
      {option.kind === "in_person" && <><label className="f" htmlFor={`location-${option.id}`}>Meeting address</label><input id={`location-${option.id}`} className="input" maxLength={500} value={option.address} onChange={e => update(index, { ...option, address: e.target.value })} /><label className="f" htmlFor={`notes-${option.id}`}>Additional notes</label><textarea id={`notes-${option.id}`} className="input" maxLength={1000} value={option.notes} onChange={e => update(index, { ...option, notes: e.target.value })} /></>}
      {option.kind === "custom" && <><label className="f" htmlFor={`location-${option.id}`}>Location details</label><textarea id={`location-${option.id}`} className="input" maxLength={1000} value={option.details} onChange={e => update(index, { ...option, details: e.target.value })} /><label className="f"><input type="checkbox" checked={option.showBeforeBooking} onChange={e => update(index, { ...option, showBeforeBooking: e.target.checked })} /> Display details on the booking page</label><p className="muted">{option.showBeforeBooking ? "Invitees can see these details before booking." : "Only provide these details after booking."}</p></>}
      {option.kind === "invitee" && <><label className="f" htmlFor={`location-${option.id}`}>Location question</label><input id={`location-${option.id}`} className="input" maxLength={200} value={option.prompt} onChange={e => update(index, { ...option, prompt: e.target.value })} /><p className="muted">Invitees must answer this question when booking.</p></>}
    </section>)}
    {(multiple || !options.length) && options.length < 10 && <><p className="location-picker-label">{options.length ? "Add location" : "Choose a location"}</p><div className="location-tiles">
      {choices.filter(choice => kind !== "group" || choice.kind !== "invitee").filter((_, i) => all || i < 3).map(choice => <button type="button" className="location-tile" key={choice.label} onClick={() => add(choice)}><LocationIcon kind={choice.kind} /><span>{choice.label}</span></button>)}
      <button type="button" className="location-tile" aria-expanded={all} onClick={() => setAll(value => !value)}><span aria-hidden="true">•••</span><span>{all ? "Fewer options" : "All options"}</span></button>
    </div></>}
    {multiple && <p className="muted">When you add several locations, invitees choose one while booking.</p>}
  </fieldset>;
}
