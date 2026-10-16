import { expect, test } from "@playwright/test";
import { DateTime } from "luxon";
import { EMPTY_FIELD } from "../lib/contact-field-validation";
import { EMPTY_CONTACT } from "../lib/contact-validation";
for (const width of [1440, 390]) {
  test.describe(`contact custom fields at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, timezoneId: "America/New_York" });
    let fields: Set<string>, people: Set<string>, events: string[], meetings: string[];
    test.beforeEach(async ({ page }) => { fields = new Set(); people = new Set(); events = []; meetings = []; await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click(); await page.goto("app/contacts"); });
    test.afterEach(async ({ page }) => {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      for (const uid of meetings) await page.request.post(`api/bookings/${uid}/cancel`, { data: { reason: "Local QA cleanup" } });
      for (const id of fields) { const current = await page.request.get(`api/contact-fields/${id}`); if (current.ok()) await page.request.delete(`api/contact-fields/${id}`, { data: { version: (await current.json()).version } }); }
      for (const id of people) { const current = await page.request.get(`api/contacts/${id}`); if (current.ok()) await page.request.delete(`api/contacts/${id}`, { data: { version: (await current.json()).version } }); }
      for (const id of events) await page.request.delete(`api/event-types/${id}`);
    });
    test("creates a currency column, captures its editor and retains exact saved values", async ({ page }, info) => {
      const name = `Budget ${width} ${Date.now()}`;
      await page.getByText("Columns", { exact: true }).click(); await page.getByRole("button", { name: "+ Create a custom field", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Create a custom field", exact: true });
      await expect(editor.getByLabel("Field name", { exact: true })).toBeFocused(); await editor.getByLabel("Field name", { exact: true }).fill(name); await editor.getByLabel("Field type", { exact: true }).selectOption("currency"); await editor.getByLabel("Currency", { exact: true }).selectOption("EUR");
      await page.screenshot({ path: info.outputPath("custom-field-editor.png") }); await info.attach("custom-field-styles.json", { contentType: "application/json", body: JSON.stringify(await editor.evaluate(element => { const style = getComputedStyle(element), box = element.getBoundingClientRect(); return { font: style.fontFamily, fontSize: style.fontSize, color: style.color, padding: style.padding, width: box.width, x: box.x }; })) });
      const pending = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/contact-fields")); await editor.getByRole("button", { name: "Create", exact: true }).click(); const created = await pending; expect(created.ok()).toBeTruthy(); const field = await created.json(); fields.add(field.id); await expect(editor).toHaveCount(0);
      const id = crypto.randomUUID(); people.add(id); expect((await page.request.post("api/contacts", { data: { ...EMPTY_CONTACT, id, name: "Currency QA", email: `currency-${width}-${Date.now()}@example.invalid` } })).ok()).toBeTruthy(); await page.goto(`app/contacts/${id}`);
      await page.getByRole("button", { name: "Edit custom field values", exact: true }).click(); const values = page.getByRole("dialog", { name: "Edit custom field values", exact: true }); await values.getByLabel(`${name} (EUR)`, { exact: true }).fill("00012.3400"); await values.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(values).toHaveCount(0); await expect(page.getByText("EUR 12.34", { exact: true })).toBeVisible();
      await page.reload(); await page.getByRole("button", { name: "Edit custom field values", exact: true }).click(); await expect(values.getByLabel(`${name} (EUR)`, { exact: true })).toHaveValue("12.34"); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
    test("saves multi-select and dates while retaining invalid numeric drafts for correction", async ({ page }) => {
      const definitions = [{ name: "Topics", type: "multi_select", options: ["Design", "Engineering"] }, { name: "Follow-up date", type: "date" }, { name: "Amount", type: "number" }];
      for (const item of definitions) { const id = crypto.randomUUID(); fields.add(id); expect((await page.request.post("api/contact-fields", { data: { ...EMPTY_FIELD, ...item, id } })).ok()).toBeTruthy(); }
      const id = crypto.randomUUID(); people.add(id); expect((await page.request.post("api/contacts", { data: { ...EMPTY_CONTACT, id, name: "Typed values QA", email: `typed-${width}-${Date.now()}@example.invalid` } })).ok()).toBeTruthy(); await page.goto(`app/contacts/${id}`);
      await page.getByRole("button", { name: "Edit custom field values", exact: true }).click(); const values = page.getByRole("dialog", { name: "Edit custom field values", exact: true });
      await values.getByRole("checkbox", { name: "Design", exact: true }).check(); await values.getByRole("checkbox", { name: "Engineering", exact: true }).check(); await values.getByLabel("Follow-up date", { exact: true }).fill("2028-02-29"); await values.getByLabel("Amount", { exact: true }).fill("1e9");
      await values.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(values.getByRole("alert")).toContainText("decimal number"); await expect(values.getByLabel("Amount", { exact: true })).toHaveValue("1e9");
      await values.getByLabel("Amount", { exact: true }).fill("123456789012345.123456"); await values.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(values).toHaveCount(0); await expect(page.getByText("123456789012345.123456", { exact: true })).toBeVisible(); await expect(page.getByText("Design, Engineering", { exact: true })).toBeVisible();
    });
    test("maps a booking question and displays the captured answer in the contact", async ({ page }) => {
      const eventResponse = await page.request.post("api/event-types", { data: { kind: "one_on_one" } }); expect(eventResponse.ok()).toBeTruthy(); const event = await eventResponse.json(); events.push(event.id);
      const title = `Question source ${width} ${Date.now()}`; expect((await page.request.patch(`api/event-types/${event.id}`, { data: { title, questions: [{ id: "purpose", label: "Purpose", type: "text", required: false }] } })).ok()).toBeTruthy(); await page.goto("app/contacts");
      await page.getByText("Columns", { exact: true }).click(); await page.getByRole("button", { name: "+ Create a custom field", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Create a custom field", exact: true }); await editor.getByLabel("Field name", { exact: true }).fill(title); await editor.getByLabel("Field type", { exact: true }).selectOption("invitee_question"); await editor.getByLabel("Event type", { exact: true }).selectOption(event.id); await editor.getByLabel("Invitee question", { exact: true }).selectOption("purpose");
      const pending = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/contact-fields")); await editor.getByRole("button", { name: "Create", exact: true }).click(); const fieldResponse = await pending; expect(fieldResponse.ok()).toBeTruthy(); fields.add((await fieldResponse.json()).id); await expect(editor).toHaveCount(0);
      const day = DateTime.now().setZone("America/New_York").plus({ weeks: 2 }).startOf("week").toISODate()!, email = `mapped-${width}-${Date.now()}@example.invalid`;
      const slots = await page.request.get(`api/slots?${new URLSearchParams({ user: "demo", slug: event.slug, from: day, to: day, tz: "America/New_York" })}`); expect(slots.ok()).toBeTruthy(); const start = (await slots.json()).slots[day][0]; expect(start).toBeTruthy();
      const booked = await page.request.post("api/bookings", { data: { username: "demo", slug: event.slug, start, name: "Mapped QA", email, tz: "America/New_York", answers: { purpose: "Discuss design" } } }); expect(booked.ok()).toBeTruthy(); meetings.push((await booked.json()).uid);
      await page.goto(`app/contacts?q=${encodeURIComponent(email)}`); await expect(page.getByRole("cell", { name: "Discuss design", exact: true })).toBeVisible(); await page.getByRole("link", { name: "Mapped QA", exact: true }).click(); people.add(page.url().split("/").pop()!); await expect(page.getByText("Discuss design", { exact: true })).toBeVisible();
    });
    test("retries an uncertain create, reloads a conflicting edit and confirms deletion", async ({ page }) => {
      const name = `Conflict ${width} ${Date.now()}`; await page.getByText("Columns", { exact: true }).click(); await page.getByRole("button", { name: "+ Create a custom field", exact: true }).click(); let editor = page.getByRole("dialog", { name: "Create a custom field", exact: true }); await editor.getByLabel("Field name", { exact: true }).fill(name); let id = "";
      await page.route("**/api/contact-fields", async route => { if (route.request().method() !== "POST") return route.continue(); const result = await route.fetch(); expect(result.ok()).toBeTruthy(); id = (await result.json()).id; fields.add(id); await route.abort("failed"); });
      await editor.getByRole("button", { name: "Create", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("could not be confirmed"); await page.unroute("**/api/contact-fields"); await editor.getByRole("button", { name: "Create", exact: true }).click(); await expect(editor).toHaveCount(0);
      await page.getByLabel(`Manage ${name} column`, { exact: true }).click(); await page.getByRole("button", { name: "Edit custom field", exact: true }).click(); editor = page.getByRole("dialog", { name: "Edit custom field", exact: true }); await editor.getByLabel("Field name", { exact: true }).fill("Local draft");
      expect((await page.request.patch(`api/contact-fields/${id}`, { data: { ...EMPTY_FIELD, name: `${name} remote`, version: 1 } })).ok()).toBeTruthy(); await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("changed elsewhere");
      page.once("dialog", dialog => dialog.accept()); await editor.getByRole("button", { name: "Reload saved field", exact: true }).click(); await expect(editor.getByLabel("Field name", { exact: true })).toHaveValue(`${name} remote`);
      page.once("dialog", dialog => dialog.accept()); await editor.getByRole("button", { name: "Delete field", exact: true }).click(); await expect(editor).toHaveCount(0); expect((await page.request.get(`api/contact-fields/${id}`)).status()).toBe(404);
    });
  });
}
