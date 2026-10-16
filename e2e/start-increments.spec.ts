import { expect, test } from "@playwright/test";
import { DateTime } from "luxon";

for (const width of [1440, 390]) {
  test.describe(`start time increments at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    let event: { id: string; title: string; slug: string }, bookingUid: string | undefined, templateId: string | undefined;
    test.beforeEach(async ({ page }) => {
      bookingUid = undefined; templateId = undefined;
      await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click();
      const created = await page.request.post("api/event-types"); expect(created.ok()).toBeTruthy(); event = await created.json();
      event.title = `Increments ${width} ${Date.now()}`;
      expect((await page.request.patch(`api/event-types/${event.id}`, { data: { title: event.title, durationMin: 45, minNoticeMin: 0 } })).ok()).toBeTruthy();
      await page.reload(); await page.getByRole("button", { name: `Edit ${event.title}`, exact: true }).click();
    });
    test.afterEach(async ({ page }) => {
      if (bookingUid) await page.request.post(`api/bookings/${bookingUid}/cancel`, { data: { reason: "Local QA cleanup" } });
      if (templateId) await page.request.delete(`api/event-types/${templateId}`);
      await page.request.delete(`api/event-types/${event.id}`);
    });

    test("saves a preset independently of duration and books a quarter-hour start", async ({ page }, info) => {
      const editor = page.getByRole("dialog", { name: "Edit event type" });
      await editor.getByRole("button", { name: /^Booking page options/ }).click();
      const interval = editor.getByLabel("Start time increments", { exact: true }); await expect(interval).toHaveValue("30");
      await interval.selectOption("15"); await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(editor.locator("footer").getByRole("status")).toHaveText("Changes saved");
      await page.screenshot({ path: info.outputPath("start-increments.png") });
      await info.attach("increment-control-styles.json", { contentType: "application/json", body: JSON.stringify(await interval.evaluate(element => {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        return { fontFamily: style.fontFamily, fontSize: style.fontSize, color: style.color, padding: style.padding, width: rect.width, height: rect.height };
      })) });
      await editor.getByRole("button", { name: /^Basics/ }).click(); await editor.getByLabel("Duration (minutes)", { exact: true }).fill("60");
      await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.locator("footer").getByRole("status")).toHaveText("Changes saved");
      await editor.getByRole("button", { name: "Close", exact: true }).click(); await page.reload();
      await page.getByRole("button", { name: `Edit ${event.title}`, exact: true }).click();
      await editor.getByRole("button", { name: /^Booking page options/ }).click(); await expect(interval).toHaveValue("15");
      const day = DateTime.now().setZone("America/New_York").plus({ weeks: 2 }).startOf("week");
      await page.goto(`demo/${event.slug}?month=${day.toFormat("yyyy-MM")}&date=${day.toISODate()}&tz=America%2FNew_York`);
      await page.getByRole("button", { name: "9:15 AM", exact: true }).click();
      await page.screenshot({ path: info.outputPath("quarter-hour-slots.png") });
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(page.getByText(/9:15 AM – 10:15 AM/)).toBeVisible();
      await page.getByLabel("Name", { exact: true }).fill("Increment QA"); await page.getByLabel("Email", { exact: true }).fill("increment-qa@example.invalid");
      const booked = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/bookings"));
      await page.getByRole("button", { name: "Book it", exact: true }).click(); const response = await booked; expect(response.ok()).toBeTruthy(); bookingUid = (await response.json()).uid;
      await expect(page.getByTestId("confirm-heading")).toHaveText("You're booked");
    });

    test("validates custom increments, preserves the draft and reopens a saved custom value", async ({ page }, info) => {
      const editor = page.getByRole("dialog", { name: "Edit event type" }); await editor.getByRole("button", { name: /^Booking page options/ }).click();
      await editor.getByLabel("Start time increments", { exact: true }).selectOption("custom");
      const custom = editor.getByLabel("Custom increment (minutes)", { exact: true }); await custom.fill("4");
      let saves = 0; page.on("request", request => { if (request.method() === "PATCH") saves++; });
      await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("Start time increments");
      await expect(editor.getByRole("alert")).toBeFocused(); expect(saves).toBe(0); await expect(custom).toHaveValue("4");
      await page.screenshot({ path: info.outputPath("increment-validation.png") });
      await custom.fill("70"); await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(editor.locator("footer").getByRole("status")).toHaveText("Changes saved"); await editor.getByRole("button", { name: "Close", exact: true }).click();
      await page.reload(); await page.getByRole("button", { name: `Edit ${event.title}`, exact: true }).click();
      await editor.getByRole("button", { name: /^Booking page options/ }).click(); await expect(custom).toHaveValue("70");
    });

    test("retains an increment after a failed save and allows retry", async ({ page }) => {
      const editor = page.getByRole("dialog", { name: "Edit event type" }); await editor.getByRole("button", { name: /^Booking page options/ }).click();
      await editor.getByLabel("Start time increments", { exact: true }).selectOption("5");
      await page.route(`**/api/event-types/${event.id}`, route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "save_failed" }) }));
      await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("Saving could not be confirmed");
      await expect(editor.getByLabel("Start time increments", { exact: true })).toHaveValue("5");
      await page.unroute(`**/api/event-types/${event.id}`); await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(editor.locator("footer").getByRole("status")).toHaveText("Changes saved");
    });

    test("shows and enforces an administrator's managed increment lock", async ({ page }) => {
      const slug = `inc-${width}-${Date.now()}`;
      const created = await page.request.post("api/teams", { data: { name: "Increment QA team", slug } }); expect(created.ok()).toBeTruthy(); const team = await created.json();
      const template = await (await page.request.post(`api/teams/${team.id}/event-types`, { data: { kind: "managed", title: `Managed ${slug}` } })).json();
      templateId = template.id;
      expect((await page.request.patch(`api/event-types/${template.id}`, { data: { startIntervalMin: 45, lockedFields: ["startIntervalMin"] } })).ok()).toBeTruthy();
      expect((await page.request.post(`api/teams/${team.id}/event-types/${template.id}/assign`, { data: { userIds: ["demo-user"] } })).ok()).toBeTruthy();
      await page.goto("app/teams"); const card = page.getByTestId(`team-${slug}`).getByTestId("team-et");
      await expect(card.getByLabel("Start time increments", { exact: true })).toBeChecked();
      await page.goto("app"); await page.getByRole("button", { name: `Edit Managed ${slug}`, exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Edit event type" }); await editor.getByRole("button", { name: /^Booking page options/ }).click();
      await expect(editor.getByLabel("Start time increments", { exact: true })).toHaveValue("45"); await expect(editor.getByLabel("Start time increments", { exact: true })).toBeDisabled();
    });
  });
}
