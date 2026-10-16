import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { generateSlots, defaultWeekly, Schedule } from "../../lib/slots";

const ny: Schedule = { timezone: "America/New_York", weekly: defaultWeekly(), overrides: {} };
const base = { schedule: ny, durationMin: 30, now: "2026-10-01T00:00:00Z", inviteeTz: "America/New_York" };

describe("generateSlots", () => {
  it("weekday 9-5 gives 16 half-hour slots, none on weekends", () => {
    const s = generateSlots({ ...base, from: "2026-10-12", to: "2026-10-18" });
    expect(s["2026-10-12"]).toHaveLength(16);
    expect(s["2026-10-12"][0]).toBe("2026-10-12T13:00:00.000Z");
    expect(s["2026-10-17"]).toBeUndefined();
  });
  it("shows host hours in invitee time zone (London)", () => {
    const s = generateSlots({ ...base, inviteeTz: "Europe/London", from: "2026-10-12", to: "2026-10-12" });
    expect(DateTime.fromISO(s["2026-10-12"][0]).setZone("Europe/London").toFormat("HH:mm")).toBe("14:00");
  });
  it("re-buckets late slots onto the next invitee day (Tokyo)", () => {
    const s = generateSlots({ ...base, inviteeTz: "Asia/Tokyo", from: "2026-10-13", to: "2026-10-13" });
    // Mon 12 Oct 9:00 NY = Mon 22:00 Tokyo; Mon 11:00 NY = Tue 00:00 Tokyo
    expect(s["2026-10-13"].map(x => DateTime.fromISO(x).setZone("Asia/Tokyo").toFormat("HH:mm"))).toContain("00:00");
  });
  it("respects date overrides: closed day and custom hours", () => {
    const sched = { ...ny, overrides: { "2026-10-13": [], "2026-10-14": [{ start: "13:00", end: "14:00" }] } };
    const s = generateSlots({ ...base, schedule: sched, from: "2026-10-13", to: "2026-10-14" });
    expect(s["2026-10-13"]).toBeUndefined();
    expect(s["2026-10-14"]).toHaveLength(2);
  });
  it("applies buffers around busy times", () => {
    const busy = [{ start: "2026-10-12T14:00:00Z", end: "2026-10-12T14:30:00Z" }]; // 10:00-10:30 NY
    const s = generateSlots({ ...base, busy, bufferBeforeMin: 15, bufferAfterMin: 15, from: "2026-10-12", to: "2026-10-12" });
    const t = s["2026-10-12"].map(x => DateTime.fromISO(x).setZone("America/New_York").toFormat("HH:mm"));
    expect(t).not.toContain("09:30"); expect(t).not.toContain("10:00"); expect(t).not.toContain("10:30");
    expect(t).toContain("09:00"); expect(t).toContain("11:00");
  });
  it("enforces minimum notice and date range", () => {
    const s = generateSlots({ ...base, now: "2026-10-12T15:10:00Z", minNoticeMin: 240, rangeDays: 2, from: "2026-10-12", to: "2026-10-20" });
    expect(DateTime.fromISO(s["2026-10-12"][0]).setZone("America/New_York").toFormat("HH:mm")).toBe("15:30");
    expect(s["2026-10-14"]).toBeDefined();
    expect(s["2026-10-15"]).toBeUndefined();
  });
  it("DST spring forward: 1:00-4:00 window skips the missing hour", () => {
    const sched: Schedule = { timezone: "America/New_York", weekly: { 7: [{ start: "01:00", end: "04:00" }] }, overrides: {} };
    const s = generateSlots({ ...base, schedule: sched, durationMin: 60, now: "2026-01-01T00:00:00Z", from: "2026-03-08", to: "2026-03-08" });
    const t = s["2026-03-08"].map(x => DateTime.fromISO(x).setZone("America/New_York").toFormat("HH:mm"));
    expect(t).toEqual(["01:00", "03:00"]); // 2 real hours exist in that window
  });
  it("DST fall back: 9-5 stays 9-5 local and UTC shifts by an hour", () => {
    const sched: Schedule = { timezone: "America/New_York", weekly: { 7: [{ start: "09:00", end: "17:00" }], 1: [{ start: "09:00", end: "17:00" }] }, overrides: {} };
    const s = generateSlots({ ...base, schedule: sched, now: "2026-10-01T00:00:00Z", from: "2026-10-31", to: "2026-11-02" });
    expect(s["2026-11-01"][0]).toBe("2026-11-01T14:00:00.000Z");
    expect(s["2026-11-01"]).toHaveLength(16);
  });
  it("invitee in a zone without DST during host DST change (UTC)", () => {
    const s = generateSlots({ ...base, inviteeTz: "UTC", now: "2026-01-01T00:00:00Z", from: "2026-03-06", to: "2026-03-09" });
    expect(s["2026-03-06"][0]).toBe("2026-03-06T14:00:00.000Z");
    expect(s["2026-03-09"][0]).toBe("2026-03-09T13:00:00.000Z");
  });
});

