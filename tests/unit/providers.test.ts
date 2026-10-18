import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { google, googleOAuth } from "../../lib/calendars/google";
import { microsoft } from "../../lib/calendars/microsoft";
import { parseBusy } from "../../lib/calendars/caldav";
import { seal, open } from "../../lib/crypto";

const T = { access_token: "at" };
type Call = { url: string; init: any };
let calls: Call[] = [];
function stub(...responses: any[]) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => { calls.push({ url: String(url), init }); const r = responses.shift();
    return new Response(r === null ? null : JSON.stringify(r), { status: r === null ? 204 : (r?.__status ?? 200) }); }));
}
const ev = { uid: "abc123", title: "Chat: Ada", description: "notes", location: "Google Meet", start: new Date("2026-10-20T14:00:00Z"), end: new Date("2026-10-20T14:30:00Z"),
  organizer: { name: "Host", email: "h@x.com" }, attendees: [{ name: "Ada", email: "ada@x.com" }] };
beforeEach(() => vi.unstubAllGlobals());

describe("google adapter", () => {
  it.each([
    {}, { calendars: {} }, { calendars: { selected: { errors: [{ reason: "notFound" }], busy: [] } } },
    { calendars: { selected: { busy: null } } }, { calendars: { selected: { busy: [{ start: "bad", end: "bad" }] } } },
    { calendars: { selected: { busy: [{ start: "2026-10-20T15:00:00Z", end: "2026-10-20T14:00:00Z" }] } } },
  ])("rejects incomplete or failed free/busy responses: %j", async response => {
    stub(response);
    await expect(google.freeBusy(T, ["selected"], new Date("2026-10-20"), new Date("2026-10-22"))).rejects.toMatchObject({ status: 502 });
  });
  it("does not accept partial success when another selected calendar is missing", async () => {
    stub({ calendars: { first: { busy: [] } } });
    await expect(google.freeBusy(T, ["first", "missing"], new Date("2026-10-20"), new Date("2026-10-22"))).rejects.toMatchObject({ status: 502 });
  });
  it("checks every selected calendar in batches of at most 50", async () => {
    const ids = Array.from({ length: 51 }, (_, index) => `cal-${index}`);
    stub(...[ids.slice(0, 50), ids.slice(50)].map(batch => ({ calendars: Object.fromEntries(batch.map(id => [id, { busy: [] }])) })));
    await expect(google.freeBusy(T, [...ids, ids[0]], new Date("2026-10-20"), new Date("2026-10-22"))).resolves.toEqual([]);
    expect(calls.map(call => JSON.parse(call.init.body).items.length)).toEqual([50, 1]);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(calls[1].init.signal).toBe(calls[0].init.signal);
  });
  it("lists calendars across pages with write access", async () => {
    stub({ items: [{ id: "p", summary: "Me", primary: true, accessRole: "owner" }], nextPageToken: "n" }, { items: [{ id: "h", summary: "Holidays", accessRole: "reader" }] });
    const l = await google.listCalendars(T);
    expect(l).toEqual([{ externalId: "p", name: "Me", isPrimary: true, canWrite: true }, { externalId: "h", name: "Holidays", isPrimary: false, canWrite: false }]);
    expect(calls[1].url).toContain("pageToken=n");
  });
  it("merges free/busy across calendars and sends bearer token", async () => {
    stub({ calendars: { a: { busy: [{ start: "2026-10-20T14:00:00Z", end: "2026-10-20T15:00:00Z" }] }, b: { busy: [{ start: "2026-10-21T14:00:00Z", end: "2026-10-21T15:00:00Z" }] } } });
    const b = await google.freeBusy(T, ["a", "b"], new Date("2026-10-20"), new Date("2026-10-22"));
    expect(b).toHaveLength(2);
    expect(calls[0].init.headers.authorization).toBe("Bearer at");
    expect(JSON.parse(calls[0].init.body).items).toEqual([{ id: "a" }, { id: "b" }]);
  });
  it("creates events without Google's own invite email and requests Meet links", async () => {
    stub({ id: "gev1", hangoutLink: "https://meet.google.com/x" });
    const r = await google.createEvent(T, "primary", { ...ev, wantsMeet: true });
    expect(r).toEqual({ externalEventId: "gev1", meetingUrl: "https://meet.google.com/x", conferenceStatus: "ready" });
    expect(calls[0].url).toContain("sendUpdates=none"); expect(calls[0].url).toContain("conferenceDataVersion=1");
    expect(JSON.parse(calls[0].init.body).conferenceData.createRequest.conferenceSolutionKey.type).toBe("hangoutsMeet");
  });
  it("treats a 410 on delete as already gone, but surfaces 401", async () => {
    stub({ __status: 410 }); await expect(google.deleteEvent(T, "primary", "x")).resolves.toBeUndefined();
    stub({ __status: 401 }); await expect(google.deleteEvent(T, "primary", "x")).rejects.toMatchObject({ status: 401 });
  });
  it("reads the account email from the id_token", () => {
    const idt = `h.${Buffer.from(JSON.stringify({ email: "t@x.com" })).toString("base64url")}.s`;
    expect(googleOAuth.emailFromIdToken(idt)).toBe("t@x.com");
  });
});

