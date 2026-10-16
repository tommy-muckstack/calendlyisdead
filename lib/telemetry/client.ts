"use client";
import type { PostHog, PostHogConfig, CaptureResult } from "posthog-js/dist/module.no-external";
import { BP } from "@/lib/basepath";
import { websiteEvents, websiteRoute, type WebsiteEvent, type WebsiteProperties } from "./schema";

export const WEBSITE_CONTEXT = { site_id: "yourappisdead", app_id: "calendlyisdead", platform: "web", schema_version: 1 } as const;
const productionHosts = new Set(["yourappisdead.com", "www.yourappisdead.com", "calendlyisdead.vercel.app"]);
let client: PostHog | undefined;
let loading: Promise<void> | undefined;
let lastPage: string | undefined;

function enabled() {
  return typeof window !== "undefined" && !!process.env.NEXT_PUBLIC_POSTHOG_KEY &&
    process.env.NEXT_PUBLIC_POSTHOG_ENABLED !== "false" && process.env.NODE_ENV === "production" &&
    (process.env.NEXT_PUBLIC_POSTHOG_ENVIRONMENT ?? "production") === "production" &&
    productionHosts.has(window.location.hostname) &&
    navigator.doNotTrack !== "1" && !(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
}

/** A final allowlist also removes SDK-added referrers, URL queries and person properties. */
export function sanitizeWebsiteEvent(event: CaptureResult): CaptureResult | null {
  if (!Object.hasOwn(websiteEvents, event.event)) return null;
  const name = event.event as WebsiteEvent;
  const parsed = websiteEvents[name].safeParse(event.properties);
  if (!parsed.success) return null;
  const route = websiteRoute(String(event.properties.route_template ?? "/[unknown]"), "");
  const props: Record<string, unknown> = {
    ...parsed.data, ...WEBSITE_CONTEXT, ...route, environment: "production",
    $current_url: `https://${window.location.hostname}${BP}${route.route_template === "/" ? "/" : route.route_template}`,
    $pathname: `${BP}${route.route_template}`, $process_person_profile: false,
  };
  // These are SDK-generated opaque IDs and version metadata, never account identifiers.
  for (const key of ["distinct_id", "$session_id", "$window_id", "$lib", "$lib_version"]) {
    if (typeof event.properties[key] === "string") props[key] = event.properties[key];
  }
  // Construct a fresh payload so future SDK additions cannot bypass the property allowlist.
  return { event: name, properties: props, uuid: event.uuid, ...(event.timestamp ? { timestamp: event.timestamp } : {}) };
}

export const WEBSITE_POSTHOG_OPTIONS: Partial<PostHogConfig> = {
  api_host: "https://us.i.posthog.com", ui_host: "https://us.posthog.com",
  persistence: "sessionStorage", persistence_name: "isdead_website_anonymous_v1",
  person_profiles: "never", cross_subdomain_cookie: false,
  autocapture: false, capture_pageview: false, capture_pageleave: false,
  capture_exceptions: false, capture_performance: false, capture_heatmaps: false,
  logs: { captureConsoleLogs: false },
  capture_dead_clicks: false, rageclick: false,
  disable_session_recording: true, disable_surveys: true, disable_product_tours: true,
  disable_conversations: true, disable_web_experiments: true,
  disable_external_dependency_loading: true, advanced_disable_flags: true,
  save_campaign_params: false, save_referrer: false,
  before_send: sanitizeWebsiteEvent,
};

export function initWebsiteAnalytics(): Promise<void> {
  if (!enabled()) return Promise.resolve();
  if (!loading) loading = import("posthog-js/dist/module.no-external").then(({ default: posthog }) => {
    if (!enabled()) return;
    client = posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, WEBSITE_POSTHOG_OPTIONS, `isdead_${WEBSITE_CONTEXT.app_id}`);
  }).catch(() => { loading = undefined; });
  return loading;
}

/** Best effort; telemetry failures must never block navigation or authentication. */
export function trackWebsiteEvent<E extends WebsiteEvent>(name: E, properties: WebsiteProperties<E>, pathname?: string) {
  if (!enabled()) return;
  const parsed = websiteEvents[name].safeParse(properties);
  if (!parsed.success) return;
  const route = websiteRoute(pathname ?? window.location.pathname);
  void initWebsiteAnalytics().then(() => {
    if (!enabled()) return;
    try {
      client?.capture(name, { ...parsed.data, ...WEBSITE_CONTEXT, ...route, environment: "production" }, { send_instantly: true, transport: "sendBeacon" });
    } catch { /* Analytics must not interrupt the product. */ }
  }).catch(() => {});
}

export function trackWebsitePage(pathname: string) {
  if (!enabled() || pathname === lastPage) return;
  lastPage = pathname;
  trackWebsiteEvent("$pageview", {}, pathname);
}
