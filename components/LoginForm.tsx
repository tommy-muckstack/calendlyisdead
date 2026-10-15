"use client";
import { useState } from "react";
import Link from "next/link";
import type { FirebaseClientConfig } from "@/lib/isdead-auth/config";
import { signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword, authErrorMessage } from "@/lib/isdead-auth/client";
import { BP } from "@/lib/basepath";
import { G, MsMark, Check } from "@/components/mk/icons";
import { Arrow } from "@/components/mk/chrome";
type Props = { config: FirebaseClientConfig | null; demo: boolean; demoAs?: "mate"; to: string; mode?: "login" | "signup"; autoProvider?: string };
// Calendly auth layout: email first, then password; Google below. Login = narrow card; signup = wide card with a perks column.
export function LoginForm({ config, demo, demoAs, to, mode: initial = "login" }: Props) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">(initial);
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [note, setNote] = useState("");
  const done = () => { window.location.assign(to); };
  const run = async (f: () => Promise<void>) => { setBusy(true); setErr(""); setNote(""); try { await f(); } catch (e) { setErr(authErrorMessage(e)); } finally { setBusy(false); } };
  const session = `${BP}/api/session`;
  const signup = mode === "signup";
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd = new FormData(e.currentTarget);
    if (step === "email") { const v = String(fd.get("email") || "").trim(); if (!v) return; setEmail(v); if (mode === "reset") { run(async () => { await resetPassword(config!, v); setNote("If that email has an account, a reset link is on its way."); setMode("login"); }); return; } setStep("password"); return; }
    const password = String(fd.get("password") ?? ""), name = String(fd.get("name") ?? "");
    run(async () => { if (signup) await signUpWithEmail(config!, session, email, password, name || undefined); else await signInWithEmail(config!, session, email, password); done(); }); };
  const demoLogin = () => run(async () => { const r = await fetch(`${BP}/api/session/demo${demoAs ? `?who=${demoAs}` : ""}`, { method: "POST" }); if (!r.ok) throw new Error("Demo sign-in failed"); done(); });
  const form = <div>
    <h1>{signup ? "Create a free account" : mode === "reset" ? "Reset your password" : "Log in to your account"}</h1>
    {signup && <p className="sub">No credit card required. Everything is free, always.</p>}
    {!config && <p className="sub" role="status">Sign-in isn’t configured on this deployment yet.</p>}
    {config && <>
      <form onSubmit={onSubmit} noValidate={false}>
        {step === "email" && <input className="cm-in" name="email" type="email" required autoComplete="email" placeholder="Enter your email" aria-label="Email" defaultValue={email} />}
        {step === "password" && <>
          <input className="cm-in pad" value={email} readOnly aria-label="Email" onClick={() => setStep("email")} />
          {signup && <input className="cm-in pad" name="name" autoComplete="name" placeholder="Your name" aria-label="Name" />}
          <input className="cm-in" name="password" type="password" required minLength={6} autoFocus autoComplete={signup ? "new-password" : "current-password"} placeholder={signup ? "Create a password" : "Enter your password"} aria-label="Password" />
        </>}
        {err && <p className="cm-err" role="alert">{err}</p>}
        {note && <p className="sub" role="status">{note}</p>}
        <button className="cm-btn fill cm-full" disabled={busy}>{step === "email" ? (mode === "reset" ? "Email me a reset link" : "Continue with email") : signup ? "Create account" : "Log in"}</button>
        {step === "password" && !signup && <p className="cm-aft" style={{ marginTop: 12 }}><a href="#" style={{ marginLeft: 0 }} onClick={e => { e.preventDefault(); setMode("reset"); setStep("email"); }}>Forgot password?</a></p>}
      </form>
      {mode !== "reset" && <>
        <div className="cm-or">or</div>
        <button className="cm-social" disabled={busy} onClick={() => run(async () => { await signInWithGoogle(config, session); done(); })}><G s={20} />Continue with Google</button>
        <button className="cm-social" disabled={busy} onClick={() => setErr("Microsoft sign-in isn’t available yet. Use email or Google.")}><MsMark s={20} />Continue with Microsoft</button>
      </>}</>}
    {signup && <p className="cm-aft">Continue with Google to connect your calendar.</p>}
    <p className="cm-aft" style={{ marginTop: signup ? 28 : 28 }}>
      {signup ? <>Already have a CalendlyIsDead account? <Link href="/login">Log In <Arrow /></Link></> : <>Don’t have an account? <Link href="/signup">Sign up for free <Arrow /></Link></>}</p>
    {demo && <div className="cm-demo"><button disabled={busy} onClick={demoLogin}>Use the demo account</button></div>}
  </div>;
  if (!signup) return form;
  return <>{form}
    <aside className="cm-perks"><h5>Everything included, free</h5><h2>Explore every feature with no trial clock</h2>
      <ul>{["Multi-person and co-hosted meetings", "Round Robin meeting distribution", "AI email assistant and inbox replies", "Collect payments through your own Stripe", "No branding, no seat fees"].map(x => <li key={x}><Check />{x}</li>)}</ul></aside></>;
}
