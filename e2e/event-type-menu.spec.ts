import { expect, test, type Page, type Route } from "@playwright/test";

async function createEvent(page: Page, title: string) {
  const response = await page.request.post("api/event-types");
  expect(response.ok()).toBeTruthy();
  const event = await response.json();
  const changed = await page.request.patch(`api/event-types/${event.id}`, { data: { title } });
  expect(changed.ok()).toBeTruthy();
  return changed.json();
}

for (const width of [1440, 390]) {
  test.describe(`event card menu at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await page.goto("login");
      await page.getByRole("button", { name: "Use the demo account" }).click();
      await expect(page.getByRole("heading", { name: "Scheduling", exact: true })).toBeVisible();
    });

    test("menu keyboard navigation, dismissal and viewport containment", async ({ page }, info) => {
      const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
      const source = await createEvent(page, `Keyboard ${width}`);
      await page.reload();
      const trigger = page.getByRole("button", { name: `More options for ${source.title}`, exact: true });
      const menu = page.getByRole("menu", { name: `Options for ${source.title}`, exact: true });
      await trigger.focus(); await trigger.press("ArrowDown");
      await expect(menu.getByRole("menuitem", { name: "View booking page", exact: true })).toBeFocused();
      await page.keyboard.press("End");
      await expect(menu.getByRole("menuitemcheckbox")).toBeFocused();
      await page.keyboard.press("Home"); await page.keyboard.press("ArrowDown");
      await expect(menu.getByRole("menuitem", { name: "Edit", exact: true })).toBeFocused();
      const box = await menu.boundingBox(); expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(900);
      await page.screenshot({ path: info.outputPath("event-menu.png") });
      await page.keyboard.press("Escape"); await expect(menu).toBeHidden(); await expect(trigger).toBeFocused();
      await trigger.press("ArrowUp"); await expect(menu.getByRole("menuitemcheckbox")).toBeFocused();
      await page.keyboard.press("Tab"); await expect(menu).toBeHidden();
      await trigger.click(); await page.keyboard.press("Shift+Tab"); await expect(menu).toBeHidden();
      await trigger.click(); await page.getByRole("heading", { name: "Scheduling", exact: true }).click();
      await expect(menu).toBeHidden(); expect(errors).toEqual([]);
    });

    test("duplicate opens an independently editable copy and preserves its link when renamed", async ({ page }, info) => {
      const source = await createEvent(page, `Copy source ${width}`);
      await page.reload();
      await page.getByRole("button", { name: `More options for ${source.title}`, exact: true }).click();
      await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Edit event type" });
      await expect(editor.getByLabel("Name", { exact: true })).toHaveValue(`${source.title} (copy)`);
      await expect(editor.getByLabel("Name", { exact: true })).toBeFocused();
      await page.screenshot({ path: info.outputPath("duplicate-editor.png") });
      const saved = page.waitForResponse(r => r.request().method() === "PATCH" && r.url().includes("/api/event-types/"));
      await editor.getByLabel("Name", { exact: true }).fill(`Renamed copy ${width}`);
      await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      expect((await saved).ok()).toBeTruthy();
      await editor.getByRole("button", { name: "Close", exact: true }).click();
      await page.reload();
      await expect(page.getByRole("button", { name: `Edit ${source.title}`, exact: true })).toBeVisible();
      const copy = page.getByTestId("event-type").filter({ has: page.getByRole("button", { name: `Edit Renamed copy ${width}`, exact: true }) });
      await expect(copy.getByRole("link", { name: `View Renamed copy ${width}`, exact: true })).toHaveAttribute("href", `/calendlyisdead/demo/${source.slug}-copy`);
    });

    test("pending and failed duplication does not create a phantom card or report success", async ({ page }) => {
      const source = await createEvent(page, `Failure source ${width}`); await page.reload();
      const count = await page.getByTestId("event-type").count();
      let pending: Route | undefined;
      await page.route(`**/api/event-types/${source.id}/duplicate`, route => { pending = route; });
      await page.getByRole("button", { name: `More options for ${source.title}`, exact: true }).click();
      await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
      await expect.poll(() => !!pending).toBe(true);
      await expect(page.getByRole("button", { name: `More options for ${source.title}`, exact: true })).toBeDisabled();
      await pending!.fulfill({ status: 503, json: { error: "unavailable" } });
      await expect(page.getByRole("alert")).toContainText("could not be confirmed");
      await expect(page.getByTestId("event-type")).toHaveCount(count);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByText("Event type duplicated", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: `More options for ${source.title}`, exact: true })).toBeEnabled();
    });

    test("turned-off event stays selected in Add to website", async ({ page }) => {
      const source = await createEvent(page, `Embed source ${width}`); await page.reload();
      const trigger = page.getByRole("button", { name: `More options for ${source.title}`, exact: true });
      await trigger.click(); await page.getByRole("menuitemcheckbox", { name: /Turn off/ }).click();
      await trigger.click();
      await expect(page.getByRole("menuitemcheckbox", { name: /Turn on/ })).toHaveAttribute("aria-checked", "false");
      await page.getByRole("menuitem", { name: "Add to website", exact: true }).click();
      await expect(page.getByLabel("Event type", { exact: true })).toHaveValue(source.slug);
      await expect(page.getByRole("status")).toContainText("turned off");
      await expect(page.getByTestId("embed-code")).toContainText(`/demo/${source.slug}`);
    });

    test("clipboard rejection is reported honestly", async ({ page }) => {
      await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", {
        configurable: true, value: { writeText: async () => { throw new Error("Permission denied"); } },
      }));
      await page.reload();
      await page.getByRole("button", { name: "Copy link", exact: true }).first().click();
      await expect(page.getByRole("alert")).toContainText("could not be copied");
      await expect(page.getByText("Link copied", { exact: true })).toHaveCount(0);
    });

    test("copied managed template remains editable by its admin despite assignment locks", async ({ page }) => {
      const slug = `copy-${width}-${Date.now()}`;
      const teamResponse = await page.request.post("api/teams", { data: { name: "Copy test team", slug } });
      expect(teamResponse.ok()).toBeTruthy(); const team = await teamResponse.json();
      const eventResponse = await page.request.post(`api/teams/${team.id}/event-types`, { data: { kind: "managed", title: `Managed ${width}` } });
      expect(eventResponse.ok()).toBeTruthy();
      await page.goto("app/teams");
      await page.getByTestId(`team-${slug}`).getByRole("button", { name: "Duplicate", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Edit event type" });
      await expect(editor.getByLabel("Duration (minutes)")).toBeEnabled();
      const saved = page.waitForResponse(r => r.request().method() === "PATCH" && r.url().includes("/api/event-types/"));
      await editor.getByLabel("Duration (minutes)").fill("45");
      await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      expect((await saved).ok()).toBeTruthy();
      await editor.getByRole("button", { name: "Close", exact: true }).click(); await page.reload();
      await expect(page.getByTestId(`team-${slug}`).getByTestId("team-et").filter({ hasText: `Managed ${width} (copy)` })).toContainText("45 min");
    });
  });
}
