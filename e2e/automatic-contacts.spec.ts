import { expect, test } from "@playwright/test";
import { DateTime } from "luxon";
import type { ContactSettings } from "../lib/contact-settings-validation";
for (const width of [1440, 390]) {
  test.describe(`automatic contacts at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, timezoneId: "America/New_York" });
    let original: ContactSettings, bookings: string[], contacts: Set<string>;
    test.beforeEach(async ({ page }) => {
      bookings = []; contacts = new Set(); await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click();
      original = await (await page.request.get("api/settings/contacts")).json();
      expect((await page.request.patch("api/settings/contacts", { data: { ...original, bookingEnabled: true, exclusions: [] } })).ok()).toBeTruthy(); await page.goto("app/contact-settings");
    });
    test.afterEach(async ({ page }) => {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      for (const uid of bookings) await page.request.post(`api/bookings/${uid}/cancel`, { data: { reason: "Local QA cleanup" } });
      for (const id of contacts) { const result = await page.request.get(`api/contacts/${id}`); if (result.ok()) await page.request.delete(`api/contacts/${id}`, { data: { version: (await result.json()).version } }); }
      if (original) { const current = await (await page.request.get("api/settings/contacts")).json(); await page.request.patch("api/settings/contacts", { data: { ...original, version: current.version } }); }
    });
    test("saves exclusions and opt-out, supports keyboard input and reopens saved preferences", async ({ page }, info) => {
      const checkbox = page.getByRole("checkbox", { name: "Someone books a meeting with you via CalendlyIsDead" }); await checkbox.focus(); await page.keyboard.press("Space"); await expect(checkbox).not.toBeChecked();
      await page.getByLabel("Exclude domains and email addresses", { exact: true }).fill(" COMPANY.COM, person@OTHER.COM company.com\n");
      await page.screenshot({ path: info.outputPath("automatic-contact-settings.png") });
      await info.attach("settings-styles.json", { contentType: "application/json", body: JSON.stringify(await page.locator(".contact-settings").evaluate(element => { const style = getComputedStyle(element), box = element.getBoundingClientRect(); return { font: style.fontFamily, size: style.fontSize, padding: style.padding, color: style.color, width: box.width, x: box.x }; })) });
      await page.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(page.getByRole("status")).toHaveText("Changes saved"); await page.reload();
      await expect(checkbox).not.toBeChecked(); await expect(page.getByLabel("Exclude domains and email addresses", { exact: true })).toHaveValue("company.com, person@other.com");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
    test("creates a contact from booking and respects deletion and exclusions on later bookings", async ({ page }) => {
      const email = `auto-${width}-${Date.now()}@example.invalid`, blocked = `blocked-${width}-${Date.now()}.invalid`;
      const book = async (address: string) => {
        const day = DateTime.now().setZone("America/New_York").plus({ weeks: 2 }).startOf("week").toISODate()!;
        const calendar = await page.request.get(`api/slots?${new URLSearchParams({ user: "demo", slug: "30min", from: day, to: day, tz: "America/New_York" })}`); expect(calendar.ok()).toBeTruthy();
        const start = (await calendar.json()).slots[day][0]; expect(start).toBeTruthy();
        const response = await page.request.post("api/bookings", { data: { username: "demo", slug: "30min", name: "Automatic contact QA", email: address, start, tz: "America/New_York" } }); expect(response.ok()).toBeTruthy(); bookings.push((await response.json()).uid);
      };
      await book(email); await page.goto(`app/contacts?q=${encodeURIComponent(email)}`); await expect(page.locator("tbody tr")).toHaveCount(1); await page.getByRole("link", { name: "Automatic contact QA", exact: true }).click();
      const id = page.url().split("/").pop()!; contacts.add(id); await expect(page.locator(`a[href$="/app/meetings/${bookings[0]}"]`)).toBeVisible();
      await page.getByRole("button", { name: "Edit contact", exact: true }).click(); page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Delete contact", exact: true }).click(); await expect(page.getByRole("heading", { name: "All contacts", exact: true })).toBeVisible();
      await book(email); await page.goto(`app/contacts?q=${encodeURIComponent(email)}`); await expect(page.getByRole("heading", { name: "No contacts found", exact: true })).toBeVisible();
      await page.goto("app/contact-settings"); await page.getByLabel("Exclude domains and email addresses", { exact: true }).fill(blocked); await page.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(page.getByRole("status")).toHaveText("Changes saved");
      await book(`qa@${blocked}`); await page.goto(`app/contacts?q=${encodeURIComponent(`qa@${blocked}`)}`); await expect(page.getByRole("heading", { name: "No contacts found", exact: true })).toBeVisible();
    });
    test("retains a draft after a committed response is lost and confirms retry", async ({ page }) => {
      await page.getByLabel("Exclude domains and email addresses", { exact: true }).fill("company.com");
      await page.route("**/api/settings/contacts", async route => { if (route.request().method() !== "PATCH") return route.continue(); const result = await route.fetch(); expect(result.ok()).toBeTruthy(); await route.abort("failed"); });
      await page.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("could not be confirmed"); await expect(page.getByLabel("Exclude domains and email addresses", { exact: true })).toHaveValue("company.com");
      await page.unroute("**/api/settings/contacts"); await page.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(page.getByRole("status")).toHaveText("Changes saved");
    });
    test("protects dirty navigation and reloads a stale draft only after confirmation", async ({ page }) => {
      await page.getByLabel("Exclude domains and email addresses", { exact: true }).fill("local.com"); page.once("dialog", dialog => dialog.dismiss()); await page.getByRole("link", { name: "Close settings", exact: true }).click(); await expect(page.getByLabel("Exclude domains and email addresses", { exact: true })).toHaveValue("local.com");
      const current = await (await page.request.get("api/settings/contacts")).json(); expect((await page.request.patch("api/settings/contacts", { data: { ...current, exclusions: ["remote.com"] } })).ok()).toBeTruthy();
      await page.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("changed elsewhere");
      page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Reload saved settings", exact: true }).click(); await expect(page.getByLabel("Exclude domains and email addresses", { exact: true })).toHaveValue("remote.com");
    });
  });
}
