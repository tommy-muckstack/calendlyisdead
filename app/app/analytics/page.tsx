import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/auth";
import { statsFor } from "@/lib/analytics";
import { formatMoney } from "@/lib/payments";
export const dynamic = "force-dynamic";
const pct = (x: number | null) => x === null ? "–" : `${Math.round(x * 100)}%`;
export default async function Page({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const u = await requireUser(); if (!u) redirect("/login");
  const days = [7, 30, 90, 365].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 30;
  const s = await statsFor(u.id, days, u.timezone ?? "America/New_York");
  const max = Math.max(1, ...s.byType.map(t => t.bookings));
  const hmax = Math.max(1, ...s.heat.flat());
  return <>
    <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>Last {days} days</h2>
      <div className="row">{[7, 30, 90, 365].map(d => <Link key={d} className={`btn ${d === days ? "primary" : ""}`} href={`/app/analytics?days=${d}`}>{d === 365 ? "1 year" : `${d} days`}</Link>)}</div></div>
    <div className="stats" data-testid="stats">
      <div className="card"><span className="muted">New bookings</span><b data-testid="stat-new">{s.newBookings}</b></div>
      <div className="card"><span className="muted">Upcoming</span><b>{s.upcoming}</b></div>
      <div className="card"><span className="muted">Completed</span><b>{s.completed}</b></div>
      <div className="card"><span className="muted">Cancelled</span><b data-testid="stat-cancelled">{s.cancelled}</b><small className="muted">{pct(s.cancelRate)} rate</small></div>
      <div className="card"><span className="muted">Rescheduled</span><b>{s.rescheduled}</b></div>
      <div className="card"><span className="muted">Page views</span><b>{s.totalViews}</b><small className="muted">{pct(s.conversion)} booked</small></div>
      <div className="card"><span className="muted">Revenue</span><b data-testid="stat-revenue">{formatMoney(s.revenueCents)}</b></div>
    </div>
    <h2>By event type</h2>
    <div className="card" style={{ padding: 8 }}>
      <table className="t"><thead><tr><th>Event type</th><th>Bookings</th><th style={{ width: "35%" }}></th><th>Views</th><th>Conversion</th></tr></thead>
        <tbody>{s.byType.map(t => <tr key={t.id}><td><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: t.color, marginRight: 8 }} />{t.title}</td>
          <td>{t.bookings}</td><td><div className="bar" style={{ width: `${(t.bookings / max) * 100}%`, background: t.color }} /></td><td>{t.views}</td><td>{pct(t.conversion)}</td></tr>)}
          {!s.byType.length && <tr><td colSpan={5} className="muted">No bookings or views yet in this period.</td></tr>}</tbody></table>
    </div>
    <h2>Popular times</h2>
    <p className="muted">{s.busiest ? `Busiest: ${s.busiest.day} around ${s.busiest.hour % 12 || 12}${s.busiest.hour < 12 ? "am" : "pm"}` : "Not enough data yet."}</p>
    <div className="card heat" style={{ padding: 14 }} data-testid="heatmap">
      <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="muted" style={{ textAlign: "center" }}>{h % 6 === 0 ? h : ""}</span>)}
      {s.heat.map((row, d) => [<span key={`l${d}`} className="muted">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]}</span>,
        ...row.map((n, h) => <div key={`${d}-${h}`} title={`${n} bookings`} style={{ background: n ? `color-mix(in srgb, var(--brand) ${20 + (n / hmax) * 80}%, white)` : "#f1f3f2" }} />)])}
    </div>
  </>;
}
