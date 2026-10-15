"use client";
import { useEffect, useRef, useState } from "react";
import { G, MsMark, ICON } from "./icons";
const heights = [165, 225, 285, 325, 355, 380, 394]; const widths = [5, 8, 12, 17, 22, 28, 40]; // outermost → nearest the card
export function HeroArt() {
  const bars = (rev: boolean) => heights.map((h, i) => <i key={i} style={{ height: h, width: widths[i], opacity: 0.45 + i * 0.09 }} />);
  return <div className="cm-heroart" aria-hidden>
    <div className="cm-bars l">{bars(false)}</div>
    <div className="cm-bookcard">
      <div className="brand"><svg width="26" height="26" viewBox="0 0 30 30"><path d="M4 11l11-6 11 6-11 6z" fill="#2e6cc0" /><path d="M4 11v8l11 6v-8z" fill="#5aa5ff" /><path d="M26 11v8l-11 6v-8z" fill="#1d4f9a" /></svg>Acme Studio</div>
      <div className="who">
        <div className="cm-av" style={{ width: 50, height: 50, fontSize: 16, position: "absolute", left: 250, top: 99, background: "linear-gradient(135deg,#f6c7a6,#d07b46)" }}>SR</div><div style={{ height: 58 }} />
        <div className="host">Sage Rowan</div><div className="evt">Client Check-in</div>
        <div className="meta"><svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="3" width="7" height="6" rx="1.5" fill="#5F6D77" /><path d="M8 5l3-1.5v5L8 7z" fill="#5F6D77" /></svg>Video call</div>
        <div className="meta" style={{ marginTop: 6 }}><svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="#5F6D77" /><path d="M6 3v3l2 1" stroke="#fff" strokeWidth="1" fill="none" /></svg>30 min</div>
        <div style={{ marginTop: 14, width: 66 }}><i className="cm-skel" /><i className="cm-skel" style={{ width: 52 }} /><i className="cm-skel" /><i className="cm-skel" /><i className="cm-skel" style={{ width: 46 }} /></div>
      </div>
    </div>
    <div className="cm-bars r">{bars(true)}</div>
  </div>;
}
type Item = { icon: React.ReactNode; t: string; d?: string };
export function Story({ id, tag, badge, tagBg, title, items, art, flip, tall }: { id: string; tag: string; badge?: string; tagBg: string; title: string; items: Item[]; art: "avail" | "assist" | "recap" | "pay"; flip?: boolean; tall?: boolean }) {
  const [i, setI] = useState(0); const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!tall) return; // scroll-linked: the item whose centre is closest to 45% of the viewport is active (matches calendly.com's scroll story)
    const on = () => { const rows = ref.current!.querySelectorAll<HTMLElement>(".cm-acc>div"); let best = 0, bd = 1e9; rows.forEach((r, k) => { const b = r.getBoundingClientRect(); const d = Math.abs(b.top + b.height / 2 - innerHeight * 0.45); if (d < bd) { bd = d; best = k; } }); setI(best); };
    on(); addEventListener("scroll", on, { passive: true }); return () => removeEventListener("scroll", on);
  }, [tall]);
  const inner = <div className="inner">
    <div className="txt">
      <span className="cm-tag"><span className="ti" style={{ background: tagBg }}>{ICON.cal}</span>{tag}{badge && <em>{badge}</em>}</span>
      <h2>{title}</h2>
      <div className="cm-acc">{items.map((it, k) => <div key={it.t} className={k === i ? "on" : ""}>
        <button onClick={() => setI(k)} aria-expanded={k === i}>{it.icon}{it.t}</button>
        {it.d && <p className="d">{it.d}<span className="go"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 7.5l5-5M3.5 2.5h4v4" stroke="#071A31" strokeWidth="1.2" strokeLinecap="round" /></svg></span></p>}
      </div>)}</div>
    </div>
    <div className="artcol">{art === "avail" ? <ArtAvail i={i} /> : art === "assist" ? <ArtAssist /> : art === "recap" ? <ArtRecap /> : <ArtPay />}</div>
  </div>;
  return <section ref={ref} id={id} className={"cm-story" + (tall ? " tall" : "") + (flip ? " flip" : "")}>{inner}</section>;
}
export const Av = ({ s, t, bg }: { s: number; t: string; bg?: string }) => <span className="cm-av" style={{ width: s, height: s, fontSize: s * 0.36, background: bg }}>{t}</span>;
export function ArtAvail({ i }: { i: number }) {
  const sub = ["Availability", "Event types", "Workflows", "Embed", "Anywhere", "Teams"][i] ?? "Availability";
  return <div className="cm-art g1"><div className="eq" aria-hidden>{Array.from({ length: 9 }, (_, n) => <i key={n} style={{ height: 30 + (n % 3) * 14 }} />)}</div><div className="cm-ui"><h4>{sub}</h4>
    <div className="cm-row"><span className="cm-sel">0 <span>⌄</span></span>Meetings per day</div>
    <div className="cm-row"><span className="cm-sel" style={{ color: "#8a96a0" }}>15 min ⌄</span>Meeting Buffer Time<span className="cm-toggle" /></div>
    <div className="cm-row" style={{ fontSize: 11 }}>Schedule: <b style={{ color: "#071A31", fontWeight: 500 }}>Custom ⌄</b></div>
    {["M", "T", "W"].map(d => <div className="cm-day" key={d}><b>{d}</b>9:00am – 5:00pm<s /></div>)}
  </div></div>;
}
export function ArtAssist() { return <div className="cm-art g2"><div className="cm-ui" style={{ display: "flex", gap: 14, alignItems: "center", padding: 18, width: "70%", borderRadius: 18 }}><Av s={44} t="DM" bg="linear-gradient(135deg,#3b82c4,#103a6b)" /><span style={{ fontFamily: "var(--sans)", fontWeight: 500, fontSize: 22 }}>Dana Moore</span></div></div>; }
export function ArtRecap() { return <div className="cm-art g3"><div className="cm-ui" style={{ padding: 10, width: "62%", borderRadius: 22 }}>
  <div style={{ height: 150, borderRadius: 12, background: "linear-gradient(160deg,#bcd3f2,#f0c7d6)", position: "relative", overflow: "hidden" }}><span style={{ position: "absolute", left: 8, top: 8, background: "rgba(7,26,49,.55)", color: "#fff", fontSize: 8, padding: "2px 6px", borderRadius: 3 }}>Emily</span>
    <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}><circle cx="50" cy="42" r="14" fill="#f3d2b8" /><path d="M20 100c2-24 14-34 30-34s28 10 30 34z" fill="#fff" stroke="#071A31" strokeWidth=".4" /><path d="M36 34c2-12 26-14 28 0-6-4-22-4-28 0z" fill="#8a4b2a" /></svg></div>
  <div style={{ display: "flex", gap: 6, margin: "10px 4px 6px", alignItems: "center" }}><i style={{ width: 8, height: 8, borderRadius: "50%", border: "2px solid #5aa5ff" }} /><i style={{ flex: 1, height: 6, borderRadius: 3, background: "#e2e8f0" }} /><i style={{ flex: 1.4, height: 6, borderRadius: 3, background: "#e2e8f0" }} /></div>
  <div style={{ display: "flex", gap: 22, justifyContent: "center", alignItems: "center", padding: "4px 0 8px" }}><span style={{ color: "#5aa5ff" }}>✂</span><span style={{ width: 30, height: 30, borderRadius: "50%", background: "#3d8bf0", color: "#fff", display: "grid", placeItems: "center", fontSize: 12 }}>▶</span><span style={{ color: "#5aa5ff", fontSize: 12 }}>1x</span></div></div></div>; }
