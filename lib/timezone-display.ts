import { BOOKING_TIMEZONES, validBookingTimezone } from "./booking-timezone";
export type BookingTimeFormat = "12h" | "24h";
export const BOOKING_TIME_FORMAT_KEY = "calendlyisdead.booking.time-format.v1";
export const readTimeFormat = (value: unknown): BookingTimeFormat | null => value === "12h" || value === "24h" ? value : null;
export function defaultTimeFormat(locale?: string): BookingTimeFormat {
  return new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hour12 ? "12h" : "24h";
}
export function formatBookingTime(instant: string | number | Date, zone: string, format: BookingTimeFormat): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", hourCycle: format === "24h" ? "h23" : "h12" })
    .format(new Date(instant)).replace(/\s/g, "").toLowerCase();
}
const FRIENDLY: Record<string, string> = {
  UTC: "Coordinated Universal Time", "America/New_York": "Eastern Time - US & Canada", "America/Chicago": "Central Time - US & Canada",
  "America/Denver": "Mountain Time - US & Canada", "America/Los_Angeles": "Pacific Time - US & Canada", "America/Phoenix": "Arizona Time",
  "America/Anchorage": "Alaska Time", "Pacific/Honolulu": "Hawaii Time",
};
const ALIASES: Record<string, string> = {
  "America/New_York": "US/Eastern EST EDT", "America/Chicago": "US/Central CST CDT", "America/Denver": "US/Mountain MST MDT",
  "America/Los_Angeles": "US/Pacific PST PDT", "Asia/Calcutta": "Asia/Kolkata India", "Asia/Kolkata": "Asia/Calcutta India",
  "Europe/Kiev": "Europe/Kyiv Ukraine", "Europe/Kyiv": "Europe/Kiev Ukraine", UTC: "GMT Universal Zulu",
};
export function canonicalTimezone(zone: string) { return new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone; }
export function timezoneLabel(zone: string): string {
  if (!validBookingTimezone(zone)) return "Time zone unavailable";
  const canonical = canonicalTimezone(zone);
  if (FRIENDLY[canonical]) return FRIENDLY[canonical];
  const city = canonical.split("/").slice(1).join(" / ").replaceAll("_", " ") || canonical;
  const generic = new Intl.DateTimeFormat("en-US", { timeZone: canonical, timeZoneName: "longGeneric" }).formatToParts(new Date("2026-01-01T12:00:00Z")).find(p => p.type === "timeZoneName")?.value;
  return generic && generic !== city ? `${generic} - ${city}` : city;
}
export type TimezoneOption = { value: string; label: string; region: string; search: string };
const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replaceAll("_", " ");
const REGIONS = ["UTC", "Africa", "Americas", "Antarctica", "Asia", "Atlantic", "Australia", "Europe", "Pacific", "Other"];
export function timezoneOptions(selected: string, supported: readonly string[] = BOOKING_TIMEZONES): TimezoneOption[] {
  const seen = new Set<string>(), result: TimezoneOption[] = [];
  for (const value of [selected, "UTC", ...supported]) {
    if (!validBookingTimezone(value)) continue;
    const canonical = canonicalTimezone(value); if (seen.has(canonical)) continue; seen.add(canonical);
    const prefix = canonical.split("/")[0], region = prefix === "America" ? "Americas" : REGIONS.includes(prefix) ? prefix : "Other";
    const label = timezoneLabel(value);
    result.push({ value, label, region, search: normalize(`${value} ${canonical} ${label} ${region} ${ALIASES[canonical] ?? ""}`) });
  }
  return result.sort((a, b) => REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region) || a.label.localeCompare(b.label, "en"));
}
export function searchTimezones(options: TimezoneOption[], query: string) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return options.filter(option => words.every(word => option.search.includes(word)));
}
/** Keep the dropdown inside the visible viewport, including an on-screen keyboard. */
export function timezonePopupPosition(anchor: { left: number; top: number; bottom: number; width: number }, viewport: { left: number; top: number; width: number; height: number }) {
  const margin = 12, width = Math.min(360, Math.max(300, anchor.width), Math.max(0, viewport.width - 2 * margin));
  const below = viewport.top + viewport.height - anchor.bottom - margin, above = anchor.top - viewport.top - margin;
  const up = below < 320 && above > below, height = Math.max(0, Math.min(460, (up ? above : below) - 6, viewport.height - 2 * margin));
  return { left: Math.max(viewport.left + margin, Math.min(anchor.left, viewport.left + viewport.width - margin - width)), top: Math.max(viewport.top + margin, Math.min(up ? anchor.top - height - 6 : anchor.bottom + 6, viewport.top + viewport.height - margin - height)), width, maxHeight: height };
}
