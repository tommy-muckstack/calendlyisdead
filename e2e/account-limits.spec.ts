import { expect, test } from "@playwright/test";

const clear = { meetingLimitPerDay: null, meetingLimitPerWeek: null, meetingLimitPerMonth: null };
for (const width of [1440, 390]) {
  test.describe(`account meeting limits at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click();
      expect((await page.request.patch("api/settings/meeting-limits", { data: clear })).ok()).toBeTruthy();
      await page.goto("app/availability/advanced");
    });
    test.afterEach(async ({ page }) => { await page.request.patch("api/settings/meeting-limits", { data: clear }); });

    test("automatically persists a monthly-only limit and its removal", async ({ page }, info) => {
      await page.getByLabel("Limit period", { exact: true }).selectOption("meetingLimitPerMonth");
      await page.getByRole("button", { name: "Add a meeting limit" }).click();
      await page.getByLabel("Monthly meeting limit", { exact: true }).fill("12");
      await expect(page.getByRole("status")).toHaveText("All changes saved");
      expect(await (await page.request.get("api/settings/meeting-limits")).json()).toMatchObject({ ...clear, meetingLimitPerMonth: 12 });
      await page.reload(); await expect(page.getByLabel("Monthly meeting limit", { exact: true })).toHaveValue("12");
      await expect(page.getByLabel("Daily meeting limit", { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath("account-monthly-limit.png") });
      await page.getByRole("button", { name: "Remove monthly meeting limit" }).click();
      await expect(page.getByRole("status")).toHaveText("All changes saved"); await page.reload();
      await expect(page.getByText("No account meeting limits.", { exact: true })).toBeVisible();
    });

    test("invalid input stays local and unsaved navigation requires a decision", async ({ page }, info) => {
      await page.getByRole("button", { name: "Add a meeting limit" }).click();
      await page.getByLabel("Daily meeting limit", { exact: true }).fill("0");
      await expect(page.getByRole("alert")).toContainText("Enter a whole number");
      expect(await (await page.request.get("api/settings/meeting-limits")).json()).toMatchObject(clear);
      page.once("dialog", async dialog => { expect(dialog.message()).toContain("not saved"); await dialog.dismiss(); });
      await page.getByRole("link", { name: "Close settings", exact: true }).click();
      await expect(page.getByLabel("Daily meeting limit", { exact: true })).toHaveValue("0");
      await page.screenshot({ path: info.outputPath("invalid-account-limit.png") });
    });

    test("a failed automatic save retains input and can be retried", async ({ page }) => {
      await page.route("**/api/settings/meeting-limits", async route => {
        if (route.request().method() === "PATCH") await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "save_failed" }) }); else await route.continue();
      });
      await page.getByRole("button", { name: "Add a meeting limit" }).click();
      await page.getByLabel("Daily meeting limit", { exact: true }).fill("2");
      await expect(page.getByRole("alert")).toContainText("Save could not be confirmed");
      await expect(page.getByLabel("Daily meeting limit", { exact: true })).toHaveValue("2");
      await page.unroute("**/api/settings/meeting-limits"); await page.getByRole("button", { name: "Retry saving" }).click();
      await expect(page.getByRole("status")).toHaveText("All changes saved");
      expect(await (await page.request.get("api/settings/meeting-limits")).json()).toMatchObject({ meetingLimitPerDay: 2 });
    });

    test("event settings show account limits separately with a link to manage them", async ({ page }, info) => {
      await page.request.patch("api/settings/meeting-limits", { data: { meetingLimitPerDay: 3, meetingLimitPerMonth: 20 } });
      const response = await page.request.post("api/event-types"); expect(response.ok()).toBeTruthy(); const event = await response.json();
      const title = `Host limit ${width} ${Date.now()}`; await page.request.patch(`api/event-types/${event.id}`, { data: { title } });
      await page.goto("app"); await page.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Edit event type" }); await editor.getByRole("button", { name: /^Limits and buffers/ }).click();
      const hosts = editor.getByRole("region", { name: "Host meeting limits" });
      await expect(hosts.getByText("Daily: 3 · Weekly: No limit · Monthly: 20", { exact: true })).toBeVisible();
      await expect(hosts.getByRole("link", { name: "Manage your meeting limits (new tab)" })).toHaveAttribute("href", /app\/availability\/advanced$/);
      await expect(hosts.locator("input")).toHaveCount(0);
      await page.screenshot({ path: info.outputPath("event-host-limits.png") });
    });

    test("finishes queued automatic edits when leaving during a save", async ({ page }) => {
      let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let first = true;
      await page.route("**/api/settings/meeting-limits", async route => {
        if (route.request().method() === "PATCH" && first) { first = false; await held; }
        await route.continue();
      });
      try {
        await page.getByRole("button", { name: "Add a meeting limit" }).click();
        await page.getByLabel("Daily meeting limit", { exact: true }).fill("2"); await expect(page.getByRole("status")).toHaveText("Saving…");
        await page.getByLabel("Daily meeting limit", { exact: true }).fill("5");
        page.once("dialog", dialog => dialog.accept()); await page.getByRole("link", { name: "Close settings", exact: true }).click();
        await expect(page).toHaveURL(/\/app$/); release();
        await expect.poll(async () => (await (await page.request.get("api/settings/meeting-limits")).json()).meetingLimitPerDay).toBe(5);
      } finally { release(); }
    });

    test("removes a limit even when its earlier successful write had an unconfirmed response", async ({ page }) => {
      await page.route("**/api/settings/meeting-limits", async route => {
        if (route.request().method() === "PATCH") {
          const committed = await route.fetch(); expect(committed.ok()).toBeTruthy();
          await route.fulfill({ status: 502, body: "Response lost" });
        } else await route.continue();
      });
      await page.getByRole("button", { name: "Add a meeting limit" }).click(); await page.getByLabel("Daily meeting limit", { exact: true }).fill("2");
      await expect(page.getByRole("alert")).toContainText("Save could not be confirmed");
      expect((await (await page.request.get("api/settings/meeting-limits")).json()).meetingLimitPerDay).toBe(2);
      await page.unroute("**/api/settings/meeting-limits"); await page.getByRole("button", { name: "Remove daily meeting limit" }).click();
      await expect(page.getByRole("status")).toHaveText("All changes saved");
      expect((await (await page.request.get("api/settings/meeting-limits")).json()).meetingLimitPerDay).toBeNull();
    });
  });
}
