import "../marketing.css";
import { BP } from "@/lib/basepath";
import { demoEnabled } from "@/auth";
import { firebaseClientConfig, firebaseConfigured } from "@/lib/isdead-auth/config";
import { cmSans, cmSerif } from "@/components/mk/fonts";
import { Banner, Nav } from "@/components/mk/chrome";
import { LoginForm } from "@/components/LoginForm";
export const dynamic = "force-dynamic";
export const metadata = { title: "Create a free account | CalendlyIsDead" };
export default async function Signup() {
  return <div className={`cm ${cmSans.variable} ${cmSerif.variable}`}><Banner /><Nav variant="signup" />
    <section className="cm-authsec"><div className="cm-auth"><div className="cm-acard wide">
      <LoginForm config={firebaseConfigured() ? firebaseClientConfig() : null} demo={demoEnabled()} to={BP + "/app"} mode="signup" />
    </div></div></section></div>;
}
