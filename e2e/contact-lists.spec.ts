import { expect, test } from "@playwright/test";
import { ContactFields, EMPTY_CONTACT } from "../lib/contact-validation";
import { EMPTY_RULES, ViewCondition } from "../lib/contact-view-validation";
for (const width of [1440, 390]) {
  test.describe(`contact lists and views at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } }); let person: string, listIds: string[];
    test.beforeEach(async ({ page }) => {
      await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click(); person = crypto.randomUUID(); listIds = [];
      expect((await page.request.post("api/contacts", { data: { ...EMPTY_CONTACT, id: person, name: `Lists ${person}`, email: `${person}@example.invalid`, company: person } })).ok()).toBeTruthy(); await page.goto(`app/contacts?q=${person}`);
    });
    test.afterEach(async ({ page }) => {
      await page.unrouteAll({ behavior: "ignoreErrors" }); for (const id of listIds) { const current = await page.request.get(`api/contacts/collections/${id}`); if (current.ok()) await page.request.delete(`api/contacts/collections/${id}`, { data: { version: (await current.json()).version } }); }
      const contact = await page.request.get(`api/contacts/${person}`); if (contact.ok()) await page.request.delete(`api/contacts/${person}`, { data: { version: (await contact.json()).version } });
    });
    test("creates a list from selected contacts, removes membership and keeps the record", async ({ page }, info) => {
      await page.getByLabel(`Select Lists ${person} (${person}@example.invalid)`, { exact: true }).check(); await page.getByRole("button", { name: "Add to list", exact: true }).click();
      const selection = page.getByRole("dialog", { name: "Add to list", exact: true }); await selection.getByRole("button", { name: "+ Create new list", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Create list", exact: true }); await expect(editor.getByLabel("List name", { exact: true })).toBeFocused(); await editor.getByLabel("List name", { exact: true }).fill(`List ${person}`);
      await page.screenshot({ path: info.outputPath("new-contact-list.png") }); await info.attach("list-editor-styles.json", { contentType: "application/json", body: JSON.stringify(await editor.evaluate(element => { const style = getComputedStyle(element), box = element.getBoundingClientRect(); return { fontFamily: style.fontFamily, fontSize: style.fontSize, padding: style.padding, width: box.width, x: box.x }; })) });
      const created = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/contacts/collections")); await editor.getByRole("button", { name: "Create list", exact: true }).click(); const id = (await (await created).json()).id; listIds.push(id);
      await selection.getByRole("button", { name: "Add to list", exact: true }).click(); await expect(selection).toHaveCount(0); await page.goto(`app/contacts?collection=${id}`); await expect(page.getByRole("link", { name: `Lists ${person}`, exact: true })).toBeVisible();
      await page.getByLabel("Select contacts on this page", { exact: true }).check(); await page.getByRole("button", { name: "Remove from list", exact: true }).click(); const removal = page.getByRole("dialog", { name: "Remove from list", exact: true }); await expect(removal).toContainText("other lists will be kept"); await removal.getByRole("button", { name: "Remove from list", exact: true }).click(); await expect(page.getByRole("link", { name: `Lists ${person}`, exact: true })).toHaveCount(0);
      expect((await page.request.get(`api/contacts/${person}`)).status()).toBe(200); await page.screenshot({ path: info.outputPath("empty-contact-list.png") }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
    test("applies filters, saves a view and updates results when a contact changes", async ({ page }, info) => {
      await page.getByRole("button", { name: "Filter", exact: true }).click(); const filters = page.getByRole("dialog", { name: "Filter contacts", exact: true }); await filters.getByRole("button", { name: "+ Add condition", exact: true }).click();
      await filters.getByLabel("Field", { exact: true }).selectOption("company"); await filters.getByLabel("Condition", { exact: true }).selectOption("is"); await filters.getByLabel("Value", { exact: true }).fill(person); await page.screenshot({ path: info.outputPath("contact-filter-editor.png") }); await filters.getByRole("button", { name: "Apply", exact: true }).click();
      await page.getByRole("button", { name: "Save as view", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Create view", exact: true }); await editor.getByLabel("View name", { exact: true }).fill(`View ${person}`);
      const created = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/contacts/collections")); await editor.getByRole("button", { name: "Create view", exact: true }).click(); const id = (await (await created).json()).id; listIds.push(id);
      await expect(page.getByRole("heading", { name: `View ${person}`, exact: true })).toBeVisible(); await expect(page.getByRole("link", { name: `Lists ${person}`, exact: true })).toBeVisible(); await page.reload();
      const current = await (await page.request.get(`api/contacts/${person}`)).json(); expect((await page.request.patch(`api/contacts/${person}`, { data: { ...ContactFields.parse(current), version: current.version, company: "No longer matches" } })).ok()).toBeTruthy(); await page.reload(); await expect(page.getByText("No contacts found", { exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath("saved-contact-view.png") }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
    test("keeps changes after a failed save and reloads a renamed list on conflict", async ({ page }) => {
      const id = crypto.randomUUID(); listIds.push(id); expect((await page.request.post("api/contacts/collections", { data: { id, name: `Original ${person}`, kind: "list", rules: EMPTY_RULES } })).ok()).toBeTruthy(); await page.goto(`app/contacts?collection=${id}`);
      await page.getByText("Manage lists and views", { exact: true }).click(); await page.getByRole("button", { name: `Edit Original ${person}`, exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit list", exact: true }); await editor.getByLabel("List name", { exact: true }).fill(`Local ${person}`);
      await page.route(`**/api/contacts/collections/${id}`, route => route.abort("failed")); await editor.getByRole("button", { name: "Save", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("could not be confirmed"); await expect(editor.getByLabel("List name", { exact: true })).toHaveValue(`Local ${person}`); await page.unroute(`**/api/contacts/collections/${id}`);
      expect((await page.request.patch(`api/contacts/collections/${id}`, { data: { name: `Remote ${person}`, kind: "list", rules: EMPTY_RULES, version: 1 } })).ok()).toBeTruthy(); await editor.getByRole("button", { name: "Save", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("changed"); page.once("dialog", dialog => dialog.accept()); await editor.getByRole("button", { name: "Reload saved list", exact: true }).click(); await expect(editor.getByLabel("List name", { exact: true })).toHaveValue(`Remote ${person}`);
    });
    test("applies view changes without saving until requested, and cancels via the keyboard", async ({ page }) => {
      const id = crypto.randomUUID(); listIds.push(id); const rules = { match: "all", conditions: [ViewCondition.parse({ field: "company", operator: "is", value: person })] }; expect((await page.request.post("api/contacts/collections", { data: { id, name: `View ${person}`, kind: "view", rules } })).ok()).toBeTruthy(); await page.goto(`app/contacts?collection=${id}`);
      await page.getByRole("button", { name: "Filter (1)", exact: true }).click(); const filters = page.getByRole("dialog", { name: "Filter contacts", exact: true }); await filters.getByLabel("Value", { exact: true }).fill("different"); await filters.getByRole("button", { name: "Apply", exact: true }).click(); await expect(page.getByText("These filters have not been saved to the view.", { exact: true })).toBeVisible(); expect((await (await page.request.get(`api/contacts/collections/${id}`)).json()).rules).toEqual(rules);
      await page.getByRole("button", { name: "Save view", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit view", exact: true }); page.once("dialog", dialog => dialog.accept()); await page.keyboard.press("Escape"); await expect(editor).toHaveCount(0); await expect(page.getByRole("button", { name: "Save view", exact: true })).toBeFocused();
      await page.getByRole("button", { name: "Save view", exact: true }).click(); await editor.getByRole("button", { name: "Save", exact: true }).click(); await expect(editor).toHaveCount(0); expect((await (await page.request.get(`api/contacts/collections/${id}`)).json()).rules.conditions[0].value).toBe("different");
    });
  });
}
