import { redirect } from "next/navigation";
import { requireUser, signOut } from "@/auth";
import { BP } from "@/lib/basepath";
import { firebaseClientConfig } from "@/lib/isdead-auth/config";
import { readLoginSettings } from "@/lib/login-settings-server";
import { LoginSettings } from "@/components/LoginSettings";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser(); if (!user) redirect("/login");
  const initial = await readLoginSettings(user);
  return <LoginSettings initial={initial} config={firebaseClientConfig()} signInAgain={async () => {
    "use server";
    await signOut({ redirectTo: `${BP}/login?callbackUrl=${encodeURIComponent("/app/profile/login")}` });
  }} />;
}
