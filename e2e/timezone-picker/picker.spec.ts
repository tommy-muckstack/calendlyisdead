import { expect, test } from "@playwright/test";
for (const width of [1440, 390]) test.describe(`Invitee timezone picker at ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  let event: { id: string; slug: string }, uid: string | undefined;
  test.beforeEach(async ({ page }) => {
    uid = undefined; await page.request.post("api/session/demo?who=host");
    const created = await page.request.post("api/event-types"); expect(created.ok()).toBe(true); event = await created.json();
    expect((await page.request.patch(`api/event-types/${event.id}`, { data: { title: "Timezone picker QA", minNoticeMin: 0, location: "Office" } })).ok()).toBe(true);
  });
  test.afterEach(async ({ page }) => { if (uid) await page.request.post(`api/bookings/${uid}/cancel`, { data: { reason: "Local QA cleanup" } }); await page.request.delete(`api/event-types/${event.id}`); });
  test("searches by city, handles no results, selects with the keyboard and restores history", async ({ page }, info) => {
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`demo/${event.slug}?tz=US%2FEastern`); const trigger = page.locator(".booking-zone-trigger"); await expect(trigger).toHaveAttribute("data-timezone", "US/Eastern");
    await trigger.focus(); await page.keyboard.press("Enter"); const dialog = page.getByRole("dialog", { name: "Time zone", exact: true }), search = dialog.getByRole("combobox", { name: "Search time zones" });
    await expect(search).toBeFocused(); await search.fill("not a timezone"); await expect(dialog.getByRole("status")).toContainText("No time zones found");
    await search.fill("Kolkata"); await search.press("ArrowDown"); await search.press("Enter"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused(); await expect(trigger).toContainText("India");
    await page.goBack(); await expect(trigger).toHaveAttribute("data-timezone", "US/Eastern"); await page.goForward(); await expect(trigger).toContainText("India");
    await trigger.click(); await search.fill("Europe"); await page.screenshot({ path: info.outputPath("timezone-search.png") });
    await info.attach("timezone-picker-styles.json", { contentType: "application/json", body: JSON.stringify(await dialog.evaluate(element => { const s = getComputedStyle(element), r = element.getBoundingClientRect(); return { fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, padding: s.padding, width: r.width, height: r.height, x: r.x, y: r.y, viewportWidth: innerWidth, viewportHeight: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth }; })) });
    const box = await dialog.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused(); expect(errors).toEqual([]);
  });
  test("persists the clock choice and books the same instant in a fractional-offset zone", async ({ page }, info) => {
    await page.goto(`demo/${event.slug}?tz=Asia%2FKathmandu`); await page.locator("button.day.open").first().click();
    const first = page.locator(".slot .t").first(); await expect(first).toHaveText(/(?:am|pm)$/); await first.click();
    await page.locator(".booking-zone-trigger").click(); await page.getByRole("radio", { name: "24h", exact: true }).check(); await page.keyboard.press("Escape");
    await expect(first).toHaveText(/^\d{2}:\d{2}$/); await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
    await page.reload(); await expect(first).toHaveText(/^\d{2}:\d{2}$/); await first.click(); await page.getByRole("button", { name: "Next", exact: true }).click();
    const instant = new URL(page.url()).searchParams.get("slot"); await expect(page.getByTestId("booking-timezone")).toHaveAttribute("data-timezone", "Asia/Kathmandu");
    await page.getByLabel("Name", { exact: true }).fill("Timezone QA"); await page.getByLabel("Email", { exact: true }).fill("timezone@example.invalid"); await page.screenshot({ path: info.outputPath("timezone-booking-details.png") });
    const response = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/api/bookings")); await page.getByRole("button", { name: "Book it", exact: true }).click(); const booked = await response; expect(booked.ok()).toBe(true); uid = (await booked.json()).uid;
    expect(booked.request().postDataJSON()).toMatchObject({ start: instant, tz: "Asia/Kathmandu" });
  });
  test("keeps a locked timezone fixed while allowing clock format changes without storage", async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage unavailable"); } }); });
    expect((await page.request.patch(`api/event-types/${event.id}`, { data: { lockedTimezone: "Asia/Tokyo" } })).ok()).toBe(true);
    await page.goto(`demo/${event.slug}?tz=America%2FNew_York`); await expect(page.locator(".booking-zone-trigger")).toHaveCount(0); await expect(page.getByTestId("booking-timezone")).toHaveAttribute("data-timezone", "Asia/Tokyo");
    await page.locator("button.day.open").first().click(); await page.getByRole("radio", { name: "24h", exact: true }).check(); await expect(page.locator(".slot .t").first()).toHaveText(/^\d{2}:\d{2}$/);
  });
});
