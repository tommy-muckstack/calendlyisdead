import { expect, test, type Route } from "@playwright/test";

for (const width of [1440, 390]) {
  test.describe(`event editor at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await page.goto("login");
      await page.getByRole("button", { name: "Use the demo account" }).click();
      await expect(page.getByRole("heading", { name: "Scheduling", exact: true })).toBeVisible();
      const response = await page.request.post("api/event-types");
      expect(response.ok()).toBeTruthy(); const event = await response.json();
      await page.request.patch(`api/event-types/${event.id}`, { data: { title: `Editor ${width}` } });
      await page.reload();
      await page.getByRole("button", { name: `Edit Editor ${width}`, exact: true }).click();
    });

    test("keeps edits local until Save changes, then persists after reload", async ({ page }, info) => {
      const requests: string[] = [];
      page.on("request", r => { if (r.method() === "PATCH") requests.push(r.url()); });
      const editor = page.getByRole("dialog", { name: "Edit event type" });
      await editor.getByLabel("Name", { exact: true }).fill(`Saved editor ${width}`);
      // Exceeds the removed 600 ms debounce, guarding against accidental autosave.
      await page.waitForTimeout(800); expect(requests).toEqual([]);
      await page.screenshot({ path: info.outputPath("editor-unsaved.png") });
      await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
      await expect(editor.getByRole("status")).toHaveText("Changes saved");
      expect(requests).toHaveLength(1);
      await editor.getByRole("button", { name: "Close", exact: true }).click();
      await page.reload();
      await expect(page.getByRole("button", { name: `Edit Saved editor ${width}`, exact: true })).toBeVisible();
    });

    test("pending and failed saves preserve the draft and allow retry", async ({ page }, info) => {
      const editor = page.getByRole("dialog", { name: "Edit event type" });
      let pending: Route | undefined; let count = 0;
      await page.route("**/api/event-types/*", route => {
        if (route.request().method() !== "PATCH") return route.continue();
        pending = route; count++;
      });
      await editor.getByLabel("Name", { exact: true }).fill(`Retry editor ${width}`);
      await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect.poll(() => !!pending).toBe(true);
      await expect(editor.getByLabel("Name", { exact: true })).toBeDisabled();
      await expect(editor.getByRole("button", { name: "Close", exact: true })).toBeDisabled();
      await page.keyboard.press("Escape"); await expect(editor).toBeVisible();
      await pending!.fulfill({ status: 503, body: "Service unavailable" });
      await expect(editor.getByRole("alert")).toContainText("Your edits are still here");
      await expect(editor.getByRole("alert")).toBeFocused();
      await expect(editor.getByLabel("Name", { exact: true })).toHaveValue(`Retry editor ${width}`);
      await page.screenshot({ path: info.outputPath("editor-save-failure.png") });
      await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect.poll(() => count).toBe(2); await pending!.continue();
      await expect(editor.getByRole("status")).toHaveText("Changes saved");
      await expect(editor.getByRole("alert")).toHaveCount(0);
    });

    test("confirms discarding through Close and Escape, contains focus and returns it", async ({ page }) => {
      const editor = page.getByRole("dialog", { name: "Edit event type" });
      await expect(editor.getByLabel("Name", { exact: true })).toBeFocused();
      const box = await editor.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width); expect(box!.height).toBeLessThanOrEqual(900);
      await editor.getByLabel("Name", { exact: true }).fill("Discard this draft");
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press("Tab");
        expect(await editor.evaluate(el => el.contains(document.activeElement))).toBe(true);
      }
      page.once("dialog", d => d.dismiss());
      await editor.getByRole("button", { name: "Close", exact: true }).click();
      await expect(editor.getByLabel("Name", { exact: true })).toHaveValue("Discard this draft");
      page.once("dialog", d => d.accept()); await page.keyboard.press("Escape");
      await expect(editor).toHaveCount(0);
      const trigger = page.getByRole("button", { name: `Edit Editor ${width}`, exact: true });
      await expect(trigger).toBeFocused(); await trigger.click();
      await expect(editor.getByLabel("Name", { exact: true })).toHaveValue(`Editor ${width}`);
    });

    test("invalid questions stay in the draft and are not silently dropped", async ({ page }) => {
      const editor = page.getByRole("dialog", { name: "Edit event type" });
      const patches: string[] = []; page.on("request", r => { if (r.method() === "PATCH") patches.push(r.url()); });
      await editor.getByRole("button", { name: /^Invitee questions/ }).click();
      await editor.getByRole("button", { name: "+ Add question", exact: true }).click();
      await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(editor.getByRole("alert")).toContainText("Invitee questions");
      await expect(editor.getByLabel("Question 1", { exact: true })).toHaveValue("");
      expect(patches).toEqual([]);
    });
  });
}
