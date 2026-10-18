import { describe, it, expect } from "vitest";
import { EVENTS, EVENT_PREFIXES, APP, superProps } from "@/lib/posthog/taxonomy";
describe("analytics taxonomy", () => {
  it("uses the shared prefixes and snake_case", () => { for (const e of Object.values(EVENTS)) { expect(e, e).toMatch(/^[a-z]+(_[a-z]+)+$/); expect(EVENT_PREFIXES.some(p => e.startsWith(p)), e).toBe(true); } });
  it("never puts the product name in an event name", () => { for (const e of Object.values(EVENTS)) expect(e.includes(APP.replace(/isdead$/, ""))).toBe(false); });
  it("sends the hub's super properties", () => { expect(superProps("app")).toEqual({ product: APP, surface: "app", platform: "web" }); });
});
import { scrub } from "@/lib/posthog/posthog";
describe("analytics privacy", () => {
  it("strips query strings, hashes and titles", () => {
    const e = scrub({ event: "$pageview", properties: { $current_url: "https://yourappisdead.com/x/app?url=https://secret.example#frag", $referrer: "https://google.com/search?q=me", title: "My private doc" } });
    expect(e.properties.$current_url).toBe("https://yourappisdead.com/x/app"); expect(e.properties.$referrer).toBe("https://google.com/search"); expect("title" in e.properties).toBe(false);
  });
});
describe("analytics privacy (nested person properties)", () => {
  it("scrubs every url/referrer/pathname key, including session-entry and $set_once bags", () => {
    const e = scrub({ event: "$pageview", $set_once: { $initial_referrer: "https://x.example/?q=1" }, properties: { $session_entry_url: "https://yourappisdead.com/x/?ref=me#y", $session_entry_pathname: "/x/", $set: { $current_url: "https://yourappisdead.com/x/app?a=1" }, $set_once: { $initial_current_url: "https://yourappisdead.com/x/?utm_source=secret#frag" } } });
    expect(e.properties.$session_entry_url).toBe("https://yourappisdead.com/x/");
    expect(e.properties.$set_once.$initial_current_url).toBe("https://yourappisdead.com/x/");
    expect(e.properties.$set.$current_url).toBe("https://yourappisdead.com/x/app");
    expect(e.$set_once.$initial_referrer).toBe("https://x.example/");
  });
});
describe("CalendlyIsDead secret paths", () => {
  it("masks booking, payment, invite, meeting, poll and routing-form ids", () => {
    for (const [seg, rest] of [["booking", "abc/cancel"], ["pay", "abc"], ["invite", "tok"], ["meet", "room1"], ["poll", "p1"], ["f", "form1"]]) {
      const e = scrub({ event: "$pageview", properties: { $current_url: `https://yourappisdead.com/calendlyisdead/${seg}/${rest}?x=1` } });
      expect(e.properties.$current_url).toBe(`https://yourappisdead.com/calendlyisdead/${seg}/:id${rest.includes("/") ? "/" + rest.split("/")[1] : ""}`);
    }
  });
});