import { holidayDates } from "../../lib/slots";
describe("holidays and limits", () => {
  const groupAtLimit = { ...base, from: "2026-10-13", to: "2026-10-13",
    existing: ["2026-10-13T15:00:00Z"], joinableStarts: ["2026-10-13T11:00:00-04:00"], limits: { perDay: 1 } };
  it("keeps only existing group sessions open at the meeting limit", () => {
    expect(generateSlots(groupAtLimit)).toEqual({ "2026-10-13": ["2026-10-13T15:00:00.000Z"] });
  });
  it.each([
    { label: "busy intervals", change: { busy: [{ start: "2026-10-13T15:00:00Z", end: "2026-10-13T16:00:00Z" }] } },
    { label: "minimum notice", change: { now: "2026-10-13T14:01:00Z", minNoticeMin: 60 } },
    { label: "closed hours", change: { schedule: { ...ny, overrides: { "2026-10-13": [] } } } },
  ])("still applies $label to joinable group sessions", ({ change }) => {
    expect(generateSlots({ ...groupAtLimit, ...change })).toEqual({});
  });
  it("distinguishes the two repeated DST times when joining an existing session at the limit", () => {
    const schedule: Schedule = { ...ny, weekly: { 7: [{ start: "01:00", end: "03:00" }] } };
    const slots = generateSlots({ ...base, schedule, inviteeTz: "Asia/Tokyo", from: "2026-11-01", to: "2026-11-01",
      existing: ["2026-11-01T05:30:00Z"], joinableStarts: ["2026-11-01T01:30:00-04:00"], limits: { perDay: 1 } });
    expect(slots).toEqual({ "2026-11-01": ["2026-11-01T05:30:00.000Z"] });
  });
  it("US holidays block the day unless an override re-opens it", () => {
    const hol = holidayDates("US", 2026, 2026);
    expect(hol).toContain("2026-11-26");
    const s = generateSlots({ ...base, blockedDates: hol, from: "2026-11-25", to: "2026-11-27" });
    expect(s["2026-11-26"]).toBeUndefined(); expect(s["2026-11-25"]).toHaveLength(16);
    const s2 = generateSlots({ ...base, blockedDates: hol, schedule: { ...ny, overrides: { "2026-11-26": [{ start: "10:00", end: "11:00" }] } }, from: "2026-11-26", to: "2026-11-26" });
    expect(s2["2026-11-26"]).toHaveLength(2);
  });
  it("max per day closes a day once reached (counted in host tz)", () => {
    const existing = ["2026-10-13T13:00:00Z", "2026-10-13T15:00:00Z"];
    const s = generateSlots({ ...base, existing, limits: { perDay: 2 }, from: "2026-10-12", to: "2026-10-14" });
    expect(s["2026-10-13"]).toBeUndefined(); expect(s["2026-10-12"]).toBeDefined(); expect(s["2026-10-14"]).toBeDefined();
  });
  it("max per week closes the rest of that ISO week only", () => {
    const existing = ["2026-10-12T13:00:00Z", "2026-10-13T13:00:00Z", "2026-10-14T13:00:00Z"];
    const s = generateSlots({ ...base, existing, limits: { perWeek: 3 }, from: "2026-10-12", to: "2026-10-20" });
    expect(s["2026-10-15"]).toBeUndefined(); expect(s["2026-10-16"]).toBeUndefined(); expect(s["2026-10-19"]).toHaveLength(16);
  });
  it("a booking at 11pm host time counts toward the host's day, not the invitee's", () => {
    const sched = { ...ny, weekly: { ...ny.weekly, 2: [{ start: "09:00", end: "23:30" }] } };
    const existing = ["2026-10-14T03:00:00Z"]; // Tue 13 Oct 23:00 NY = Wed in UTC
    const s = generateSlots({ ...base, schedule: sched, existing, limits: { perDay: 1 }, from: "2026-10-13", to: "2026-10-14" });
    expect(s["2026-10-13"]).toBeUndefined(); expect(s["2026-10-14"]).toHaveLength(16);
  });
});
