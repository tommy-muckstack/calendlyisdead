import { BP } from "@/lib/basepath";
import { redirect } from "next/navigation";
import { requireUser, signOut } from "@/auth";
import { AppShell } from "@/components/app/Shell";
export const dynamic = "force-dynamic";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser(); if (!u) redirect("/login");
  return <AppShell user={{ name: (u as any).name || "", email: u.email || "", username: u.username! }}
    signOut={<form action={async () => { "use server"; await signOut({ redirectTo: BP + "/" }); }}><button role="menuitem" type="submit">Sign out</button></form>}>{children}</AppShell>;
}
