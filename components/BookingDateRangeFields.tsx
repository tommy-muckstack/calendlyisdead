"use client";
import type { BookingDateRange } from "@/lib/booking-date-range";

export function BookingDateRangeFields({ value, disabled, onChange }: {
  value: BookingDateRange; disabled: boolean; onChange(value: BookingDateRange): void;
}) {
  return <>
    <label className="f" htmlFor="et-date-range">Date range</label>
    <select id="et-date-range" className="input" disabled={disabled} value={value.kind} onChange={event => {
      const kind = event.target.value;
      onChange(kind === "fixed" ? { kind, start: "", end: "" } : kind === "indefinite" ? { kind }
        : { kind: "rolling", days: 60, unit: "calendar" });
    }}>
      <option value="rolling">Number of days into the future</option>
      <option value="fixed">Within a date range</option>
      <option value="indefinite">Indefinitely into the future</option>
    </select>
    {value.kind === "rolling" && <>
      <label className="f" htmlFor="et-range-days">Days into the future</label>
      <input id="et-range-days" className="input" type="number" min={1} max={730} step={1} disabled={disabled}
        value={Number.isFinite(value.days) ? value.days : ""} onChange={event => onChange({ ...value, days: event.target.valueAsNumber })} />
      <label className="f" htmlFor="et-range-unit">Count days as</label>
      <select id="et-range-unit" className="input" disabled={disabled} value={value.unit}
        onChange={event => onChange({ ...value, unit: event.target.value === "weekdays" ? "weekdays" : "calendar" })}>
        <option value="calendar">Calendar days</option><option value="weekdays">Weekdays</option>
      </select>
      {value.unit === "weekdays" && <p className="muted">Count Monday through Friday. Your availability still controls whether weekends can be booked.</p>}
    </>}
    {value.kind === "fixed" && <>
      <label className="f" htmlFor="et-range-start">Start date</label>
      <input id="et-range-start" className="input" type="date" disabled={disabled} value={value.start}
        onChange={event => onChange({ ...value, start: event.target.value })} />
      <label className="f" htmlFor="et-range-end">End date</label>
      <input id="et-range-end" className="input" type="date" disabled={disabled} min={value.start || undefined} value={value.end}
        onChange={event => onChange({ ...value, end: event.target.value })} />
    </>}
  </>;
}
