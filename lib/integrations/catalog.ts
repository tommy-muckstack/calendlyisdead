/** Only list capabilities with a working setup path. Provider names are descriptive. */
export const integrations = [
  { id: "zoom", name: "Zoom", category: "Video conferencing", icon: "video", color: "#2864e8", description: "Include your reusable Zoom meeting link in bookings.", setup: "reusable" },
  { id: "google-meet", name: "Google Meet", category: "Video conferencing", icon: "video", color: "#188038", description: "Add Meet details to bookings and manage your calendar connection.", setup: "meet" },
  { id: "google-calendar", name: "Google Calendar", category: "Calendars", icon: "calendar", color: "#1967d2", description: "Check for conflicts and add scheduled meetings to Google Calendar.", setup: "calendar", provider: "google" },
  { id: "outlook", name: "Outlook Calendar", category: "Calendars", icon: "calendar", color: "#0078d4", description: "Connect your Outlook or Microsoft 365 calendar for scheduling.", setup: "calendar", provider: "microsoft" },
  { id: "microsoft-teams", name: "Microsoft Teams Conferencing", category: "Video conferencing", icon: "video", color: "#6264a7", description: "Include your reusable Teams meeting link in bookings.", setup: "reusable" },
  { id: "icloud", name: "iCloud Calendar", category: "Calendars", icon: "calendar", color: "#c43730", description: "Check iCloud availability and add new meetings to your calendar.", setup: "calendar", provider: "caldav" },
  { id: "embed", name: "Embed CalendlyIsDead", category: "Website", icon: "embed", color: "#006bff", description: "Add an inline booking page or popup to your website.", setup: "embed" },
] as const;
export type Integration = (typeof integrations)[number];
export type IntegrationId = Integration["id"];
export type IntegrationConnection = { id: string; provider: string; status: string };
export type IntegrationCalendar = { id: string; connectionId: string; canWrite: boolean };
export type IntegrationState = { label: string; tone: "connected" | "attention" | "neutral"; connected: boolean };

export function integrationState(item: Integration, connections: IntegrationConnection[], calendars: IntegrationCalendar[], destinationId: string | null): IntegrationState {
  if (item.setup === "calendar") {
    const matching = connections.filter(connection => connection.provider === item.provider);
    if (matching.some(connection => connection.status !== "ok")) return { label: "Needs attention", tone: "attention", connected: true };
    if (matching.length) return { label: "Connected", tone: "connected", connected: true };
    return { label: "Not connected", tone: "neutral", connected: false };
  }
  if (item.setup === "meet") {
    const destination = calendars.find(calendar => calendar.id === destinationId && calendar.canWrite);
    const connection = connections.find(connection => connection.id === destination?.connectionId && connection.provider === "google");
    if (connection) return connection.status === "ok"
      ? { label: "Calendar ready", tone: "connected", connected: true }
      : { label: "Needs attention", tone: "attention", connected: true };
    return { label: "Set up Google Calendar", tone: "neutral", connected: false };
  }
  return { label: item.setup === "reusable" ? "Use a reusable link" : "Available", tone: "neutral", connected: false };
}

export const integrationById = (id: string) => integrations.find(item => item.id === id);
