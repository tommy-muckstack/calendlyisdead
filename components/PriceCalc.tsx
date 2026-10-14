"use client";
import { useState } from "react";
import { calendlyYearly } from "@/lib/pricing";
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export function PriceCalc() {
  const [seats, setSeats] = useState(10);
  return <div className="card" style={{ padding: 24 }}>
    <label className="f" htmlFor="seats">Team size: <b data-testid="seats">{seats}</b> {seats === 1 ? "person" : "people"}</label>
    <input id="seats" type="range" min={1} max={200} value={seats} onChange={e => setSeats(Number(e.target.value))} style={{ width: "100%" }} />
    <div className="stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
      <div className="card"><span className="muted">Calendly Standard</span><b data-testid="cost-standard">{usd(calendlyYearly(seats, "standard"))}</b><small className="muted">per year</small></div>
      <div className="card"><span className="muted">Calendly Teams</span><b data-testid="cost-teams">{usd(calendlyYearly(seats, "teams"))}</b><small className="muted">per year</small></div>
      <div className="card" style={{ borderColor: "var(--brand)" }}><span className="muted">CalendlyIsDead</span><b data-testid="cost-ours">$0</b><small className="muted">forever, Apache-2.0</small></div>
    </div>
  </div>;
}
