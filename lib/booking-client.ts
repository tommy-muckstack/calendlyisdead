export type SlotCalendar = Record<string, string[]>;

// A failed or malformed response must not masquerade as an empty calendar.
export async function loadSlotCalendar(url: string, signal: AbortSignal): Promise<SlotCalendar> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("availability_unavailable");
  const body: unknown = await response.json();
  const slots = body && typeof body === "object" && "slots" in body ? body.slots : null;
  if (!slots || typeof slots !== "object" || Array.isArray(slots) ||
    !Object.entries(slots).every(([day, times]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Array.isArray(times) &&
      times.every(time => typeof time === "string" && Number.isFinite(Date.parse(time))))) {
    throw new Error("invalid_availability_response");
  }
  return slots as SlotCalendar;
}
