"use client";
import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { FirebaseClientConfig } from "@/lib/isdead-auth/config";
import { LoginSettingsData, NewLoginEmail, NewPassword, loginSettingsError, type AccountAction, type LoginSettings as Settings } from "@/lib/login-settings";
import { changeAccountLogin, clearAccountLogin, verifyAccountLogin } from "@/lib/login-settings-client";
import { BP } from "@/lib/basepath";
import { G } from "./mk/icons";
import "./profile-settings.css";

const titles: Record<AccountAction, string> = { password: "Set your password", email: "Change login email", link_google: "Link Google sign-in", unlink_google: "Remove Google sign-in" };
export function LoginSettings({ initial, config, signInAgain }: { initial: Settings; config: FirebaseClientConfig | null; signInAgain: () => Promise<void> }) {
  const [info, setInfo] = useState(initial), [action, setAction] = useState<AccountAction | null>(null);
  const [method, setMethod] = useState<"password" | "google.com">("password"), [verified, setVerified] = useState(false);
  const [currentPassword, setCurrentPassword] = useState(""), [value, setValue] = useState(""), [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState(""), [signIn, setSignIn] = useState(false);
  const mounted = useRef(true), inFlight = useRef(false), identity = useRef<User | null>(null), alert = useRef<HTMLParagraphElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const account = info.status === "ready" ? info : null;
  const password = account?.providers.includes("password"), google = account?.providers.includes("google.com");
  const clear = () => { if (config && identity.current) void clearAccountLogin(config).catch(() => {}); identity.current = null; setVerified(false); setCurrentPassword(""); setValue(""); setConfirm(""); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (config && identity.current) void clearAccountLogin(config).catch(() => {}); }; }, [config]);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  useEffect(() => { if (action) heading.current?.focus(); }, [action, verified]);
  useEffect(() => {
    if (!action) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || event.metaKey || event.ctrlKey) return;
      if (inFlight.current || !window.confirm("Leave this login change?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [action]);
  function choose(next: AccountAction) {
    if (inFlight.current) return;
    clear(); setAction(next); setMethod(password ? "password" : "google.com"); setError(""); setStatus("");
  }
  async function run(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setStatus("");
    try { await work(); }
    catch (cause) { if (mounted.current) { clear(); setError(loginSettingsError(cause)); } }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function refresh() {
    const response = await fetch(`${BP}/api/settings/login`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (response.status === 401) { if (mounted.current) setSignIn(true); return; }
    const result = LoginSettingsData.parse(await response.json());
    if (!response.ok || result.status === "error") throw new Error("read_failed");
    if (mounted.current) setInfo(result);
  }
  function verify(event: React.FormEvent) {
    event.preventDefault(); if (!config || !account) return;
    void run(async () => {
      const user = await verifyAccountLogin(config, account, method, currentPassword);
      if (!mounted.current) { await clearAccountLogin(config); return; }
      identity.current = user; setCurrentPassword(""); setVerified(true);
    });
  }
  function submit(event: React.FormEvent) {
    event.preventDefault(); if (!config || !account || !action || !identity.current) return;
    if (action === "password" && (!NewPassword.safeParse(value).success || value !== confirm)) { setError(value !== confirm ? "The new passwords do not match." : "Use 8–72 characters for your new password."); return; }
    if (action === "email" && !NewLoginEmail.safeParse(value.trim()).success) { setError("Enter a valid new email address."); return; }
    const selected = action, user = identity.current;
    void run(async () => {
      const result = await changeAccountLogin(config, account.uid, user, selected, selected === "email" ? value.trim() : value);
      if (!mounted.current) return;
      clear(); setAction(null);
      if (result.outcome === "verification_sent") { setStatus("Check your new email inbox and follow the verification link. Then sign in again with your new email. Your current email stays active until verification."); return; }
      setStatus(selected === "password" ? "Your password has changed." : selected === "link_google" ? "Google sign-in is linked." : "Google sign-in has been removed. Use your email and password to sign in.");
      if (result.session === "sign_in_required") { setSignIn(true); return; }
      // The credential change succeeded even if this separate read is unavailable.
      try { await refresh(); } catch { setSignIn(true); }
    });
  }
  return <section className="profile-settings login-settings ph-no-capture" aria-labelledby="login-settings-title">
    <h1 id="login-settings-title">Login</h1>
    <p>Changes apply to your shared IsDead login. Your scheduling links and connected calendars stay attached to this account.</p>
    {info.status === "demo" && <p role="status">This demo account has no email password or Google login to change. Sign in to your own account to manage login settings.</p>}
    {info.status === "unavailable" && <p role="status">Login management is unavailable for this account. Sign in again or contact the site administrator.</p>}
    {info.status === "error" && <div>{!error && <p role="alert">Login settings could not be loaded.</p>}<button className="btn" disabled={busy} onClick={() => void run(refresh)}>Try again</button></div>}
    {info.status !== "error" && !action && !signIn && <button className="btn" disabled={busy} onClick={() => void run(refresh)}>{busy ? "Refreshing…" : "Refresh login settings"}</button>}
    {account && <><dl className="login-summary"><div><dt>Login email</dt><dd>{account.email}</dd></div><div><dt>Email verification</dt><dd>{account.emailVerified ? "Verified" : "Not verified"}</dd></div><div><dt>Login methods</dt><dd>{account.providers.map(provider => provider === "password" ? "Email and password" : "Google").join(", ")}</dd></div></dl>
      {!action && !signIn && config && <div className="login-actions">
        <button id="login-action-password" className="btn" disabled={busy} onClick={() => choose("password")}>{password ? "Change password" : "Set an email password"}</button>
        {password ? <button id="login-action-email" className="btn" disabled={busy} onClick={() => choose("email")}>Change email</button> : <a href="https://myaccount.google.com/email" target="_blank" rel="noreferrer">Manage your Google email</a>}
        {!google ? <button id="login-action-link_google" className="btn" disabled={busy} onClick={() => choose("link_google")}>Add Google sign-in</button> : password ? <button id="login-action-unlink_google" className="btn" disabled={busy} onClick={() => choose("unlink_google")}>Remove Google sign-in</button> : <p>Set an email password before removing Google sign-in.</p>}
      </div>}
    </>}
    {action && account && config && <form onSubmit={verified ? submit : verify} noValidate className="login-change" aria-labelledby="login-change-title">
      <h2 ref={heading} tabIndex={-1} id="login-change-title">{titles[action]}</h2>
      <fieldset disabled={busy} aria-busy={busy}>
        {!verified ? <><p>First, verify your current login for {account.email}.</p>
          {password && google && action !== "unlink_google" && <label>Verify using<select className="input" value={method} onChange={event => setMethod(event.target.value as typeof method)}><option value="password">Email and password</option><option value="google.com">Google</option></select></label>}
          {method === "password" && <label>Current password<input className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>}
          <button className={method === "google.com" ? "login-google" : "btn primary"} type="submit" disabled={method === "password" && !currentPassword}>{method === "google.com" && <G />}{busy ? "Verifying…" : method === "google.com" ? "Continue with Google" : "Verify login"}</button>
        </> : <>{action === "password" && <><label>New password<input className="input" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={value} onChange={event => setValue(event.target.value)} /></label><label>Confirm new password<input className="input" type="password" autoComplete="new-password" maxLength={72} value={confirm} onChange={event => setConfirm(event.target.value)} /></label><p className="muted">Use 8–72 characters. Choose a password you do not use elsewhere.</p></>}
          {action === "email" && <><label>New login email<input className="input" type="email" autoComplete="email" value={value} maxLength={254} onChange={event => setValue(event.target.value)} /></label><p>Your new email must be verified before your login email changes.</p></>}
          {action === "link_google" && <p>Choose the Google account you want to add. An account already linked to a different user cannot be moved here.</p>}
          {action === "unlink_google" && <p>You will sign in with your email and password after removing Google.</p>}
          <button className={action === "link_google" ? "login-google" : "btn primary"} type="submit">{action === "link_google" && <G />}{busy ? "Updating…" : action === "link_google" ? "Continue with Google" : action === "email" ? "Send verification link" : action === "unlink_google" ? "Remove Google sign-in" : "Save password"}</button>
        </>}
        <button className="btn" type="button" onClick={() => { clear(); setAction(null); setError(""); requestAnimationFrame(() => document.getElementById(`login-action-${action}`)?.focus()); }}>Cancel</button>
      </fieldset>
    </form>}
    {error && <p role="alert" tabIndex={-1} ref={alert}>{error}</p>}
    {status && <p role="status">{status}</p>}
    {signIn && <div><p>Your login details may have changed. Sign in again to continue.</p><form action={signInAgain}><button className="btn primary">Sign out and sign in again</button></form></div>}
  </section>;
}
