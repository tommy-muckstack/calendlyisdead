"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BP } from "@/lib/basepath";
import { I } from "./icons";
import "./appshell.css";

const SCHED = [{ href: "/app", label: "Event types" }, { href: "/app/one-off", label: "Single-use links" }, { href: "/app/polls", label: "Meeting polls" }, { href: "/app/routing", label: "Routing forms" }];
const CALENDAR = [{ href: "/app/meetings", label: "Meetings" }, { href: "/app/calendars", label: "Calendar connections" }];
const NAV: { href: string; label: string; icon: keyof typeof I; match: (p: string) => boolean }[] = [
  { href: "/app", label: "Scheduling", icon: "sched", match: p => SCHED.some(t => t.href === p) || p === "/app/availability" },
  { href: "/app/meetings", label: "Calendar", icon: "cal", match: p => p.startsWith("/app/calendars") || p.startsWith("/app/meetings") },
  { href: "/app/assistant", label: "Assistant", icon: "assist", match: p => p.startsWith("/app/assistant") },
  { href: "/app/teams", label: "Teams", icon: "team", match: p => p.startsWith("/app/teams") },
  { href: "/app/workflows", label: "Automations", icon: "auto", match: p => p.startsWith("/app/workflows") },
  { href: "/app/analytics", label: "Analytics", icon: "chart", match: p => p.startsWith("/app/analytics") },
];
const TITLES: [string, string, { href: string; label: string }[]?][] = [
  ["/app/meetings", "Calendar", CALENDAR], ["/app/calendars", "Calendar", CALENDAR], ["/app/assistant", "Assistant"], ["/app/teams", "Teams"], ["/app/workflows", "Automations", [{ href: "/app/workflows", label: "My automations" }]],
  ["/app/analytics", "Analytics", [{ href: "/app/analytics", label: "Events" }]], 
];
const GET_STARTED = [
  { t: "Create your first event type", n: "2 tasks", a: <><rect x="8" y="10" width="32" height="28" rx="4" fill="#dbeafe" stroke="#2563eb" strokeWidth="2" /><path d="M8 18h32" stroke="#2563eb" strokeWidth="2" /><path d="M17 26h6M17 31h14" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" /></> },
  { t: "Connect your calendar", n: "2 tasks", a: <><rect x="6" y="12" width="36" height="26" rx="4" fill="#fde68a" stroke="#d97706" strokeWidth="2" /><path d="M6 20h36M16 8v8M32 8v8" stroke="#d97706" strokeWidth="2" strokeLinecap="round" /></> },
  { t: "Automate reminders and follow-ups", n: "2 tasks", a: <><rect x="6" y="14" width="30" height="22" rx="3" fill="#e0e7ff" stroke="#6366f1" strokeWidth="2" /><path d="M6 17l15 10 15-10" stroke="#6366f1" strokeWidth="2" fill="none" /><circle cx="38" cy="14" r="6" fill="#bbf7d0" stroke="#16a34a" strokeWidth="2" /></> },
  { t: "Using CalendlyIsDead with a team", n: "2 tasks", a: <><circle cx="17" cy="19" r="6" fill="#fbcfe8" stroke="#db2777" strokeWidth="2" /><circle cx="32" cy="22" r="5" fill="#bae6fd" stroke="#0284c7" strokeWidth="2" /><path d="M6 38c1-7 6-10 11-10s10 3 11 10M28 37c.8-4 3-6 6-6s5 2 6 6" stroke="#475569" strokeWidth="2" fill="none" strokeLinecap="round" /></> },
];

export function AppShell({ user, signOut, children }: { user: { name: string; email: string; username: string }; signOut: ReactNode; children: ReactNode }) {
  const path = (usePathname() || "").replace(BP, "") || "/app";
  const [menu, setMenu] = useState<null | "side" | "top" | "user">(null);
  const [gs, setGs] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { try { if (localStorage.getItem("cid-gs") === "off") setGs(false); } catch { } }, []);
  useEffect(() => { const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(null); }; addEventListener("mousedown", f); return () => removeEventListener("mousedown", f); }, []);
  const settings = ["/app/availability", "/app/branding", "/app/embed"].some(x => path.startsWith(x));
  const sched = SCHED.find(t => t.href === path) || (settings ? SCHED[0] : undefined);
  const meta = sched ? ["Scheduling", SCHED] as const : (() => { const t = TITLES.find(x => path.startsWith(x[0])); return t ? [t[1], t[2]] as const : ["", undefined] as const; })();
  const initial = (user.name || user.email || "?").trim()[0]?.toUpperCase();
  const create = (to: string) => { setMenu(null); if (to === "event") { if (path === "/app") dispatchEvent(new CustomEvent("cid:create-event-type")); else location.href = `${BP}/app?new=1`; } };
  const CreateMenu = ({ id }: { id: "side" | "top" }) => menu === id ? <div className="cs-menu" role="menu">
    <button role="menuitem" onClick={() => create("event")}>Event type</button>
    <Link role="menuitem" href="/app/one-off" onClick={() => setMenu(null)}>Single-use link</Link>
    <Link role="menuitem" href="/app/polls" onClick={() => setMenu(null)}>Meeting poll</Link>
    <Link role="menuitem" href="/app/routing" onClick={() => setMenu(null)}>Routing form</Link></div> : null;
  return <div className="cs" ref={ref}>
    <div className="cs-user"><button className="cs-who" onClick={() => setMenu(menu === "user" ? null : "user")} aria-label="Account menu"><span className="cs-av">{initial}</span><b>{user.name || user.email}</b>{I.chev(16)}</button>
      <button className="cs-ico" aria-label="Collapse sidebar">{I.panel(20)}</button>
      {menu === "user" && <div className="cs-menu cs-menu-user" role="menu"><div className="cs-em">{user.email}</div><a role="menuitem" href={`${BP}/${user.username}`} target="_blank">My booking page</a><Link role="menuitem" href="/app/branding" onClick={() => setMenu(null)}>Settings</Link>
        {signOut}</div>}</div>
    <aside className="cs-side">
      <div className="cs-create"><button className="cs-btn cs-outline cs-wide" onClick={() => setMenu(menu === "side" ? null : "side")} aria-haspopup="menu">{I.plus(16)}Create{I.chev(14)}</button><CreateMenu id="side" /></div>
      <nav>{NAV.map(n => { const on = n.match(path); return <Link key={n.href} href={n.href} className={"cs-nav" + (on ? " on" : "")} aria-current={on ? "page" : undefined}>{I[n.icon](22)}{n.label}</Link>; })}</nav>
      <div className="cs-grow" />
      <div className="cs-promo"><div className="cs-promo-art" /><b>Free and open source</b><span>No seats, no gates. Read the code, fork it, self-host it.</span><a href="https://github.com/tommy-muckstack/calendlyisdead" target="_blank" rel="noreferrer">View the source →</a></div>
      <a className="cs-btn cs-outline cs-wide" href="https://github.com/tommy-muckstack/calendlyisdead" target="_blank" rel="noreferrer">{I.star(18)}Star on GitHub</a>
      <Link className={"cs-nav cs-settings" + (path.startsWith("/app/branding") || path.startsWith("/app/embed") ? " on" : "")} href="/app/branding">{I.gear(20)}Settings</Link>
    </aside>
    <div className={"cs-wrap" + (gs && path === "/app" ? " has-gs" : "")}>
      <main className="cs-main">
        {meta[0] && <header className="cs-head">
          <div className="cs-title"><h1>{meta[0]}</h1><span className="cs-help" title="Help">{I.help(16)}</span></div>
          {sched && <div className="cs-actions"><Link className="cs-btn cs-outline" href="/app/availability">{I.avail(16)}Manage availability</Link>
            <div className="cs-create"><button className="cs-btn cs-dark" onClick={() => setMenu(menu === "top" ? null : "top")} aria-haspopup="menu">{I.plus(16)}Create{I.chev(14)}</button><CreateMenu id="top" /></div></div>}
          {meta[1] && <div className="cs-tabs" role="tablist">{meta[1].map(t => {
            const selected = path === t.href || (t.href === "/app/meetings" && path.startsWith("/app/meetings/")) || (settings && t.href === "/app");
            return <Link key={t.href + t.label} href={t.href} role="tab" className={selected ? "on" : ""} aria-selected={selected}>{t.label}</Link>;
          })}</div>}
        </header>}
        {settings ? <div className="cs-body cs-dim" aria-hidden /> : <div className="cs-body">{children}</div>}
      </main>
      {gs && path === "/app" && <aside className="cs-gs"><div className="cs-gs-h"><h2>Get started</h2><button className="cs-ico" onClick={() => setGs(false)} aria-label="Close">{I.close(22)}</button></div>
        {GET_STARTED.map(g => <div key={g.t} className="cs-gs-i"><svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>{g.a}</svg><div><b>{g.t}</b><span>{g.n}</span></div></div>)}
        <button className="cs-btn cs-outline cs-sm" onClick={() => { setGs(false); try { localStorage.setItem("cid-gs", "off"); } catch { } }}>Don’t show again</button></aside>}
    </div>
    {settings && <div className="cs-scrim"><section className="cs-modal" role="dialog" aria-modal="true" aria-label="Settings">
      <aside className="cs-mnav"><h4>My account</h4>
        <Link href="/app/availability" className={path.startsWith("/app/availability") ? "on" : ""}>{I.avail(18)}Scheduling</Link>
        <Link href="/app/branding" className={path.startsWith("/app/branding") ? "on" : ""}>{I.star(18)}Branding</Link>
        <a href={`${BP}/${user.username}`} target="_blank" rel="noreferrer">{I.link(18)}My link</a>
        <h4>Features</h4>
        <Link href="/app/embed" className={path.startsWith("/app/embed") ? "on" : ""}>{I.ext(18)}Embed</Link>
        <Link href="/app/assistant">{I.assist(18)}Assistant</Link>
        <h4>Admin</h4>
        <Link href="/app/teams">{I.team(18)}Teams</Link>
        <Link href="/app/analytics">{I.chart(18)}Analytics</Link></aside>
      <div className="cs-mbody"><div className="cs-mh"><h2>{path.startsWith("/app/availability") ? "Scheduling settings" : path.startsWith("/app/branding") ? "Branding" : "Embed"}</h2><Link href="/app" className="cs-ico" aria-label="Close settings">{I.close(22)}</Link></div>
        <div className="cs-mc">{children}</div></div>
    </section></div>}
  </div>;
}
