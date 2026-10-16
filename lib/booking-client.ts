import { DateTime } from "luxon";

export type SlotCalendar = Record<string, string[]>;

function validZone(zone: string | null): zone is string {
  if (!zone) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return DateTime.now().setZone(zone).isValid; }
  catch { return false; }
}

/** Recover invalid shared-link parameters before constructing the calendar. */
export function readBookingQuery(params: Pick<URLSearchParams, "get">, fallbackZone: string, now: DateTime = DateTime.utc(), lockedTimezone?: string | null) {
  const requestedZone = params.get("tz");
  const locked = validZone(lockedTimezone ?? null);
  const tz = locked ? lockedTimezone! : validZone(requestedZone) ? requestedZone : validZone(fallbackZone) ? fallbackZone : "UTC";
  const requestedMonth = params.get("month");
  const parsedMonth = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth)
    ? DateTime.fromFormat(requestedMonth, "yyyy-MM", { zone: tz }) : null;
  const month = parsedMonth?.isValid ? requestedMonth! : now.setZone(tz).toFormat("yyyy-MM");
  const requestedDate = params.get("date");
  const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) &&
    DateTime.fromISO(requestedDate, { zone: tz }).toISODate() === requestedDate ? requestedDate : null;
  const requestedSlot = params.get("slot");
  // A selected slot must identify an instant, including its offset, not a wall time.
  const slot = requestedSlot && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(requestedSlot) &&
    DateTime.fromISO(requestedSlot, { setZone: true }).isValid ? requestedSlot : null;
  const invalid = (!locked && requestedZone !== null && !validZone(requestedZone)) ||
    (requestedMonth !== null && !parsedMonth?.isValid) || (requestedDate !== null && !date) || (requestedSlot !== null && !slot);
  return { tz, month, date, slot: invalid ? null : slot, invalid };
}

// A failed or malformed response must not masquerade as an empty calendar.
export async function loadSlotCalendar(url: string, signal: AbortSignal, expectedTimezone?: string): Promise<SlotCalendar> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("availability_unavailable");
  const body: unknown = await response.json();
  if (expectedTimezone && body && typeof body === "object" && "timezone" in body && typeof body.timezone === "string" && body.timezone !== expectedTimezone)
    throw new Error("booking_timezone_changed");
  const slots = body && typeof body === "object" && "slots" in body ? body.slots : null;
  if (!slots || typeof slots !== "object" || Array.isArray(slots) ||
    !Object.entries(slots).every(([day, times]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Array.isArray(times) &&
      times.every(time => typeof time === "string" && Number.isFinite(Date.parse(time))))) {
    throw new Error("invalid_availability_response");
  }
  return slots as SlotCalendar;
}
