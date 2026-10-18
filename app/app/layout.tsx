import { BP } from "@/lib/basepath";
import { redirect } from "next/navigation";
import { requireUser, signOut, entryRedirect } from "@/auth";
import { AppShell } from "@/components/app/Shell";
export const dynamic = "force-dynamic";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser(); if (!u) redirect(entryRedirect("/app"));
  // Analytics identity: Firebase accounts by their Firebase uid (shared across IsDead apps); guests and the demo account stay anonymous.
  const analytics = u.firebaseUid ? { id: u.firebaseUid, kind: "firebase" as const } : { id: u.id, kind: u.username?.startsWith("guest-") ? "guest" as const : "demo" as const };
  return <AppShell analytics={analytics} user={{ name: (u as any).name || "", email: u.email || "", username: u.username! }}
    signOut={<form action={async () => { "use server"; await signOut({ redirectTo: BP + "/" }); }}><button role="menuitem" type="submit">Sign out</button></form>}>{children}</AppShell>;
}
