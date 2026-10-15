"use client";
import { useState } from "react";
import type { FirebaseClientConfig } from "@/lib/isdead-auth/config";
import { signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword, authErrorMessage } from "@/lib/isdead-auth/client";
import { BP } from "@/lib/basepath";
import { GoogleButton } from "@/vendor/isdead-design/src/google";
type Props = { config: FirebaseClientConfig | null; demo: boolean; demoAs?: "mate"; to: string };
const full = { width: "100%", justifyContent: "center" } as const;
export function LoginForm({ config, demo, demoAs, to }: Props) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [note, setNote] = useState("");
  const done = () => { window.location.assign(to); };
  const run = async (f: () => Promise<void>) => { setBusy(true); setErr(""); setNote(""); try { await f(); } catch (e) { setErr(authErrorMessage(e)); } finally { setBusy(false); } };
  const session = `${BP}/api/session`;
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email")), password = String(fd.get("password") ?? ""), name = String(fd.get("name") ?? "");
    run(async () => {
      if (mode === "reset") { await resetPassword(config!, email); setNote("If that email has an account, a reset link is on its way."); setMode("signin"); return; }
      if (mode === "signup") await signUpWithEmail(config!, session, email, password, name || undefined); else await signInWithEmail(config!, session, email, password);
      done(); }); };
  const demoLogin = () => run(async () => { const r = await fetch(`${BP}/api/session/demo${demoAs ? `?who=${demoAs}` : ""}`, { method: "POST" }); if (!r.ok) throw new Error("Demo sign-in failed"); done(); });
  return <>
    <h2 style={{ marginTop: 0 }}>{mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Log in to your account"}</h2>
    {!config && <p className="muted" role="status">Sign-in not configured. Email and Google sign-in turn on once Firebase is set up.</p>}
    {config && <>
      <form onSubmit={onSubmit}>
        {mode === "signup" && <><label className="f" htmlFor="name">Name</label><input className="input" id="name" name="name" autoComplete="name" /></>}
        <label className="f" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
        {mode !== "reset" && <><label className="f" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></>}
        <button className="btn primary" style={{ ...full, marginTop: 12 }} disabled={busy}>{mode === "signup" ? "Create account" : mode === "reset" ? "Email me a reset link" : "Sign in"}</button>
      </form>
      {mode !== "reset" && <><div className="muted" style={{ textAlign: "center", margin: "12px 0", fontSize: 13 }}>or</div>
        <GoogleButton block disabled={busy} onClick={() => run(async () => { await signInWithGoogle(config, session); done(); })} /></>}
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
        {mode === "signin" ? <><a href="#" onClick={e => { e.preventDefault(); setMode("signup"); }}>Create an account</a> · <a href="#" onClick={e => { e.preventDefault(); setMode("reset"); }}>Forgot password?</a></>
          : <a href="#" onClick={e => { e.preventDefault(); setMode("signin"); }}>Back to sign in</a>}
      </p></>}
    {err && <p role="alert" style={{ color: "var(--warn)" }}>{err}</p>}
    {note && <p role="status" className="muted">{note}</p>}
    {demo && <button className="btn" style={{ ...full, marginTop: 16 }} disabled={busy} onClick={demoLogin}>Use the demo account</button>}
  </>;
}
