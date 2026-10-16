import { describe, expect, it } from "vitest";
import { generateSlots } from "../../lib/slots";

const weekly = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(day => [day, [{ start: "00:00", end: "24:00" }]]));
const base = { schedule: { timezone: "America/New_York", weekly, overrides: {} }, durationMin: 30,
  now: "2027-03-01T12:00:00Z", inviteeTz: "UTC", from: "2027-03-07", to: "2027-03-10", rangeDays: 1 };

describe("booking date range slot boundaries", () => {
  it("includes both fixed dates in the host calendar despite invitee midnight and spring DST", () => {
    const dateRange = { kind: "fixed", start: "2027-03-13", end: "2027-03-15" } as const;
    const slots = Object.values(generateSlots({ ...base, dateRange, from: "2027-03-13", to: "2027-03-16" })).flat();
    expect(slots[0]).toBe("2027-03-13T05:00:00.000Z");
    expect(slots.at(-1)).toBe("2027-03-16T03:30:00.000Z");
    expect(slots).toHaveLength(142);
  });
  it("counts weekdays when extending a rolling horizon without closing available weekends", () => {
    const dateRange = { kind: "rolling", days: 2, unit: "weekdays" } as const;
    const slots = generateSlots({ ...base, now: "2027-03-05T12:00:00Z", from: "2027-03-05", to: "2027-03-10", inviteeTz: "America/New_York", dateRange });
    expect(Object.keys(slots)).toEqual(["2027-03-05", "2027-03-06", "2027-03-07", "2027-03-08", "2027-03-09"]);
  });
  it("removes the future horizon for indefinite events while retaining notice and busy time", () => {
    const dateRange = { kind: "indefinite" } as const;
    const slots = Object.values(generateSlots({ ...base, dateRange, from: "2030-01-01", to: "2030-01-01",
      busy: [{ start: "2030-01-01T00:00:00Z", end: "2030-01-01T23:30:00Z" }] })).flat();
    expect(slots).toEqual(["2030-01-01T23:30:00.000Z"]);
    expect(generateSlots({ ...base, dateRange, minNoticeMin: 60, from: "2027-03-01", to: "2027-03-01" })["2027-03-01"][0]).toBe("2027-03-01T13:00:00.000Z");
  });
  it("keeps the old rolling calendar range when the new field is null", () => {
    expect(generateSlots({ ...base, dateRange: null })).toEqual(generateSlots(base));
  });
  it("uses one event calendar for fixed team dates across hosts in different zones", () => {
    const dateRange = { kind: "fixed", start: "2027-03-09", end: "2027-03-09" } as const;
    const slots = Object.values(generateSlots({ ...base, schedule: { ...base.schedule, timezone: "Pacific/Honolulu" }, dateRange, dateRangeTimezone: "Asia/Tokyo" })).flat();
    expect(slots[0]).toBe("2027-03-08T15:00:00.000Z");
    expect(slots.at(-1)).toBe("2027-03-09T14:30:00.000Z");
  });
  it("does not exempt existing group sessions from a newly restricted date range", () => {
    const start = "2027-03-09T15:00:00.000Z";
    const dateRange = { kind: "fixed", start: "2027-03-07", end: "2027-03-08" } as const;
    const slots = Object.values(generateSlots({ ...base, dateRange, joinableStarts: [start], existing: [start], limits: { perDay: 1 } })).flat();
    expect(slots).not.toContain(start); expect(slots.length).toBeGreaterThan(0);
  });
  it("keeps both occurrences of the repeated hour inside a fixed fall-back date", () => {
    const dateRange = { kind: "fixed", start: "2027-11-07", end: "2027-11-07" } as const;
    const slots = Object.values(generateSlots({ ...base, dateRange, from: "2027-11-07", to: "2027-11-08" })).flat();
    expect(slots).toHaveLength(50); expect(slots[0]).toBe("2027-11-07T04:00:00.000Z"); expect(slots.at(-1)).toBe("2027-11-08T04:30:00.000Z");
  });
  it("counts the next weekday from a weekend without treating holidays as weekends", () => {
    const dateRange = { kind: "rolling", days: 1, unit: "weekdays" } as const;
    const slots = generateSlots({ ...base, dateRange, now: "2027-07-03T12:00:00Z", from: "2027-07-03", to: "2027-07-07", inviteeTz: "America/New_York" });
    expect(Object.keys(slots)).toEqual(["2027-07-03", "2027-07-04", "2027-07-05"]);
  });
  it("still intersects explicit ranges with buffers, closed dates and per-day limits", () => {
    const dateRange = { kind: "fixed", start: "2027-03-08", end: "2027-03-10" } as const;
    const slots = generateSlots({ ...base, dateRange, inviteeTz: "America/New_York", existing: ["2027-03-08T15:00:00Z"], limits: { perDay: 1 },
      schedule: { ...base.schedule, overrides: { "2027-03-09": [] } }, bufferBeforeMin: 30,
      busy: [{ start: "2027-03-10T05:00:00Z", end: "2027-03-10T06:00:00Z" }] });
    expect(Object.keys(slots)).toEqual(["2027-03-10"]); expect(slots["2027-03-10"][0]).toBe("2027-03-10T06:30:00.000Z");
  });
  it("does not extend a range when a timezone skips an entire calendar date", () => {
    const input = { ...base, schedule: { ...base.schedule, timezone: "Pacific/Apia" }, now: "2011-12-29T22:00:00Z", from: "2011-12-30", to: "2011-12-31" };
    expect(generateSlots({ ...input, dateRange: { kind: "fixed", start: "2011-12-30", end: "2011-12-30" } })).toEqual({});
    for (const dateRange of [null, { kind: "rolling", days: 1, unit: "calendar" } as const, { kind: "rolling", days: 1, unit: "weekdays" } as const]) {
      const slots = Object.values(generateSlots({ ...input, dateRange })).flat();
      expect(slots).toHaveLength(20); expect(slots.at(-1)).toBe("2011-12-30T09:30:00.000Z");
    }
  });
});
