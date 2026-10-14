import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, signOut } from "@/auth";
import { Logo } from "@/components/Logo";
export const dynamic = "force-dynamic";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser(); if (!u) redirect("/login");
  return <div className="shell">
    <aside className="side">
      <div style={{ padding: "4px 8px 18px" }}><Logo /></div>
      <Link className="nav" href="/app">◷ Event types</Link>
      <Link className="nav" href="/app/availability">▦ Availability</Link>
      <Link className="nav" href="/app/calendars">⇄ Calendars</Link>
      <Link className="nav" href="/app/teams">◎ Teams</Link>
      <Link className="nav" href="/app/workflows">✉ Workflows</Link>
      <Link className="nav" href="/app/routing">⇢ Routing forms</Link>
      <a className="nav" href={`/${u.username}`} target="_blank">↗ My booking page</a>
      <div style={{ flex: 1 }} />
      <div className="muted" style={{ fontSize: 13, padding: "0 12px" }}>{u.email}</div>
      <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}><button className="btn" style={{ margin: 8 }}>Sign out</button></form>
    </aside>
    <main className="main">{children}</main>
  </div>;
}
