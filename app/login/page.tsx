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
export const metadata = { title: "Log in | CalendlyIsDead", referrer: "no-referrer" as const };
export default async function Login({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; as?: string }> }) {
  const { callbackUrl, as } = await searchParams;
  const destination = loginDestination(callbackUrl, BP);
  const user = await requireUser();
  if (user) redirect(!destination.startsWith("/invite/") && await onboardingRequired(user.id) ? "/onboarding" : destination);
  const to = BP + destination;
  return <div className={`cm ${cmSans.variable} ${cmSerif.variable}`}><Banner /><Nav variant="login" />
    <section className="cm-authsec"><div className="cm-auth"><div className="cm-acard">
      <LoginForm config={firebaseConfigured() ? firebaseClientConfig() : null} demo={demoEnabled()} demoAs={as === "mate" ? "mate" : undefined} to={to} mode="login" />
    </div></div></section></div>;
}
