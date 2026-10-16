import { expect, test } from "@playwright/test";
import { DateTime } from "luxon";

for (const width of [1440, 390]) {
  test.describe(`booking date ranges at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, timezoneId: "America/New_York" });
    let event: { id: string; title: string; slug: string }, bookingUid: string | undefined, templateId: string | undefined;
    test.beforeEach(async ({ page }) => {
      bookingUid = undefined; templateId = undefined;
      await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click();
      const created = await page.request.post("api/event-types"); expect(created.ok()).toBeTruthy(); event = await created.json();
      event.title = `Date range ${width} ${Date.now()}`;
      expect((await page.request.patch(`api/event-types/${event.id}`, { data: { title: event.title, minNoticeMin: 0 } })).ok()).toBeTruthy(); await page.reload();
    });
    test.afterEach(async ({ page }) => {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      if (bookingUid) await page.request.post(`api/bookings/${bookingUid}/cancel`, { data: { reason: "Local QA cleanup" } });
      if (templateId) await page.request.delete(`api/event-types/${templateId}`);
      await page.request.delete(`api/event-types/${event.id}`);
    });
    test("saves weekdays and restores the chosen range after reopening", async ({ page }, info) => {
      await page.getByRole("button", { name: `Edit ${event.title}`, exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit event type" });
      await editor.getByRole("button", { name: /^Availability/ }).click(); await editor.getByLabel("Days into the future", { exact: true }).fill("4"); await editor.getByLabel("Count days as").selectOption("weekdays");
      await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.locator("footer").getByRole("status")).toHaveText("Changes saved");
      await page.reload(); await page.getByRole("button", { name: `Edit ${event.title}`, exact: true }).click(); await editor.getByRole("button", { name: /^Availability/ }).click();
      await expect(editor.getByLabel("Days into the future", { exact: true })).toHaveValue("4"); await expect(editor.getByLabel("Count days as")).toHaveValue("weekdays");
      await page.screenshot({ path: info.outputPath("date-range-weekdays.png") });
      await info.attach("date-range-styles.json", { contentType: "application/json", body: JSON.stringify(await editor.getByLabel("Date range", { exact: true }).evaluate(element => {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color, padding: style.padding, width: rect.width, x: rect.x };
      })) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
    test("saves fixed dates, hides outside dates and completes an invitee booking across midnight", async ({ page }, info) => {
      const start = DateTime.now().setZone("America/New_York").plus({ weeks: 2 }).startOf("week").set({ hour: 16 }), day = start.toISODate()!, local = start.setZone("Asia/Tokyo");
      await page.getByRole("button", { name: `Edit ${event.title}`, exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit event type" });
      await editor.getByRole("button", { name: /^Availability/ }).click(); await editor.getByLabel("Date range", { exact: true }).selectOption("fixed");
      await editor.getByLabel("Start date", { exact: true }).fill(day); await editor.getByLabel("End date", { exact: true }).fill(day);
      await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.locator("footer").getByRole("status")).toHaveText("Changes saved");
      await page.screenshot({ path: info.outputPath("date-range-fixed.png") });
      const rejected = await page.request.post("api/bookings", { data: { username: "demo", slug: event.slug, start: start.plus({ days: 1 }).toUTC().toISO(), name: "Range QA", email: "range-qa@example.invalid", tz: "Asia/Tokyo" } });
      expect(rejected.status()).toBe(409);
      await page.goto(`demo/${event.slug}?${new URLSearchParams({ month: local.toFormat("yyyy-MM"), date: local.toISODate()!, tz: "Asia/Tokyo" })}`);
      await page.getByRole("button", { name: local.toFormat("h:mm a"), exact: true }).click(); await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByLabel("Name", { exact: true }).fill("Range QA"); await page.getByLabel("Email", { exact: true }).fill("range-qa@example.invalid");
      const submitted = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/bookings"));
      await page.getByRole("button", { name: "Book it", exact: true }).click(); const response = await submitted; expect(response.ok()).toBeTruthy(); bookingUid = (await response.json()).uid;
      await expect(page.getByTestId("confirm-heading")).toHaveText("You're booked");
    });
    test("permits a far-future invitee slot after saving indefinite availability", async ({ page }) => {
      await page.getByRole("button", { name: `Edit ${event.title}`, exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit event type" });
      await editor.getByRole("button", { name: /^Availability/ }).click(); await editor.getByLabel("Date range", { exact: true }).selectOption("indefinite");
      await expect(editor.getByLabel("Days into the future", { exact: true })).toHaveCount(0); await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.locator("footer").getByRole("status")).toHaveText("Changes saved");
      const start = DateTime.now().setZone("America/New_York").plus({ years: 3 }).startOf("week").set({ hour: 9 });
      await page.goto(`demo/${event.slug}?${new URLSearchParams({ month: start.toFormat("yyyy-MM"), date: start.toISODate()!, tz: "America/New_York" })}`);
      await expect(page.getByRole("button", { name: "9:00 AM", exact: true })).toBeEnabled();
    });
    test("validates fixed dates and retains the draft through save failure and retry", async ({ page }) => {
      await page.getByRole("button", { name: `Edit ${event.title}`, exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit event type" });
      await editor.getByRole("button", { name: /^Availability/ }).click(); await editor.getByLabel("Date range", { exact: true }).selectOption("fixed");
      await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("Date range");
      await editor.getByLabel("Start date", { exact: true }).fill("2027-12-04"); await editor.getByLabel("End date", { exact: true }).fill("2027-12-03");
      await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("End date");
      await editor.getByLabel("End date", { exact: true }).fill("2027-12-05"); await page.route(`**/api/event-types/${event.id}`, route => route.fulfill({ status: 503, json: { error: "unavailable" } }));
      await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("could not be confirmed"); await expect(editor.getByLabel("Start date", { exact: true })).toHaveValue("2027-12-04");
      await page.unroute(`**/api/event-types/${event.id}`); await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.locator("footer").getByRole("status")).toHaveText("Changes saved");
    });
    test("shows legacy managed locks on all date-range controls", async ({ page }) => {
      const slug = `range-${width}-${Date.now()}`; const created = await page.request.post("api/teams", { data: { name: "Range QA team", slug } }); expect(created.ok()).toBeTruthy(); const team = await created.json();
      const template = await (await page.request.post(`api/teams/${team.id}/event-types`, { data: { kind: "managed", title: `Managed ${slug}` } })).json(); templateId = template.id;
      expect((await page.request.patch(`api/event-types/${template.id}`, { data: { rangeDays: 17, lockedFields: ["rangeDays"] } })).ok()).toBeTruthy();
      expect((await page.request.post(`api/teams/${team.id}/event-types/${template.id}/assign`, { data: { userIds: ["demo-user"] } })).ok()).toBeTruthy();
      await page.goto("app"); await page.getByRole("button", { name: `Edit Managed ${slug}`, exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit event type" });
      await editor.getByRole("button", { name: /^Availability/ }).click(); await expect(editor.getByLabel("Date range", { exact: true })).toBeDisabled();
      await expect(editor.getByLabel("Days into the future", { exact: true })).toHaveValue("17"); await expect(editor.getByLabel("Days into the future", { exact: true })).toBeDisabled(); await expect(editor.getByLabel("Count days as")).toBeDisabled();
    });
  });
}