export function ArtPay() { return <div className="cm-art g4"><div style={{ width: "74%" }}><div className="cm-ui" style={{ width: "88%", margin: "0 auto", padding: 16, borderRadius: 20, background: "#f0f6ff" }}>
  <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Av s={44} t="DM" bg="linear-gradient(135deg,#1f9d8c,#0e5b6b)" /><div><div style={{ fontSize: 11, color: "#5F6D77" }}>Dana Moore</div><div style={{ fontFamily: "var(--sans)", fontWeight: 500, fontSize: 17 }}>Consultation</div></div></div>
  <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#5F6D77", margin: "10px 0 16px" }}><span>◷ 45 min</span><span>▭ Video</span></div></div>
  <div className="cm-ui" style={{ width: "100%", marginTop: -16, padding: "22px 18px", borderRadius: 20, display: "flex", alignItems: "center", fontFamily: "var(--sans)", fontWeight: 500, fontSize: 16 }}>Require Payment<span className="cm-toggle" style={{ width: 40, height: 22, borderRadius: 11 }} /></div></div></div>; }

const tiles: [string, string, React.ReactNode][] = [
  ["Video", "#4a8cff", <svg key="a" width="20" height="14" viewBox="0 0 20 14"><rect width="13" height="14" rx="3" fill="#fff" /><path d="M14 5l6-4v12l-6-4z" fill="#fff" /></svg>],
  ["Calendar", "transparent", <svg key="b" width="30" height="30" viewBox="0 0 30 30"><rect x="2" y="2" width="26" height="26" rx="6" fill="#3d8bf0" /><rect x="6" y="9" width="18" height="15" rx="3" fill="#fff" /><text x="15" y="21.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#3d8bf0">31</text></svg>],
  ["Mail", "transparent", <svg key="c" width="30" height="22" viewBox="0 0 30 22"><path d="M2 3l13 10L28 3v16H2z" fill="#fff" stroke="#e5523f" strokeWidth="3" strokeLinejoin="round" /><path d="M2 3l13 10L28 3" stroke="#e5523f" strokeWidth="3" fill="none" /></svg>],
  ["Meet", "transparent", <svg key="d" width="28" height="22" viewBox="0 0 28 22"><rect width="18" height="22" rx="4" fill="#f6b600" /><path d="M19 8l9-6v18l-9-6z" fill="#fbcf3a" /></svg>],
  ["CRM", "transparent", <svg key="e" width="30" height="22" viewBox="0 0 30 22"><ellipse cx="15" cy="11" rx="14" ry="10" fill="#2f9be0" /></svg>],
  ["Chat", "transparent", <svg key="f" width="28" height="28" viewBox="0 0 28 28"><rect x="1" y="9" width="12" height="5" rx="2.5" fill="#36c5f0" /><rect x="14" y="1" width="5" height="12" rx="2.5" fill="#2eb67d" /><rect x="15" y="14" width="12" height="5" rx="2.5" fill="#ecb22e" /><rect x="9" y="15" width="5" height="12" rx="2.5" fill="#e01e5a" /></svg>],
  ["Teams", "transparent", <svg key="g" width="28" height="28" viewBox="0 0 28 28"><rect x="3" y="3" width="22" height="22" rx="5" fill="#5059c9" /><text x="14" y="20" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">T</text></svg>],
  ["Outlook", "transparent", <svg key="h" width="30" height="26" viewBox="0 0 30 26"><rect x="10" y="2" width="19" height="22" rx="3" fill="#4cb3f0" /><rect x="1" y="5" width="16" height="16" rx="3" fill="#1e73d2" /><circle cx="9" cy="13" r="4" fill="none" stroke="#fff" strokeWidth="2.2" /></svg>],
  ["Browser", "transparent", <svg key="i" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="#e8453c" /><path d="M15 2a13 13 0 0111.3 6.5H15z" fill="#e8453c" /><path d="M3.7 8.5L9 17.5l5-9" fill="#fbbc05" /><circle cx="15" cy="15" r="5.5" fill="#fff" /><circle cx="15" cy="15" r="3.8" fill="#4285f4" /></svg>],
  ["AI", "transparent", <svg key="j" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="10" fill="none" stroke="#071A31" strokeWidth="2.4" /><path d="M14 4v20M5 9l18 10M23 9L5 19" stroke="#071A31" strokeWidth="2" /></svg>],
  ["Analytics", "transparent", <svg key="k" width="26" height="26" viewBox="0 0 26 26"><g stroke="#e8704a" strokeWidth="2.6" strokeLinecap="round"><path d="M13 2v22M2 13h22M5 5l16 16M21 5L5 21" /></g></svg>],
  ["Marketing", "transparent", <svg key="l" width="26" height="26" viewBox="0 0 26 26"><circle cx="18" cy="17" r="5" fill="none" stroke="#ff7a59" strokeWidth="3" /><circle cx="18" cy="5" r="3" fill="#ff7a59" /><path d="M18 8v4M4 6l9 9" stroke="#ff7a59" strokeWidth="3" /></svg>],
  ["Forms", "transparent", <svg key="m" width="22" height="26" viewBox="0 0 22 26"><path d="M11 2c4 5 8 6 8 12a8 8 0 01-16 0c0-4 3-4 3-8z" fill="none" stroke="#1d9a6c" strokeWidth="3" /></svg>],
  ["Jobs", "transparent", <svg key="n" width="26" height="26" viewBox="0 0 26 26"><rect x="2" y="2" width="22" height="22" rx="5" fill="#0a66c2" /><text x="13" y="19" textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff">in</text></svg>],
  ["Pay", "#6772e5", <svg key="o" width="22" height="22" viewBox="0 0 22 22"><text x="11" y="18" textAnchor="middle" fontSize="20" fontWeight="800" fill="#fff">S</text></svg>],
  ["Checkout", "transparent", <svg key="p" width="26" height="26" viewBox="0 0 26 26"><path d="M7 3h10c4 0 5 3 4 6-1 4-4 5-8 5H10l-1 7H5z" fill="#1c4bb5" /><path d="M11 8h5c2 0 3 1 2.4 3-.7 2-2 3-4.4 3h-3z" fill="#3b8ef0" /></svg>],
  ["Ticketing", "#ff4f00", <svg key="q" width="24" height="24" viewBox="0 0 24 24"><rect x="2" y="12" width="20" height="8" rx="1.5" fill="#fff" /></svg>],
];
export function Tiles() {
  const row = (a: number, b: number, cls = "") => <div className={"cm-tiles " + cls}>{tiles.slice(a, b).map(([n, bg, g]) => <div className="cm-tile" key={n} title={n}><span style={{ background: bg }}>{g}</span></div>)}</div>;
  return <>{row(0, 9)}{row(9, 17, "r2")}</>;
}
const stories = [
  { stat: "$0 per seat", q: "Round robin, workflows, routing and payments without a plan upgrade.", chip: "What you pay", who: "10-person team vs. $960–$2,400 a year" },
  { stat: "Your data, your server", q: "Self-host on Postgres and export anything, any time.", chip: "Open source", who: "Apache-2.0 on GitHub" },
  { stat: "Every feature unlocked", q: "Reminders, analytics and embeds work on day one, with no trial clock.", chip: "No plan gates", who: "Free hosted, or run it yourself" },
];
export function Stories() {
  const [k, setK] = useState(0);
  useEffect(() => { const t = setInterval(() => setK(x => (x + 1) % stories.length), 5000); return () => clearInterval(t); }, []);
  const s = stories[k];
  return <div className="cm-stage">
    <div className="cm-side" style={{ left: "calc(50% - 595px)", width: 74, height: 200, top: 130 }}><i style={{ background: "linear-gradient(160deg,#2e6cc0,#b99cf3)" }} /></div>
    <div className="cm-side" style={{ left: "calc(50% - 505px)", width: 98, height: 275, top: 82 }}><i style={{ background: "linear-gradient(160deg,#b99cf3,#f4b6d4)" }} /></div>
    <div className="cm-bigcard"><div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "8px 8px 8px 0" }}>
      <div className="stat">{s.stat}</div>
      <div><blockquote>“{s.q}”</blockquote><div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}><span className="cm-chip">{s.chip}</span><span className="cm-chip">{s.who}</span></div></div></div>
      <div className="cm-photo"><svg viewBox="0 0 300 300" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}><circle cx="220" cy="70" r="46" fill="#8ec8ff" opacity=".6" /><rect x="40" y="110" width="150" height="130" rx="14" fill="#fff" opacity=".92" /><rect x="40" y="110" width="150" height="30" rx="14" fill="#6BB1FF" /><g fill="#2e6cc0" opacity=".75">{Array.from({ length: 15 }, (_, n) => <circle key={n} cx={58 + (n % 5) * 28} cy={162 + Math.floor(n / 5) * 24} r="7" />)}</g></svg></div></div>
    <div className="cm-side" style={{ right: "calc(50% - 505px)", width: 102, height: 275, top: 82 }}><i style={{ background: "linear-gradient(160deg,#6dd0b8,#2e6cc0)" }} /></div>
    <div className="cm-side" style={{ right: "calc(50% - 595px)", width: 62, height: 200, top: 130 }}><i style={{ background: "linear-gradient(160deg,#f4b6d4,#9db6ec)" }} /></div>
    <div className="cm-dots" style={{ position: "absolute", bottom: 40, left: 0, right: 0 }}>{stories.map((_, n) => <i key={n} className={n === k ? "on" : ""} onClick={() => setK(n)} style={{ cursor: "pointer" }} />)}</div>
  </div>;
}
export function Reel() {
  const card = (cls: string, bg: string, cap?: React.ReactNode) => <div className={cls} style={{ background: bg }}>{cap}<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMax slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}><circle cx="50" cy="45" r="14" fill="#f3d2b8" opacity=".95" /><path d="M14 100c3-26 16-36 36-36s33 10 36 36z" fill="#fff" opacity=".9" /></svg></div>;
  return <div className="cm-reel">
    {card("s", "linear-gradient(160deg,#6BB1FF,#b9e4f0 55%,#f4c7d6)")}
    {card("c", "linear-gradient(160deg,#b9d9fb,#f6c8d8 45%,#8ec8ff)", <div className="cap"><span style={{ width: 36, height: 36, padding: 0, display: "grid", placeItems: "center", background: "#dbee9f", borderRadius: "50%" }}>{ICON.spark}</span><span>Discovery</span><span className="s">Scheduled</span></div>)}
    {card("s", "linear-gradient(160deg,#6BB1FF,#d9c8f6 60%,#f4c7d6)")}
  </div>;
}


