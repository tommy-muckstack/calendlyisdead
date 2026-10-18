import { expect, test } from "@playwright/test";
for (const width of [1440, 390]) test.describe(`Integrations at ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  test.beforeEach(async ({ page }) => { expect((await page.request.post("api/session/demo?who=host")).ok()).toBe(true); });
  test("filters, handles empty results and opens setup with the keyboard", async ({ page }, info) => {
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto("app/integrations"); const directory = page.getByRole("region", { name: "Integrations & apps" });
    await expect(directory.locator(".integration-card")).toHaveCount(7);
    await page.getByLabel("Search integrations", { exact: true }).fill("not-an-integration"); await expect(page.getByRole("heading", { name: "No integrations found" })).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click(); await page.getByLabel("Category", { exact: true }).selectOption("Calendars"); await expect(directory.locator(".integration-card")).toHaveCount(3);
    await page.screenshot({ path: info.outputPath("integrations-calendar-grid.png") });
    await info.attach("integrations-styles.json", { contentType: "application/json", body: JSON.stringify(await directory.evaluate(element => { const s = getComputedStyle(element), card = element.querySelector(".integration-card")!, c = getComputedStyle(card); return { fontFamily: s.fontFamily, fontSize: s.fontSize, width: element.getBoundingClientRect().width, cardPadding: c.padding, cardBorder: c.border, cardGap: getComputedStyle(element.querySelector(".integrations-grid")!).gap, overflow: document.documentElement.scrollWidth > innerWidth }; })) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "Google Calendar", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(page.getByRole("heading", { name: "Google Calendar", exact: true })).toBeVisible();
    await expect(page.getByText("New Google Calendar connections are unavailable on this deployment.", { exact: false })).toBeVisible();
    await page.getByRole("navigation", { name: "Automations sections" }).getByRole("link", { name: "My automations" }).click(); await expect(page).toHaveURL(/app\/workflows$/); expect(errors).toEqual([]);
  });
  test("reflects the actual destination without inventing conferencing connections", async ({ page }) => {
    await page.request.put("api/calendars/add-to", { data: { calendarId: "conference-calendar" } });
    await page.goto("app/integrations"); await page.getByLabel("Connected apps").check();
    await expect(page.getByRole("link", { name: "Google Calendar", exact: true })).toBeVisible(); await expect(page.getByRole("link", { name: "Google Meet", exact: true })).toBeVisible(); await expect(page.getByRole("link", { name: "Zoom", exact: true })).toHaveCount(0);
    expect((await page.request.put("api/calendars/add-to", { data: { calendarId: null } })).ok()).toBe(true); await page.reload(); await page.getByLabel("Connected apps").check();
    await expect(page.getByRole("link", { name: "Google Meet", exact: true })).toHaveCount(0);
    await page.goto("app/integrations/zoom"); await expect(page.getByText("It does not connect your Zoom account", { exact: false })).toBeVisible();
    await page.goto("app/integrations/icloud"); await page.getByRole("link", { name: "Connect iCloud Calendar", exact: true }).click(); await expect(page.getByLabel("Apple ID email")).toBeVisible();
  });
  test("keeps failed calendar changes retryable and never reports false success", async ({ page }) => {
    await page.goto("app/calendars"); const conflicts = page.getByLabel("Synthetic calendar", { exact: true }); const previous = await conflicts.isChecked();
    await page.route("**/api/calendars/conference-calendar", route => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' }));
    await conflicts.setChecked(!previous); await expect(conflicts).toBeChecked({ checked: previous }); await expect(page.getByRole("status")).toContainText("couldn't be saved");
    await page.route("**/api/integrations/mock", route => route.abort("failed")); await page.getByRole("button", { name: "+ Demo calendar", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Couldn't reach the server"); await expect(page.getByText("Connected demo calendar.", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ Demo calendar", exact: true })).toBeEnabled();
  });
});
