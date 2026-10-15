import { BP } from "@/lib/basepath";
import { demoEnabled } from "@/auth";
import { firebaseClientConfig, firebaseConfigured } from "@/lib/isdead-auth/config";
import { SiteNav } from "@/components/SiteNav";
import { LoginForm } from "@/components/LoginForm";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; as?: string }> }) {
  const { callbackUrl, as } = await searchParams;
  const rel = callbackUrl?.startsWith(BP + "/") ? callbackUrl.slice(BP.length) : callbackUrl;
  const to = BP + (rel && /^\/(?!\/)/.test(rel) ? rel : "/app");
  // Calendly-style layout from @isdead/design (templates/marketing-site.md): marketing nav + full-bleed gradient + centered card
  return <>
    <SiteNav />
    <section className="ids-auth"><div className="ids-auth__card cid-login">
      <LoginForm config={firebaseConfigured() ? firebaseClientConfig() : null} demo={demoEnabled()} demoAs={as === "mate" ? "mate" : undefined} to={to} />
    </div></section>
  </>;
}
