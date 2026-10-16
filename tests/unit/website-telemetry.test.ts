import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authFailureReason, websiteRoute } from "../../lib/telemetry/schema";

const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn() }));
vi.mock("posthog-js/dist/module.no-external", () => ({ default: { init: sdk.init } }));
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
beforeEach(() => {
  vi.resetModules(); sdk.init.mockReset(); sdk.capture.mockReset();
  sdk.init.mockReturnValue({ capture: sdk.capture });
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_only_not_a_real_project");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_ENVIRONMENT", "production");
  vi.stubGlobal("window", { location: { hostname: "yourappisdead.com", pathname: "/calendlyisdead/login" } });
  vi.stubGlobal("navigator", { doNotTrack: "0", globalPrivacyControl: false });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("website route privacy", () => {
  it.each([
    ["/calendlyisdead/", "/", "marketing"],
    ["/calendlyisdead/login?to=/secret#token", "/login", "auth"],
    ["/calendlyisdead/app/meetings/private-id", "/app/meetings/[uid]", "app"],
    ["/calendlyisdead/app/profile?name=private#photo", "/app/profile", "app"],
    ["/calendlyisdead/app/availability/advanced?timezone=private", "/app/availability/advanced", "app"],
    ["/calendlyisdead/booking/private-id/cancel?email=person@example.test", "/booking/[uid]/cancel", "booking"],
    ["/calendlyisdead/invite/secret-token", "/invite/[token]", "auth"],
    ["/calendlyisdead/private-host/private-event", "/[user]/[slug]", "booking"],
    ["/calendlyisdead/team/private-team/private-event", "/team/[team]/[slug]", "booking"],
    ["/calendlyisdead/app/unknown/secret", "/[unknown]", "other"],
    ["/calendlyisdead/api/private", "/[unknown]", "other"],
  ])("sanitizes %s", (path, route_template, surface) => {
    expect(websiteRoute(path)).toEqual({ route_template, surface });
  });
  it("supports root hosting and preserves the unknown classification", () => {
    expect(websiteRoute("/app", "")).toEqual({ route_template: "/app", surface: "app" });
    expect(websiteRoute("/[unknown]", "").surface).toBe("other");
  });
});

describe("website analytics boundary", () => {
  it.each(["localhost", "127.0.0.1", "calendlyisdead-preview.vercel.app", "unrelated.example"])("does not initialize or send from %s", async hostname => {
    window.location.hostname = hostname;
    const analytics = await import("../../lib/telemetry/client");
    analytics.trackWebsitePage("/login"); await analytics.initWebsiteAnalytics();
    expect(sdk.init).not.toHaveBeenCalled(); expect(sdk.capture).not.toHaveBeenCalled();
  });
  it.each([
    ["NODE_ENV", "development"], ["NEXT_PUBLIC_POSTHOG_ENVIRONMENT", "preview"],
    ["NEXT_PUBLIC_POSTHOG_ENABLED", "false"], ["NEXT_PUBLIC_POSTHOG_KEY", ""],
  ])("does not initialize with %s=%s", async (key, value) => {
    vi.stubEnv(key, value);
    const analytics = await import("../../lib/telemetry/client");
    await analytics.initWebsiteAnalytics(); expect(sdk.init).not.toHaveBeenCalled();
  });
  it.each([{ doNotTrack: "1" }, { globalPrivacyControl: true }])("respects browser privacy preference %j", async preference => {
    vi.stubGlobal("navigator", preference);
    await (await import("../../lib/telemetry/client")).initWebsiteAnalytics();
    expect(sdk.init).not.toHaveBeenCalled();
  });
  it("initializes once, sends one initial pageview, then counts later navigation", async () => {
    const a = await import("../../lib/telemetry/client");
    a.trackWebsitePage("/login"); a.trackWebsitePage("/login");
    await a.initWebsiteAnalytics(); await settle();
    expect(sdk.init).toHaveBeenCalledTimes(1); expect(sdk.capture).toHaveBeenCalledTimes(1);
    a.trackWebsitePage("/app"); a.trackWebsitePage("/login"); await settle();
    expect(sdk.capture).toHaveBeenCalledTimes(3);
    expect(sdk.capture.mock.calls[0][1]).toMatchObject({ site_id: "yourappisdead", app_id: "calendlyisdead", platform: "web", surface: "auth", route_template: "/login", schema_version: 1 });
  });
  it("drops SDK/user content and spoofed context at the final boundary", async () => {
    const { sanitizeWebsiteEvent } = await import("../../lib/telemetry/client");
    const result = sanitizeWebsiteEvent({ uuid: "test-uuid", event: "website_auth_completed", $set: { email: "secret@example.test" }, $set_once: { name: "Secret Name" }, properties: {
      method: "google", flow: "login", route_template: "/booking/private-token",
      app_id: "another-app", surface: "marketing", email: "secret@example.test", notes: "private notes",
      $current_url: "https://example.test/secret?token=private", $referrer: "https://example.test/private",
      $set: { email: "secret@example.test" }, $initial_current_url: "https://example.test/private",
      distinct_id: "anonymous-id", $session_id: "session-id", $lib: "web",
    } });
    const encoded = JSON.stringify(result);
    for (const forbidden of ["secret@example", "Secret Name", "private", "another-app", "$set", "$referrer", "$initial"]) expect(encoded).not.toContain(forbidden);
    expect(result?.properties).toMatchObject({ app_id: "calendlyisdead", surface: "booking", route_template: "/booking/[uid]", $process_person_profile: false });
    expect(result?.properties.$current_url).toBe("https://yourappisdead.com/calendlyisdead/booking/[uid]");
  });
  it("rejects automatic/unregistered events and unsupported provider values", async () => {
    const { sanitizeWebsiteEvent } = await import("../../lib/telemetry/client");
    for (const event of ["$autocapture", "$identify", "$snapshot", "$exception", "constructor", "arbitrary_event"]) {
      expect(sanitizeWebsiteEvent({ uuid: "test", event, properties: {} })).toBeNull();
    }
    expect(sanitizeWebsiteEvent({ uuid: "test", event: "website_auth_started", properties: { method: "microsoft", flow: "login" } })).toBeNull();
  });
  it("disables automatic capture and external paid-feature loaders", async () => {
    const { WEBSITE_POSTHOG_OPTIONS: config } = await import("../../lib/telemetry/client");
    expect(config).toMatchObject({ api_host: "https://us.i.posthog.com", autocapture: false, capture_pageview: false, capture_pageleave: false, capture_exceptions: false, capture_performance: false, disable_session_recording: true, disable_external_dependency_loading: true, advanced_disable_flags: true, persistence: "sessionStorage", person_profiles: "never" });
  });
  it("keeps authentication/navigation usable if the SDK throws", async () => {
    const a = await import("../../lib/telemetry/client");
    sdk.init.mockImplementationOnce(() => { throw new Error("SDK blocked"); });
    await expect(a.initWebsiteAnalytics()).resolves.toBeUndefined();
    sdk.capture.mockImplementation(() => { throw new Error("offline"); });
    expect(() => a.trackWebsiteEvent("website_auth_completed", { method: "email", flow: "login" })).not.toThrow();
    await settle();
  });
  it("maps auth errors to bounded categories without logging messages", () => {
    expect(authFailureReason({ code: "auth/invalid-credential", message: "secret@example.test" })).toBe("credentials");
    expect(authFailureReason(new Error("private token"))).toBe("other");
  });
});
