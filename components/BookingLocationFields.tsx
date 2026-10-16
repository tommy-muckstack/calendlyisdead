"use client";
import { useState } from "react";
import type { LocationSelection, PublicLocationOption } from "@/lib/event-locations";

export function BookingLocationFields({ options, initial, disabled }: { options: PublicLocationOption[]; initial?: LocationSelection; disabled?: boolean }) {
  const [selected, setSelected] = useState(options.some(option => option.id === initial?.id) ? initial!.id : options.length === 1 ? options[0].id : "");
  const [inputs, setInputs] = useState<Record<string, string>>(initial ? { [initial.id]: initial.input } : {});
  const option = options.find(option => option.id === selected);
  if (!options.length) return null;
  return <fieldset className="booking-location-fields" disabled={disabled}>
    <legend>Location{options.length > 1 ? " *" : ""}</legend>
    {options.length > 1 ? options.map(item => <label className="booking-location-choice" key={item.id}>
      <input type="radio" name="locationId" value={item.id} checked={item.id === selected} required onChange={() => setSelected(item.id)} /><span>{item.label}{item.description && <small>{item.description}</small>}</span>
    </label>) : <><input type="hidden" name="locationId" value={options[0].id} /><p>{options[0].label}<small className="location-description">{options[0].description}</small></p></>}
    {option?.input && <><label className="f" htmlFor="booking-location-input">{option.prompt} *</label>
      {option.input === "phone" ? <input id="booking-location-input" name="locationInput" className="input" type="tel" autoComplete="tel" maxLength={40} required value={inputs[option.id] ?? ""} onChange={e => setInputs({ ...inputs, [option.id]: e.target.value })} />
        : <textarea id="booking-location-input" name="locationInput" className="input" maxLength={1000} required value={inputs[option.id] ?? ""} onChange={e => setInputs({ ...inputs, [option.id]: e.target.value })} />}
    </>}
  </fieldset>;
}
