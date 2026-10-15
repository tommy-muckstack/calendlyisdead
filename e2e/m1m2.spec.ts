import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
const shots = "research/ours";
const tz = "America/New_York";
const login = async (page: Page) => { await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click(); await expect(page.getByRole("heading", { name: "Event types" })).toBeVisible(); };
const slots = async (page: Page, slug: string, from: string, to: string) => (await (await page.request.get(`api/slots?user=demo&slug=${slug}&from=${from}&to=${to}&tz=${tz}`)).json()).slots as Record<string, string[]>;
const nyTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
const mockEvents = () => JSON.parse(fs.readFileSync(".data/e2e/mock-calendar.json", "utf8")).events as any[];
const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

test.describe.serial("calendar sync and M2", () => {
  test("connect a calendar: its busy time blocks slots, bookings are written and removed", async ({ page }) => {
    await login(page);
    await page.goto("app/calendars");
    await page.getByRole("button", { name: "+ Demo calendar" }).click();
    await expect(page.getByTestId("connection")).toBeVisible();
    await expect(page.getByLabel("Add new bookings to")).not.toHaveValue("");
    await expect(page.getByLabel("Work (mock) (primary)")).toBeChecked();
    await page.screenshot({ path: `${shots}/10-calendars.png` });
    const s = await slots(page, "30min", day(2), day(12));
    const all = Object.values(s).flat();
    expect(all.length).toBeGreaterThan(0);
    expect(all.map(nyTime)).not.toContain("12:00"); expect(all.map(nyTime)).not.toContain("12:30");
    // un-check the conflict calendar and noon comes back
    await page.getByLabel("Work (mock) (primary)").uncheck();
    await expect.poll(async () => Object.values(await slots(page, "30min", day(2), day(12))).flat().map(nyTime)).toContain("12:00");
    await page.getByLabel("Work (mock) (primary)").check();
    await expect.poll(async () => Object.values(await slots(page, "30min", day(2), day(12))).flat().map(nyTime)).not.toContain("12:00");
    // book -> event lands in the add-to calendar
    const start = all[all.length - 1];
    const r = await page.request.post("api/bookings", { data: { username: "demo", slug: "30min", start, name: "Grace", email: "grace@example.com", tz } });
    expect(r.status()).toBe(200); const { uid } = await r.json();
    expect(mockEvents().some(e => e.id === `mock-${uid}` && e.start === start && e.calendarId === "work")).toBe(true);
    await page.goto(`booking/${uid}`); await expect(page.getByText(/meet\.example\.invalid/)).toBeVisible();
    await page.request.post(`api/bookings/${uid}/cancel`, { data: { reason: "test" } });
    expect(mockEvents().some(e => e.id === `mock-${uid}`)).toBe(false);
  });

  test("custom invitee questions: added in the editor, shown and enforced on the booking page", async ({ page }) => {
    await login(page);
    await page.getByTestId("event-type").filter({ hasText: "Deep dive" }).click();
    await page.getByRole("button", { name: /Invitee questions/ }).click();
    await page.getByRole("button", { name: "+ Add question" }).click();
    await page.getByLabel("Question 1", { exact: true }).fill("Company");
    await page.getByTestId("question").getByLabel("Required").check();
    await expect(page.getByRole("status")).toHaveText("Saved");
    await page.screenshot({ path: `${shots}/11-editor-questions.png` });
    const s = await slots(page, "deep-dive", day(2), day(20)); const start = Object.values(s).flat()[0];
    const bad = await page.request.post("api/bookings", { data: { username: "demo", slug: "deep-dive", start, name: "Lin", email: "lin@example.com", tz } });
    expect(bad.status()).toBe(400);
    await page.goto(`demo/deep-dive?date=${start.slice(0, 10)}&slot=${encodeURIComponent(start)}&tz=${tz}`);
    await expect(page.getByLabel("Company *")).toBeVisible();
    await page.getByLabel("Name").fill("Lin"); await page.getByLabel("Email", { exact: true }).fill("lin@example.com"); await page.getByLabel("Company *").fill("Acme");
    await page.screenshot({ path: `${shots}/12-booking-question.png` });
    await page.getByRole("button", { name: "Book it" }).click();
    await expect(page.getByTestId("confirm-heading")).toHaveText("You're booked");
  });

  test("multiple schedules, holidays and daily limits", async ({ page }) => {
    await login(page);
    // a Monday-only schedule assigned to deep-dive
    const sc = await (await page.request.post("api/schedules", { data: { name: "Mondays" } })).json();
    const mon = { 1: [{ start: "10:00", end: "12:00" }] };
    expect((await page.request.put(`api/schedules/${sc.id}`, { data: { weekly: mon, timezone: tz } })).status()).toBe(200);
    const ets = await page.request.get("app"); expect(ets.ok()).toBe(true);
    const r = await page.request.patch(`api/event-types/demo-60`, { data: { scheduleId: sc.id } }); expect(r.status()).toBe(200);
    const s = await slots(page, "deep-dive", day(1), day(21));
    for (const d of Object.keys(s)) expect(new Date(d + "T12:00:00Z").getUTCDay()).toBe(1);
    expect(Object.keys(s).length).toBeGreaterThan(0);
    // holidays on the default schedule: Thanksgiving (Thu 26 Nov 2026) closes, the day before stays open
    const def = (await page.request.get("app/availability")).ok(); expect(def).toBe(true);
    expect((await page.request.put(`api/schedules/demo-schedule`, { data: { holidayCountry: "US" } })).status()).toBe(200);
    const h = await slots(page, "30min", "2026-11-25", "2026-11-26");
    expect(h["2026-11-26"]).toBeUndefined(); expect(h["2026-11-25"]?.length).toBeGreaterThan(0);
    // daily limit of 1: after one booking the day disappears
    await page.request.patch(`api/event-types/demo-30`, { data: { maxPerDay: 1 } });
    const s2 = await slots(page, "30min", day(3), day(14)); const d0 = Object.keys(s2).sort()[0];
    const b = await page.request.post("api/bookings", { data: { username: "demo", slug: "30min", start: s2[d0][0], name: "Max", email: "max@example.com", tz } });
    expect(b.status()).toBe(200);
    expect((await slots(page, "30min", d0, d0))[d0]).toBeUndefined();
    await page.request.patch(`api/event-types/demo-30`, { data: { maxPerDay: null } });
    expect((await slots(page, "30min", d0, d0))[d0]?.length).toBeGreaterThan(0);
    await page.goto("app/availability");
    await expect(page.getByRole("tab", { name: "Mondays" })).toBeVisible();
    await page.getByRole("tab", { name: /Working hours/ }).click();
    await expect(page.getByLabel("Holiday calendar")).toHaveValue("US");
    await page.screenshot({ path: `${shots}/13-schedules-holidays.png`, fullPage: true });
  });
});
