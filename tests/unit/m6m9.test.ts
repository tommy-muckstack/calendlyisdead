import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { confFor, meetingUrlFor } from "../../lib/conferencing";
import { verifyStripeSignature, signStripePayload, createCheckout, formatMoney } from "../../lib/payments";
import { brandVars, validLogo } from "../../lib/branding";
import { computeStats } from "../../lib/analytics";
import { parseThread, draftReply } from "../../lib/assistant";
import { tally } from "../../lib/polls";
import { calendlyYearly } from "../../lib/pricing";

describe("conferencing", () => {
  it("detects provider from location", () => {
    expect(confFor("Zoom")).toBe("zoom"); expect(confFor("google meet")).toBe("meet"); expect(confFor("Phone call")).toBeNull(); expect(confFor("Zoomba class")).toBeNull();
  });
  it("falls back to a demo room without keys, keeps a calendar Meet link", async () => {
    const info = { topic: "x", start: new Date(), durationMin: 30 };
    expect(await meetingUrlFor("Zoom", "abc", info)).toMatch(/\/meet\/zoom-abc$/);
    expect(await meetingUrlFor("Google Meet", "abc", info)).toMatch(/\/meet\/meet-abc$/);
    expect(await meetingUrlFor("Google Meet", "abc", info, "https://meet.google.com/xyz")).toBe("https://meet.google.com/xyz");
    expect(await meetingUrlFor("Office", "abc", info)).toBeNull();
  });
  it("creates a real Zoom meeting when configured", async () => {
    Object.assign(process.env, { ZOOM_ACCOUNT_ID: "a", ZOOM_CLIENT_ID: "b", ZOOM_CLIENT_SECRET: "c" });
    const calls: string[] = [];
    const f = (async (url: string, init: any) => { calls.push(url);
      if (url.includes("oauth/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
      expect(init.headers.authorization).toBe("Bearer tok"); return new Response(JSON.stringify({ id: 1, join_url: "https://zoom.us/j/1" })); }) as any;
    expect(await meetingUrlFor("Zoom", "u1", { topic: "t", start: new Date(), durationMin: 30 }, null, f)).toBe("https://zoom.us/j/1");
    expect(calls[1]).toContain("/users/me/meetings");
    delete process.env.ZOOM_ACCOUNT_ID; delete process.env.ZOOM_CLIENT_ID; delete process.env.ZOOM_CLIENT_SECRET;
  });
});

describe("stripe", () => {
  it("verifies signatures and rejects tampering and old timestamps", () => {
    const body = JSON.stringify({ a: 1 }), h = signStripePayload(body, "whsec_test");
    expect(verifyStripeSignature(body, h, "whsec_test")).toBe(true);
    expect(verifyStripeSignature(body + " ", h, "whsec_test")).toBe(false);
    expect(verifyStripeSignature(body, h, "other")).toBe(false);
    expect(verifyStripeSignature(body, signStripePayload(body, "whsec_test", 1000), "whsec_test")).toBe(false);
    expect(verifyStripeSignature(body, null, "whsec_test")).toBe(false);
  });
  it("builds a checkout session request", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x"; let sent: any;
    const f = (async (_u: string, init: any) => { sent = new URLSearchParams(init.body); return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" })); }) as any;
    const r = await createCheckout({ uid: "b1", title: "Coaching", amountCents: 5000, currency: "usd", email: "a@example.com", successUrl: "s", cancelUrl: "c" }, f);
    expect(r.url).toContain("checkout.stripe.com"); expect(sent.get("line_items[0][price_data][unit_amount]")).toBe("5000"); expect(sent.get("metadata[bookingUid]")).toBe("b1");
    delete process.env.STRIPE_SECRET_KEY;
  });
  it("formats money", () => expect(formatMoney(12345, "usd")).toBe("$123.45"));
});

describe("branding", () => {
  it("derives ink and soft shades", () => {
    const v = brandVars("#336699"); expect(v["--brand"]).toBe("#336699"); expect(v["--brand-ink"]).toBe("#264d73"); expect(Object.keys(brandVars("nope"))).toHaveLength(0);
  });
  it("only accepts https or small data-URL logos", () => {
    expect(validLogo("https://x.com/a.png")).toBe(true); expect(validLogo("http://x.com/a.png")).toBe(false); expect(validLogo("javascript:alert(1)")).toBe(false);
    expect(validLogo("data:image/png;base64,AAAA")).toBe(true); expect(validLogo("data:text/html;base64,AAAA")).toBe(false);
  });
});

describe("analytics", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const r = (o: any) => ({ uid: Math.random().toString(36), eventTypeId: "a", start: new Date("2026-10-13T14:00:00Z"), createdAt: now, status: "confirmed", cancelReason: null, rescheduledFrom: null, paymentStatus: "none", amountCents: 0, groupUid: null, ...o });
  it("counts new, cancelled, rescheduled, revenue, conversion and heat", () => {
    const rows = [r({}), r({ start: new Date("2026-10-20T14:00:00Z"), paymentStatus: "paid", amountCents: 5000 }), r({ status: "cancelled", cancelReason: "nope" }),
      r({ status: "cancelled", cancelReason: "rescheduled" }), r({ rescheduledFrom: "x" }), r({ paymentStatus: "pending" }), r({ uid: "g-1", groupUid: "g" })];
    const s = computeStats(rows as any, [{ eventTypeId: "a", count: 8 }], [{ id: "a", title: "A", color: "#000" }], "America/New_York", now);
    expect(s.newBookings).toBe(4); expect(s.cancelled).toBe(1); expect(s.rescheduled).toBe(1); expect(s.revenueCents).toBe(5000);
    expect(s.completed).toBe(2); expect(s.upcoming).toBe(1); expect(s.conversion).toBe(0.5); expect(s.heat[1][10]).toBe(3); expect(s.busiest).toMatchObject({ day: "Tue", hour: 10 });
  });
});

describe("email-thread parser", () => {
  const now = DateTime.fromISO("2026-10-14T10:00", { zone: "America/New_York" }); // Wednesday
  it("reads people, duration, zone, days and parts of day", () => {
    const p = parseThread(`From: Jordan Lee <jordan@example.com>\nTo: Demo Host <demo@calendlyisdead.local>\nSubject: Re: Intro call\n\nCould we do 45 minutes next week? I'm on Pacific time. Tuesday afternoon works, or Thursday morning before 11.\n> old quoted Monday at 9`,
      { hostEmail: "demo@calendlyisdead.local", hostTz: "America/New_York", now });
    expect(p.title).toBe("Intro call"); expect(p.durationMin).toBe(45); expect(p.timezone).toBe("America/Los_Angeles");
    expect(p.people).toEqual([{ name: "Jordan Lee", email: "jordan@example.com" }]);
    expect(p.windows).toEqual(expect.arrayContaining([expect.objectContaining({ weekday: 2, fromHour: 12, toHour: 17 }), expect.objectContaining({ weekday: 4, fromHour: 9, toHour: 11 })]));
    expect(p.windows.some(w => w.weekday === 1)).toBe(false);
  });
  it("captures exact times and tomorrow", () => {
    const p = parseThread("hi, does tomorrow at 2:30pm work? an hour should do", { hostTz: "America/New_York", now });
    expect(p.durationMin).toBe(60); expect(p.explicit[0]).toBe(DateTime.fromISO("2026-10-15T14:30", { zone: "America/New_York" }).toUTC().toISO());
  });
  it("drafts a reply with links", () => {
    const t = draftReply({ hostName: "Demo", people: [{ name: "Jordan Lee" }], slots: ["2026-10-20T17:00:00.000Z"], zone: "America/Los_Angeles", links: ["L1"], profileUrl: "P", exactMatch: null });
    expect(t).toContain("Hi Jordan"); expect(t).toContain("Tuesday, Oct 20 at 10:00 AM PDT: L1");
  });
});

describe("polls + pricing", () => {
  it("tallies and marks the best option", () => {
    const t = tally(["a", "b"], [{ name: "X", picks: ["a", "b"] }, { name: "Y", picks: ["b"] }]);
    expect(t).toEqual([{ option: "a", count: 1, names: ["X"], best: false }, { option: "b", count: 2, names: ["X", "Y"], best: true }]);
  });
  it("computes Calendly yearly cost", () => { expect(calendlyYearly(10, "standard")).toBe(1200); expect(calendlyYearly(10, "teams")).toBe(1920); });
});
