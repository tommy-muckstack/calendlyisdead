import { DM_Sans } from "next/font/google";
const dm = DM_Sans({ subsets: ["latin"] });
export const metadata = { title: "CalendlyIsDead: free, open-source scheduling" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className={dm.className}>{children}</body></html>;
}
