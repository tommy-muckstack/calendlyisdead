import Link from "next/link";
import "../marketing.css";
import { cmSans, cmSerif } from "@/components/mk/fonts";
import { Banner, Nav, Footer, Arrow } from "@/components/mk/chrome";
import { Check, ICON } from "@/components/mk/icons";
import { COMPARE } from "@/lib/pricingRows";
import { Reel } from "@/components/mk/home";
import { Faq } from "@/components/mk/Faq";
export const metadata = { title: "Pricing | CalendlyIsDead" };
const SC = "#6fb3ff", PM = "#5ddfd7", NT = "#b89ffa", CL = "#dbee9f";
const plans = [
  { n: "Free", amt: "Always free", was: "", btn: "Get started", inc: "Includes:", groups: [{ t: "Scheduling", c: SC, ic: ICON.cal, l: ["One event type", "One calendar connection", "One-on-one scheduling", "Customizable booking page", "Browser extension"] }] },
  { n: "Standard", amt: "$0", per: "/seat/mo", was: "Calendly charges $10 per seat", btn: "Get started", inc: "Everything in Free, and:", groups: [
    { t: "Scheduling", c: SC, ic: ICON.cal, l: ["Unlimited event types", "Connect multiple calendars", "Automations & reminders", "Connect webhooks, Zapier"] },
    { t: "Payments", c: PM, ic: ICON.card, l: ["Connect your own Stripe"] },
    { t: "Notetaker", c: NT, ic: ICON.doc, note: "Not built yet", l: ["Recordings & transcripts", "Shareable meeting recaps", "Joins Zoom, Google Meet, Teams"], dim: true },
    { t: "AI assistant", c: CL, ic: ICON.spark, tag: "Beta", l: ["Replies to email threads with your times", "Bring your own AI provider"] }] },
  { n: "Teams", amt: "$0", per: "/seat/mo", was: "Calendly charges $16 per seat", btn: "Get started", fill: true, pop: true, inc: "Everything in Standard, and:", groups: [
    { t: "Scheduling", c: SC, ic: ICON.cal, l: ["Round-robin & team scheduling", "Qualify, route, & schedule leads", "Centrally managed event types", "Analytics for every event type", "Branding controls"] },
    { t: "Admin", c: NT, ic: ICON.team, l: ["Teams and roles", "Export all of your data"] },
    { t: "Notetaker", c: NT, ic: ICON.doc, note: "Not built yet", l: ["Advanced admin controls"], dim: true }] },
  { n: "Enterprise", amt: "$0", per: "license", was: "Calendly starts at $15k/yr", btn: "Self-host it", inc: "Everything in Teams, and:", groups: [
    { t: "Scheduling", c: SC, ic: ICON.cal, l: ["Run it on your own servers", "Bring your own SSO", "Export all data any time", "Fork it, change it, ship it", "Audit-friendly Postgres data"] },
    { t: "AI assistant", c: CL, ic: ICON.spark, tag: "Beta", l: ["Point it at your own model"] }] },
];
const faqs = [
  ["What happens at the end of my trial?", "There is no trial. CalendlyIsDead is free and open source, so nothing expires and nothing is billed. Your hosting provider may charge for your own server if you outgrow its free tier."],
  ["Which plan is best for me and my team?", "Every plan has the same code. Pick Free to try a single booking page, Standard for multiple calendars and reminders, or Teams for round robin, routing forms and shared event types."],
  ["Can we try CalendlyIsDead with multiple users?", "Yes. Sign up, create a team, and invite your teammates. Invitees booking a meeting never need an account."],
  ["What does the renewal process look like?", "There is nothing to renew. You can run the same deployment for as long as you like, and update it by pulling the latest changes from GitHub."],
  ["How do I upgrade or downgrade?", "Plans here describe how Calendly gates features. In CalendlyIsDead every feature that exists is available to everyone, so there is nothing to switch."],
  ["We’re a non-profit organization, is there special pricing available?", "It is free for everyone, including non-profits, schools and volunteer groups."],
  ["What payment methods do you accept?", "None are needed to use CalendlyIsDead. If you collect payments from your own invitees, you connect your own Stripe account and the money goes straight to you."],
];
export default function Pricing() {
  return <div className={`cm ${cmSans.variable} ${cmSerif.variable}`}><Banner /><Nav />
    <section className="cm-sec"><div className="cm-price">
      <div className="cm-ptop"><h1>Add an assistant to Standard or Teams plans, still free</h1>
        <div><p>Meeting recaps are on the roadmap, plus an AI assistant to help with the work around meetings.</p>
          <div className="cm-bill"><span><i className="rad" />Billed monthly</span><span><i className="rad on" />Billed yearly</span><em>Save 100%</em></div></div></div>
      <div className="cm-plans">{plans.map(p => <div key={p.n} className={"cm-pw" + (p.pop ? " pop" : "")}>{p.pop && <span className="lab">POPULAR PLAN</span>}<div className="cm-plan">
        <div className="top"><h3>{p.n}</h3><div className="amt">{p.amt}{p.per && <small> {p.per}</small>}</div><div className="was">{p.was}</div>
          <Link className={"btn" + (p.fill ? " fill" : "")} href="/signup">{p.btn}<Arrow s={14} /></Link></div>
        <div className="bd"><div className="inc">{p.inc}</div>
        {p.groups.map(g => <div key={g.t + (g.note || "")} className={g.dim ? "dim" : ""}><h5><span style={{ width: 16, height: 16, borderRadius: 4, background: g.c, display: "grid", placeItems: "center" }}>{g.ic}</span>{g.t}{g.note && <em>{g.note}</em>}{g.tag && <em>{g.tag}</em>}</h5><ul>{g.l.map(x => <li key={x}><Check />{x}</li>)}</ul></div>)}</div>
      </div></div>)}</div>
      <p className="cm-pnote"><b>Prices compared</b> are Calendly’s list prices per seat, billed yearly, as of October 2026. Notetaker is not part of CalendlyIsDead yet. <Link href="/pricing/calculator" style={{ textDecoration: "underline" }}>See what your team would pay</Link>.</p>
    </div></section>
    <section className="cm-cmpsec">
      <h2 className="cm-cmph">Compare features</h2>
      <div className="cm-ct" data-testid="feature-table">
        <div className="cm-cth"><div className="lab"><div className="gh"><i>{ICON.cal}</i><h3>Scheduling</h3></div></div>{[["Free", "Get started"], ["Standard", "Get started"], ["Teams", "Get started"], ["Enterprise", "Self-host it"]].map(([n, b]) => <div key={n} className="col"><span>{n}</span><Link className={"b" + (n === "Teams" ? " fill" : "")} href="/signup">{b}</Link></div>)}</div>
        {COMPARE.map((g, gi) => <section key={g.t} className="cm-cts">
          {gi > 0 && <div className="gh"><i>{({ Scheduling: ICON.cal, Notetaker: ICON.doc, Callie: ICON.spark, Payments: ICON.card, Contacts: ICON.team, Automations: ICON.flow, Personalizations: ICON.pen, "Admin tools": ICON.grid, Security: ICON.box, Support: ICON.at } as Record<string, React.ReactNode>)[g.t]}</i><h3>{g.t === "Callie" ? "AI assistant" : g.t}</h3>{g.beta && <em>Beta</em>}</div>}
          {g.rows.map(([l, v]) => <div key={l} className="r"><div className="l"><span>{l}</span></div><div className="v">{v.map((c, i) => <div key={i} className={c === "–" ? "no" : ""}>{c === "✓" ? <span className="cm-chk"><Check c="#fff" /></span> : c}</div>)}</div></div>)}
        </section>)}
      </div>
    </section>
    <section className="cm-sec"><div className="cm-faq"><h2>Frequently asked questions</h2><Faq items={faqs as [string, string][]} /></div></section>
    <section className="cm-final">
      <span className="cm-eyebrow">Get started</span>
      <h2 className="cm-h2 cm-sans">From the first meeting to the follow-up</h2>
      <p className="cm-p">All of the work around meetings, handled in one place. Book time, capture every discussion, and keep next steps moving without the manual work.</p>
      <Link className="cm-btn fill" href="/signup">Start for free</Link>
      <Reel />
    </section>
    <Footer /></div>;
}
