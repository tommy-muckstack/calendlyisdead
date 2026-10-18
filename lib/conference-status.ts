export type ConferenceStatus = "pending" | "ready" | "failed" | null | undefined;
export function conferenceMessage(status: ConferenceStatus, host = false) {
  return status === "pending" ? "Google Meet is preparing the meeting link. Check this booking page again for joining details."
    : status === "failed" ? host ? "The Google Meet link could not be retrieved. Check your Google Calendar and share the joining details with your invitee." : "The Google Meet link is not available. Contact your host for joining details."
    : "";
}
