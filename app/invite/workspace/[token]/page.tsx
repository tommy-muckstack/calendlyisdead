import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/auth";
import { readWorkspaceInvitation, WorkspaceError } from "@/lib/workspaces";
import { WorkspaceInvitation } from "@/components/WorkspaceInvitation";
import "@/components/workspace-settings.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workspace invitation | CalendlyIsDead", referrer: "no-referrer", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params, user = await requireUser();
  const login = `/login?callbackUrl=${encodeURIComponent(`/invite/workspace/${token}`)}`;
  if (!user) return <main className="workspace-accept card"><h1>You’re invited to a workspace</h1><p>Sign in with the email address the invitation was sent to.</p><Link className="btn primary" href={login}>Sign in to accept</Link></main>;
  let invitation: Awaited<ReturnType<typeof readWorkspaceInvitation>>;
  try { invitation = await readWorkspaceInvitation(user.id, { token }); }
  catch (error) {
    return <main className="workspace-accept card"><h1>Workspace invitation</h1><p role="alert">{error instanceof WorkspaceError ? error.message : "The invitation could not be loaded. Try again or ask the workspace admin for a new link."}</p><p>Signed in as {user.email}.</p><Link href="/app/people">Go to People</Link><p>To use a different account, sign out from your account menu, then reopen this invitation.</p></main>;
  }
  return <main className="workspace-accept card">{invitation.alreadyJoined ? <><h1>You’ve joined {invitation.name}</h1><Link className="btn primary" href="/app/people">Go to People</Link></> : <WorkspaceInvitation token={token} name={invitation.name} role={invitation.role} />}<p>Signed in as {user.email}.</p></main>;
}
