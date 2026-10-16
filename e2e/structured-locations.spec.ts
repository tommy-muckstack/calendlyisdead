import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) test.describe(`location picker at ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  test("creates phone and hidden custom options, then books and reschedules between them", async ({ page }, info) => {
    await page.request.post("api/session/demo?who=host"); await page.goto("app");
    await page.locator(".cs-actions").getByRole("button", { name: "Create", exact: true }).click();
    await page.getByRole("menuitem", { name: "One-on-one", exact: true }).click();
    const draft = page.getByRole("dialog", { name: "New event type" });
    await draft.getByLabel("Name", { exact: true }).fill(`Location choices ${width}`);
    await draft.getByRole("button", { name: /^Location/ }).click(); await draft.getByRole("button", { name: "Phone call", exact: true }).click();
    await expect(draft.getByLabel("Who will place the call?")).toHaveValue("host_calls");
    await draft.getByRole("button", { name: "All options", exact: true }).click(); await draft.getByRole("button", { name: "Custom", exact: true }).click();
    const secret = `Private room instructions ${width}`; await draft.getByLabel("Location details", { exact: true }).fill(secret); await draft.getByLabel("Display details on the booking page").uncheck();
    await page.screenshot({ path: info.outputPath("configured-location-choices.png") });
    await info.attach("location-picker-styles.json", { contentType: "application/json", body: JSON.stringify(await draft.locator(".location-editor").evaluate(element => { const style = getComputedStyle(element); return { fontFamily: style.fontFamily, fontSize: style.fontSize, width: style.width, padding: style.padding, overflow: element.scrollWidth > element.clientWidth }; })) });
    const createdResponse = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/event-types"));
    await draft.getByRole("button", { name: "Create", exact: true }).click(); const response = await createdResponse; expect(response.ok()).toBe(true); const event = (await response.json()).event;
    await page.getByRole("dialog", { name: "Edit event type" }).getByRole("button", { name: "Close", exact: true }).click();
    const from = new Date(Date.now() + 864e5).toISOString().slice(0, 10), to = new Date(Date.now() + 8 * 864e5).toISOString().slice(0, 10);
    const availability = await page.request.get(`api/slots?${new URLSearchParams({ user: "demo", slug: event.slug, from, to, tz: "UTC" })}`); expect(availability.ok()).toBe(true); const start = (Object.values((await availability.json()).slots).flat() as string[])[0]; expect(start).toBeTruthy();
    await page.goto(`demo/${event.slug}?${new URLSearchParams({ slot: start, tz: "UTC" })}`); expect(await page.content()).not.toContain(secret);
    await page.getByLabel("Name", { exact: true }).fill("Location invitee"); await page.getByLabel("Email", { exact: true }).fill("location-choice@example.invalid");
    await page.getByRole("radio", { name: /Phone call/ }).check();
    let posts = 0; page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/api/bookings")) posts++; });
    await page.getByRole("button", { name: "Book it", exact: true }).click(); expect(posts).toBe(0); await expect(page.getByLabel("Phone number *", { exact: true })).toBeFocused();
    await page.getByLabel("Phone number *", { exact: true }).fill("+1 212 555 0102"); await page.screenshot({ path: info.outputPath("invitee-location-phone.png") });
    const bookingResponse = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/bookings")); await page.getByRole("button", { name: "Book it", exact: true }).click(); const booked = await bookingResponse; expect(booked.ok()).toBe(true); const uid = (await booked.json()).uid;
    await expect(page.getByText("Phone call: +1 212 555 0102", { exact: true })).toBeVisible();
    await page.goto(`booking/${uid}/reschedule`); const url = new URL(page.url()); url.searchParams.set("slot", start); await page.goto(url.toString());
    await expect(page.getByLabel("Phone number *", { exact: true })).toHaveValue("+1 212 555 0102"); await page.getByRole("radio", { name: /Custom/ }).check(); expect(await page.content()).not.toContain(secret);
    const moveResponse = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/bookings")); await page.getByRole("button", { name: "Confirm new time", exact: true }).click(); const moved = await moveResponse; expect(moved.ok()).toBe(true); const movedUid = (await moved.json()).uid;
    await expect(page.getByText(secret, { exact: true })).toBeVisible(); await page.screenshot({ path: info.outputPath("hidden-location-after-booking.png") });
    expect((await page.request.post(`api/bookings/${movedUid}/cancel`, { data: { reason: "Local QA cleanup" } })).ok()).toBe(true); expect((await page.request.delete(`api/event-types/${event.id}`)).ok()).toBe(true);
  });
  test("validates a supplied video link while preserving the unsaved draft", async ({ page }, info) => {
    await page.request.post("api/session/demo?who=host"); await page.goto("app"); await page.locator(".cs-actions").getByRole("button", { name: "Create", exact: true }).click(); await page.getByRole("menuitem", { name: "One-on-one", exact: true }).click();
    const draft = page.getByRole("dialog", { name: "New event type" }); await draft.getByLabel("Name", { exact: true }).fill("Video draft"); await draft.getByRole("button", { name: /^Location/ }).click(); await draft.getByRole("button", { name: "Zoom", exact: true }).click();
    await draft.getByLabel("Meeting link", { exact: true }).fill("javascript:alert(1)"); await draft.getByRole("button", { name: "Create", exact: true }).click(); await expect(draft.getByRole("alert")).toBeVisible(); await expect(draft.getByLabel("Meeting link", { exact: true })).toHaveValue("javascript:alert(1)");
    await page.screenshot({ path: info.outputPath("video-location-validation.png") });
    await draft.getByLabel("Meeting link", { exact: true }).fill("https://example.invalid/qa-room"); await expect(draft.getByText(/Automatic link creation is not configured/)).toBeVisible();
    page.once("dialog", dialog => dialog.accept()); await draft.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(page.getByTestId("event-type").filter({ hasText: "Video draft" })).toHaveCount(0);
  });
});