describe("microsoft adapter", () => {
  it("follows calendarView paging and ignores free / cancelled events", async () => {
    stub({ value: [{ start: { dateTime: "2026-10-20T14:00:00.0000000" }, end: { dateTime: "2026-10-20T15:00:00.0000000" }, showAs: "busy" },
                   { start: { dateTime: "2026-10-20T16:00:00" }, end: { dateTime: "2026-10-20T17:00:00" }, showAs: "free" }], "@odata.nextLink": "https://graph.microsoft.com/next" },
         { value: [{ start: { dateTime: "2026-10-21T14:00:00" }, end: { dateTime: "2026-10-21T15:00:00" }, showAs: "tentative" },
                   { start: { dateTime: "2026-10-21T16:00:00" }, end: { dateTime: "2026-10-21T17:00:00" }, showAs: "busy", isCancelled: true }] });
    const b = await microsoft.freeBusy(T, ["cal1"], new Date("2026-10-20"), new Date("2026-10-22"));
    expect(b).toEqual([{ start: "2026-10-20T14:00:00.000Z", end: "2026-10-20T15:00:00.000Z" }, { start: "2026-10-21T14:00:00.000Z", end: "2026-10-21T15:00:00.000Z" }]);
    expect(calls[0].init.headers.prefer).toBe('outlook.timezone="UTC"'); expect(calls[1].url).toBe("https://graph.microsoft.com/next");
  });
  it("creates an event in UTC with no attendees (so Outlook doesn't send a second invite)", async () => {
    stub({ id: "mev1" });
    const r = await microsoft.createEvent(T, "cal1", ev);
    const body = JSON.parse(calls[0].init.body);
    expect(r.externalEventId).toBe("mev1"); expect(body.start).toEqual({ dateTime: "2026-10-20T14:00:00.000", timeZone: "UTC" });
    expect(body.attendees).toBeUndefined(); expect(body.body.content).toContain("ada@x.com");
  });
});

describe("caldav parsing", () => {
  const ics = (lines: string) => `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\n${lines}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  it("reads UTC, TZID and folded lines", () => {
    expect(parseBusy(ics("DTSTART:20261020T140000Z\r\nDTEND:20261020T150000Z"))).toEqual([{ start: "2026-10-20T14:00:00.000Z", end: "2026-10-20T15:00:00.000Z" }]);
    expect(parseBusy(ics("DTSTART;TZID=America/New_York:20261020T\r\n 090000\r\nDTEND;TZID=America/New_York:20261020T100000"))[0].start).toBe("2026-10-20T13:00:00.000Z");
  });
  it("uses DURATION and all-day dates, skips transparent and cancelled", () => {
    expect(parseBusy(ics("DTSTART:20261020T140000Z\r\nDURATION:PT45M"))[0].end).toBe("2026-10-20T14:45:00.000Z");
    expect(parseBusy(ics("DTSTART;VALUE=DATE:20261020"), "America/New_York")[0]).toEqual({ start: "2026-10-20T04:00:00.000Z", end: "2026-10-21T04:00:00.000Z" });
    expect(parseBusy(ics("DTSTART:20261020T140000Z\r\nDTEND:20261020T150000Z\r\nTRANSP:TRANSPARENT"))).toEqual([]);
    expect(parseBusy(ics("DTSTART:20261020T140000Z\r\nDTEND:20261020T150000Z\r\nSTATUS:CANCELLED"))).toEqual([]);
  });
});

describe("secret storage", () => {
  it("round-trips and is not plaintext", () => {
    const pw = randomUUID(); const s = seal({ password: pw }); expect(s).not.toContain(pw.slice(0, 8)); expect(open(s)).toEqual({ password: pw });
  });
  it("rejects tampering", () => { const s = seal({ a: 1 }).split("."); s[2] = Buffer.from("x").toString("base64url"); expect(() => open(s.join("."))).toThrow(); });
});
