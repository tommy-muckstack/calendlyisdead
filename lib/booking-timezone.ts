/** Named zones (including UTC and IANA aliases) retain daylight-saving rules. */
export function validBookingTimezone(value: string): boolean {
  if (!value || value !== value.trim()) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}

export const BOOKING_TIMEZONES = ["UTC", ...(Intl.supportedValuesOf?.("timeZone") ?? [])];
