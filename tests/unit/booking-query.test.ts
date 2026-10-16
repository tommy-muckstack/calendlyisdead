import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { readBookingQuery } from "../../lib/booking-client";

const now = DateTime.fromISO("2026-11-01T00:30:00Z");
const read = (query: Record<string, string>, fallback = "America/New_York") => readBookingQuery(new URLSearchParams(query), fallback, now);
describe("booking link calendar parameters", () => {
  it("uses the visitor's local month at UTC month boundaries", () => {
    expect(read({})).toEqual({ tz: "America/New_York", month: "2026-10", date: null, slot: null, invalid: false });
    expect(read({ tz: "UTC" })).toMatchObject({ tz: "UTC", month: "2026-11", invalid: false });
  });
  it.each(["bad", "2026-00", "2026-13", "2026-2", "", "2026-11-01"])("recovers malformed month %j", month => {
    expect(read({ month })).toMatchObject({ month: "2026-10", invalid: true, slot: null });
  });
  it.each(["", "Not/A_Zone", "UTC+100"])("recovers unsupported timezone %j", tz => {
    expect(read({ tz })).toMatchObject({ tz: "America/New_York", invalid: true });
  });
  it("uses UTC when both the requested zone and fallback are invalid", () => {
    expect(read({ tz: "Bad" }, "Bad")).toMatchObject({ tz: "UTC", month: "2026-11", invalid: true });
  });
  it("accepts UTC and valid timezone aliases without replacing them", () => {
    for (const tz of ["UTC", "US/Eastern", "Asia/Kolkata"]) expect(read({ tz })).toMatchObject({ tz, invalid: false });
  });
  it("validates real dates, preserving leap days and rejecting impossible dates", () => {
    expect(read({ date: "2028-02-29" })).toMatchObject({ date: "2028-02-29", invalid: false });
    expect(read({ date: "2027-02-29" })).toMatchObject({ date: null, invalid: true });
    expect(read({ date: "2026-04-31" })).toMatchObject({ date: null, invalid: true });
  });
  it("preserves distinct instants in a repeated DST hour", () => {
    for (const slot of ["2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00"]) {
      expect(read({ slot })).toMatchObject({ slot, invalid: false });
    }
  });
  it.each(["bad", "2026-11-01", "2026-11-01T01:30:00", "2026-02-30T10:00:00Z"])("drops an invalid or ambiguous slot %j", slot => {
    expect(read({ slot })).toMatchObject({ slot: null, invalid: true });
  });
  it("returns to the calendar if other link parameters are invalid, even with a valid instant", () => {
    expect(read({ tz: "Invalid", slot: "2026-11-01T14:00:00Z" })).toMatchObject({ slot: null, invalid: true });
  });
});
