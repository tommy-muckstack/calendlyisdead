import Link from "next/link";
import { Hero, Section, Footer, Pill } from "@isdead/design";
import { SiteNav } from "@/components/SiteNav";
import { PriceCalc } from "@/components/PriceCalc";
import { CALENDLY, FEATURES } from "@/lib/pricing";
import { BP } from "@/lib/basepath";
const GH = "https://github.com/tommy-muckstack/calendlyisdead";
// Layout follows the marketing-site template in @isdead/design (templates/marketing-site.md):
// nav → hero + product shot → audience strip → 4-step tabs → alternating feature rows → proof stats → integrations → pricing → final CTA → footer.
const Shot = ({ src, alt }: { src: string; alt: string }) =>
  <img src={`${BP}/home/${src}`} alt={alt} style={{ width: "100%", borderRadius: 16, border: "1px solid var(--ids-color-border)", boxShadow: "var(--ids-shadow-lg)", display: "block", background: "#fff" }} />;
const steps = [
  { t: "Book", d: "Share a link, embed a widget, or let routing forms send people to the right person." },
  { t: "Prep", d: "Invitee questions, buffers, limits and calendar checks happen before anyone joins." },
  { t: "Meet", d: "Zoom, Google Meet, phone or in person, added to every invite automatically." },
  { t: "Follow up", d: "Workflows send reminders and thank-you emails, and analytics show what's working." },
];
const rows = [
  { id: "product", k: "Scheduling", h: "Book meetings without the back-and-forth", p: "Event types, availability rules, holidays, round robin and collective team events. Your booking page shows only the times that really work.", img: "event-types.png" },
  { id: "assistant", k: "AI assistant", h: "Paste an email thread, get a reply with times", p: "The email assistant reads the conversation, picks the right event type and drafts a reply with booking links you can send as-is.", img: "assistant.png" },
  { id: "analytics", k: "Insights", h: "See who books, when, and how often", p: "Bookings, cancellations and popular hours across every event type and teammate, with no plan upgrade required.", img: "analytics.png" },
  { id: "payments", k: "Payments", h: "Collect payment when people book", p: "Connect your own Stripe account to charge for sessions upfront. CalendlyIsDead never takes a cut or charges you.", img: "booking.png" },
];
export default function Home() {
  return <>
    <SiteNav />
    <Hero eyebrow={<Pill>Free · Open source · Apache-2.0</Pill>}
      title={<>Scheduling that never<br />sends you a bill.</>}
      subtitle="Booking pages, team round robin, reminders, payments, embeds, routing and an AI email assistant. Everything a per-seat subscription sells, for $0."
      actions={<><Link className="ids-btn ids-btn--primary" href="/login">Get started for free</Link><Link className="ids-btn ids-btn--outline" href="/demo/30min">Try a booking page</Link></>}>
      <div style={{ maxWidth: 1080, margin: "56px auto 0" }}><Shot src="booking.png" alt="A CalendlyIsDead booking page with a month calendar and open times" /></div>
    </Hero>
    <p className="ids-muted" style={{ textAlign: "center", padding: "40px 24px 0", fontWeight: 600 }}>Built for coaches, recruiters, sales teams, support desks, clinics and anyone whose work runs on meetings</p>
    <Section id="solutions" title="There's more to meetings than finding a time">
      <div className="ids-grid" style={{ marginTop: 48 }}>{steps.map((s, i) =>
        <div key={s.t} className="ids-card" style={{ padding: 28 }}><span className="ids-pill">{i + 1}</span><h3 className="ids-h3" style={{ margin: "16px 0 8px" }}>{s.t}</h3><p className="ids-muted" style={{ margin: 0 }}>{s.d}</p></div>)}</div>
    </Section>
    {rows.map((r, i) =>
      <Section key={r.id} id={r.id} style={{ paddingTop: 48, paddingBottom: 48 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 56, alignItems: "center", direction: i % 2 ? "rtl" : "ltr" }}>
          <div style={{ direction: "ltr" }}><span className="ids-pill">{r.k}</span><h2 className="ids-h2" style={{ margin: "16px 0 12px", fontSize: "var(--ids-type-3xl)" }}>{r.h}</h2><p className="ids-muted" style={{ fontSize: 18 }}>{r.p}</p>
            <Link className="ids-btn ids-btn--outline" href="/login" style={{ marginTop: 12 }}>Try it free</Link></div>
          <div style={{ direction: "ltr" }}><Shot src={r.img} alt={r.h} /></div>
        </div>
      </Section>)}
    <Section id="resources" title="Real numbers, no fine print">
      <div className="stats" style={{ marginTop: 40 }}>
        <div className="card"><b>$0</b><span className="muted">per seat, per month, forever</span></div>
        <div className="card"><b>1 snippet</b><span className="muted">Inline, popup widget or popup link on any site</span></div>
        <div className="card"><b>Your data</b><span className="muted">Self-host on Postgres. Export anything.</span></div>
        <div className="card"><b>No lock-in</b><span className="muted">Apache-2.0. Fork it, change it, ship it.</span></div>
      </div>
    </Section>
    <Section title="Connects with the tools you already use" subtitle="Google Calendar, Outlook, iCloud and CalDAV calendars; Zoom and Google Meet; Stripe; Resend email; webhooks and embeds." />
    <Section id="pricing" title="What your team is paying for scheduling">
      <div style={{ marginTop: 32 }}><PriceCalc /></div>
      <p className="muted" style={{ fontSize: 13 }}>Calendly list prices per seat, billed yearly, as of {CALENDLY.asOf}: Standard ${CALENDLY.standard}/mo, Teams ${CALENDLY.teams}/mo, Enterprise from ${CALENDLY.enterpriseFromYear.toLocaleString()}/yr. Monthly billing costs more. Self-hosting has your own hosting costs; small instances fit in free tiers.</p>
      <h3 className="ids-h2" style={{ textAlign: "center", margin: "56px 0 24px" }}>Every feature, no plan gates</h3>
      <div className="card" style={{ padding: 8 }}>
        <table className="t" data-testid="feature-table"><thead><tr><th>Feature</th><th>Calendly plan you'd need</th><th>CalendlyIsDead</th></tr></thead>
          <tbody>{FEATURES.map(f => <tr key={f.name}><td>{f.name}</td><td className="muted">{f.plan}</td><td style={{ color: "var(--ids-color-accent)", fontWeight: 700 }}>✓ Free</td></tr>)}</tbody></table>
      </div>
    </Section>
    <section style={{ margin: "0 16px 16px", borderRadius: 24, background: "var(--ids-gradient-hero)", padding: "96px 24px", textAlign: "center" }}>
      <h2 className="ids-h1" style={{ fontSize: "var(--ids-type-3xl)" }}>From the first booking to the follow-up</h2>
      <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center" }}><Link className="ids-btn ids-btn--primary" href="/login">Get started for free</Link><a className="ids-btn ids-btn--outline" href={GH}>View on GitHub</a></div>
    </section>
    <Footer columns={[
      { title: "Product", links: [{ href: BP + "/#product", label: "Scheduling" }, { href: BP + "/#assistant", label: "AI assistant" }, { href: BP + "/#payments", label: "Payments" }, { href: BP + "/#analytics", label: "Analytics" }] },
      { title: "Get started", links: [{ href: BP + "/login", label: "Log in" }, { href: BP + "/demo/30min", label: "Demo booking page" }, { href: BP + "/#pricing", label: "Price comparison" }] },
      { title: "Open source", links: [{ href: GH, label: "GitHub" }, { href: GH + "/blob/main/LICENSE", label: "Apache-2.0 license" }, { href: GH + "#self-hosting", label: "Self-hosting" }] },
      { title: "More IsDead apps", links: [{ href: "/superhumanisdead", label: "SuperhumanIsDead" }, { href: "/wisprflowisdead", label: "WisprFlowIsDead" }] },
    ]} note="CalendlyIsDead is an independent open-source project. It is not affiliated with, endorsed by or sponsored by Calendly LLC. Calendly is a trademark of its owner." />
  </>;
}
