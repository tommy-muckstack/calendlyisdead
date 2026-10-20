import { expect, test } from "@playwright/test";
for (const width of [1440, 390]) test.describe(`My link at ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  test.beforeEach(async ({ page }) => {
    await page.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await page.request.post("api/session/demo?who=host");
    const current = await (await page.request.get("api/settings/my-link")).json();
    expect((await page.request.patch("api/settings/my-link", { data: { username: "demo", expectedUsername: current.username } })).status()).toBe(200);
    await page.goto("app/profile"); await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "My link", exact: true }).click();
  });
  test("opens the editor, saves by keyboard and refreshes public URLs", async ({ page }, info) => {
    const input = page.getByLabel("Your link", { exact: true });
    await expect(page.getByRole("heading", { name: "My link", exact: true })).toBeVisible(); await expect(input).toHaveValue("demo");
    await expect(page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "My link", exact: true })).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: info.outputPath("my-link-before.png") });
    await input.fill(`new-host-${width}`); await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeFocused(); await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText("Changes saved"); await expect(input).toBeFocused();
    expect((await page.request.get("demo")).status()).toBe(404); expect((await page.request.get("demo/30min")).status()).toBe(404);
    expect((await page.request.get(`new-host-${width}/30min`)).status()).toBe(200);
    await page.reload(); await expect(input).toHaveValue(`new-host-${width}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("my-link-after.png") });
    await info.attach("my-link-styles.json", { contentType: "application/json", body: JSON.stringify(await input.evaluate(element => { const s = getComputedStyle(element); return { fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, color: s.color, padding: s.padding, width: s.width }; })) });
    await page.getByRole("link", { name: "Close settings", exact: true }).click();
    await expect(page.getByRole("link", { name: "View landing page" })).toHaveAttribute("href", `/calendlyisdead/new-host-${width}`);
  });
  test("validates a reserved name and preserves a failed draft for retry", async ({ page }, info) => {
    const input = page.getByLabel("Your link", { exact: true }), save = page.getByRole("button", { name: "Save changes", exact: true });
    await input.fill("app"); await save.click(); await expect(page.getByRole("alert")).toContainText("reserved"); await expect(page.getByRole("alert")).toBeFocused();
    await input.fill("sam"); await save.click(); await expect(page.getByRole("alert")).toContainText("already in use"); await expect(input).toHaveValue("sam");
    await page.route("**/api/settings/my-link", route => route.fulfill({ status: 500, json: { error: "save_failed" } }), { times: 1 });
    await input.fill(`retry-${width}`); await save.click(); await expect(page.getByRole("alert")).toContainText("could not be confirmed"); await expect(input).toHaveValue(`retry-${width}`);
    await page.screenshot({ path: info.outputPath("my-link-error.png") });
    await save.click(); await expect(page.getByRole("status")).toContainText("Changes saved");
  });
  test("requires an explicit reload when a second session changed the link", async ({ page }) => {
    const input = page.getByLabel("Your link", { exact: true }); await input.fill(`draft-${width}`);
    expect((await page.request.patch("api/settings/my-link", { data: { username: `other-session-${width}`, expectedUsername: "demo" } })).status()).toBe(200);
    await page.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("another session"); await expect(input).toHaveValue(`draft-${width}`);
    await page.getByRole("button", { name: "Discard draft and load current link", exact: true }).click(); await expect(input).toHaveValue(`other-session-${width}`); await expect(input).toBeFocused();
    await input.fill(`final-${width}`); await page.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Changes saved");
  });
  test("cancels local edits, guards navigation and reports clipboard failure honestly", async ({ page }) => {
    const input = page.getByLabel("Your link", { exact: true }); await input.fill("discard-me"); await page.getByRole("button", { name: "Cancel changes", exact: true }).click(); await expect(input).toHaveValue("demo"); await expect(input).toBeFocused();
    await input.fill("stay-here"); page.once("dialog", dialog => dialog.dismiss()); await page.getByRole("link", { name: "Close settings", exact: true }).click(); await expect(input).toHaveValue("stay-here");
    await page.getByRole("button", { name: "Cancel changes", exact: true }).click();
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } }));
    await page.getByRole("button", { name: "Copy link", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("could not be copied");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { (window as unknown as { copied: string }).copied = value; } } }));
    await page.getByRole("button", { name: "Copy link", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Link copied"); expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe("http://127.0.0.1:3159/calendlyisdead/demo");
  });
});
