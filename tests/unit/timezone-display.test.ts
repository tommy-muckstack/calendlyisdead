import { describe, expect, it } from "vitest";
import { canonicalTimezone, defaultTimeFormat, formatBookingTime, readTimeFormat, searchTimezones, timezoneLabel, timezoneOptions, timezonePopupPosition } from "../../lib/timezone-display";
describe("invitee timezone display", () => {
  it("formats midnight and noon correctly in both clock systems", () => {
    expect(formatBookingTime("2026-10-18T00:00:00Z", "UTC", "12h")).toBe("12:00am");
    expect(formatBookingTime("2026-10-18T12:00:00Z", "UTC", "12h")).toBe("12:00pm");
    expect(formatBookingTime("2026-10-18T00:00:00Z", "UTC", "24h")).toBe("00:00");
    expect(formatBookingTime("2026-10-18T13:05:00Z", "UTC", "24h")).toBe("13:05");
  });
  it("uses real zone rules for fractional offsets and date crossings", () => {
    expect(formatBookingTime("2026-01-01T23:30:00Z", "Asia/Kathmandu", "24h")).toBe("05:15");
    expect(formatBookingTime("2026-01-01T23:30:00Z", "Asia/Kolkata", "12h")).toBe("5:00am");
    expect(formatBookingTime("2026-01-01T01:00:00Z", "Pacific/Honolulu", "12h")).toBe("3:00pm");
  });
  it("uses the instant's DST offset rather than today's offset", () => {
    expect(formatBookingTime("2026-03-08T06:30:00Z", "America/New_York", "12h")).toBe("1:30am");
    expect(formatBookingTime("2026-03-08T07:30:00Z", "America/New_York", "12h")).toBe("3:30am");
    expect(formatBookingTime("2026-11-01T05:30:00Z", "America/New_York", "24h")).toBe("01:30");
    expect(formatBookingTime("2026-11-01T06:30:00Z", "America/New_York", "24h")).toBe("01:30");
  });
  it("chooses a locale clock without treating arbitrary saved values as preferences", () => {
    expect(defaultTimeFormat("en-US")).toBe("12h"); expect(defaultTimeFormat("en-GB")).toBe("24h");
    expect(readTimeFormat("12h")).toBe("12h"); expect(readTimeFormat("24h")).toBe("24h");
    for (const invalid of [null, "", "24", "<script>", {}]) expect(readTimeFormat(invalid)).toBeNull();
  });
  it("retains a selected alias while avoiding duplicate canonical options", () => {
    const options = timezoneOptions("US/Eastern", ["America/New_York", "US/Eastern", "UTC"]);
    expect(options.map(o => o.value)).toContain("US/Eastern"); expect(options.map(o => o.value)).not.toContain("America/New_York");
    expect(new Set(options.map(o => canonicalTimezone(o.value))).size).toBe(options.length);
    expect(timezoneLabel("US/Eastern")).toBe("Eastern Time - US & Canada");
  });
  it("searches cities, regions, readable labels and renamed zone aliases", () => {
    const options = timezoneOptions("UTC", ["America/New_York", "Europe/Paris", "Asia/Calcutta", "Pacific/Auckland"]);
    expect(searchTimezones(options, "Eastern Canada").map(o => o.value)).toEqual(["America/New_York"]);
    expect(searchTimezones(options, "new_york").map(o => o.value)).toEqual(["America/New_York"]);
    expect(searchTimezones(options, "Europe Paris").map(o => o.value)).toEqual(["Europe/Paris"]);
    expect(searchTimezones(options, "Kolkata")).toHaveLength(1);
    expect(searchTimezones(options, "missing zone")).toEqual([]); expect(searchTimezones(options, "  ")).toEqual(options);
  });
  it("retains UTC and the valid current zone even without a supported-values list", () => {
    expect(timezoneOptions("Asia/Tokyo", []).map(o => o.value).sort()).toEqual(["Asia/Tokyo", "UTC"]);
    expect(timezoneOptions("Bad/Zone", []).map(o => o.value)).toEqual(["UTC"]);
  });
  it.each([
    [{ left: 900, top: 600, bottom: 640, width: 300 }, { left: 0, top: 0, width: 1440, height: 900 }],
    [{ left: 24, top: 700, bottom: 740, width: 342 }, { left: 0, top: 0, width: 390, height: 844 }],
    [{ left: 24, top: 220, bottom: 260, width: 342 }, { left: 0, top: 180, width: 390, height: 300 }],
    [{ left: 24, top: -300, bottom: -260, width: 342 }, { left: 0, top: 0, width: 390, height: 200 }],
  ])("keeps the dropdown inside the visible viewport", (anchor, viewport) => {
    const p = timezonePopupPosition(anchor, viewport);
    expect(p.left).toBeGreaterThanOrEqual(viewport.left + 12); expect(p.left + p.width).toBeLessThanOrEqual(viewport.left + viewport.width - 12);
    expect(p.top).toBeGreaterThanOrEqual(viewport.top + 12); expect(p.top + p.maxHeight).toBeLessThanOrEqual(viewport.top + viewport.height - 12);
  });
});
