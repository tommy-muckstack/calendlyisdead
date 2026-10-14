import Link from "next/link";
import { Logo } from "@/components/Logo";
import { PriceCalc } from "@/components/PriceCalc";
import { CALENDLY, FEATURES } from "@/lib/pricing";
export default function Home() {
  return <main style={{ maxWidth: 980, margin: "0 auto", padding: "40px 24px 80px" }}>
    <nav className="row" style={{ justifyContent: "space-between" }}><Logo size={34} />
      <div className="row"><a className="btn" href="https://github.com/tommy-muckstack/calendlyisdead">GitHub</a><Link className="btn primary" href="/login">Sign in</Link></div></nav>
    <section style={{ textAlign: "center", padding: "70px 0 40px" }}>
      <span className="pill">Free · Open source · Apache-2.0</span>
      <h1 style={{ fontSize: 60, lineHeight: 1.02, margin: "20px 0 14px", letterSpacing: "-.02em" }}>Scheduling that never<br />sends you a bill.</h1>
      <p className="muted" style={{ fontSize: 20, maxWidth: 640, margin: "0 auto" }}>Booking pages, team round robin, reminders, payments, embeds, routing and an AI email assistant. Everything you'd pay a per-seat subscription for, for $0.</p>
      <div className="row" style={{ justifyContent: "center", marginTop: 26 }}>
        <Link className="btn primary" href="/login">Get started free</Link>
        <Link className="btn" href="/demo/30min">Try a booking page</Link>
      </div>
    </section>
    <section>
      <h2 style={{ fontSize: 32, textAlign: "center" }}>What your team is paying for scheduling</h2>
      <PriceCalc />
      <p className="muted" style={{ fontSize: 13 }}>Calendly list prices per seat, billed yearly, as of {CALENDLY.asOf}: Standard ${CALENDLY.standard}/mo, Teams ${CALENDLY.teams}/mo, Enterprise from ${CALENDLY.enterpriseFromYear.toLocaleString()}/yr. Monthly billing costs more. Self-hosting has your own hosting costs; small instances fit in free tiers.</p>
    </section>
    <section style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: 32, textAlign: "center" }}>Every feature, no plan gates</h2>
      <div className="card" style={{ padding: 8 }}>
        <table className="t" data-testid="feature-table"><thead><tr><th>Feature</th><th>Calendly plan you'd need</th><th>CalendlyIsDead</th></tr></thead>
          <tbody>{FEATURES.map(f => <tr key={f.name}><td>{f.name}</td><td className="muted">{f.plan}</td><td style={{ color: "var(--brand-ink)", fontWeight: 700 }}>✓ Free</td></tr>)}</tbody></table>
      </div>
    </section>
    <section className="stats" style={{ marginTop: 40 }}>
      <div className="card"><b>1 snippet</b><span className="muted">Inline, popup widget or popup link on any site</span></div>
      <div className="card"><b>Your data</b><span className="muted">Self-host on Postgres. Export anything.</span></div>
      <div className="card"><b>No lock-in</b><span className="muted">Apache-2.0. Fork it, change it, ship it.</span></div>
    </section>
    <p className="muted" style={{ fontSize: 13, textAlign: "center", marginTop: 50 }}>CalendlyIsDead is an independent open-source project. It is not affiliated with, endorsed by or sponsored by Calendly LLC. Calendly is a trademark of its owner.</p>
  </main>;
}
