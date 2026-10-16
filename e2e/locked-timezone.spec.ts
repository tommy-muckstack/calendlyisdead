import { expect, test } from "@playwright/test";
import { DateTime } from "luxon";

for (const width of [1440, 390]) {
  test.describe(`locked booking timezone at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, timezoneId: "America/New_York" });
    let event: { id: string; title: string; slug: string }, bookingUid: string | undefined, templateId: string | undefined;
    test.beforeEach(async ({ page }) => {
      bookingUid = undefined; templateId = undefined;
      await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click();
      const created = await page.request.post("api/event-types"); expect(created.ok()).toBeTruthy(); event = await created.json();
      event.title = `Timezone ${width} ${Date.now()}`;
      expect((await page.request.patch(`api/event-types/${event.id}`, { data: { title: event.title, minNoticeMin: 0 } })).ok()).toBeTruthy(); await page.reload();
    });
    test.afterEach(async ({ page }) => {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      if (bookingUid) await page.request.post(`api/bookings/${bookingUid}/cancel`, { data: { reason: "Local QA cleanup" } });
      if (templateId) await page.request.delete(`api/event-types/${templateId}`);
      await page.request.delete(`api/event-types/${event.id}`);
    });
    test("saves a locked zone and books the same instant across host/invitee midnight", async ({ page }, info) => {
      await page.getByRole("button", { name: `Edit ${event.title}`, exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit event type" });
      await editor.getByRole("button", { name: /^Booking page options/ }).click(); await editor.getByLabel("Lock the timezone", { exact: true }).check();
      await editor.getByLabel("Booking time zone", { exact: true }).selectOption("Asia/Tokyo"); await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(editor.locator("footer").getByRole("status")).toHaveText("Changes saved");
      await page.screenshot({ path: info.outputPath("locked-timezone-editor.png") });
      await info.attach("timezone-control-styles.json", { contentType: "application/json", body: JSON.stringify(await editor.getByLabel("Booking time zone", { exact: true }).evaluate(element => {
        const s = getComputedStyle(element), r = element.getBoundingClientRect(); return { fontFamily: s.fontFamily, fontSize: s.fontSize, padding: s.padding, color: s.color, width: r.width, height: r.height };
      })) });
      const start = DateTime.now().setZone("America/New_York").plus({ weeks: 2 }).startOf("week").set({ hour: 16 }), local = start.setZone("Asia/Tokyo");
      await page.goto(`demo/${event.slug}?${new URLSearchParams({ month: local.toFormat("yyyy-MM"), date: local.toISODate()!, tz: "Pacific/Honolulu" })}`);
      await expect(page.getByRole("combobox", { name: "Time zone", exact: true })).toHaveCount(0); await expect(page.getByTestId("booking-timezone")).toHaveText("Asia/Tokyo");
      await page.getByRole("button", { name: local.toFormat("h:mm a"), exact: true }).click(); await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(page.getByTestId("booking-timezone")).toHaveText("Asia/Tokyo"); await page.screenshot({ path: info.outputPath("locked-timezone-invitee.png") });
      await page.getByLabel("Name", { exact: true }).fill("Timezone QA"); await page.getByLabel("Email", { exact: true }).fill("timezone-qa@example.invalid");
      const submitted = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/bookings"));
      await page.getByRole("button", { name: "Book it", exact: true }).click(); const response = await submitted; expect(response.ok()).toBeTruthy(); bookingUid = (await response.json()).uid;
      expect(response.request().postDataJSON()).toMatchObject({ tz: "Asia/Tokyo", start: start.toUTC().toISO() }); await expect(page.getByTestId("confirm-heading")).toHaveText("You're booked");
    });
    test("unlocks a saved zone and restores the invitee picker", async ({ page }) => {
      expect((await page.request.patch(`api/event-types/${event.id}`, { data: { lockedTimezone: "Asia/Tokyo" } })).ok()).toBeTruthy(); await page.reload();
      await page.getByRole("button", { name: `Edit ${event.title}`, exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit event type" });
      await editor.getByRole("button", { name: /^Booking page options/ }).click(); await expect(editor.getByLabel("Booking time zone", { exact: true })).toHaveValue("Asia/Tokyo");
      await editor.getByLabel("Lock the timezone", { exact: true }).uncheck(); await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(editor.locator("footer").getByRole("status")).toHaveText("Changes saved"); await page.goto(`demo/${event.slug}?tz=America%2FNew_York`);
      const picker = page.getByRole("combobox", { name: "Time zone", exact: true }); await expect(picker).toHaveValue("America/New_York"); await picker.selectOption("UTC"); await expect(picker).toHaveValue("UTC");
    });
    test("retains the timezone draft after a failed save and supports retry", async ({ page }) => {
      await page.getByRole("button", { name: `Edit ${event.title}`, exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit event type" });
      await editor.getByRole("button", { name: /^Booking page options/ }).click(); await editor.getByLabel("Lock the timezone", { exact: true }).check(); await editor.getByLabel("Booking time zone", { exact: true }).selectOption("Asia/Tokyo");
      await page.route(`**/api/event-types/${event.id}`, route => route.fulfill({ status: 503, json: { error: "unavailable" } }));
      await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("could not be confirmed"); await expect(editor.getByLabel("Booking time zone", { exact: true })).toHaveValue("Asia/Tokyo");
      await page.unroute(`**/api/event-types/${event.id}`); await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.locator("footer").getByRole("status")).toHaveText("Changes saved");
    });
    test("requires refresh when the host changes the zone between page and availability loading", async ({ page }) => {
      expect((await page.request.patch(`api/event-types/${event.id}`, { data: { lockedTimezone: "Asia/Tokyo" } })).ok()).toBeTruthy();
      let changed = false;
      await page.route("**/api/slots?**", async route => { if (!changed) { changed = true; expect((await page.request.patch(`api/event-types/${event.id}`, { data: { lockedTimezone: "Europe/London" } })).ok()).toBeTruthy(); } await route.continue(); });
      const slot = DateTime.now().setZone("America/New_York").plus({ weeks: 2 }).startOf("week").set({ hour: 16 }).toUTC().toISO()!;
      await page.goto(`demo/${event.slug}?${new URLSearchParams({ slot })}`); await expect(page.getByRole("alert")).toContainText("time zone has changed");
      await expect(page.getByRole("button", { name: "Book it", exact: true })).toBeDisabled(); await page.getByRole("button", { name: "Refresh booking page", exact: true }).click();
      await expect(page.getByTestId("booking-timezone")).toHaveText("Europe/London"); await expect(page.getByRole("alert")).toHaveCount(0); await expect(page.getByRole("button", { name: "Book it", exact: true })).toBeEnabled();
    });
    test("shows a managed timezone lock and prevents the assigned host from changing it", async ({ page }) => {
      const slug = `tz-${width}-${Date.now()}`; const created = await page.request.post("api/teams", { data: { name: "Timezone QA team", slug } }); expect(created.ok()).toBeTruthy(); const team = await created.json();
      const template = await (await page.request.post(`api/teams/${team.id}/event-types`, { data: { kind: "managed", title: `Managed ${slug}` } })).json(); templateId = template.id;
      expect((await page.request.patch(`api/event-types/${template.id}`, { data: { lockedTimezone: "Asia/Tokyo", lockedFields: ["lockedTimezone"] } })).ok()).toBeTruthy();
      expect((await page.request.post(`api/teams/${team.id}/event-types/${template.id}/assign`, { data: { userIds: ["demo-user"] } })).ok()).toBeTruthy();
      await page.goto("app"); await page.getByRole("button", { name: `Edit Managed ${slug}`, exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit event type" });
      await editor.getByRole("button", { name: /^Booking page options/ }).click(); await expect(editor.getByLabel("Lock the timezone", { exact: true })).toBeDisabled();
      await expect(editor.getByLabel("Booking time zone", { exact: true })).toHaveValue("Asia/Tokyo"); await expect(editor.getByLabel("Booking time zone", { exact: true })).toBeDisabled();
    });
  });
}
