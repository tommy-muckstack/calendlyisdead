import { expect, test } from "@playwright/test";
import { EMPTY_CONTACT } from "../lib/contact-validation";
import { EMPTY_FIELD } from "../lib/contact-field-validation";
for (const width of [1440, 390]) {
  test.describe(`contact CSV transfer at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    let contacts: Set<string>, fields: Set<string>;
    test.beforeEach(async ({ page }) => { contacts = new Set(); fields = new Set(); await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click(); await page.goto("app/contacts"); });
    test.afterEach(async ({ page }) => {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      for (const id of contacts) { const current = await page.request.get(`api/contacts/${id}`); if (current.ok()) await page.request.delete(`api/contacts/${id}`, { data: { version: (await current.json()).version } }); }
      for (const id of fields) { const current = await page.request.get(`api/contact-fields/${id}`); if (current.ok()) await page.request.delete(`api/contact-fields/${id}`, { data: { version: (await current.json()).version } }); }
    });
    test("maps a file, reviews partial results and downloads skipped contacts", async ({ page }, info) => {
      const fieldId = crypto.randomUUID(), fieldName = `Amount ${Date.now()}`; fields.add(fieldId);
      expect((await page.request.post("api/contact-fields", { data: { ...EMPTY_FIELD, id: fieldId, name: fieldName, type: "number" } })).ok()).toBeTruthy(); await page.reload();
      await page.locator("summary").filter({ hasText: "+ Add contact" }).click(); await page.getByRole("button", { name: "Import contacts from a file", exact: true }).click(); const dialog = page.getByRole("dialog", { name: "Import contacts from a file", exact: true });
      const email = `csv-${width}-${Date.now()}@example.invalid`; await dialog.getByLabel("CSV file", { exact: true }).setInputFiles({ name: "contacts.csv", mimeType: "text/csv", buffer: Buffer.from(`Name,Email,${fieldName}\nImport QA,${email},not-a-number\nInvalid,broken,2`) });
      await expect(dialog.getByLabel("Name", { exact: false }).first()).toHaveValue("name"); await page.screenshot({ path: info.outputPath("csv-mapping.png") });
      await info.attach("csv-mapping-styles.json", { contentType: "application/json", body: JSON.stringify(await dialog.evaluate(element => { const style = getComputedStyle(element), box = element.getBoundingClientRect(); return { width: box.width, x: box.x, font: style.fontFamily, fontSize: style.fontSize, padding: style.padding }; })) });
      await dialog.getByRole("button", { name: "Continue", exact: true }).click(); await expect(dialog.locator('input[value="merge"]')).toBeChecked(); await dialog.getByRole("button", { name: "Review import", exact: true }).click(); await expect(dialog.getByRole("status")).toContainText("1 contacts to import; 1 skipped; 1 with field issues");
      const waiting = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/contacts/import")); await dialog.getByRole("button", { name: "Import contacts", exact: true }).click(); const result = await (await waiting).json(); for (const row of result.rows) if (row.contactId) contacts.add(row.contactId);
      const completed = page.getByRole("dialog", { name: "Import complete", exact: true }); await completed.getByRole("button", { name: "View contacts with issues", exact: true }).click(); await expect(completed.locator("tbody tr")).toHaveCount(1);
      const downloading = page.waitForEvent("download"); await completed.getByRole("button", { name: "Download skipped contacts", exact: true }).click(); await (await downloading).saveAs(info.outputPath("skipped-contacts.csv"));
      await page.screenshot({ path: info.outputPath("csv-results.png") }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await completed.getByRole("button", { name: "View contacts", exact: true }).click(); await expect(completed).toHaveCount(0);
    });
    test("overwrites mapped fields while retaining unmapped details", async ({ page }) => {
      const id = crypto.randomUUID(), email = `overwrite-${width}-${Date.now()}@example.invalid`; contacts.add(id); expect((await page.request.post("api/contacts", { data: { ...EMPTY_CONTACT, id, name: "Saved", email, phone: "123", company: "Old" } })).ok()).toBeTruthy();
      await page.locator("summary").filter({ hasText: "+ Add contact" }).click(); await page.getByRole("button", { name: "Import contacts from a file", exact: true }).click(); const dialog = page.getByRole("dialog");
      await dialog.getByLabel("CSV file", { exact: true }).setInputFiles({ name: "contacts.csv", mimeType: "text/csv", buffer: Buffer.from(`Name,Email,Company\nNew,${email},`) }); await dialog.getByRole("button", { name: "Continue", exact: true }).click(); await dialog.locator('input[value="overwrite"]').check(); await dialog.getByRole("button", { name: "Review import", exact: true }).click(); await dialog.getByRole("button", { name: "Import contacts", exact: true }).click(); await expect(dialog.getByRole("heading")).toHaveText("Import complete");
      expect(await (await page.request.get(`api/contacts/${id}`)).json()).toMatchObject({ name: "New", company: "", phone: "123" });
    });
    test("confirms a committed import after a lost response without duplicates", async ({ page }) => {
      const email = `retry-${width}-${Date.now()}@example.invalid`; await page.locator("summary").filter({ hasText: "+ Add contact" }).click(); await page.getByRole("button", { name: "Import contacts from a file", exact: true }).click(); const dialog = page.getByRole("dialog");
      await dialog.getByLabel("CSV file", { exact: true }).setInputFiles({ name: "contacts.csv", mimeType: "text/csv", buffer: Buffer.from(`Name,Email\nRetry QA,${email}`) }); await dialog.getByRole("button", { name: "Continue", exact: true }).click(); await dialog.getByRole("button", { name: "Review import", exact: true }).click();
      await page.route("**/api/contacts/import", async route => { const response = await route.fetch(); expect(response.ok()).toBeTruthy(); const result = await response.json(); for (const row of result.rows) if (row.contactId) contacts.add(row.contactId); await route.abort("failed"); });
      await dialog.getByRole("button", { name: "Import contacts", exact: true }).click(); await expect(dialog.getByRole("button", { name: "Confirm import result", exact: true })).toBeVisible(); await expect(dialog.getByRole("button", { name: "Back", exact: true })).toBeDisabled(); await page.unroute("**/api/contacts/import");
      await dialog.getByRole("button", { name: "Confirm import result", exact: true }).click(); await expect(dialog.getByRole("heading")).toHaveText("Import complete"); expect((await (await page.request.get(`api/contacts?q=${encodeURIComponent(email)}`)).json()).total).toBe(1);
    });
    test("exports a selection and all contacts across pagination", async ({ page }, info) => {
      const prefix = `export-${width}-${Date.now()}`;
      for (let i = 0; i < 27; i++) { const id = crypto.randomUUID(); contacts.add(id); expect((await page.request.post("api/contacts", { data: { ...EMPTY_CONTACT, id, name: `Export QA ${i}`, email: `${prefix}-${i}@example.invalid` } })).ok()).toBeTruthy(); }
      await page.goto(`app/contacts?q=${prefix}`); await page.getByLabel("Select contacts on this page", { exact: true }).check(); const toolbar = page.getByRole("region", { name: "Selected contacts", exact: true });
      let downloading = page.waitForEvent("download"); await toolbar.getByRole("button", { name: "Export", exact: true }).click(); await (await downloading).saveAs(info.outputPath("selected-contacts.csv")); await expect(toolbar.getByRole("status")).toContainText("25 contacts ready");
      await toolbar.getByRole("button", { name: /^Select all \d+ contacts$/ }).click(); downloading = page.waitForEvent("download"); await toolbar.getByRole("button", { name: "Export", exact: true }).click(); await (await downloading).saveAs(info.outputPath("all-contacts.csv")); await expect(toolbar.getByText("across all pages and filters", { exact: false })).toBeVisible(); await page.screenshot({ path: info.outputPath("csv-export-selection.png") });
    });
  });
}
