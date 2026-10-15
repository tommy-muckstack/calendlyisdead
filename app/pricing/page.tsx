import Link from "next/link";
import "../marketing.css";
import { cmSans, cmSerif } from "@/components/mk/fonts";
import { Banner, Nav, Footer, Arrow } from "@/components/mk/chrome";
import { PriceCalc } from "@/components/PriceCalc";
import { CALENDLY } from "@/lib/pricing";
import { Check } from "@/components/mk/icons";
import { ICON } from "@/components/mk/icons";
export const metadata = { title: "Pricing | CalendlyIsDead" };
const plans = [
  { n: "Free", amt: "Always free", was: "", btn: "Get started", inc: "Includes:", groups: [{ t: "Scheduling", c: "#6fb3ff", l: ["Unlimited event types", "Connect Google, Outlook, iCloud, CalDAV", "One-on-one scheduling", "Customizable booking page", "Embeds on any website"] }] },
  { n: "Standard", amt: "$0", per: "/seat/mo", was: "Calendly charges $10", btn: "Get started", inc: "Everything in Free, and:", groups: [{ t: "Scheduling", c: "#6fb3ff", l: ["Automations & reminders", "Multiple calendars", "Meeting polls & one-off links", "Webhooks & API"] }, { t: "Payments", c: "#5ddfd7", l: ["Connect your own Stripe"] }, { t: "Assistant", c: "#dbee9f", l: ["AI email replies with your times", "Bring your own AI provider"] }] },
  { n: "Teams", amt: "$0", per: "/seat/mo", was: "Calendly charges $16", btn: "Get started", fill: true, pop: true, inc: "Everything in Standard, and:", groups: [{ t: "Scheduling", c: "#6fb3ff", l: ["Round-robin & team scheduling", "Collective events", "Routing forms", "Analytics for every event type", "Branding controls"] }, { t: "Admin", c: "#b89ffa", l: ["Teams and roles", "Audit-friendly Postgres data"] }] },
  { n: "Enterprise", amt: "$0", per: "license", was: "Calendly starts at $15k/yr", btn: "Self-host it", inc: "Everything in Teams, and:", groups: [{ t: "Scheduling", c: "#6fb3ff", l: ["Run it on your servers", "Bring your own SSO", "Export all data any time", "Fork it, change it, ship it"] }] },
];
const rows: [string, (string | boolean)[]][] = [
  ["__Scheduling", []], ["One-on-one meetings", ["Unlimited", "Unlimited", "Unlimited", "Unlimited"]], ["Connect calendars", ["Unlimited", "Unlimited", "Unlimited", "Unlimited"]],
  ["Unlimited meetings", [true, true, true, true]], ["Customize your booking link", [true, true, true, true]], ["Mobile and browser embed", [true, true, true, true]], ["Meeting polls and one-off links", [true, true, true, true]],
  ["Control your meeting availability", [true, true, true, true]], ["Multi-person meeting types", [true, true, true, true]], ["Round-robin meeting distribution", [true, true, true, true]], ["Reminders and follow-up workflows", [true, true, true, true]],
  ["Routing forms", [true, true, true, true]], ["Analytics", [true, true, true, true]], ["__Payments", []], ["Collect payment through Stripe", [true, true, true, true]], ["__Assistant", []], ["AI email assistant", [true, true, true, true]], ["__Admin", []], ["Teams and roles", [true, true, true, true]], ["Export your data", [true, true, true, true]],
];
export default function Pricing() {
  return <div className={`cm ${cmSans.variable} ${cmSerif.variable}`}><Banner /><Nav />
    <section className="cm-sec"><div className="cm-price">
      <div className="cm-ptop"><h1>Add a team to any plan, still free</h1>
        <div><p>Every feature is included in every plan. Pick how you want to run it, and see what you would have paid.</p>
          <div className="cm-bill"><span><i className="rad" />Billed monthly</span><span><i className="rad on" />Billed yearly</span><em>Save 100%</em></div></div></div>
      <div className="cm-plans">{plans.map(p => <div key={p.n} className={"cm-plan" + (p.pop ? " pop" : "")}>
        <h3>{p.n}</h3><div className="amt">{p.amt}{p.per && <small> {p.per}</small>}</div><div className="was">{p.was}</div>
        <Link className={"btn" + (p.fill ? " fill" : "")} href="/signup">{p.btn}<Arrow s={14} /></Link>
        <div className="inc">{p.inc}</div>
        {p.groups.map(g => <div key={g.t}><h5><span style={{ width: 16, height: 16, borderRadius: 4, background: g.c, display: "grid", placeItems: "center" }}>{ICON.cal}</span>{g.t}</h5><ul>{g.l.map(x => <li key={x}><Check />{x}</li>)}</ul></div>)}
      </div>)}</div>
      <p style={{ fontSize: 12, margin: "28px 0 0", display: "flex", gap: 8, alignItems: "center" }}><b style={{ fontWeight: 600 }}>Prices compared</b> are Calendly’s list prices per seat, billed yearly, as of October 2026.</p>
      <div className="cm-cmp"><h2>Compare features</h2>
        <table className="cm-tbl" data-testid="feature-table"><thead><tr><th style={{ width: "28%" }} /><th>Free</th><th>Standard</th><th>Teams</th><th>Enterprise</th></tr></thead>
          <tbody>{rows.map(([n, v]) => n.startsWith("__") ? <tr className="grp" key={n}><td colSpan={5}>{n.slice(2)}</td></tr> : <tr key={n}><td>{n}</td>{v.map((c, i) => <td key={i}>{c === true ? <span className="cm-chk"><Check c="#fff" /></span> : c}</td>)}</tr>)}</tbody></table></div>
      <div className="cm-cmp" id="calculator"><h2>What your team is paying for scheduling</h2>
        <div style={{ marginTop: 32 }}><PriceCalc /></div>
        <p style={{ fontSize: 13, opacity: .7 }}>Calendly list prices per seat, billed yearly, as of {CALENDLY.asOf}: Standard ${CALENDLY.standard}/mo, Teams ${CALENDLY.teams}/mo, Enterprise from ${CALENDLY.enterpriseFromYear.toLocaleString()}/yr. Self-hosting has your own hosting costs; small instances fit in free tiers.</p></div>
    </div></section>
    <Footer /></div>;
}
