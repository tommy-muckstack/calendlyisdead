"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BP } from "@/lib/basepath";

export function AvailabilityNav() {
  const pathname = usePathname().replace(new RegExp(`^${BP}`), "");
  return <nav aria-label="Scheduling settings" className="row" style={{ gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
    {[["/app/availability", "Availability"], ["/app/availability/advanced", "Advanced availability"]].map(([href, label]) =>
      <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
        style={{ padding: "8px 0", color: pathname === href ? "#006bff" : "inherit", borderBottom: `2px solid ${pathname === href ? "#006bff" : "transparent"}` }}>{label}</Link>)}
  </nav>;
}
