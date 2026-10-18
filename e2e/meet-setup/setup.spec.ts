import { expect, test } from "@playwright/test";
for (const width of [1440, 390]) test.describe(`Automatic Meet setup at ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  test.beforeEach(async ({ page }) => { await page.request.post("api/session/demo?who=host"); await page.request.put("api/calendars/add-to", { data: { calendarId: "conference-calendar" } }); });
  for (const failed of [false, true]) test(failed ? "configures automatic Meet and shows a provider failure" : "creates an automatic event through the editor and resolves a pending room", async ({ page }, info) => {
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto("app"); await page.locator(".cs-actions").getByRole("button", { name: "Create", exact: true }).click(); await page.getByRole("menuitem", { name: "One-on-one", exact: true }).click();
    const draft = page.getByRole("dialog", { name: "New event type" }); await draft.getByLabel("Name", { exact: true }).fill(failed ? "Failure QA" : "Automatic Meet QA");
    await draft.getByRole("button", { name: /^Location/ }).click(); await draft.getByRole("button", { name: "All options", exact: true }).click(); await draft.getByRole("button", { name: "Google Meet", exact: true }).click();
    await expect(draft.getByLabel("Google Meet setup", { exact: true })).toHaveValue("automatic"); await expect(draft.getByLabel("Meeting link", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("automatic-meet-editor.png") });
    await info.attach("automatic-meet-styles.json", { contentType: "application/json", body: JSON.stringify(await draft.locator(".location-config").evaluate(element => { const s = getComputedStyle(element); return { fontFamily: s.fontFamily, fontSize: s.fontSize, padding: s.padding, width: element.getBoundingClientRect().width, overflow: element.scrollWidth > element.clientWidth }; })) });
    const creation = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/event-types")); await draft.getByRole("button", { name: "Create", exact: true }).click(); const made = await creation; expect(made.ok()).toBe(true); const event = (await made.json()).event; expect(event.locations[0].kind).toBe("google_meet");
    const from = new Date(Date.now() + 864e5).toISOString().slice(0,10), to = new Date(Date.now() + 8*864e5).toISOString().slice(0,10);
    const availability = await page.request.get(`api/slots?${new URLSearchParams({ user: "demo", slug: event.slug, from, to, tz: "UTC" })}`); expect(availability.ok()).toBe(true); const start = (Object.values((await availability.json()).slots).flat() as string[])[0]; expect(start).toBeTruthy();
    await page.goto(`demo/${event.slug}?${new URLSearchParams({ slot: start, tz: "UTC" })}`); await page.getByLabel("Name", { exact: true }).fill("Meet invitee"); await page.getByLabel("Email", { exact: true }).fill("meet-setup@example.invalid");
    const reservation = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/bookings")); await page.getByRole("button", { name: "Book it", exact: true }).click(); const booked = await reservation; expect(booked.ok()).toBe(true); const uid = (await booked.json()).uid;
    await expect(page.getByRole("status").filter({ hasText: failed ? "Contact your host" : "Google Meet is preparing" })).toBeVisible(); await expect(page.getByTestId("meeting-url")).toHaveCount(0);
    if (!failed) { expect((await page.request.get("api/cron/workflows", { headers: { authorization: "Bearer conference-e2e-only" } })).ok()).toBe(true); await page.reload(); await expect(page.getByTestId("meeting-url")).toHaveAttribute("href", `https://meet.google.com/qa-qa-${uid}`); }
    await page.screenshot({ path: info.outputPath(failed ? "automatic-meet-failed.png" : "automatic-meet-ready.png") }); expect(errors).toEqual([]);
    await page.request.post(`api/bookings/${uid}/cancel`, { data: { reason: "Local QA cleanup" } }); await page.request.delete(`api/event-types/${event.id}`);
  });
  test("retains a failed draft and lets the host choose a reusable link", async ({ page }, info) => {
    await page.request.put("api/calendars/add-to", { data: { calendarId: null } }); await page.goto("app?new=one_on_one");
    const draft = page.getByRole("dialog", { name: "New event type" }); await draft.getByLabel("Name", { exact: true }).fill("Meet draft"); await draft.getByRole("button", { name: /^Location/ }).click(); await draft.getByRole("button", { name: "All options", exact: true }).click(); await draft.getByRole("button", { name: "Google Meet", exact: true }).click();
    await draft.getByRole("button", { name: "Create", exact: true }).click(); await expect(draft.getByRole("alert")).toContainText("each host must select"); await expect(draft.getByRole("alert")).toBeFocused();
    await expect(draft.getByLabel("Google Meet setup", { exact: true })).toHaveValue("automatic"); await page.screenshot({ path: info.outputPath("automatic-meet-setup-error.png") });
    await draft.getByLabel("Google Meet setup", { exact: true }).selectOption("link"); await draft.getByLabel("Meeting link", { exact: true }).fill("https://meet.google.com/reused-room");
    const creation = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/event-types")); await draft.getByRole("button", { name: "Create", exact: true }).click(); const made = await creation; expect(made.ok()).toBe(true); const event = (await made.json()).event; expect(event.locations[0]).toMatchObject({ kind: "video", provider: "google_meet", url: "https://meet.google.com/reused-room" });
    await page.request.delete(`api/event-types/${event.id}`);
  });
});
