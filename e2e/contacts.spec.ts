import { expect, test } from "@playwright/test";
import { DateTime } from "luxon";
import { EMPTY_CONTACT } from "../lib/contact-validation";

for (const width of [1440, 390]) {
  test.describe(`contacts at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, timezoneId: "America/New_York" });
    let ids: Set<string>, bookingUid: string | undefined;
    test.beforeEach(async ({ page }) => {
      ids = new Set(); bookingUid = undefined;
      await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click(); await page.goto("app/contacts");
    });
    test.afterEach(async ({ page }) => {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      if (bookingUid) await page.request.post(`api/bookings/${bookingUid}/cancel`, { data: { reason: "Local QA cleanup" } });
      for (const id of ids) {
        const current = await page.request.get(`api/contacts/${id}`);
        if (current.ok()) await page.request.delete(`api/contacts/${id}`, { data: { version: (await current.json()).version } });
      }
    });
    test("adds all documented fields, preserves dirty drafts and reopens the saved contact", async ({ page }, info) => {
      await page.locator("summary").filter({ hasText: "+ Add contact" }).click(); await page.getByRole("button", { name: "Create a contact", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Add contact", exact: true });
      await expect(editor.getByLabel("Name (required)")).toBeFocused(); const name = `Contacts QA ${width} ${Date.now()}`, email = `contact-${width}-${Date.now()}@example.invalid`;
      await editor.getByLabel("Name (required)").fill(name); await editor.getByLabel("Email address (required)").fill(email.toUpperCase());
      for (const [label, value] of [["Phone", "+1 555 0100"], ["Job title", "Engineer"], ["Company", "Example"], ["LinkedIn", "https://www.linkedin.com/in/example"], ["Country", "Japan"], ["City", "Tokyo"], ["State", "Tokyo"]]) await editor.getByLabel(label, { exact: true }).fill(value);
      await editor.getByLabel("Time zone", { exact: true }).selectOption("Asia/Tokyo");
      page.once("dialog", dialog => dialog.dismiss()); await editor.press("Escape"); await expect(editor).toBeVisible();
      await page.screenshot({ path: info.outputPath("contact-editor.png") });
      await info.attach("contact-editor-styles.json", { contentType: "application/json", body: JSON.stringify(await editor.evaluate(element => {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, padding: style.padding, color: style.color, width: rect.width, x: rect.x };
      })) });
      const saved = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/contacts")); await editor.getByRole("button", { name: "Save contact", exact: true }).click();
      const response = await saved; expect(response.ok()).toBeTruthy(); const contact = await response.json(); ids.add(contact.id); expect(contact.email).toBe(email);
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible(); await page.reload(); await page.getByRole("button", { name: "Edit contact", exact: true }).click();
      const edit = page.getByRole("dialog", { name: "Edit contact", exact: true }); await expect(edit.getByLabel("Company", { exact: true })).toHaveValue("Example"); await expect(edit.getByLabel("Time zone", { exact: true })).toHaveValue("Asia/Tokyo");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
    test("retains meeting history through an email edit and contact deletion", async ({ page }) => {
      const email = `history-${width}-${Date.now()}@example.invalid`, name = `History ${width} ${Date.now()}`, id = crypto.randomUUID(); ids.add(id);
      expect((await page.request.post("api/contacts", { data: { ...EMPTY_CONTACT, id, name, email } })).ok()).toBeTruthy();
      const day = DateTime.now().setZone("America/New_York").plus({ weeks: 2 }).startOf("week").toISODate()!;
      const calendar = await page.request.get(`api/slots?${new URLSearchParams({ user: "demo", slug: "30min", from: day, to: day, tz: "America/New_York" })}`); expect(calendar.ok()).toBeTruthy();
      const start = (await calendar.json()).slots[day][0]; expect(start).toBeTruthy();
      const booked = await page.request.post("api/bookings", { data: { username: "demo", slug: "30min", name, email, start, tz: "America/New_York" } }); expect(booked.ok()).toBeTruthy(); bookingUid = (await booked.json()).uid;
      await page.goto(`app/contacts/${id}`); await expect(page.locator(`a[href$="/app/meetings/${bookingUid}"]`)).toBeVisible();
      await page.getByRole("button", { name: "Edit contact", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit contact", exact: true });
      await editor.getByLabel("Email address (required)").fill(`new-${email}`); await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor).toHaveCount(0);
      await expect(page.locator(`a[href$="/app/meetings/${bookingUid}"]`)).toBeVisible();
      await page.getByRole("button", { name: "Edit contact", exact: true }).click(); page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Delete contact", exact: true }).click();
      await expect(page.getByRole("heading", { name: "All contacts", exact: true })).toBeVisible(); expect((await page.request.get(`api/contacts/${id}`)).status()).toBe(404);
      await page.goto(`app/meetings/${bookingUid}`); await expect(page.getByRole("heading", { name: "Quick chat", exact: true })).toBeVisible();
    });
    test("retries a committed create after a lost response without adding a duplicate", async ({ page }) => {
      const name = `Lost response ${width} ${Date.now()}`, email = `lost-${width}-${Date.now()}@example.invalid`; let firstId: string | undefined;
      await page.locator("summary").filter({ hasText: "+ Add contact" }).click(); await page.getByRole("button", { name: "Create a contact", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Add contact", exact: true });
      await editor.getByLabel("Name (required)").fill(name); await editor.getByLabel("Email address (required)").fill(email);
      await page.route("**/api/contacts", async route => { const response = await route.fetch(); expect(response.ok()).toBeTruthy(); const contact = await response.json(); firstId = contact.id; ids.add(contact.id); await route.abort("failed"); });
      await editor.getByRole("button", { name: "Save contact", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("could not be confirmed"); await expect(editor.getByLabel("Name (required)")).toHaveValue(name);
      await page.unroute("**/api/contacts"); await editor.getByRole("button", { name: "Save contact", exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/app/contacts/${firstId}$`));
      await page.goto(`app/contacts?q=${encodeURIComponent(email)}`); await expect(page.locator("tbody tr")).toHaveCount(1);
    });
    test("keeps a stale edit until saved data is explicitly reloaded", async ({ page }) => {
      const id = crypto.randomUUID(), name = `Stale ${width} ${Date.now()}`, email = `stale-${width}-${Date.now()}@example.invalid`; ids.add(id);
      const fields = { ...EMPTY_CONTACT, name, email }; expect((await page.request.post("api/contacts", { data: { ...fields, id } })).ok()).toBeTruthy(); await page.goto(`app/contacts/${id}`);
      await page.getByRole("button", { name: "Edit contact", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit contact", exact: true }); await editor.getByLabel("Company", { exact: true }).fill("Local draft");
      expect((await page.request.patch(`api/contacts/${id}`, { data: { ...fields, company: "Remote save", version: 1 } })).ok()).toBeTruthy();
      await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("changed elsewhere"); await expect(editor.getByLabel("Company", { exact: true })).toHaveValue("Local draft");
      page.once("dialog", dialog => dialog.accept()); await editor.getByRole("button", { name: "Reload saved contact", exact: true }).click(); await expect(editor.getByLabel("Company", { exact: true })).toHaveValue("Remote save");
      await editor.getByLabel("Company", { exact: true }).fill("Final save"); await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor).toHaveCount(0); await expect(page.getByText("Final save", { exact: true })).toBeVisible();
    });
  });
}
