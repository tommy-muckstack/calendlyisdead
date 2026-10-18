"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./profile-settings.css";
export function ProfileTabs() {
  const login = usePathname().endsWith("/login");
  return <nav className="profile-tabs" aria-label="Profile tabs">
    <Link href="/app/profile" aria-current={!login ? "page" : undefined}>General</Link>
    <Link href="/app/profile/login" aria-current={login ? "page" : undefined}>Login</Link>
  </nav>;
}
