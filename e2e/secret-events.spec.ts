import { expect, test, type Page, type Route } from "@playwright/test";

async function action(page: Page, title: string, label: "Make secret" | "Make public") {
  await page.getByRole("button", { name: `More options for ${title}`, exact: true }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}
for (const width of [1440, 390]) {
  test.describe(`secret events at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    let event: { id: string; title: string; slug: string }, teamEventId: string | undefined;
    test.beforeEach(async ({ page }) => {
      teamEventId = undefined;
      await page.goto("login"); await page.getByRole("button", { name: "Use the demo account" }).click();
      const created = await page.request.post("api/event-types"); expect(created.ok()).toBeTruthy(); event = await created.json();
      event.title = `Visibility ${width} ${Date.now()}`;
      expect((await page.request.patch(`api/event-types/${event.id}`, { data: { title: event.title } })).ok()).toBeTruthy(); await page.reload();
    });
    test.afterEach(async ({ page }) => {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      if (teamEventId) await page.request.delete(`api/event-types/${teamEventId}`);
      await page.request.delete(`api/event-types/${event.id}`);
    });

    test("hides from the public page, preserves the direct page and restores public visibility", async ({ page }, info) => {
      const trigger = page.getByRole("button", { name: `More options for ${event.title}`, exact: true });
      await trigger.focus(); await trigger.press("ArrowDown");
      await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
      const secret = page.getByRole("menuitem", { name: "Make secret", exact: true }); await expect(secret).toBeFocused();
      await page.screenshot({ path: info.outputPath("public-event-menu.png") }); await secret.press("Enter");
      const card = page.getByTestId("event-type").filter({ hasText: event.title });
      await expect(card.getByRole("img", { name: "Secret event", exact: true })).toBeVisible();
      await expect(trigger).toBeEnabled(); await expect(trigger).toBeFocused();
      await page.screenshot({ path: info.outputPath("secret-event-card.png") });
      await info.attach("secret-card-styles.json", { contentType: "application/json", body: JSON.stringify(await card.evaluate(element => {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        return { fontFamily: style.fontFamily, fontSize: style.fontSize, color: style.color, padding: style.padding, gap: style.gap, width: rect.width, height: rect.height };
      })) });
      await page.goto("demo"); await expect(page.getByRole("link").filter({ hasText: event.title })).toHaveCount(0);
      await page.goto(`demo/${event.slug}`); await expect(page.getByRole("heading", { name: event.title, exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Pick a day", exact: true })).toBeVisible();
      await page.goto("app"); await action(page, event.title, "Make public"); await expect(card.getByRole("img", { name: "Secret event" })).toHaveCount(0);
      await expect(page.getByText("Event type made public", { exact: true })).toBeVisible();
      await page.goto("demo"); await expect(page.getByRole("link").filter({ hasText: event.title })).toBeVisible();
    });

    test("keeps prior visibility on pending, failed or mismatched responses and allows retry", async ({ page }, info) => {
      let pending: Route | undefined;
      await page.route(`**/api/event-types/${event.id}`, route => { pending = route; });
      await action(page, event.title, "Make secret"); await expect.poll(() => !!pending).toBe(true);
      const trigger = page.getByRole("button", { name: `More options for ${event.title}`, exact: true });
      const card = page.getByTestId("event-type").filter({ hasText: event.title });
      await expect(trigger).toBeDisabled(); await expect(card.getByRole("img", { name: "Secret event" })).toHaveCount(0);
      await pending!.fulfill({ status: 503, json: { error: "unavailable" } }); await expect(page.getByRole("alert")).toContainText("could not be confirmed");
      await page.screenshot({ path: info.outputPath("visibility-save-error.png") }); await expect(trigger).toBeEnabled();
      pending = undefined; await action(page, event.title, "Make secret"); await expect.poll(() => !!pending).toBe(true);
      await pending!.fulfill({ status: 200, json: { id: "wrong-event", secret: true } }); await expect(trigger).toBeEnabled();
      await expect(card.getByRole("img", { name: "Secret event" })).toHaveCount(0);
      await page.unroute(`**/api/event-types/${event.id}`); await action(page, event.title, "Make secret");
      await expect(card.getByRole("img", { name: "Secret event" })).toBeVisible(); await expect(page.getByRole("alert")).toHaveCount(0);
    });

    test("keeps an event secret after turning it off and on again", async ({ page }) => {
      await action(page, event.title, "Make secret");
      const trigger = page.getByRole("button", { name: `More options for ${event.title}`, exact: true });
      const card = page.getByTestId("event-type").filter({ hasText: event.title }); await expect(card.getByRole("img", { name: "Secret event" })).toBeVisible();
      await trigger.click(); await page.getByRole("menuitemcheckbox", { name: /Turn off/ }).click(); await expect(trigger).toBeEnabled();
      await page.goto(`demo/${event.slug}`); await expect(page.getByRole("heading", { name: "Pick a day", exact: true })).toHaveCount(0);
      await page.goto("app"); await trigger.click(); await page.getByRole("menuitemcheckbox", { name: /Turn on/ }).click();
      await expect(page.getByText("Event type turned on", { exact: true })).toBeVisible(); await expect(card.getByRole("img", { name: "Secret event" })).toBeVisible();
      await page.goto("demo"); await expect(page.getByRole("link").filter({ hasText: event.title })).toHaveCount(0);
      await page.goto(`demo/${event.slug}`); await expect(page.getByRole("heading", { name: "Pick a day", exact: true })).toBeVisible();
    });

    test("lets team administrators hide and restore a team event without changing its direct link", async ({ page }, info) => {
      const slug = `visibility-${width}-${Date.now()}`;
      const created = await page.request.post("api/teams", { data: { name: "Visibility QA team", slug } }); expect(created.ok()).toBeTruthy(); const team = await created.json();
      const type = await page.request.post(`api/teams/${team.id}/event-types`, { data: { kind: "round_robin", title: `Team ${event.title}` } }); expect(type.ok()).toBeTruthy();
      const teamEvent = await type.json(); teamEventId = teamEvent.id;
      await page.goto("app/teams"); const card = page.getByTestId(`team-${slug}`).getByTestId("team-et");
      await card.getByRole("button", { name: "Make secret", exact: true }).click(); await expect(card.getByRole("img", { name: "Secret event" })).toBeVisible();
      await page.reload(); await expect(card.getByRole("button", { name: "Make public", exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath("secret-team-event.png") });
      await page.goto(`team/${slug}`); await expect(page.getByRole("link").filter({ hasText: teamEvent.title })).toHaveCount(0);
      await page.goto(`team/${slug}/${teamEvent.slug}`); await expect(page.getByRole("heading", { name: teamEvent.title, exact: true })).toBeVisible();
      await page.goto("app/teams"); await card.getByRole("button", { name: "Make public", exact: true }).click();
      await expect(card.getByRole("button", { name: "Make secret", exact: true })).toBeEnabled();
      await page.goto(`team/${slug}`); await expect(page.getByRole("link").filter({ hasText: teamEvent.title })).toBeVisible();
    });
  });
}
