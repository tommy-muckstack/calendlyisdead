import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, requireUser } from "@/auth";
import { acceptInvite } from "@/lib/teams";
export const dynamic = "force-dynamic";
export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const { token } = await params; const { e } = await searchParams;
  const s = await auth();
  if (!s) return <main style={{ maxWidth: 460, margin: "80px auto", padding: 24 }}><div className="card" style={{ padding: 28 }}>
    <h1 style={{ marginTop: 0 }}>You&#39;re invited to a team</h1><p className="muted">Sign in with the email address the invite was sent to.</p>
    <Link className="btn primary" href={`/login?callbackUrl=/invite/${token}`}>Sign in to accept</Link></div></main>;
  return <main style={{ maxWidth: 460, margin: "80px auto", padding: 24 }}><div className="card" style={{ padding: 28 }}>
    <h1 style={{ marginTop: 0 }}>Join the team?</h1>
    {e && <p style={{ color: "var(--warn)" }}>{e === "wrong_account" ? "This invite was sent to a different email address. Sign in with that account." : "This invite is no longer valid."}</p>}
    <form action={async () => { "use server";
      const u = await requireUser(); if (!u) redirect("/login");
      const r = await acceptInvite(token, u);
      if ("error" in r) redirect(`/invite/${token}?e=${r.error}`);
      redirect("/app/teams"); }}>
      <button className="btn primary">Accept invite</button></form>
  </div></main>;
}
