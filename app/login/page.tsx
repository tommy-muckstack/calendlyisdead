import { signIn, demoEnabled } from "@/auth";
import { Logo } from "@/components/Logo";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; callbackUrl?: string }> }) {
  const { sent, callbackUrl } = await searchParams;
  const to = callbackUrl && /^\/(?!\/)/.test(callbackUrl) ? callbackUrl : "/app";
  return <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }}>
    <Logo />
    <div className="card" style={{ padding: 28, marginTop: 24 }}>
      {sent ? <><h2 style={{ marginTop: 0 }}>Check your inbox</h2><p className="muted">We sent you a sign-in link. In local dev it's printed in the server log.</p></> : <>
      <h2 style={{ marginTop: 0 }}>Sign in or create an account</h2>
      {process.env.AUTH_GOOGLE_ID && <form action={async () => { "use server"; await signIn("google", { redirectTo: to }); }}>
        <button className="btn" style={{ width: "100%", justifyContent: "center" }}>Continue with Google</button></form>}
      <form action={async (fd: FormData) => { "use server"; await signIn("email", { email: String(fd.get("email")), redirectTo: to }); }}>
        <label className="f" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" required placeholder="you@company.com" />
        <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 12 }}>Email me a link</button>
      </form>
      {demoEnabled() && <form action={async () => { "use server"; await signIn("demo", { redirectTo: to }); }} style={{ marginTop: 16 }}>
        <button className="btn" style={{ width: "100%", justifyContent: "center" }}>Use the demo account</button></form>}
      {demoEnabled() && <form action={async () => { "use server"; await signIn("demo", { who: "mate", redirectTo: to }); }} style={{ marginTop: 8 }}>
        <button className="btn" style={{ width: "100%", justifyContent: "center" }}>Use the demo teammate account</button></form>}</>}
    </div>
  </main>;
}
