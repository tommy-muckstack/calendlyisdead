"use client";
// PostHog client for the IsDead family (shared project 666931). Requests go through our own origin (<basePath>/ingest →
// PostHog) so ad blockers don't drop them. The key is the project's publishable token; without NEXT_PUBLIC_POSTHOG_KEY
// everything is a no-op.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { superProps, LEGACY_PROPS, type EventName, type Surface } from "./taxonomy";
type PH = typeof import("posthog-js").default;
type Props = Record<string, string | number | boolean | null | undefined>;
let ph: PH | null = null; let loading: Promise<PH | null> | null = null;
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const UI_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.posthog.com";
const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "/calendlyisdead";
export const analyticsEnabled = !!KEY;
// CalendlyIsDead: the marketing site is home, pricing, login and signup. Everything else is the product: the dashboard
// (/app) and what it publishes (booking pages /<user>/<slug>, team pages, booking/cancel/reschedule/pay links, polls,
// routing forms, meeting rooms, invites).
const surfaceOf = (pathname: string): Surface => (/^\/(pricing(\/calculator)?|login|signup)?\/?$/.test(pathname.slice(BP.length)) ? "landing" : "app");

// Privacy: URL properties keep only origin + path (query strings and hashes can hold user content like prefilled links),
// path segments listed in PRIVATE_PATHS are masked (tokens/ids that work like passwords), and the page title is dropped
// (it can be a user's own page or document name).
// Booking uids (cancel/reschedule/pay links), invite tokens, meeting rooms, poll and routing-form ids work like passwords.
const PRIVATE_PATHS: RegExp[] = [/(\/booking\/)[^/?#]+/, /(\/pay\/)[^/?#]+/, /(\/invite\/)[^/?#]+/, /(\/meet\/)[^/?#]+/, /(\/poll\/)[^/?#]+/, /(\/f\/)[^/?#]+/];
// Any key ending in url / referrer / pathname (posthog-js has many: $current_url, $session_entry_url, $initial_referrer, …),
// at the top level and inside $set / $set_once, wherever those sit.
const URL_KEY = /(url|referrer|pathname)$/i;
const cleanUrl = (v: unknown) => { if (typeof v !== "string" || !v || v === "$direct") return v; let u = v.split(/[?#]/)[0]!; for (const re of PRIVATE_PATHS) u = u.replace(re, "$1:id"); return u; };
const cleanBag = (bag: unknown) => { if (!bag || typeof bag !== "object") return; const o = bag as Record<string, unknown>; for (const k of Object.keys(o)) if (URL_KEY.test(k)) o[k] = cleanUrl(o[k]); };
export function scrub(e: any) { if (!e) return e; for (const bag of [e.properties, e.$set, e.$set_once, e.properties?.$set, e.properties?.$set_once]) cleanBag(bag); if (e.properties) delete e.properties.title; return e; }

async function client(): Promise<PH | null> {
  if (!KEY || typeof window === "undefined") return null;
  if (ph) return ph;
  loading ??= import("posthog-js").then(m => {
    const p = m.default;
    // Dev only: verbose logs + accept automated browsers (posthog-js drops bot/webdriver traffic by default).
    const debug = process.env.NODE_ENV !== "production" && typeof localStorage !== "undefined" && localStorage.getItem("isdead_ph_debug") === "1";
    p.init(KEY, {
      api_host: `${location.origin}${BP}/ingest`, ui_host: UI_HOST,
      capture_pageview: false, capture_pageleave: true, autocapture: false, disable_session_recording: true, capture_heatmaps: false, capture_performance: false, before_send: scrub,
      persistence: "localStorage+cookie", person_profiles: "always", debug, opt_out_useragent_filter: debug,
    });
    // Every IsDead app shares the yourappisdead.com cookie, and super properties persist in it: clear other apps'
    // leftovers, then set ours (otherwise the hub's product=yourappisdead would ride along on this app's events).
    for (const k of LEGACY_PROPS) p.unregister(k);
    p.register({ ...superProps(surfaceOf(location.pathname)), env: process.env.NODE_ENV === "production" ? "production" : "development" });
    ph = p; if (process.env.NODE_ENV !== "production") (window as unknown as { __posthog?: PH }).__posthog = p;
    return p;
  }).catch(err => { if (process.env.NODE_ENV !== "production") console.warn("[analytics] PostHog failed to start", err); return null; });
  return loading;
}
/** Fire a taxonomy event. Safe to call anywhere on the client; drops silently when analytics is off. */
export function track(event: EventName, props: Props = {}) {
  void client().then(p => p?.capture(event, { surface: surfaceOf(location.pathname), ...props }));
}
/** Like track, but sent immediately; await it before navigating away (sign-in redirects). Never throws or hangs past 1.5s. */
export async function trackNow(event: EventName, props: Props = {}) {
  await Promise.race([client().then(p => { p?.capture(event, { surface: surfaceOf(location.pathname), ...props }, { send_instantly: true }); }).catch(() => {}), new Promise(r => setTimeout(r, 1500))]);
}
/** Signed-in users are identified by Firebase uid (shared across the family). Guests and demo sessions never are. */
export function identify(uid: string, accountType: "firebase" | "guest" | "demo") {
  void client().then(p => { if (!p) return; if (accountType === "firebase") p.identify(uid, { account_type: accountType }); else p.register({ account_type: accountType }); });
}
// reset() wipes super properties too, so put this app's back straight away.
export function resetIdentity() { void client().then(p => { p?.reset(); p?.register(superProps(surfaceOf(location.pathname))); }); }
/** Mount once in the root layout: boots the client and sends a $pageview per route change. */
export function Analytics() {
  const path = usePathname();
  useEffect(() => { if (!path) return; void client().then(p => { if (!p) return; p.register({ surface: surfaceOf(location.pathname) }); p.capture("$pageview"); }); }, [path]);
  return null;
}
