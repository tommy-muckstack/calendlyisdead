import "@/vendor/isdead-design/css/calendly.css";
import "@/vendor/isdead-design/css/components.css";
import "./globals.css";
import { Analytics } from "@/lib/posthog/posthog";
export const metadata = { title: "CalendlyIsDead: free, open-source scheduling" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-ids-theme="calendly"><body className="ids-root">{children}<Analytics /></body></html>;
}
