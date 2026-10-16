"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackWebsiteEvent, trackWebsitePage } from "@/lib/telemetry/client";

export function WebsiteAnalytics() {
  const path = usePathname();
  useEffect(() => { if (path) trackWebsitePage(path); }, [path]);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-signup-method]") : null;
      const method = target?.dataset.signupMethod;
      if (method === "email" || method === "google") trackWebsiteEvent("website_signup_clicked", { method, placement: "homepage_hero" });
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);
  return null;
}
