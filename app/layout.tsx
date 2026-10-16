import "@/vendor/isdead-design/css/calendly.css";
import "@/vendor/isdead-design/css/components.css";
import "./globals.css";
import { Suspense } from "react";
import { WebsiteAnalytics } from "@/components/WebsiteAnalytics";
import type { Metadata } from "next";
import { BP } from "@/lib/basepath";
export const metadata: Metadata = {
  title: "CalendlyIsDead: free, open-source scheduling",
  icons: {
    icon: [
      { url: BP + "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: BP + "/logo.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: [{ url: BP + "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-ids-theme="calendly"><body className="ids-root">{children}<Suspense fallback={null}><WebsiteAnalytics /></Suspense></body></html>;
}
