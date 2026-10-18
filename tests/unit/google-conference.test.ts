import { afterEach, describe, expect, it, vi } from "vitest";
import { google, googleConferenceResult, readGoogleConference } from "../../lib/calendars/google";

afterEach(() => vi.unstubAllGlobals());
const pending = { conferenceData: { createRequest: { status: { statusCode: "pending" } } } };
const tokens = { access_token: "synthetic-test-token" };
const event = { uid: "test", title: "Meeting", description: "", location: "Google Meet", start: new Date("2026-12-15T11:00:00Z"), end: new Date("2026-12-15T11:30:00Z"), organizer: { name: "Host", email: "host@example.invalid" }, attendees: [], wantsMeet: true };

describe("Google's asynchronous conferencing response", () => {
  it("distinguishes pending, successful entry points, failed creation and cancelled events", () => {
    expect(googleConferenceResult(pending)).toEqual({ conferenceStatus: "pending" });
    expect(googleConferenceResult({ conferenceData: { entryPoints: [{ entryPointType: "phone", uri: "tel:12345" }, { entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }] } })).toEqual({ conferenceStatus: "ready", meetingUrl: "https://meet.google.com/abc-defg-hij" });
    expect(googleConferenceResult({ conferenceData: { createRequest: { status: { statusCode: "failure" } } } })).toEqual({ conferenceStatus: "failed" });
    expect(googleConferenceResult({ status: "cancelled", hangoutLink: "https://meet.google.com/old" })).toEqual({ conferenceStatus: "failed" });
    expect(googleConferenceResult({ conferenceData: { createRequest: { status: { statusCode: "success" } } } })).toEqual({ conferenceStatus: "failed" });
  });
  it.each(["javascript:alert(1)", "https://meet.google.com.evil.invalid/room", "http://meet.google.com/room", "https://name:password@meet.google.com/room"])("rejects an unsafe provider link: %s", url => {
    expect(googleConferenceResult({ hangoutLink: url })).toEqual({ conferenceStatus: "failed" });
  });
  it("retains the created event ID while Meet is pending", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "google-event", ...pending })); vi.stubGlobal("fetch", fetch);
    expect(await google.createEvent(tokens, "calendar/id", event)).toEqual({ externalEventId: "google-event", conferenceStatus: "pending" });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("reads the existing event, encoding IDs, instead of inserting another one", async () => {
    const fetch = vi.fn(async () => Response.json({ hangoutLink: "https://meet.google.com/abc-defg-hij" })); vi.stubGlobal("fetch", fetch);
    expect(await readGoogleConference(tokens, "a/b", "event/id")).toEqual({ conferenceStatus: "ready", meetingUrl: "https://meet.google.com/abc-defg-hij" });
    expect(fetch.mock.calls[0]).toEqual(["https://www.googleapis.com/calendar/v3/calendars/a%2Fb/events/event%2Fid", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer synthetic-test-token" }), signal: expect.any(AbortSignal) })]);
  });
  it("handles deleted events as terminal but leaves transient failures retryable", async () => {
    for (const status of [404, 410]) { vi.stubGlobal("fetch", async () => new Response("", { status })); expect(await readGoogleConference(tokens, "cal", "event")).toEqual({ conferenceStatus: "failed" }); }
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 })); await expect(readGoogleConference(tokens, "cal", "event")).rejects.toMatchObject({ status: 503 });
  });
  it("rejects a missing event identifier rather than inventing a fallback room", async () => {
    vi.stubGlobal("fetch", async () => Response.json(pending)); await expect(google.createEvent(tokens, "cal", event)).rejects.toMatchObject({ status: 502 });
  });
});
