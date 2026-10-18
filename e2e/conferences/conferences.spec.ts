import { expect, test } from "@playwright/test";
for (const width of [1440, 390]) test.describe(`Google conference states at ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  for (const failed of [false, true]) test(failed ? "shows provider failure without a demo room" : "updates pending joining details after provider completion", async ({ page }, info) => {
    await page.request.post("api/session/demo?who=host");
    const created = await page.request.post("api/event-types", { data: { kind: "one_on_one" } }); expect(created.ok()).toBe(true); const event = await created.json();
    expect((await page.request.patch(`api/event-types/${event.id}`, { data: { title: failed ? "Failure QA" : "Pending Meet QA", location: "Google Meet", minNoticeMin: 0 } })).ok()).toBe(true);
    const from = new Date(Date.now()+864e5).toISOString().slice(0,10), to = new Date(Date.now()+8*864e5).toISOString().slice(0,10);
    const availability = await page.request.get(`api/slots?${new URLSearchParams({ user: "demo", slug: event.slug, from, to, tz: "UTC" })}`); expect(availability.ok()).toBe(true);
    const start = (Object.values((await availability.json()).slots).flat() as string[])[0]; expect(start).toBeTruthy();
    await page.goto(`demo/${event.slug}?${new URLSearchParams({ slot: start, tz: "UTC" })}`);
    await page.getByLabel("Name", { exact: true }).fill("Conference QA"); await page.getByLabel("Email", { exact: true }).fill("conference@example.invalid");
    const response = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/api/bookings"));
    await page.getByRole("button", { name: "Book it", exact: true }).click(); const booked = await response; expect(booked.ok()).toBe(true); const uid = (await booked.json()).uid;
    await expect(page.getByRole("status").filter({ hasText: failed ? "Contact your host" : "Google Meet is preparing" })).toBeVisible();
    await expect(page.getByTestId("meeting-url")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(failed ? "conference-failed.png" : "conference-pending.png") });
    await info.attach("conference-status-styles.json", { contentType: "application/json", body: JSON.stringify(await page.getByRole("status").filter({ hasText: "Google Meet" }).evaluate(element => { const style = getComputedStyle(element); return { fontFamily: style.fontFamily, fontSize: style.fontSize, color: style.color, width: style.width, overflow: element.scrollWidth > element.clientWidth }; })) });
    if (!failed) {
      const run = await page.request.get("api/cron/workflows", { headers: { authorization: "Bearer conference-e2e-only" } }); expect(run.ok()).toBe(true);
      const result = await run.json(); expect(result.conferences.ready).toBe(1); expect(result.conferenceDeliveries).toMatchObject({ local: 2, updated: 1 });
      const retry = await page.request.get("api/cron/workflows", { headers: { authorization: "Bearer conference-e2e-only" } }); expect((await retry.json()).conferenceDeliveries).toMatchObject({ local: 0, updated: 0 });
      await page.reload(); const link = page.getByTestId("meeting-url"); await expect(link).toHaveAttribute("href", `https://meet.google.com/qa-qa-${uid}`); await link.focus(); await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Reschedule", exact: true })).toBeFocused(); await page.keyboard.press("Shift+Tab"); await expect(link).toBeFocused();
      await expect(page.getByRole("status").filter({ hasText: "Google Meet is preparing" })).toHaveCount(0); await page.screenshot({ path: info.outputPath("conference-ready.png") });
      await page.goto(`app/meetings/${uid}`); await expect(page.getByRole("link", { name: "Join meeting", exact: true })).toHaveAttribute("href", `https://meet.google.com/qa-qa-${uid}`);
    }
    expect((await page.request.post(`api/bookings/${uid}/cancel`, { data: { reason: "Local QA cleanup" } })).ok()).toBe(true);
    expect((await page.request.delete(`api/event-types/${event.id}`)).ok()).toBe(true);
  });
});
