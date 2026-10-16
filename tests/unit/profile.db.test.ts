import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { MAX_PHOTO_DATA_LENGTH } from "../../lib/profile";

const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
vi.mock("@/auth", () => ({ requireUser: auth }));
vi.mock("../../lib/calendars", () => ({ externalBusy: async () => ({ busy: [], errors: [] }), writeEvent: async () => null, removeEvent: async () => {} }));
vi.mock("../../lib/email", () => ({ sendMail: async () => {} }));
vi.mock("../../lib/workflows", () => ({ onBooked: async () => {}, onCancelled: async () => {} }));
vi.mock("../../lib/conferencing", () => ({ confFor: () => null, meetingUrlFor: async () => null }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, schema: typeof import("../../lib/db/schema");
let profile: typeof import("../../app/api/settings/profile/route");
const edit = (data: unknown) => profile.PATCH(new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify(data) }));
const read = async () => (await profile.GET()).json();
const picture = async (format: "png" | "jpeg" | "webp" | "gif" = "png", width = 120, height = 160) =>
  `data:image/${format};base64,${(await sharp({ create: { width, height, channels: 3, background: "#006bff" } }).toFormat(format).toBuffer()).toString("base64")}`;
const tz = "America/New_York", day = DateTime.now().setZone(tz).plus({ months: 1 }).startOf("month");

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-profile-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); schema = database.schema;
  profile = await import("../../app/api/settings/profile/route");
  await db.update(schema.schedules).set({ timezone: tz, weekly: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(d => [d, [{ start: "00:00", end: "24:00" }]])) });
});
beforeEach(async () => {
  auth.mockResolvedValue({ id: "demo-user" }); await db.delete(schema.bookings);
  await db.update(schema.users).set({ name: "Demo Host", image: null, welcomeMessage: "Pick a meeting type to see open times.", timezone: tz, meetingLimitPerDay: null, meetingLimitPerWeek: null, meetingLimitPerMonth: null }).where(eq(schema.users.id, "demo-user"));
  await db.update(schema.eventTypes).set({ minNoticeMin: 0, bufferAfterMin: 0, rangeDays: 730 });
});
afterEach(() => vi.restoreAllMocks());

