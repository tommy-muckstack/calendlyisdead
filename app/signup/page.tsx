import "../marketing.css";
import { BP } from "@/lib/basepath";
import { redirect } from "next/navigation";
import { onboardingRequired } from "@/lib/onboarding";
import { loginDestination } from "@/lib/onboarding-validation";
import { demoEnabled, requireUser } from "@/auth";
import { firebaseClientConfig, firebaseConfigured } from "@/lib/isdead-auth/config";
import { cmSans, cmSerif } from "@/components/mk/fonts";
import { Banner, Nav } from "@/components/mk/chrome";
import { LoginForm } from "@/components/LoginForm";
export const dynamic = "force-dynamic";
export const metadata = { title: "Create a free account | CalendlyIsDead", referrer: "no-referrer" as const };
export default async function Signup({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const destination = loginDestination((await searchParams).callbackUrl, BP);
  const user = await requireUser();
  if (user) redirect(!destination.startsWith("/invite/") && await onboardingRequired(user.id) ? "/onboarding" : destination);
  return <div className={`cm ${cmSans.variable} ${cmSerif.variable}`}><Banner /><Nav variant="signup" />
    <section className="cm-authsec"><div className="cm-auth"><div className="cm-acard wide">
      <LoginForm config={firebaseConfigured() ? firebaseClientConfig() : null} demo={demoEnabled()} to={BP + destination} mode="signup" />
    </div></div></section></div>;
}
