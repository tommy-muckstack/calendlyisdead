import { expect, test, type Route } from "@playwright/test";
import { DateTime } from "luxon";
import { EMPTY_RULES } from "../lib/contact-view-validation";
for (const width of [1440, 390]) {
  test.describe(`contact list automations at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } }); let event: { id: string; slug: string }, lists: string[], bookings: string[], contactIds: string[];
    test.beforeEach(async ({ page }) => {
      lists = []; bookings = []; contactIds = []; await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click();
      const created = await page.request.post("api/event-types"); expect(created.ok()).toBeTruthy(); event = await created.json();
      expect((await page.request.patch(`api/event-types/${event.id}`, { data: { title: `Automation ${event.id}` } })).ok()).toBeTruthy();
      for (const name of ["First", "Second"]) { const id = crypto.randomUUID(); expect((await page.request.post("api/contacts/collections", { data: { id, name: `${name} ${event.id}`, kind: "list", rules: EMPTY_RULES } })).status()).toBe(201); lists.push(id); }
      await page.goto(`app/contacts/automations?event=${event.id}`);
    });
    test.afterEach(async ({ page }) => {
      await page.unrouteAll({ behavior: "ignoreErrors" }); for (const uid of bookings) await page.request.post(`api/bookings/${uid}/cancel`, { data: { reason: "Local QA cleanup" } });
      for (const id of contactIds) { const current = await page.request.get(`api/contacts/${id}`); if (current.ok()) await page.request.delete(`api/contacts/${id}`, { data: { version: (await current.json()).version } }); }
      for (const id of lists) { const current = await page.request.get(`api/contacts/collections/${id}`); if (current.ok()) await page.request.delete(`api/contacts/collections/${id}`, { data: { version: (await current.json()).version } }); }
      if (event) await page.request.delete(`api/event-types/${event.id}`);
    });
    test("selects multiple lists, enables future bookings and preserves memberships when paused or deleted", async ({ page }, info) => {
      await page.getByRole("button", { name: "+ Add list automation", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Add contact to list", exact: true }); await expect(editor.getByRole("heading")).toBeFocused();
      await editor.getByLabel(`First ${event.id}`, { exact: true }).check(); await editor.getByLabel(`Second ${event.id}`, { exact: true }).check(); const toggle = editor.getByRole("switch", { name: "Enable automation" }); await toggle.focus(); await page.keyboard.press("Space"); await expect(toggle).toBeChecked();
      await page.screenshot({ path: info.outputPath("enabled-contact-list-automation.png") }); await info.attach("automation-editor-styles.json", { contentType: "application/json", body: JSON.stringify(await editor.evaluate(element => { const style = getComputedStyle(element), box = element.getBoundingClientRect(); return { fontFamily: style.fontFamily, fontSize: style.fontSize, color: style.color, padding: style.padding, width: box.width, x: box.x }; })) });
      const day = DateTime.now().setZone("America/New_York").plus({ weeks: 2 }).startOf("week").toISODate()!, calendar = await page.request.get(`api/slots?${new URLSearchParams({ user: "demo", slug: event.slug, from: day, to: day, tz: "America/New_York" })}`);
      const start = (await calendar.json()).slots[day][0]; expect(start).toBeTruthy(); const booked = await page.request.post("api/bookings", { data: { username: "demo", slug: event.slug, name: "Automation booking QA", email: `${event.id}@example.invalid`, start, tz: "America/New_York" } }); expect(booked.ok()).toBeTruthy(); bookings.push((await booked.json()).uid);
      const members = await (await page.request.get(`api/contacts?collection=${lists[0]}`)).json(); expect(members.total).toBe(1); contactIds.push(members.rows[0].contact.id);
      await toggle.uncheck(); await expect(toggle).not.toBeChecked(); page.once("dialog", dialog => dialog.accept()); await editor.getByRole("button", { name: "Delete automation", exact: true }).click(); await expect(editor).toHaveCount(0);
      for (const id of lists) expect((await (await page.request.get(`api/contacts?collection=${id}`)).json()).total).toBe(1);
      await page.reload(); await expect(page.getByRole("button", { name: "+ Add list automation", exact: true })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
    test("keeps a failed enable pending, preserves selections and reloads conflicting settings explicitly", async ({ page }, info) => {
      await page.getByRole("button", { name: "+ Add list automation", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Add contact to list", exact: true }); await editor.getByLabel(`First ${event.id}`, { exact: true }).check(); let pending: Route | undefined;
      await page.route("**/contact-automations/lists", route => { if (route.request().method() !== "PATCH") return route.continue(); pending = route; }); await editor.getByRole("switch").click(); await expect.poll(() => !!pending).toBe(true); await expect(editor.getByRole("switch")).toBeDisabled(); await page.keyboard.press("Escape"); await expect(editor).toBeVisible();
      await pending!.fulfill({ status: 503, body: "Unavailable" }); await expect(editor.getByRole("alert")).toContainText("choices are still here"); await expect(editor.getByRole("alert")).toBeFocused(); await expect(editor.getByLabel(`First ${event.id}`, { exact: true })).toBeChecked(); await page.screenshot({ path: info.outputPath("automation-save-error.png") });
      await page.unroute("**/contact-automations/lists"); expect((await page.request.patch(`api/event-types/${event.id}/contact-automations/lists`, { data: { action: "save", listIds: [lists[1]], enabled: false, version: 0 } })).ok()).toBeTruthy();
      await editor.getByRole("switch").click(); await expect(editor.getByRole("alert")).toContainText("changed elsewhere"); page.once("dialog", dialog => dialog.dismiss()); await editor.getByRole("button", { name: "Reload saved automation and lists" }).click(); await expect(editor.getByLabel(`First ${event.id}`, { exact: true })).toBeChecked();
      page.once("dialog", dialog => dialog.accept()); await editor.getByRole("button", { name: "Reload saved automation and lists" }).click(); await expect(editor.getByLabel(`Second ${event.id}`, { exact: true })).toBeChecked(); await expect(editor.getByLabel(`First ${event.id}`, { exact: true })).not.toBeChecked();
    });
    test("allows pausing a deleted destination, then repairs its selection", async ({ page }, info) => {
      const path = `api/event-types/${event.id}/contact-automations/lists`; expect((await page.request.patch(path, { data: { action: "save", listIds: [lists[0]], enabled: true, version: 0 } })).ok()).toBeTruthy(); expect((await page.request.delete(`api/contacts/collections/${lists[0]}`, { data: { version: 1 } })).status()).toBe(204); await page.reload();
      await expect(page.getByText(/Needs attention:/)).toBeVisible(); await page.getByRole("button", { name: "Edit list automation", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Add contact to list", exact: true }); await editor.getByRole("switch").uncheck(); await expect(editor.getByRole("switch")).not.toBeChecked(); await page.screenshot({ path: info.outputPath("automation-unavailable-list.png") });
      await editor.getByLabel(/Unavailable list 1/).uncheck(); await editor.getByLabel(`Second ${event.id}`, { exact: true }).check(); await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor).toHaveCount(0); const state = await (await page.request.get(path)).json(); expect(state.automation).toMatchObject({ listIds: [lists[1]], enabled: false });
    });
    test("opens from the event editor, keeps nested cancel isolated and returns keyboard focus", async ({ page }, info) => {
      await page.goto("app"); await page.getByRole("button", { name: `Edit Automation ${event.id}`, exact: true }).click(); const eventEditor = page.getByRole("dialog", { name: "Edit event type", exact: true }); await eventEditor.getByRole("button", { name: /^Contact automations/ }).click(); const add = eventEditor.getByRole("button", { name: "+ Add list automation", exact: true }); await add.click();
      const editor = page.getByRole("dialog", { name: "Add contact to list", exact: true }); await editor.getByRole("button", { name: "+ Create new list", exact: true }).click(); const list = page.getByRole("dialog", { name: "Create list", exact: true }); await expect(list.getByLabel("List name", { exact: true })).toBeFocused(); await page.keyboard.press("Escape"); await expect(list).toHaveCount(0); await expect(editor).toBeVisible(); await expect(eventEditor).toBeVisible();
      for (let i = 0; i < 10; i++) { await page.keyboard.press("Tab"); expect(await editor.evaluate(element => element.contains(document.activeElement))).toBe(true); }
      await page.screenshot({ path: info.outputPath("event-contact-automation.png") }); const box = await editor.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width); expect(box!.height).toBeLessThanOrEqual(900);
      await page.keyboard.press("Escape"); await expect(editor).toHaveCount(0); await expect(eventEditor).toBeVisible(); await expect(add).toBeFocused();
    });
  });
}