const mtabs = [
  { c: "#6fb3ff", ic: ICON.cal, tag: "Scheduling", h: "Book meetings with the open-source scheduling tool", p: "Share a booking link, embed it on your site, and let people pick a time that really works.", bg: "#e4f0ff" },
  { c: "#dbee9f", ic: ICON.spark, tag: "AI assistant", h: "Introducing your 24/7 AI scheduling assistant", p: "Paste an email thread to coordinate scheduling on your behalf without switching tools or sacrificing control.", bg: "#f0f7d6" },
  { c: "#b89ffa", ic: ICON.doc, tag: "Insights", h: "See what your meetings add up to", p: "Bookings, cancellations and busy hours across every event type, at a glance.", bg: "#ece4ff" },
  { c: "#5ddfd7", ic: ICON.card, tag: "Payments", h: "Flexible, built-in payment tools", p: "Collect payment when clients book, through your own Stripe account.", bg: "#d9f6f2" },
];
/** Phone-only hero tabs (calendly.com swaps the desktop booking-card art for this tabbed card under 760px). */
export function MobileHero() {
  const [i, setI] = useState(1); const t = mtabs[i];
  return <div className="cm-mhero"><div className="tabs">{mtabs.map((m, k) => <button key={m.tag} aria-label={m.tag} onClick={() => setI(k)} className={k === i ? "on" : ""} style={{ background: m.c }}>{m.ic}</button>)}</div>
    <div className="card"><span className="cm-tag"><span className="ti" style={{ background: t.c }}>{t.ic}</span>{t.tag}{i === 1 && <em>Beta</em>}</span>
      <h3 className="cm-sans">{t.h}</h3><p>{t.p}</p><a className="lm" href="#scheduling">Learn more →</a>
      <div className="prev" style={{ background: t.bg }}><div className="mini"><Av s={22} t="DM" bg="linear-gradient(135deg,#3b82c4,#103a6b)" /><span><b>Dana Moore</b><i>Quick chat · 30 min</i></span></div></div></div></div>;
}
