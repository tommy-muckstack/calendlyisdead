import "@/vendor/isdead-design/css/calendly.css";
import "@/vendor/isdead-design/css/components.css";
import "./globals.css";
export const metadata = { title: "CalendlyIsDead: free, open-source scheduling" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-ids-theme="calendly"><body className="ids-root">{children}</body></html>;
}
