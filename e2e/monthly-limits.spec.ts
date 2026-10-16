import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test.describe(`monthly meeting limits at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click();
      await expect(page.getByRole("heading", { name: "Scheduling", exact: true })).toBeVisible();
    });

    test("saves, reopens and clears a personal monthly cap in Limits and buffers", async ({ page }, info) => {
      const response = await page.request.post("api/event-types"); expect(response.ok()).toBeTruthy(); const event = await response.json();
      const title = `Monthly ${width} ${Date.now()}`;
      await page.request.patch(`api/event-types/${event.id}`, { data: { title } }); await page.reload();
      await page.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Edit event type" });
      await editor.getByRole("button", { name: /^Limits and buffers/ }).click();
      const monthly = editor.getByLabel("Max bookings per month (blank = no limit)", { exact: true });
      await monthly.fill("3"); await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(editor.locator("footer").getByRole("status")).toHaveText("Changes saved");
      await page.screenshot({ path: info.outputPath("monthly-limit.png") });
      await editor.getByRole("button", { name: "Close", exact: true }).click(); await page.reload();
      await page.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
      await editor.getByRole("button", { name: /^Limits and buffers/ }).click(); await expect(monthly).toHaveValue("3");
      await monthly.fill(""); const saved = page.waitForResponse(r => r.request().method() === "PATCH" && r.url().endsWith(`/api/event-types/${event.id}`));
      await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      const cleared = await saved; expect(cleared.ok()).toBeTruthy(); expect((await cleared.json()).maxPerMonth).toBeNull();
    });

    test("invalid counts keep the draft and do not send a save", async ({ page }, info) => {
      await page.getByTestId("event-type").first().click(); const editor = page.getByRole("dialog", { name: "Edit event type" });
      await editor.getByRole("button", { name: /^Limits and buffers/ }).click();
      let patches = 0; page.on("request", r => { if (r.method() === "PATCH") patches++; });
      const monthly = editor.getByLabel("Max bookings per month (blank = no limit)", { exact: true });
      await monthly.fill("0"); await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(editor.getByRole("alert")).toContainText("Monthly limit"); await expect(editor.getByRole("alert")).toBeFocused();
      await expect(monthly).toHaveValue("0"); expect(patches).toBe(0);
      await page.screenshot({ path: info.outputPath("invalid-monthly-limit.png") });
    });

    test("team admins can edit existing event limits without first duplicating the event", async ({ page }) => {
      const slug = `monthly-${width}-${Date.now()}`;
      const response = await page.request.post("api/teams", { data: { name: "Monthly team", slug } }); expect(response.ok()).toBeTruthy(); const team = await response.json();
      const created = await page.request.post(`api/teams/${team.id}/event-types`, { data: { kind: "round_robin", title: "Rotating meeting" } }); expect(created.ok()).toBeTruthy(); const event = await created.json();
      await page.goto("app/teams");
      const card = page.getByTestId(`team-${slug}`).getByTestId("team-et");
      await card.getByRole("button", { name: "Edit", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Edit event type" });
      await editor.getByRole("button", { name: /^Limits and buffers/ }).click();
      await editor.getByLabel("Max bookings per month (blank = no limit)", { exact: true }).fill("4");
      const saved = page.waitForResponse(r => r.request().method() === "PATCH" && r.url().endsWith(`/api/event-types/${event.id}`));
      await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      expect((await (await saved).json()).maxPerMonth).toBe(4);
      await editor.getByRole("button", { name: "Close", exact: true }).click(); await page.reload();
      await expect(card).toHaveCount(1); await card.getByRole("button", { name: "Edit", exact: true }).click();
      await editor.getByRole("button", { name: /^Limits and buffers/ }).click();
      await expect(editor.getByLabel("Max bookings per month (blank = no limit)", { exact: true })).toHaveValue("4");
    });
  });
}