describe("profile persistence and identity boundaries", () => {
  it("saves name, welcome message and timezone without changing login identity or booking links", async () => {
    const [before] = await db.select().from(schema.users).where(eq(schema.users.id, "demo-user"));
    expect((await edit({ name: "  Renée 李  ", welcomeMessage: "Hello\nWelcome", timezone: "Europe/Paris" })).status).toBe(200);
    expect(await read()).toEqual({ name: "Renée 李", welcomeMessage: "Hello\nWelcome", timezone: "Europe/Paris", image: null, username: "demo" });
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, "demo-user"));
    for (const field of ["id", "email", "emailVerified", "firebaseUid", "username", "brandColor", "logoUrl"] as const) expect(after[field]).toEqual(before[field]);
    expect((await db.select().from(schema.schedules).where(eq(schema.schedules.userId, "demo-user"))).every((s: { timezone: string }) => s.timezone === tz)).toBe(true);
  });
  it.each([{ name: "" }, { name: "  " }, { name: "x".repeat(121) }, { welcomeMessage: "x".repeat(1001) }, { timezone: "" }, { timezone: "Mars/Olympus" }, { timezone: " UTC " }, { image: "https://example.invalid/avatar.png" }])("rejects invalid profile fields without partial writes: %j", async bad => {
    expect((await edit({ welcomeMessage: "Must not save", ...bad })).status).toBe(400);
    expect((await read()).welcomeMessage).toBe("Pick a meeting type to see open times.");
  });
  it("rejects malformed/empty payloads and fields belonging to authentication, another user or limits", async () => {
    for (const data of [{}, null, [], { userId: "demo-mate", name: "Other" }, { email: "other@example.invalid", name: "Other" }, { firebaseUid: "other" }, { username: "new-link" }, { meetingLimitPerDay: 10 }]) expect((await edit(data)).status).toBe(400);
    expect((await profile.PATCH(new NextRequest("http://localhost", { method: "PATCH", body: "{" }))).status).toBe(400);
    expect((await read()).name).toBe("Demo Host");
  });
  it("requires authentication and cannot target another user's profile", async () => {
    auth.mockResolvedValue(null); expect((await profile.GET()).status).toBe(401); expect((await edit({ name: "No" })).status).toBe(401);
    auth.mockResolvedValue({ id: "demo-user" });
    expect((await profile.PATCH(new NextRequest("http://localhost?userId=demo-mate", { method: "PATCH", body: JSON.stringify({ name: "Changed" }) }))).status).toBe(200);
    expect((await db.select().from(schema.users).where(eq(schema.users.id, "demo-mate")))[0].name).toBe("Sam Rivera");
  });
  it("reports missing users and database failures without false success", async () => {
    auth.mockResolvedValue({ id: "missing" }); expect((await profile.GET()).status).toBe(404); expect((await edit({ name: "Missing" })).status).toBe(404);
    auth.mockResolvedValue({ id: "demo-user" }); vi.spyOn(db, "update").mockImplementationOnce(() => { throw new Error("test write failure"); });
    expect((await edit({ name: "Not saved" })).status).toBe(500); expect((await read()).name).toBe("Demo Host");
  });
  it.each(["UTC", "US/Eastern", "Asia/Kathmandu"])("accepts a valid timezone or alias: %s", async timezone => {
    expect((await edit({ timezone })).status).toBe(200); expect((await read()).timezone).toBe(timezone);
  });
  it("uses the edited timezone in host meeting date filters without moving the booked instant", async () => {
    const start = day.plus({ hours: 0, minutes: 30 }).toUTC();
    await db.insert(schema.bookings).values({ uid: "time-display", eventTypeId: "demo-30", hostId: "demo-user", start: start.toJSDate(), end: start.plus({ minutes: 30 }).toJSDate(), inviteeName: "Test", inviteeEmail: "test@example.invalid", inviteeTz: tz });
    await edit({ timezone: "America/Los_Angeles" });
    const { listHostMeetings, MeetingFilters } = await import("../../lib/meetings"); const date = start.setZone("America/Los_Angeles").toISODate()!;
    const result = await listHostMeetings("demo-user", (await read()).timezone, MeetingFilters.parse({ status: "all", from: date, to: date }));
    expect(result.total).toBe(1); expect(result.rows[0].start.toISOString()).toBe(start.toJSDate().toISOString());
  });
  it("rechecks an account-timezone change committed after booking preflight", async () => {
    await db.update(schema.users).set({ meetingLimitPerDay: 1 }).where(eq(schema.users.id, "demo-user"));
    const start = day.plus({ hours: 23 });
    await db.insert(schema.bookings).values({ uid: "earlier", eventTypeId: "demo-30", hostId: "demo-user", start: start.toJSDate(), end: start.plus({ minutes: 30 }).toJSDate(), inviteeName: "Test", inviteeEmail: "test@example.invalid", inviteeTz: tz });
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementationOnce(async (...args: unknown[]) => { expect((await edit({ timezone: "UTC" })).status).toBe(200); return transaction(...args); });
    await expect((await import("../../lib/booking")).createBooking({ username: "demo", slug: "deep-dive", start: day.plus({ days: 1 }).toUTC().toISO()!, name: "Test", email: "test@example.invalid", tz })).rejects.toThrow("slot_unavailable");
    expect(await db.select().from(schema.bookings)).toHaveLength(1);
  });
  it("renders the saved public name, photo and escaped welcome text and permits hiding the message", async () => {
    await edit({ name: "New Host", welcomeMessage: "<script>not code</script>\nNext line", image: await picture() });
    const HostPage = (await import("../../app/[user]/page")).default;
    const html = renderToStaticMarkup(await HostPage({ params: Promise.resolve({ user: "demo" }) }));
    expect(html).toContain("New Host"); expect(html).toContain("data:image/png;base64,"); expect(html).toContain("&lt;script&gt;not code&lt;/script&gt;"); expect(html).not.toContain("<script>not code");
    await edit({ welcomeMessage: "" }); const hidden = renderToStaticMarkup(await HostPage({ params: Promise.resolve({ user: "demo" }) }));
    expect(hidden).not.toContain("Pick a meeting type"); expect(hidden).not.toContain("Next line");
    expect((await (await import("../../lib/booking")).loadEvent("demo", "30min"))?.ownerName).toBe("New Host");
  });
});

describe("profile photo validation and normalization", () => {
  it.each(["png", "jpeg", "webp", "gif"] as const)("decodes %s and stores a bounded 256px PNG", async format => {
    expect((await edit({ image: await picture(format) })).status).toBe(200);
    const image = (await read()).image; expect(image.startsWith("data:image/png;base64,")).toBe(true); expect(image.length).toBeLessThan(MAX_PHOTO_DATA_LENGTH);
    const metadata = await sharp(Buffer.from(image.split(",")[1], "base64")).metadata(); expect(metadata).toMatchObject({ format: "png", width: 256, height: 256 });
  });
  it("strips input metadata and normalizes orientation", async () => {
    const jpeg = await sharp({ create: { width: 120, height: 240, channels: 3, background: "#e76e50" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined(); await edit({ image: `data:image/jpeg;base64,${jpeg.toString("base64")}` });
    const result = await sharp(Buffer.from((await read()).image.split(",")[1], "base64")).metadata();
    expect(result.exif).toBeUndefined(); expect(result.icc).toBeUndefined(); expect(result.orientation).toBeUndefined(); expect(result).toMatchObject({ width: 256, height: 256 });
  });
  it("rejects tiny, corrupt, mislabeled and SVG inputs without changing the old photo or other fields", async () => {
    await edit({ image: await picture() }); const previous = await read();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>').toString("base64");
    for (const image of [await picture("png", 89, 100), "data:image/png;base64,dGVzdA==", (await picture("jpeg")).replace("image/jpeg", "image/png"), `data:image/png;base64,${svg}`, `data:image/svg+xml;base64,${svg}`, "data:image/png;base64," + "A".repeat(MAX_PHOTO_DATA_LENGTH)]) {
      expect((await edit({ image, name: "Must not save" })).status).toBe(400); expect(await read()).toEqual(previous);
    }
  });
  it("removes a saved photo without replacing it with the old provider image", async () => {
    await edit({ image: await picture() }); expect((await edit({ image: null })).status).toBe(200); expect((await read()).image).toBeNull();
  });
});
