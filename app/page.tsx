import Link from "next/link";
import { Logo } from "@/components/Logo";
export default function Home() {
  return <main style={{ maxWidth: 760, margin: "80px auto", padding: 24 }}>
    <Logo size={40} />
    <h1 style={{ fontSize: 48, lineHeight: 1.05, margin: "28px 0 12px" }}>Scheduling that never sends you a bill.</h1>
    <p className="muted" style={{ fontSize: 19 }}>Booking pages, availability rules, reminders and calendar sync. Open source under Apache-2.0. Self-host it or use ours.</p>
    <div className="row" style={{ marginTop: 24 }}>
      <Link className="btn primary" href="/login">Get started free</Link>
      <Link className="btn" href="/demo/30min">Try a booking page</Link>
    </div>
  </main>;
}
