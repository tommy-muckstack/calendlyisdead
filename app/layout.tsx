import "@/vendor/isdead-design/css/calendly.css";
import "@/vendor/isdead-design/css/components.css";
import "./globals.css";
import { Suspense } from "react";
import { WebsiteAnalytics } from "@/components/WebsiteAnalytics";
export const metadata = { title: "CalendlyIsDead: free, open-source scheduling" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-ids-theme="calendly"><body className="ids-root">{children}<Suspense fallback={null}><WebsiteAnalytics /></Suspense></body></html>;
}
