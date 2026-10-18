import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSlotCalendar } from "../../lib/booking-client";

afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;
describe("booking availability responses", () => {
  it("distinguishes a failed host calendar check from an empty calendar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "calendar_unavailable" }, { status: 503 })));
    await expect(loadSlotCalendar("/api/slots", signal())).rejects.toThrow("calendar_unavailable");
  });
  it("requires a refresh when the event timezone changed after the page loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ slots: {}, timezone: "Asia/Tokyo" })));
    await expect(loadSlotCalendar("/api/slots", signal(), "America/New_York")).rejects.toThrow("booking_timezone_changed");
  });
  it("accepts slots grouped in the expected event timezone", async () => {
    const slots = { "2027-01-12": ["2027-01-11T20:00:00Z"] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ slots, timezone: "Asia/Tokyo" })));
    expect(await loadSlotCalendar("/api/slots", signal(), "Asia/Tokyo")).toEqual(slots);
  });
  it("accepts available times and a genuinely empty calendar", async () => {
    const slots = { "2027-01-11": ["2027-01-11T14:00:00Z"] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ slots })).mockResolvedValueOnce(Response.json({ slots: {} })));
    expect(await loadSlotCalendar("/api/slots", signal())).toEqual(slots);
    expect(await loadSlotCalendar("/api/slots", signal())).toEqual({});
  });
  it.each([new Response("Unavailable", { status: 503 }), Response.json({ error: "not_found" }, { status: 404 })])("rejects failed HTTP responses instead of returning no availability", async response => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(loadSlotCalendar("/api/slots", signal())).rejects.toThrow("availability_unavailable");
  });
  it.each([null, {}, { slots: [] }, { slots: { "2027-01-11": "14:00" } }, { slots: { "2027-01-11": ["not-a-time"] } }])("rejects malformed successful responses: %j", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    await expect(loadSlotCalendar("/api/slots", signal())).rejects.toThrow("invalid_availability_response");
  });
  it("propagates a rejected network request for the caller to recover", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(loadSlotCalendar("/api/slots", signal())).rejects.toThrow("offline");
  });
  it("cancels an obsolete request through the supplied signal", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, { signal }: RequestInit) => new Promise((_resolve, reject) => {
      signal!.addEventListener("abort", () => reject(signal!.reason), { once: true });
    })));
    const controller = new AbortController();
    const result = loadSlotCalendar("/api/slots", controller.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
  });
});
