import { test, expect, Page } from "@playwright/test";
const shots = "research/ours";
const login = async (page: Page) => {
  await page.goto("login");
  await page.getByRole("button", { name: "Use the demo account" }).click();
  await expect(page.getByRole("heading", { name: "Scheduling" })).toBeVisible();
};
const pickFirstSlot = async (page: Page, nthDay = 0, nthSlot = 0) => {
  await page.locator("button.day.open").first().waitFor();
  await page.locator("button.day.open").nth(nthDay).click();
  await page.locator(".slot button.t").nth(nthSlot).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
};

test.describe.serial("M6-M9", () => {
  test("landing page compares prices", async ({ page }) => {
    await page.goto("");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("pricing");
    await expect(page.getByRole("heading", { name: "Compare features" })).toBeVisible();
    await expect(page.getByTestId("cost-standard")).toHaveText("$1,200");
    await page.getByLabel(/Team size/).fill("50");
    await expect(page.getByTestId("cost-teams")).toHaveText("$9,600");
    await expect(page.getByTestId("cost-ours")).toHaveText("$0");
    await expect(page.getByTestId("feature-table")).toContainText("Routing forms");
    await page.screenshot({ path: `${shots}/20-landing.png`, fullPage: true });
  });

  test("paid booking via demo checkout, Zoom demo room", async ({ page }) => {
    await login(page);
    const et = await (await page.request.post("api/event-types")).json();
    expect((await page.request.patch(`api/event-types/${et.id}`, { data: { title: "Paid coaching", slug: "coaching", priceCents: 4900, location: "Zoom" } })).ok()).toBe(true);
    await page.goto("demo/coaching");
    await expect(page.getByTestId("price")).toContainText("$49.00");
    await pickFirstSlot(page);
    await page.getByLabel("Name").fill("Pat Payer"); await page.getByLabel("Email", { exact: true }).fill("pat@example.com");
    await page.getByRole("button", { name: /Continue to payment/ }).click();
    await expect(page.getByTestId("amount")).toHaveText("$49.00");
    await page.screenshot({ path: `${shots}/21-demo-checkout.png` });
    await page.getByRole("button", { name: "Pay (demo)" }).click();
    await expect(page.getByTestId("confirm-heading")).toHaveText("You're booked");
    await expect(page.getByTestId("paid")).toContainText("$49.00");
    await expect(page.getByTestId("meeting-url")).toContainText("/meet/zoom-");
    await page.goto("app/analytics");
    await expect(page.getByTestId("stat-revenue")).toHaveText("$49.00");
    await page.screenshot({ path: `${shots}/22-analytics.png`, fullPage: true });
  });

  test("branding: color, hide powered-by", async ({ page }) => {
    await login(page);
    await page.goto("demo/30min");
    await expect(page.getByTestId("powered-by")).toBeVisible();
    await page.goto("app/branding");
    await page.getByLabel(/Hide "Powered by/).check();
    await expect(page.getByRole("status")).toHaveText("Saved");
    expect((await page.request.patch("api/me/branding", { data: { brandColor: "#7a3cff" } })).ok()).toBe(true);
    expect((await page.request.patch("api/me/branding", { data: { logoUrl: "javascript:alert(1)" } })).status()).toBe(400);
    await page.goto("demo/30min");
    await expect(page.getByTestId("powered-by")).toHaveCount(0);
    const brand = await page.getByTestId("brand-frame").evaluate(el => getComputedStyle(el).getPropertyValue("--brand").trim());
    expect(brand).toBe("#7a3cff");
    await page.request.patch("api/me/branding", { data: { brandColor: null, hideBranding: false } });
  });

  test("embeds: inline, popup text and popup widget on a third-party page", async ({ page }) => {
    await page.goto("embed-demo.html");
    const inline = page.frameLocator(".cid-inline iframe");
    await expect(inline.getByRole("heading", { name: /Quick chat/ })).toBeVisible();
    await page.getByRole("link", { name: "Open the popup" }).click();
    const dlg = page.getByRole("dialog", { name: "Schedule a meeting" });
    await expect(dlg).toBeVisible();
    await page.keyboard.press("Escape"); await expect(dlg).toHaveCount(0);
    await page.getByRole("button", { name: "Book a deep dive" }).click();
    await expect(page.frameLocator(".cid-modal iframe").getByRole("heading", { name: /Deep dive/ })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    // book inside the inline frame; parent page hears about it
    await inline.locator("button.day.open").first().waitFor();
    await inline.locator("button.day.open").nth(2).click();
    await inline.locator(".slot button.t").nth(1).click();
    await inline.getByRole("button", { name: "Next", exact: true }).click();
    await inline.getByLabel("Name").fill("Em Bed"); await inline.getByLabel("Email", { exact: true }).fill("embed@example.com");
    await inline.getByRole("button", { name: "Book it" }).click();
    await expect(inline.getByTestId("confirm-heading")).toHaveText("You're booked");
    await expect(page.locator("body")).toHaveAttribute("data-booked", /.+/);
    await page.screenshot({ path: `${shots}/23-embed.png`, fullPage: true });
  });

  test("embed builder shows a snippet", async ({ page }) => {
    await login(page); await page.goto("app/embed");
    await expect(page.getByTestId("embed-code")).toContainText('class="cid-inline"');
    await page.getByRole("tab", { name: "Popup widget" }).click();
    await expect(page.getByTestId("embed-code")).toContainText("initPopupWidget");
  });

  test("one-off link works once", async ({ page }) => {
    await login(page); await page.goto("app/one-off");
    await page.getByLabel("Meeting name").fill("Intro with Jordan");
    await page.getByRole("button", { name: "Create one-off link" }).click();
    const href = await page.getByTestId("one-off").first().getByRole("link", { name: "Open" }).getAttribute("href");
    await page.goto(href!);
    await pickFirstSlot(page, 1, 3);
    await page.getByLabel("Name").fill("Jordan"); await page.getByLabel("Email", { exact: true }).fill("jordan@example.com");
    await page.getByRole("button", { name: "Book it" }).click();
    await expect(page.getByTestId("confirm-heading")).toHaveText("You're booked");
    const r = await page.goto(href!); expect(r!.status()).toBe(404);
  });

  test("meeting poll: create, vote, book", async ({ page, browser }) => {
    await login(page); await page.goto("app/polls");
    await page.getByLabel("Meeting name").fill("Offsite planning");
    const d = new Date(Date.now() + 9 * 864e5); const ymd = d.toISOString().slice(0, 10);
    await page.getByLabel("Option 1").fill(`${ymd}T10:00`); await page.getByLabel("Option 2").fill(`${ymd}T15:00`);
    await page.getByRole("button", { name: "Create poll" }).click();
    const poll = page.getByTestId("poll").first(); await expect(poll).toContainText("Offsite planning");
    const href = await poll.getByRole("link").first().getAttribute("href");
    const ctx = await browser.newContext({ baseURL: "http://localhost:3123/calendlyisdead/", timezoneId: "America/New_York" }); const v = await ctx.newPage();
    await v.goto(href!); await v.getByRole("checkbox").nth(1).check();
    await v.getByLabel("Name").fill("Val Voter"); await v.getByLabel("Email").fill("val@example.com");
    await v.getByRole("button", { name: "Send my vote" }).click(); await expect(v.getByTestId("voted")).toBeVisible(); await ctx.close();
    await page.reload();
    await expect(poll).toContainText("Val Voter");
    await poll.getByRole("button", { name: "Book this time" }).click();
    await expect(page.getByTestId("poll").first()).toContainText("Booked");
  });

  test("email assistant drafts a reply with real times", async ({ page }) => {
    await login(page); await page.goto("app/assistant");
    await page.getByRole("button", { name: "Find times and draft reply" }).click();
    await expect(page.getByTestId("assistant-result")).toContainText("Jordan Lee");
    await expect(page.getByTestId("proposed").first()).toBeVisible();
    await expect(page.getByTestId("reply")).toContainText("Hi Jordan");
    await page.screenshot({ path: `${shots}/24-assistant.png`, fullPage: true });
    // one-click link lands on the details step, prefilled
    const href = await page.getByTestId("proposed").first().getByRole("link").getAttribute("href");
    await page.goto(new URL(href!).pathname + new URL(href!).search);
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("jordan@example.com");
  });
});
