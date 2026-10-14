import { randomUUID } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
const dav = { fetchCalendars: vi.fn(), fetchCalendarObjects: vi.fn(), createCalendarObject: vi.fn(), deleteCalendarObject: vi.fn() };
const createDAVClient = vi.fn(async () => dav);
vi.mock("tsdav", () => ({ createDAVClient }));
import { caldav } from "../../lib/calendars/caldav";
const creds = { serverUrl: "https://caldav.icloud.com", username: "me@icloud.com", password: randomUUID() };

describe("caldav (iCloud) adapter", () => {
  it("logs in with Basic auth and lists only event calendars", async () => {
    dav.fetchCalendars.mockResolvedValue([{ url: "https://p1/cal/home/", displayName: "Home", components: ["VEVENT"] }, { url: "https://p1/cal/tasks/", displayName: "Tasks", components: ["VTODO"] }]);
    const l = await caldav.listCalendars(creds);
    expect(createDAVClient).toHaveBeenCalledWith(expect.objectContaining({ authMethod: "Basic", credentials: { username: "me@icloud.com", password: creds.password } }));
    expect(l).toEqual([{ externalId: "https://p1/cal/home/", name: "Home", isPrimary: true, canWrite: true }]);
  });
  it("asks the server to expand recurrences and returns busy blocks", async () => {
    dav.fetchCalendarObjects.mockResolvedValue([{ data: "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261020T140000Z\r\nDTEND:20261020T150000Z\r\nEND:VEVENT\r\nEND:VCALENDAR" }]);
    const b = await caldav.freeBusy(creds, ["https://p1/cal/home/"], new Date("2026-10-20"), new Date("2026-10-21"));
    expect(dav.fetchCalendarObjects).toHaveBeenCalledWith(expect.objectContaining({ expand: true, timeRange: { start: "2026-10-20T00:00:00.000Z", end: "2026-10-21T00:00:00.000Z" } }));
    expect(b).toHaveLength(1);
  });
  it("PUTs a METHOD-less VEVENT and deletes by object URL", async () => {
    dav.createCalendarObject.mockResolvedValue({ ok: true, status: 201 });
    const r = await caldav.createEvent(creds, "https://p1/cal/home/", { uid: "u1", title: "T", description: "", location: "", start: new Date("2026-10-20T14:00:00Z"), end: new Date("2026-10-20T14:30:00Z"),
      organizer: { name: "H", email: "h@x.com" }, attendees: [{ name: "A", email: "a@x.com" }] });
    const ics = dav.createCalendarObject.mock.calls[0][0].iCalString as string;
    expect(ics).toContain("UID:u1@calendlyisdead"); expect(ics).not.toContain("METHOD:");
    expect(r.externalEventId).toBe("https://p1/cal/home/u1.ics");
    dav.deleteCalendarObject.mockResolvedValue({ ok: true, status: 204 });
    await caldav.deleteEvent(creds, "", r.externalEventId);
    expect(dav.deleteCalendarObject.mock.calls[0][0].calendarObject.url).toBe("https://p1/cal/home/u1.ics");
  });
  it("reports a failed login as 401", async () => {
    createDAVClient.mockRejectedValueOnce(new Error("Invalid credentials"));
    await expect(caldav.listCalendars(creds)).rejects.toMatchObject({ status: 401 });
  });
});
