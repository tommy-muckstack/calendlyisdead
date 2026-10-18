import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test.describe(`booking link recovery at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await page.route("**/api/slots?**", route => route.fulfill({ json: { slots: {} } }));
      await page.route("**/api/bookings", route => route.abort());
    });
    test("malformed links render a usable calendar and clean up invalid parameters when navigating", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto("demo/30min?month=invalid&date=2027-02-29&tz=Not_A_Zone&slot=bad&name=Link%20invitee");
      await expect(page.getByRole("alert")).toContainText("invalid date or time zone");
      await expect(page.getByRole("heading", { name: "Pick a day" })).toBeVisible();
      await page.getByRole("button", { name: "Next month" }).click();
      await expect(page.getByRole("alert")).toHaveCount(0);
      expect(new URL(page.url()).searchParams.get("name")).toBe("Link invitee");
      expect(errors).toEqual([]);
    });
    test("UTC and aliases stay selected and browser history restores the timezone", async ({ page }) => {
      await page.goto("demo/30min?month=2027-01&tz=US/Eastern");
      await expect(page.locator(".booking-zone-trigger")).toHaveAttribute("data-timezone", "US/Eastern");
      await page.locator(".booking-zone-trigger").click(); await page.getByRole("combobox", { name: "Search time zones" }).fill("UTC"); await page.getByRole("combobox", { name: "Search time zones" }).press("Enter");
      await expect(page.locator(".booking-zone-trigger")).toHaveAttribute("data-timezone", "UTC");
      await page.goBack();
      await expect(page.locator(".booking-zone-trigger")).toHaveAttribute("data-timezone", "US/Eastern");
      await page.goForward();
      await expect(page.locator(".booking-zone-trigger")).toHaveAttribute("data-timezone", "UTC");
    });
  });
}
