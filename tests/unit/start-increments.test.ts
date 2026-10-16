import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { generateSlots, type Schedule } from "../../lib/slots";

const schedule: Schedule = { timezone: "America/New_York", weekly: { 1: [{ start: "09:00", end: "11:00" }] }, overrides: {} };
const base = { schedule, durationMin: 45, from: "2026-10-19", to: "2026-10-19", now: "2026-10-01T00:00:00Z", inviteeTz: "America/New_York" };
const local = (slots: Record<string, string[]>) => Object.values(slots).flat().map(time => DateTime.fromISO(time).setZone(schedule.timezone).toFormat("HH:mm"));

describe("start increments independent of duration", () => {
  it("defaults a 45-minute meeting to 30-minute starts", () => {
    expect(local(generateSlots(base))).toEqual(["09:00", "09:30", "10:00"]);
  });
  it.each([5, 15, 20, 45, 60, 180, 1440])("supports %i-minute spacing with full-duration fits", intervalMin => {
    const slots = Object.values(generateSlots({ ...base, intervalMin })).flat();
    expect(slots).toHaveLength(Math.floor(75 / intervalMin) + 1);
    for (let n = 1; n < slots.length; n++) expect(+new Date(slots[n]) - +new Date(slots[n - 1])).toBe(intervalMin * 60_000);
    expect(DateTime.fromISO(slots.at(-1)!).plus({ minutes: 45 }).setZone(schedule.timezone).hour).toBeLessThanOrEqual(11);
  });
  it.each([0, -1, 4, 5.5, 1441, NaN, Infinity])("rejects unsafe intervals %s instead of entering an unbounded slot loop", intervalMin => {
    expect(() => generateSlots({ ...base, intervalMin })).toThrow("invalid_start_interval");
  });
  it("anchors custom increments at each availability range and does not restart after busy blocks", () => {
    const hours = { ...schedule, weekly: { 1: [{ start: "09:07", end: "10:50" }, { start: "13:03", end: "14:00" }] } };
    expect(local(generateSlots({ ...base, schedule: hours, intervalMin: 20, durationMin: 20,
      busy: [{ start: "2026-10-19T13:27:00Z", end: "2026-10-19T13:40:00Z" }] })))
      .toEqual(["09:07", "09:47", "10:07", "10:27", "13:03", "13:23"]);
  });
  it("filters the fixed grid using minimum notice and buffers without shortening meetings", () => {
    const slots = generateSlots({ ...base, durationMin: 30, intervalMin: 15, now: "2026-10-19T13:02:00Z", minNoticeMin: 15, bufferAfterMin: 10,
      busy: [{ start: "2026-10-19T14:00:00Z", end: "2026-10-19T14:15:00Z" }] });
    expect(local(slots)).toEqual(["10:15", "10:30"]);
  });
  it("handles spring-forward with 15-minute increments and a 45-minute real duration", () => {
    const hours = { ...schedule, weekly: { 7: [{ start: "01:00", end: "04:00" }] } };
    const slots = generateSlots({ ...base, schedule: hours, intervalMin: 15, now: "2026-01-01T00:00:00Z", from: "2026-03-08", to: "2026-03-08" });
    expect(local(slots)).toEqual(["01:00", "01:15", "01:30", "01:45", "03:00", "03:15"]);
  });
  it("keeps both repeated-hour instants distinct and re-buckets them into an invitee timezone", () => {
    const hours = { ...schedule, weekly: { 7: [{ start: "00:00", end: "03:00" }] } };
    const slots = generateSlots({ ...base, schedule: hours, durationMin: 45, intervalMin: 15, from: "2026-11-01", to: "2026-11-01", inviteeTz: "Asia/Tokyo" });
    expect(slots["2026-11-01"]).toContain("2026-11-01T05:15:00.000Z"); expect(slots["2026-11-01"]).toContain("2026-11-01T06:15:00.000Z");
    expect(new Set(slots["2026-11-01"]).size).toBe(14);
  });
  it("uses date overrides, midnight endpoints and invitee date boundaries", () => {
    const hours = { ...schedule, weekly: {}, overrides: { "2026-10-19": [{ start: "23:05", end: "24:00" }] } };
    const slots = generateSlots({ ...base, schedule: hours, durationMin: 20, intervalMin: 10, from: "2026-10-20", to: "2026-10-20", inviteeTz: "UTC" });
    expect(slots).toEqual({ "2026-10-20": ["2026-10-20T03:05:00.000Z", "2026-10-20T03:15:00.000Z", "2026-10-20T03:25:00.000Z", "2026-10-20T03:35:00.000Z"] });
  });
});
