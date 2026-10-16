import { expect, test } from "@playwright/test";
import { initialEventFields } from "../lib/event-creation-validation";

for (const width of [1440, 390]) test.describe(`booked locations at ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  test("an edit preserves the booked location until explicit rescheduling", async ({ page }, info) => {
    await page.request.post("api/session/demo?who=host");
    const response = await page.request.post("api/event-types", { data: {
      draftId: crypto.randomUUID(), autoSlug: true,
      settings: { ...initialEventFields("one_on_one", null), title: `Location snapshot ${width}`, slug: `location-snapshot-${width}`, location: "Original QA room", minNoticeMin: 0 },
    } });
    expect(response.ok()).toBe(true); const event = (await response.json()).event;
    const from = new Date(Date.now() + 864e5).toISOString().slice(0, 10), to = new Date(Date.now() + 8 * 864e5).toISOString().slice(0, 10);
    const available = await page.request.get(`api/slots?${new URLSearchParams({ user: "demo", slug: event.slug, from, to, tz: "UTC" })}`);
    expect(available.ok()).toBe(true); const start = (Object.values((await available.json()).slots).flat() as string[])[0]; expect(start).toBeTruthy();
    const booked = await page.request.post("api/bookings", { data: { username: "demo", slug: event.slug, start, name: "Location invitee", email: "location-e2e@example.invalid", tz: "UTC" } });
    expect(booked.ok()).toBe(true); const uid = (await booked.json()).uid;
    await page.goto(`booking/${uid}`); await expect(page.getByText("Original QA room", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("location-before-edit.png") });
    expect((await page.request.patch(`api/event-types/${event.id}`, { data: { location: "Replacement QA room" } })).ok()).toBe(true);
    await page.reload(); await expect(page.getByText("Original QA room", { exact: true })).toBeVisible(); await expect(page.getByText("Replacement QA room", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("location-after-event-edit.png") });
    await page.goto(`app/meetings/${uid}`); await expect(page.getByText("Original QA room", { exact: true })).toBeVisible();
    await page.goto(`booking/${uid}/reschedule`); const url = new URL(page.url()); url.searchParams.set("slot", start); await page.goto(url.toString());
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Location invitee");
    const movedResponse = page.waitForResponse(res => res.request().method() === "POST" && res.url().endsWith("/api/bookings"));
    await page.getByRole("button", { name: "Confirm new time", exact: true }).click(); const moved = await movedResponse; expect(moved.ok()).toBe(true); const movedUid = (await moved.json()).uid;
    await expect(page.getByTestId("confirm-heading")).toHaveText("You're booked"); await expect(page.getByText("Replacement QA room", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("location-after-rescheduling.png") });
    expect((await page.request.post(`api/bookings/${movedUid}/cancel`, { data: { reason: "Local QA cleanup" } })).ok()).toBe(true);
    expect((await page.request.delete(`api/event-types/${event.id}`)).ok()).toBe(true);
  });
});
