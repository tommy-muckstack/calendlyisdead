import { expect, test } from "@playwright/test";
import { EMPTY_CONTACT } from "../lib/contact-validation";
import { EMPTY_NOTE } from "../lib/contact-note-validation";
for (const width of [1440, 390]) {
  test.describe(`contact notes and reminders at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } }); let person: string;
    test.beforeEach(async ({ page }) => {
      await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click(); person = crypto.randomUUID();
      expect((await page.request.post("api/contacts", { data: { ...EMPTY_CONTACT, id: person, name: "Notes QA", email: `notes-${person}@example.invalid` } })).ok()).toBeTruthy(); await page.goto(`app/contacts/${person}?tab=notes`);
    });
    test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); const current = await page.request.get(`api/contacts/${person}`); if (current.ok()) await page.request.delete(`api/contacts/${person}`, { data: { version: (await current.json()).version } }); });
    test("saves a body-only note, creates a reminder and captures editor/timeline layouts", async ({ page }, info) => {
      await page.getByRole("button", { name: "Add note", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Add note", exact: true }); await expect(editor.getByLabel("Title", { exact: true })).toBeFocused();
      await editor.getByLabel("Note", { exact: true }).fill("Follow up about the project.\nDiscuss next steps."); await editor.getByRole("button", { name: "Add reminder", exact: true }).click(); await editor.getByLabel("Reminder date", { exact: true }).fill("2028-02-29");
      await page.screenshot({ path: info.outputPath("note-editor.png") }); await info.attach("note-editor-styles.json", { contentType: "application/json", body: JSON.stringify(await editor.evaluate(element => { const style = getComputedStyle(element), box = element.getBoundingClientRect(); return { font: style.fontFamily, fontSize: style.fontSize, padding: style.padding, width: box.width, x: box.x }; })) });
      await editor.getByRole("button", { name: "Save", exact: true }).click(); await expect(editor).toHaveCount(0); await expect(page.getByRole("article", { name: "Contact note", exact: true })).toContainText("2028-02-29"); await page.reload(); await expect(page.getByText("Discuss next steps.", { exact: false })).toBeVisible();
      await page.screenshot({ path: info.outputPath("note-timeline.png") }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
    test("edits, completes and deletes a note through its menu while preserving the contact", async ({ page }) => {
      const id = crypto.randomUUID(); expect((await page.request.post(`api/contacts/${person}/notes`, { data: { ...EMPTY_NOTE, id, title: "Initial note", body: "Body", reminderDate: "2027-03-14" } })).ok()).toBeTruthy(); await page.reload();
      let card = page.getByRole("article", { name: "Initial note", exact: true }); await card.getByLabel("Manage note Initial note", { exact: true }).click(); await card.getByRole("button", { name: "Edit", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit note", exact: true }); await editor.getByLabel("Title", { exact: true }).fill("Updated note"); await editor.getByRole("button", { name: "Save", exact: true }).click(); await expect(editor).toHaveCount(0);
      card = page.getByRole("article", { name: "Updated note", exact: true }); await card.getByRole("button", { name: "Complete", exact: true }).click(); await expect(card.getByRole("button", { name: "Complete", exact: true })).toHaveCount(0); await expect(card).toContainText("Complete");
      await card.getByLabel("Manage note Updated note", { exact: true }).click(); page.once("dialog", dialog => dialog.accept()); await card.getByRole("button", { name: "Delete", exact: true }).click(); await expect(card).toHaveCount(0); expect((await page.request.get(`api/contacts/${person}`)).status()).toBe(200);
    });
    test("confirms a lost-response create and retains a conflicting edit until reload", async ({ page }) => {
      let id = ""; await page.getByRole("button", { name: "Add note", exact: true }).click(); let editor = page.getByRole("dialog", { name: "Add note", exact: true }); await editor.getByLabel("Title", { exact: true }).fill("Retry note");
      await page.route(`**/api/contacts/${person}/notes`, async route => { const result = await route.fetch(); expect(result.ok()).toBeTruthy(); id = (await result.json()).id; await route.abort("failed"); }); await editor.getByRole("button", { name: "Save", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("could not be confirmed"); await page.unroute(`**/api/contacts/${person}/notes`); await editor.getByRole("button", { name: "Save", exact: true }).click(); await expect(editor).toHaveCount(0);
      const card = page.getByRole("article", { name: "Retry note", exact: true }); await card.getByLabel("Manage note Retry note", { exact: true }).click(); await card.getByRole("button", { name: "Edit", exact: true }).click(); editor = page.getByRole("dialog", { name: "Edit note", exact: true }); await editor.getByLabel("Title", { exact: true }).fill("Local draft");
      expect((await page.request.patch(`api/contacts/${person}/notes/${id}`, { data: { ...EMPTY_NOTE, title: "Remote edit", action: "edit", version: 1 } })).ok()).toBeTruthy(); await editor.getByRole("button", { name: "Save", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("changed elsewhere"); page.once("dialog", dialog => dialog.accept()); await editor.getByRole("button", { name: "Reload saved note", exact: true }).click(); await expect(editor.getByLabel("Title", { exact: true })).toHaveValue("Remote edit");
    });
    test("opens a note from a notification link, removes its reminder and keeps the editor closed after save", async ({ page }) => {
      const id = crypto.randomUUID(); expect((await page.request.post(`api/contacts/${person}/notes`, { data: { ...EMPTY_NOTE, id, title: "Linked note", reminderDate: "2027-03-14" } })).ok()).toBeTruthy();
      await page.goto(`app/contacts/${person}?tab=notes&note=${id}#note-${id}`); const editor = page.getByRole("dialog", { name: "Edit note", exact: true }); await expect(editor).toBeVisible(); await editor.getByRole("button", { name: "Remove reminder", exact: true }).click(); await editor.getByRole("button", { name: "Save", exact: true }).click(); await expect(editor).toHaveCount(0); await expect(page.getByRole("article", { name: "Linked note", exact: true })).not.toContainText("2027-03-14");
      expect((await (await page.request.get(`api/contacts/${person}/notes/${id}`)).json()).reminderDate).toBeNull(); await page.goto("app/contacts/reminders?bucket=all"); await expect(page.getByRole("heading", { name: "Reminders", exact: true })).toBeVisible(); await expect(page.getByRole("article", { name: "Linked note", exact: true })).toHaveCount(0);
    });
  });
}
