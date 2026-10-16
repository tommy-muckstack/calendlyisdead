import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { randomBytes } from "node:crypto";

const original = { name: "Demo Host", welcomeMessage: "Pick a meeting type to see open times.", timezone: "America/New_York", image: null };
for (const width of [1440, 390]) {
  test.describe(`profile settings at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click();
      expect((await page.request.patch("api/settings/profile", { data: original })).ok()).toBeTruthy();
      await page.reload(); await page.getByRole("button", { name: "Account menu", exact: true }).click();
      await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
      await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
    });
    test.afterEach(async ({ page }) => { await page.request.patch("api/settings/profile", { data: original }); });

    test("saves the profile and uses its name and welcome text on the public page", async ({ page }, info) => {
      await page.getByLabel("Name", { exact: true }).fill("Profile QA");
      await page.getByLabel("Welcome message", { exact: true }).fill("Welcome, QA invitees.\nChoose a meeting.");
      await page.getByLabel("Time zone", { exact: true }).selectOption("UTC");
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Changes saved");
      await expect(page.getByRole("button", { name: "Account menu", exact: true })).toContainText("Profile QA");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath("profile-saved.png") });
      await info.attach("profile-styles.json", { contentType: "application/json", body: JSON.stringify(await page.getByLabel("Name", { exact: true }).evaluate(element => {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color, padding: style.padding, width: rect.width, height: rect.height };
      })) });
      await page.reload(); await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Profile QA");
      await page.goto("demo"); await expect(page.getByRole("heading", { name: "Profile QA", exact: true })).toBeVisible();
      await expect(page.getByText("Welcome, QA invitees.", { exact: false })).toBeVisible();
      await page.screenshot({ path: info.outputPath("profile-public-page.png") });
    });

    test("uploads a photo, shows it on the public page and booking page, and removes it", async ({ page }, info) => {
      // A textured synthetic image exercises uploads above fetch keepalive's
      // 64 KiB limit; a flat-color PNG would miss that browser failure.
      const buffer = await sharp(randomBytes(256 * 256 * 3), { raw: { width: 256, height: 256, channels: 3 } }).png().toBuffer();
      await page.getByLabel("Profile photo", { exact: true }).setInputFiles({ name: "qa-avatar.png", mimeType: "image/png", buffer });
      await expect(page.getByRole("img", { name: "Demo Host profile photo", exact: true })).toBeVisible();
      const upload = page.waitForRequest(request => request.method() === "PATCH" && request.url().endsWith("/api/settings/profile"));
      await page.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(page.getByRole("status")).toHaveText("Changes saved");
      expect((await upload).postDataBuffer()!.byteLength).toBeGreaterThan(65536);
      const image = (await (await page.request.get("api/settings/profile")).json()).image;
      expect(await sharp(Buffer.from(image.split(",")[1], "base64")).metadata()).toMatchObject({ format: "png", width: 256, height: 256 });
      await page.goto("demo"); await expect(page.getByRole("img", { name: "Demo Host profile photo", exact: true })).toBeVisible();
      await page.goto("demo/30min"); await expect(page.getByRole("img", { name: "Demo Host profile photo", exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath("booking-profile-photo.png") });
      await page.goto("app/profile"); await page.getByRole("button", { name: "Remove photo", exact: true }).click();
      await page.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(page.getByRole("status")).toHaveText("Changes saved");
      expect((await (await page.request.get("api/settings/profile")).json()).image).toBeNull();
    });

    test("validates a draft, focuses the error and protects unsaved navigation", async ({ page }, info) => {
      let saves = 0; page.on("request", request => { if (request.method() === "PATCH" && request.url().endsWith("/api/settings/profile")) saves++; });
      await page.getByLabel("Name", { exact: true }).fill(" "); await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("Name:"); await expect(page.getByRole("alert")).toBeFocused(); expect(saves).toBe(0);
      page.once("dialog", dialog => dialog.dismiss()); await page.getByRole("link", { name: "Close settings", exact: true }).click();
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue(" ");
      await page.screenshot({ path: info.outputPath("profile-validation.png") });
      await page.getByRole("button", { name: "Cancel changes", exact: true }).click(); await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Demo Host");
      await page.getByRole("link", { name: "Close settings", exact: true }).click(); await expect(page).toHaveURL(/\/app$/);
    });

    test("retains a failed save for retry", async ({ page }) => {
      await page.route("**/api/settings/profile", route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "save_failed" }) }));
      await page.getByLabel("Name", { exact: true }).fill("Retry profile"); await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("Saving could not be confirmed"); await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Retry profile");
      await page.unroute("**/api/settings/profile"); await page.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(page.getByRole("status")).toHaveText("Changes saved");
    });

    test("keeps settings navigation reachable and uses the saved account timezone for limits", async ({ page }) => {
      await page.getByLabel("Search time zones", { exact: true }).fill("Paris"); await page.getByLabel("Time zone", { exact: true }).selectOption("Europe/Paris");
      await page.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(page.getByRole("status")).toHaveText("Changes saved");
      const navigation = page.getByRole("navigation", { name: "Settings sections", exact: true });
      await navigation.getByRole("link", { name: "Scheduling", exact: true }).click();
      await page.getByRole("link", { name: "Advanced availability", exact: true }).click();
      await expect(page.getByText(/Limits use Europe\/Paris/)).toBeVisible();
      await navigation.getByRole("link", { name: "Branding", exact: true }).click(); await expect(page).toHaveURL(/\/app\/branding$/);
      await navigation.getByRole("link", { name: "Profile", exact: true }).click(); await expect(page.getByLabel("Time zone", { exact: true })).toHaveValue("Europe/Paris");
    });

    test("rejects an undersized photo before it can replace the saved image", async ({ page }) => {
      const buffer = await sharp({ create: { width: 80, height: 80, channels: 3, background: "#3568aa" } }).png().toBuffer();
      await page.getByLabel("Profile photo", { exact: true }).setInputFiles({ name: "too-small.png", mimeType: "image/png", buffer });
      await expect(page.getByRole("alert")).toContainText("at least 90 × 90");
      await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
      expect((await (await page.request.get("api/settings/profile")).json()).image).toBeNull();
    });
  });
}
