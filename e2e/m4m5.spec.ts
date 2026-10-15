import { test, expect, Page, Browser } from "@playwright/test";
import fs from "node:fs";
const shots = "research/ours";
const login = async (page: Page, who: "demo" | "mate" = "demo", cb = "") => {
  const q = new URLSearchParams(); if (cb) q.set("callbackUrl", cb); if (who === "mate") q.set("as", "mate");
  await page.goto(`login${q.size ? `?${q}` : ""}`);
  await page.getByRole("button", { name: "Use the demo account" }).click();
  if (!cb) await expect(page.getByRole("heading", { name: "Event types" })).toBeVisible();
};
const mails = () => fs.readdirSync(".data/outbox").map(f => JSON.parse(fs.readFileSync(`.data/outbox/${f}`, "utf8")));

test.describe.serial("M4 teams and M5 automations", () => {
  test("team: create, invite by email, teammate accepts, round robin + collective booking pages", async ({ page, browser }) => {
    await login(page); await expect(page.getByRole("heading", { name: "Event types" })).toBeVisible();
    await page.goto("app/teams");
    await page.getByLabel("Team name").fill("Acme Support"); await page.getByLabel("Team link").fill("acme-support");
    await page.getByRole("button", { name: "Create team" }).click();
    const team = page.getByTestId("team-acme-support"); await expect(team).toBeVisible();
    await team.getByLabel("Invite email").fill("sam@calendlyisdead.local"); await team.getByRole("button", { name: "Send invite" }).click();
    await expect(page.getByRole("status")).toContainText("Invite sent");
    const inv = mails().find(m => m.to === "sam@calendlyisdead.local" && /invited you/.test(m.subject));
    const url = new URL(inv.text.match(/https?:\/\/\S+\/invite\/\S+/)[0]);
    // teammate in a separate browser session
    const ctx = await (browser as Browser).newContext({ baseURL: "http://localhost:3123/calendlyisdead/", timezoneId: "America/Chicago" }); const sam = await ctx.newPage();
    await sam.goto(url.pathname); await sam.getByRole("link", { name: "Sign in to accept" }).click();
    await sam.waitForURL(/\/login/); const lu = new URL(sam.url()); lu.searchParams.set("as", "mate"); await sam.goto(lu.toString());
    await expect(sam.getByRole("button", { name: /teammate/ })).toHaveCount(0);
    await sam.getByRole("button", { name: "Use the demo account" }).click();
    await sam.getByRole("button", { name: "Accept invite" }).click();
    await expect(sam.getByTestId("team-acme-support")).toContainText("Sam Rivera");
    await ctx.close();
    await page.reload();
    await team.getByRole("button", { name: "+ Round robin" }).click();
    await expect(team.getByTestId("team-et")).toHaveCount(1);
    await team.getByRole("button", { name: "+ Collective" }).click();
    await expect(team.getByTestId("team-et")).toHaveCount(2);
    await expect(team.getByLabel("Priority for Sam Rivera")).toBeVisible();
    await team.getByLabel("Distribution for Round robin meeting").selectOption("priority");
    await team.getByLabel("Priority for Sam Rivera").selectOption("3");
    await page.screenshot({ path: `${shots}/14-teams-admin.png`, fullPage: true });
    await page.goto("team/acme-support");
    await expect(page.getByText("Next available teammate")).toBeVisible(); await expect(page.getByText("Everyone joins")).toBeVisible();
    await page.screenshot({ path: `${shots}/15-team-page.png` });
    await page.getByText("Round robin meeting").click();
    await page.locator("button.day.open").first().click(); await page.locator(".slot button.t").first().click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Name").fill("Rae"); await page.getByLabel("Email", { exact: true }).fill("rae@example.com");
    await page.getByRole("button", { name: "Book it" }).click();
    await expect(page.getByTestId("confirm-heading")).toHaveText("You're booked");
    await expect(page.getByText("with Sam Rivera")).toBeVisible(); // high priority host
    await page.screenshot({ path: `${shots}/16-round-robin-booked.png` });
    await page.goto("team/acme-support/collective-meeting");
    await expect(page.getByText(/With (Demo Host, Sam Rivera|Sam Rivera, Demo Host)/)).toBeVisible();
  });

  test("group event with seats from the personal editor", async ({ page }) => {
    await login(page);
    await page.getByTestId("event-type").filter({ hasText: "Deep dive" }).click();
    await page.getByLabel("Type", { exact: true }).selectOption("group");
    await page.getByLabel("Seats per time").fill("3");
    await expect(page.getByRole("status")).toHaveText("Saved");
    await page.goto("demo/deep-dive");
    await expect(page.getByText("Group, up to 3")).toBeVisible();
  });

  test("workflows: reminder is scheduled and sent by the cron runner", async ({ page }) => {
    await login(page);
    await page.goto("app/workflows");
    await page.getByRole("button", { name: "+ New workflow" }).click();
    const w = page.getByTestId("workflow").last();
    await w.getByLabel("Offset hours").fill("2");
    await w.getByLabel("Subject").fill("See you soon, {{invitee.first_name}}");
    await expect(w.getByRole("status")).toHaveText("Saved");
    await page.screenshot({ path: `${shots}/17-workflows.png`, fullPage: true });
    const tz = "America/New_York", from = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10), to = new Date(Date.now() + 12 * 864e5).toISOString().slice(0, 10);
    const s = (await (await page.request.get(`api/slots?user=demo&slug=30min&from=${from}&to=${to}&tz=${tz}`)).json()).slots;
    const start = Object.values<string[]>(s).flat()[0];
    const b = await page.request.post("api/bookings", { data: { username: "demo", slug: "30min", start, name: "Noor Haddad", email: "noor@example.com", tz } });
    expect(b.status()).toBe(200);
    const due = new Date(+new Date(start) - 90 * 60_000).toISOString();
    const r = await (await page.request.get(`api/cron/workflows?now=${due}`)).json();
    expect(r.sent).toBeGreaterThanOrEqual(1);
    expect(mails().some(m => m.to === "noor@example.com" && m.subject === "See you soon, Noor")).toBe(true);
  });

  test("routing form: rules send people to an event type or a message", async ({ page }) => {
    await login(page);
    await page.goto("app/routing");
    await page.getByRole("button", { name: "+ New form" }).click();
    const f = page.getByTestId("routing-form").last();
    await f.getByLabel("Form name").fill("Talk to us");
    await f.getByRole("button", { name: "+ Add rule" }).click();
    await f.getByLabel("Rule 1 condition 1 field").selectOption("email");
    await f.getByLabel("Rule 1 condition 1 operator").selectOption("contains");
    await f.getByLabel("Rule 1 condition 1 value").fill("@bigco.com");
    await f.getByLabel("Rule 1 action event").selectOption({ label: "Quick chat (edited)" });
    await f.getByLabel("Fallback value").fill("Thanks, we'll email you a guide.");
    await expect(f.getByRole("status")).toHaveText("Saved");
    await page.screenshot({ path: `${shots}/18-routing-editor.png`, fullPage: true });
    const href = await f.getByRole("link", { name: "Open form ↗" }).getAttribute("href");
    await page.goto(href!);
    await page.getByLabel("Name *").fill("Kim"); await page.getByLabel("Email *").fill("kim@bigco.com");
    await page.screenshot({ path: `${shots}/19-routing-form.png` });
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/demo\/30min\?name=Kim&email=kim%40bigco\.com/);
    await page.goto(href!);
    await page.getByLabel("Name *").fill("Lee"); await page.getByLabel("Email *").fill("lee@gmail.com");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByTestId("form-message")).toHaveText("Thanks, we'll email you a guide.");
  });
});
