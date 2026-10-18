import { expect, test, type Page } from "@playwright/test";
async function create(page: Page, offset = 3 * 864e5) {
  await page.request.post("api/session/demo?who=host");
  const options = [new Date(Date.now() + offset).toISOString(), new Date(Date.now() + offset + 60_000).toISOString()];
  const response = await page.request.post("api/polls", { data: { title: "Participation QA", durationMin: 30, options } });
  expect(response.ok()).toBe(true); return { id: (await response.json()).id as string, options };
}
for (const width of [1440, 390]) test.describe(`Poll participation at ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  test("shares voter names only after an owner enables visibility", async ({ page }, info) => {
    const { id, options } = await create(page);
    expect((await page.request.post(`api/polls/${id}/vote`, { data: { name: "Private Voter QA", email: "private@example.invalid", picks: [options[0]] } })).ok()).toBe(true);
    await page.goto(`poll/${id}`); await expect(page.getByText("Private Voter QA", { exact: true })).toHaveCount(0); await expect(page.locator("summary")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("hidden-poll-votes.png") });
    await page.goto("app/polls"); const card = page.getByTestId("poll").filter({ has: page.locator(`a[href$="/poll/${id}"]`) });
    const toggle = card.getByRole("checkbox", { name: "Show votes on page" }); await toggle.focus(); await page.keyboard.press("Space"); await expect(toggle).toBeChecked(); await expect(toggle).toBeEnabled();
    await page.goto(`poll/${id}`); await page.locator("summary").first().focus(); await page.keyboard.press("Enter"); await expect(page.getByText("Private Voter QA", { exact: true })).toBeVisible();
    await expect(page.getByText("private@example.invalid", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("visible-poll-votes.png") });
    await info.attach("vote-styles.json", { contentType: "application/json", body: JSON.stringify(await page.locator(".poll-vote-options").evaluate(element => { const s = getComputedStyle(element); return { fontFamily: s.fontFamily, fontSize: s.fontSize, padding: s.padding, width: s.width, overflow: document.documentElement.scrollWidth > innerWidth }; })) });
    await page.goto("app/polls"); await toggle.uncheck(); await expect(toggle).toBeEnabled(); await page.goto(`poll/${id}`); await expect(page.getByText("Private Voter QA", { exact: true })).toHaveCount(0);
  });
  test("keeps form input after an error and rejects changing a final vote", async ({ page }, info) => {
    const { id } = await create(page); await page.goto(`poll/${id}`);
    await page.getByRole("checkbox").first().check(); await page.getByLabel("Name", { exact: true }).fill("Voter QA"); await page.getByLabel("Email", { exact: true }).fill("voter@example.invalid");
    await page.route(`**/api/polls/${id}/vote`, route => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' }));
    await page.getByRole("button", { name: "Send my vote" }).click(); await expect(page.getByRole("alert")).toBeFocused(); await expect(page.getByLabel("Email", { exact: true })).toHaveValue("voter@example.invalid"); await expect(page.getByRole("checkbox").first()).toBeChecked();
    await page.screenshot({ path: info.outputPath("poll-vote-error.png") }); await page.unroute(`**/api/polls/${id}/vote`);
    await page.getByRole("button", { name: "Send my vote" }).click(); await expect(page.getByTestId("voted")).toBeFocused();
    await page.reload(); await page.getByRole("checkbox").nth(1).check(); await page.getByLabel("Name", { exact: true }).fill("Voter QA"); await page.getByLabel("Email", { exact: true }).fill("voter@example.invalid");
    await page.getByRole("button", { name: "Send my vote" }).click(); await expect(page.getByRole("alert")).toContainText("cannot be changed"); await expect(page.getByRole("checkbox").nth(1)).toBeChecked();
  });
  test("closes an already open page when its final time passes", async ({ page }, info) => {
    const { id, options } = await create(page); await page.clock.install(); await page.goto(`poll/${id}`); await expect(page.getByRole("button", { name: "Send my vote" })).toBeVisible();
    await page.clock.fastForward(Date.parse(options[1]) - Date.now() + 1000); await expect(page.getByTestId("poll-closed")).toBeVisible(); await expect(page.getByRole("button", { name: "Send my vote" })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("expired-poll.png") });
  });
});
