"use client";
import { useState } from "react";
import { COMPARE } from "@/lib/pricingRows";
import { Check, ICON } from "@/components/mk/icons";

const GIC: Record<string, React.ReactNode> = { Scheduling: ICON.cal, Notetaker: ICON.doc, Callie: ICON.spark, Payments: ICON.card, Contacts: ICON.team, Automations: ICON.flow, Personalizations: ICON.pen, "Admin tools": ICON.grid, Security: ICON.box, Support: ICON.at };
const PLANS = ["Free", "Standard", "Teams", "Enterprise"];
// Phone layout of the compare table: one value column for the plan chosen in the selector (same pattern as calendly.com/pricing at 390px).
export function MobileCompare() {
  const [plan, setPlan] = useState(1);
  return <div className="cm-mt" data-testid="feature-table-mobile">
    <div className="mh"><div className="gh"><i>{ICON.cal}</i><h3>Scheduling</h3></div>
      <label className="sel"><select aria-label="Select a plan to compare" value={plan} onChange={e => setPlan(+e.target.value)}>{PLANS.map((n, i) => <option key={n} value={i}>{n}</option>)}</select>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></label></div>
    {COMPARE.map((g, gi) => <section key={g.t}>
      {gi > 0 && <div className="gh sec"><i>{GIC[g.t]}</i><h3>{g.t === "Callie" ? "AI assistant" : g.t}</h3>{g.beta && <em>Beta</em>}</div>}
      {g.rows.map(([l, v]) => { const c = v[plan]; return <div key={l} className="r"><div className="l"><span>{l}</span></div><div className={"v" + (c === "–" ? " no" : "")}>{c === "✓" ? <span className="cm-chk"><Check c="#fff" /></span> : c}</div></div>; })}
    </section>)}
  </div>;
}
