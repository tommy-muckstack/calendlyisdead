import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test.describe(`choose event kind at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await page.goto("login");
      await page.getByRole("button", { name: "Use the demo account" }).click();
      await expect(page.getByRole("heading", { name: "Scheduling", exact: true })).toBeVisible();
    });

    test("keyboard selection creates a group directly, then saves and reopens it", async ({ page }, info) => {
      const posts: string[] = [];
      page.on("request", r => { if (r.method() === "POST" && r.url().endsWith("/api/event-types")) posts.push(r.postData()!); });
      const trigger = page.locator(".cs-actions").getByRole("button", { name: "Create", exact: true });
      await trigger.focus(); await trigger.press("ArrowDown");
      const menu = page.getByRole("menu", { name: "Create", exact: true });
      await expect(menu.getByRole("menuitem", { name: "One-on-one", exact: true })).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(menu.getByRole("menuitem", { name: "Group", exact: true })).toBeFocused();
      expect(posts).toEqual([]);
      const box = await menu.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: info.outputPath("create-kinds.png") });
      await page.keyboard.press("Escape"); await expect(trigger).toBeFocused(); await expect(menu).toHaveCount(0);
      await trigger.press("ArrowDown"); await page.keyboard.press("ArrowDown");
      const created = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/api/event-types"));
      await page.keyboard.press("Enter"); const response = await created; expect(response.ok()).toBeTruthy();
      const event = await response.json(); expect(event.kind).toBe("group"); expect(posts).toEqual(['{"kind":"group"}']);
      const editor = page.getByRole("dialog", { name: "Edit event type" });
      await expect(editor.getByTestId("event-kind")).toContainText("Group");
      await expect(editor.getByLabel("Invitee limit", { exact: true })).toHaveValue("2");
      await expect(editor.getByRole("combobox", { name: "Type", exact: true })).toHaveCount(0);
      const title = `Group ${width} ${Date.now()}`;
      await editor.getByLabel("Name", { exact: true }).fill(title);
      await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(editor.locator("footer").getByRole("status")).toHaveText("Changes saved");
      await page.screenshot({ path: info.outputPath("created-group.png") });
      await editor.getByRole("button", { name: "Close", exact: true }).click(); await page.reload();
      await page.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
      await expect(editor.getByTestId("event-kind")).toContainText("Group");
      const conversion = await page.request.patch(`api/event-types/${event.id}`, { data: { kind: "one_on_one", title: "Must not save" } });
      expect(conversion.status()).toBe(409); expect(await conversion.json()).toEqual({ error: "event_kind_locked" });
    });

    test("creation from another scheduling tab preserves the chosen kind without repeating on reload", async ({ page }) => {
      await page.goto("app/polls");
      const posts: string[] = []; page.on("request", r => { if (r.method() === "POST" && r.url().endsWith("/api/event-types")) posts.push(r.postData()!); });
      await page.locator(".cs-actions").getByRole("button", { name: "Create", exact: true }).click();
      await page.getByRole("menuitem", { name: "One-on-one", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Edit event type" });
      await expect(editor.getByTestId("event-kind")).toContainText("One-on-one");
      expect(posts).toEqual(['{"kind":"one_on_one"}']);
      await expect(page).toHaveURL(/\/calendlyisdead\/app$/);
      await page.reload(); await expect(editor).toHaveCount(0); expect(posts).toHaveLength(1);
    });

    test("uncertain creation does not add a phantom card or blindly retry", async ({ page }, info) => {
      const count = await page.getByTestId("event-type").count(); let posts = 0;
      await page.route("**/api/event-types", async route => {
        if (route.request().method() !== "POST") return route.continue();
        posts++; await route.fulfill({ status: 503, body: "Unavailable" });
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        await page.locator(".cs-actions").getByRole("button", { name: "Create", exact: true }).click();
        await page.getByRole("menuitem", { name: "Group", exact: true }).click();
        await expect(page.getByRole("alert")).toContainText("Creation could not be confirmed");
      }
      expect(posts).toBe(1); await expect(page.getByTestId("event-type")).toHaveCount(count);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Reload event types", exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath("create-failure.png") });
    });
  });
}
