"use client";
import Link from "next/link";
import { useState } from "react";
import { BP } from "@/lib/basepath";
export const Chev = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
export const Arrow = ({ s = 12 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 12 12" fill="none"><path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
export function Wordmark({ size }: { size?: number }) { return <span className="cm-logo" style={size ? { fontSize: size } : undefined}><img src={BP + "/logo.svg"} alt="" /><span><b>Calendly</b><i>IsDead</i></span></span>; }

export function Banner() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return <div className="cm-banner" role="region" aria-label="Announcement">
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 6.5v3l7 3.5V3L2 6.5zM9 5.5c2 .3 3.5 1 4.5 2.5-1 1.5-2.5 2.2-4.5 2.5M4 10l.8 3.5h2L6.3 11" stroke="#071A31" strokeWidth="1.3" strokeLinejoin="round" /></svg>
    <span>Introducing the new CalendlyIsDead, built to handle all of the work around meetings.</span>
    <a className="more" href="https://github.com/tommy-muckstack/calendlyisdead" target="_blank" rel="noreferrer">Learn more →</a>
    <button className="x" aria-label="Dismiss" onClick={() => setOpen(false)}><svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="#071A31" strokeWidth="1.3" strokeLinecap="round" /></svg></button>
  </div>;
}
const MENUS: { label: string; items: [string, string, string][] }[] = [
  { label: "Product", items: [["Scheduling", "/#scheduling", "Booking pages, availability, round robin"], ["AI assistant", "/#assistant", "Paste a thread, get a reply with times"], ["Insights", "/#recaps", "Bookings, cancellations, busy hours"], ["Payments", "/#payments", "Collect payment with your own Stripe"]] },
  { label: "Solutions", items: [["For individuals", "/#scheduling", "Coaches, consultants, freelancers"], ["For teams", "/#assistant", "Round robin and collective events"], ["For large companies", "/pricing", "Self-host with SSO-ready auth"]] },
  { label: "Resources", items: [["Source code", "https://github.com/tommy-muckstack/calendlyisdead", "Apache-2.0 on GitHub"], ["Embed docs", "/embed-demo.html", "Inline, popup widget and popup text"], ["Contributing", "https://github.com/tommy-muckstack/calendlyisdead/blob/main/CONTRIBUTING.md", "Help build the next feature"]] },
];
const href = (h: string) => (h.startsWith("http") || h.endsWith(".html") ? h : h);
export function Nav({ variant = "home" }: { variant?: "home" | "login" | "signup" }) {
  const links = variant !== "signup";
  const [m, setM] = useState(false);
  return <>
    <header className="cm-nav">
      <Link href="/" aria-label="CalendlyIsDead home"><Wordmark /></Link>
      {links && <nav className="cm-links" aria-label="Main">
        {MENUS.map(x => <div className="cm-menu" key={x.label}><button className="cm-link" aria-haspopup="true">{x.label}<Chev /></button>
          <div className="cm-pop">{x.items.map(([l, h, d]) => h.startsWith("http") || h.endsWith(".html") ? <a key={l} href={h}>{l}<small>{d}</small></a> : <Link key={l} href={h}>{l}<small>{d}</small></Link>)}</div></div>)}
        <Link className="cm-link" href="/pricing">Pricing</Link>
      </nav>}
      <div className="cm-navr">
        <a className="cm-btn text" href="https://github.com/tommy-muckstack/calendlyisdead" target="_blank" rel="noreferrer">Talk to sales</a>
        {variant !== "login" && <Link className="cm-btn outline" href="/login">Log In</Link>}
        {variant !== "signup" && <Link className="cm-btn fill" href="/signup">Get started for free</Link>}
        <button className="cm-burger" aria-label="Menu" aria-expanded={m} onClick={() => setM(!m)}>{m ? <svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 3l12 12M15 3L3 15" stroke="#071A31" strokeWidth="1.8" strokeLinecap="round" /></svg> : <svg width="20" height="14" viewBox="0 0 20 14"><path d="M1 1h18M1 7h18M1 13h18" stroke="#071A31" strokeWidth="1.8" strokeLinecap="round" /></svg>}</button>
      </div>
    </header>
    <div className={"cm-mobile" + (m ? " open" : "")} onClick={() => setM(false)}>
      <Link href="/#scheduling">Product</Link><Link href="/#assistant">Solutions</Link><Link href="/#integrations">Resources</Link><Link href="/pricing">Pricing</Link><Link href="/login">Log In</Link>
      <Link className="cm-btn fill lg" style={{ marginTop: 16, fontSize: 16, fontFamily: "inherit", borderBottom: 0 }} href="/signup">Get started for free</Link>
    </div>
  </>;
}
const cols = [
  { t: "Products", l: ["Scheduling", "AI assistant", "Insights", "Contacts", "Payments"], t2: "Features", l2: ["Security", "Customizable availability", "Event types", "Meeting polls", "Reminders & follow up", "Meeting routing", "Analytics", "Admin management"] },
  { t: "Integrations", l: ["Google ecosystem", "Microsoft ecosystem", "Video conferencing", "Payment processors", "Sales & CRM", "Recruiting & ATS", "All integrations"], t2: "Solutions", l2: ["For individuals", "For teams", "For large companies"] },
  { t: "Resources", l: ["Create your account", "Pricing and plans", "Product tour", "What's new", "Getting started guide", "Community", "Developer tools"], t2: "Support", l2: ["Help center", "Learning hub", "Contact support", "Contact sales"], t3: "Company", l3: ["About us", "Contributing", "Become a partner", "Blog"] },
];
const Sq = ({ children }: { children: React.ReactNode }) => <span className="cm-sq">{children}</span>;
export function Footer() {
  return <footer className="cm-foot"><div className="cm-footc">
    <h2 className="big">Make space for what matters.</h2>
    {cols.map(c => <div className="cm-col" key={c.t} style={{ gridColumn: undefined }}>
      <h4>{c.t}</h4>{c.l.map(x => <Link key={x} href="/">{x}</Link>)}
      <h4 style={{ marginTop: 26 }}>{c.t2}</h4>{c.l2.map(x => <Link key={x} href="/">{x}</Link>)}
      {c.t3 && <><h4 style={{ marginTop: 26 }}>{c.t3}</h4>{c.l3!.map(x => <Link key={x} href="/">{x}</Link>)}</>}
    </div>)}
    <div className="flogo"><img src={BP + "/logo.svg"} alt="" /><span>CalendlyIsDead</span></div>
    <div className="cm-fbar">
      <div className="r1"><div><h5>Downloads</h5>{["Web", "Embed", "Docker", "Postgres", "CalDAV", "iCal", "API"].map(x => <Sq key={x}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#fff" strokeWidth="1.2" /><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" stroke="#fff" strokeWidth="1" /></svg></Sq>)}</div>
        <div style={{ textAlign: "right" }}><h5>Join us on social</h5>{["X", "In", "Gh", "Yt"].map(x => <Sq key={x}><span style={{ fontSize: 11, fontWeight: 600 }}>{x}</span></Sq>)}</div></div>
      <div className="r2"><span>English ▾</span><nav><a href="/">Privacy Policy</a><a href="/">Legal</a><a href="/">Status</a><a href="/">Cookie Settings</a></nav><span>Apache-2.0 · CalendlyIsDead 2026</span></div>
    </div>
  </div></footer>;
}
