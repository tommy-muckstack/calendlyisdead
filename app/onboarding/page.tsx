import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { eq } from "drizzle-orm";
import { requireUser, signOut } from "@/auth";
import { BP } from "@/lib/basepath";
import { getDb, schema } from "@/lib/db";
import { readOnboarding } from "@/lib/onboarding";
import { googleOAuth } from "@/lib/calendars/google";
import { msOAuth } from "@/lib/calendars/microsoft";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import "./onboarding.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your account | CalendlyIsDead" };
export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser(); if (!user) redirect("/login");
  const state = await readOnboarding(user.id); if (!state || state.step === "complete") redirect("/app");
  const db = await getDb(), C = schema.calendarConnections;
  const connections = await db.select({ id: C.id, provider: C.provider, accountEmail: C.accountEmail, status: C.status }).from(C).where(eq(C.userId, user.id));
  const { error } = await searchParams;
  return <div className="onboarding">
    <header className="onboarding-header"><Link href="/" aria-label="CalendlyIsDead home"><Image src={BP + "/logo.svg"} width={30} height={34} alt="" unoptimized /><b>CalendlyIsDead</b></Link>
      <form action={async () => { "use server"; await signOut({ redirectTo: BP + "/login" }); }}><button className="btn" type="submit">Sign out</button></form></header>
    <OnboardingWizard initial={state} connections={connections} available={{ google: googleOAuth.configured(), microsoft: msOAuth.configured() }} calendarError={!!error} />
    <footer>CalendlyIsDead is an independent open-source project, not affiliated with or endorsed by Calendly, LLC.</footer>
  </div>;
}
