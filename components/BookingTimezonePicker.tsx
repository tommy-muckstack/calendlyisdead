"use client";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { I } from "./app/icons";
import { BOOKING_TIME_FORMAT_KEY, defaultTimeFormat, formatBookingTime, readTimeFormat, searchTimezones, timezoneLabel, timezoneOptions, timezonePopupPosition, type BookingTimeFormat } from "@/lib/timezone-display";

export function useBookingTimeFormat() {
  const [format, setFormat] = useState<BookingTimeFormat>("12h");
  useEffect(() => {
    let saved: BookingTimeFormat | null = null;
    try { saved = readTimeFormat(localStorage.getItem(BOOKING_TIME_FORMAT_KEY)); } catch { /* Storage can be unavailable in private embeds. */ }
    setFormat(saved ?? defaultTimeFormat());
  }, []);
  function change(next: BookingTimeFormat) {
    setFormat(next);
    try { localStorage.setItem(BOOKING_TIME_FORMAT_KEY, next); } catch { /* The current page still honors the choice. */ }
  }
  return [format, change] as const;
}
export function BookingTimeFormatControl({ value, onChange }: { value: BookingTimeFormat; onChange: (value: BookingTimeFormat) => void }) {
  const id = useId();
  return <fieldset className="booking-clock-control"><legend>Time format</legend>{(["12h", "24h"] as const).map(format => <label key={format}>
    <input type="radio" name={id} value={format} checked={value === format} onChange={() => onChange(format)} /><span>{format}</span>
  </label>)}</fieldset>;
}
export function BookingTimezonePicker({ value, onChange, format, onFormatChange }: { value: string; onChange: (value: string) => void; format: BookingTimeFormat; onFormatChange: (value: BookingTimeFormat) => void }) {
  const id = useId(), listId = `${id}-options`, headingId = `${id}-heading`;
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [active, setActive] = useState<string | null>(null), [now, setNow] = useState<number | null>(null);
  const [position, setPosition] = useState<ReturnType<typeof timezonePopupPosition> | null>(null);
  const all = useMemo(() => timezoneOptions(value), [value]), options = useMemo(() => searchTimezones(all, query), [all, query]);
  const activeIndex = options.findIndex(option => option.value === active);
  const groups = [...new Set(options.map(option => option.region))];
  function close(restore = false) { setOpen(false); if (restore) trigger.current?.focus(); }
  function choose(zone: string) { close(true); onChange(zone); }
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      if (!trigger.current) return;
      // The portal leaves the host's branded wrapper; preserve its inherited theme.
      const theme = getComputedStyle(trigger.current);
      for (const name of ["--brand", "--brand-soft", "--ink", "--muted", "--line"]) panel.current?.style.setProperty(name, theme.getPropertyValue(name));
      if (panel.current) panel.current.style.fontFamily = theme.fontFamily;
      const viewport = window.visualViewport;
      setPosition(timezonePopupPosition(trigger.current.getBoundingClientRect(), { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0, width: viewport?.width ?? innerWidth, height: viewport?.height ?? innerHeight }));
    }
    place(); search.current?.focus();
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place); window.visualViewport?.addEventListener("scroll", place);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => { if (open && activeIndex >= 0) document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" }); }, [open, activeIndex, id]);
  function navigate(event: React.KeyboardEvent<HTMLInputElement>) {
    const key = event.key;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(key) && options.length) {
      event.preventDefault();
      const index = key === "Home" ? 0 : key === "End" ? options.length - 1 : key === "ArrowDown" ? (activeIndex + 1) % options.length : (activeIndex < 0 ? options.length - 1 : (activeIndex - 1 + options.length) % options.length);
      setActive(options[index].value);
    } else if (key === "Enter") { event.preventDefault(); const option = options[activeIndex] ?? options[0]; if (option) choose(option.value); }
  }
  return <div className="booking-zone-control">
    <div className="f" id={`${id}-label`}>Time zone</div>
    <button type="button" ref={trigger} className="booking-zone-trigger" aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined} data-timezone={value}
      onClick={() => { if (open) close(); else { setQuery(""); setActive(value); setOpen(true); } }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></svg>
      <span id={`${id}-value`}>{timezoneLabel(value)}{now !== null && <span className="booking-zone-clock"> ({formatBookingTime(now, value, format)})</span>}</span>{I.chev(18)}
    </button>
    {open && createPortal(<div id={`${id}-panel`} ref={panel} className="booking-zone-popup" role="dialog" aria-labelledby={headingId} style={{ ...position, visibility: position ? "visible" : "hidden" }}
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); } }}
      onBlurCapture={event => { const target = event.relatedTarget as Node | null; if (target && !event.currentTarget.contains(target) && !trigger.current?.contains(target)) close(); }}>
      <div className="booking-zone-header"><h3 id={headingId}>Time zone</h3><button className="booking-zone-dismiss" type="button" aria-label="Close time zone picker" onClick={() => close(true)}>{I.close(18)}</button></div>
      <BookingTimeFormatControl value={format} onChange={onFormatChange} />
      <label className="booking-zone-search">{I.search(18)}<input ref={search} type="search" placeholder="Search time zones" aria-label="Search time zones" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={listId} aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        value={query} onChange={event => { setQuery(event.target.value); setActive(null); }} onKeyDown={navigate} /></label>
      <div className="booking-zone-results" role="listbox" id={listId} aria-label="Time zones">
        {groups.map(region => <div key={region} role="group" aria-label={region}><div className="booking-zone-region" aria-hidden="true">{region}</div>
          {options.map((option, index) => option.region !== region ? null : <div key={option.value} role="option" id={`${id}-option-${index}`} aria-selected={option.value === value} className={`booking-zone-option${active === option.value ? " active" : ""}`}
            onPointerDown={event => event.preventDefault()} onClick={() => choose(option.value)}>
            <span><span>{option.label}</span><small>{option.value.replaceAll("_", " ")}</small></span>
            <span className="booking-zone-option-clock">{now !== null ? formatBookingTime(now, option.value, format) : ""}{option.value === value && <span aria-hidden="true"> ✓</span>}</span>
          </div>)}
        </div>)}
      </div>
      <p className="booking-zone-result-count" role="status">{options.length ? `${options.length} time zones` : "No time zones found. Try a city, region or time zone name."}</p>
    </div>, document.body)}
  </div>;
}
