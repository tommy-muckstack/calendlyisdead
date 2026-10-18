import { expect, test, type Page } from "@playwright/test";
async function fixture(page: Page) {
  await page.request.post("api/session/demo?who=host");
  const day = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), options = [`${day}T14:00:00.000Z`, `${day}T15:00:00.000Z`];
  const made = await page.request.post("api/polls", { data: { title: "Poll review QA", durationMin: 30, location: "Office", options } }); expect(made.ok()).toBe(true); const { id } = await made.json();
  expect((await page.request.post(`api/polls/${id}/vote`, { data: { name: "Voter QA", email: "voter@example.invalid", picks: options } })).ok()).toBe(true);
  await page.goto("app/polls"); return { id, card: page.getByTestId("poll").filter({ has: page.locator(`a[href$="/poll/${id}"]`) }) };
}
for (const width of [1440, 390]) test.describe(`Poll booking review at ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  test("reviews an external conflict, adds an invitee and confirms once", async ({ page }, info) => {
    const { card } = await fixture(page), trigger = card.getByRole("button", { name: "Book this time" }).first();
    await trigger.click(); const dialog = page.getByRole("dialog", { name: "Book meeting" });
    await expect(dialog.getByRole("status").filter({ hasText: "conflicts with an event" })).toBeVisible();
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    await trigger.click(); await expect(dialog.getByRole("heading", { name: "Invitees (1)" })).toBeVisible();
    await dialog.getByLabel("Name", { exact: true }).fill("Added QA"); await dialog.getByLabel("Email", { exact: true }).fill("added@example.invalid");
    await dialog.getByRole("button", { name: "Add invitee", exact: true }).click(); await expect(dialog.getByRole("heading", { name: "Invitees (2)" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("poll-conflict-review.png") });
    await info.attach("poll-review-styles.json", { contentType: "application/json", body: JSON.stringify(await dialog.evaluate(element => { const s = getComputedStyle(element); return { fontFamily: s.fontFamily, fontSize: s.fontSize, padding: s.padding, width: s.width, overflow: element.scrollWidth > element.clientWidth }; })) });
    const response = page.waitForResponse(r => r.request().method() === "POST" && /\/api\/polls\/[^/]+\/book$/.test(r.url()));
    await dialog.getByRole("button", { name: "Book Meeting", exact: true }).click(); const booked = await response; expect(booked.ok()).toBe(true);
    await expect(card).toContainText("Booked"); await expect(dialog).toHaveCount(0);
    const uid = (await booked.json()).uid; expect((await page.request.post(`api/bookings/${uid}/cancel`, { data: { reason: "Local QA cleanup" } })).ok()).toBe(true);
  });
  test("retains an added invitee after a failed review and permits retry", async ({ page }, info) => {
    const { id, card } = await fixture(page); await card.getByRole("button", { name: "Book this time" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Book meeting" }); await expect(dialog.getByRole("heading", { name: "Invitees (1)" })).toBeVisible();
    await page.route(`**/api/polls/${id}/review`, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "calendar_unavailable" }) }));
    await dialog.getByLabel("Name", { exact: true }).fill("Retained QA"); await dialog.getByLabel("Email", { exact: true }).fill("retained@example.invalid"); await dialog.getByRole("button", { name: "Add invitee", exact: true }).click();
    await expect(dialog.getByRole("alert")).toBeFocused(); await expect(dialog.getByRole("alert")).toContainText("could not be checked"); await expect(dialog.getByRole("list", { name: "Additional invitees" })).toContainText("retained@example.invalid"); await expect(dialog.getByRole("button", { name: "Book Meeting", exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath("poll-review-error.png") });
    await page.unroute(`**/api/polls/${id}/review`); await dialog.getByRole("button", { name: "Review again" }).click(); await expect(dialog.getByRole("heading", { name: "Invitees (2)" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(card).not.toContainText("Booked");
  });
});
