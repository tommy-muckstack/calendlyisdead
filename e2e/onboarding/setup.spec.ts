import { expect, test, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
async function signIn(page: Page, id: string) {
  const value = `${id}.${createHmac("sha256", "onboarding-e2e-only").update(`demo:${id}`).digest("base64url")}`;
  await page.context().addCookies([{ name: "isdead_demo", value, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
}
async function role(page: Page) { await page.getByRole("radio", { name: "Consulting", exact: true }).check(); await page.getByRole("button", { name: "Continue", exact: true }).click(); await expect(page.getByRole("heading", { name: "Connect your calendar", exact: true })).toBeVisible(); }
async function hours(page: Page) { await role(page); await page.getByRole("button", { name: "Skip for now" }).click(); await expect(page.getByRole("heading", { name: "Set your availability" })).toBeVisible(); }
for (const width of [1440, 390]) {
  test.describe(`account setup at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test("completes role/calendar/hours, persists timezone and publishes only after Finish", async ({ page }, info) => {
      const id = `setup-${width}-0`; await signIn(page, id); await page.goto('app'); await expect(page).toHaveURL(/\/onboarding$/);
      expect((await page.request.get(`${id}/30min`)).status()).toBe(404); await hours(page);
      await expect(page.getByLabel('Time zone', { exact: true })).toHaveValue('Europe/Paris'); await page.getByLabel('Time zone', { exact: true }).selectOption('Asia/Kathmandu'); await page.getByLabel('Monday start 1', { exact: true }).fill('10:00');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath('setup-hours.png'), fullPage: true });
      await info.attach('setup-styles.json', { contentType: 'application/json', body: JSON.stringify(await page.locator('.onboarding-card').evaluate(element => { const style = getComputedStyle(element), rect = element.getBoundingClientRect(); return { fontFamily: style.fontFamily, fontSize: style.fontSize, color: style.color, padding: style.padding, width: rect.width }; })) });
      await page.getByRole('button', { name: 'Finish setup' }).click(); await expect(page).toHaveURL(/\/app$/); await expect(page.getByText('30 Minute Meeting', { exact: true })).toBeVisible();
      const state = await (await page.request.get('api/onboarding')).json(); expect(state).toMatchObject({ step: 'complete', timezone: 'Asia/Kathmandu' }); expect(state.weekly[1][0].start).toBe('10:00'); expect((await page.request.get(`${id}/30min`)).status()).toBe(200);
      await page.goto('login'); await expect(page).toHaveURL(/\/app$/); await page.goto('signup'); await expect(page).toHaveURL(/\/app$/);
    });
    test("resumes saved progress and calendar authorization errors without claiming connection", async ({ page }, info) => {
      await signIn(page, `setup-${width}-1`); await page.goto('login'); await expect(page).toHaveURL(/\/onboarding$/); await role(page); await page.reload(); await expect(page.getByRole('heading', { name: 'Connect your calendar' })).toBeVisible();
      await page.goto('api/integrations/google/callback?error=access_denied'); await expect(page).toHaveURL(/\/onboarding\?error=access_denied/); await expect(page.getByRole('alert')).toContainText('not completed'); await expect(page.getByText('Connected', { exact: true })).toHaveCount(0); await page.screenshot({ path: info.outputPath('setup-calendar-error.png') }); await page.getByRole('button', { name: 'Skip for now' }).click();
    });
    test("retains failed drafts, retries, guards navigation and supports keyboard focus", async ({ page }, info) => {
      await signIn(page, `setup-${width}-2`); await page.goto('onboarding'); await page.getByRole('radio', { name: 'Consulting' }).check();
      await page.route('**/api/onboarding', route => route.request().method() === 'POST' ? route.abort() : route.continue()); await page.getByRole('button', { name: 'Continue', exact: true }).click(); await expect(page.getByRole('alert')).toBeFocused(); await expect(page.getByRole('radio', { name: 'Consulting' })).toBeChecked();
      page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('link', { name: 'CalendlyIsDead home' }).click(); await expect(page).toHaveURL(/\/onboarding$/); await page.screenshot({ path: info.outputPath('setup-save-error.png') });
      await page.unroute('**/api/onboarding'); await page.getByRole('button', { name: 'Continue', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('heading', { name: 'Connect your calendar' })).toBeFocused();
    });
    test("requires a reviewed reload after another tab changes progress", async ({ page }) => {
      await signIn(page, `setup-${width}-3`); await page.goto('onboarding'); await page.getByRole('radio', { name: 'Consulting' }).check();
      expect((await page.request.post('api/onboarding', { data: { action: 'role', version: 1, role: 'Sales', timezone: 'UTC' } })).ok()).toBe(true); await page.getByRole('button', { name: 'Continue', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('another tab');
      page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Reload saved progress' }).click(); await expect(page.getByRole('radio', { name: 'Consulting' })).toBeChecked(); page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reload saved progress' }).click(); await expect(page.getByRole('heading', { name: 'Connect your calendar' })).toBeVisible();
    });
    test("validates split hours without losing edits when going back", async ({ page }) => {
      await signIn(page, `setup-${width}-4`); await page.goto('onboarding'); await hours(page); await page.getByLabel('Monday end 1', { exact: true }).fill('08:00'); await page.getByRole('button', { name: 'Finish setup' }).click(); await expect(page.getByRole('alert')).toContainText('end after'); await page.getByLabel('Monday end 1', { exact: true }).fill('12:00'); await page.getByRole('button', { name: 'Add Monday hours' }).click(); await page.getByLabel('Monday start 2', { exact: true }).fill('13:00'); await page.getByLabel('Monday end 2', { exact: true }).fill('17:00'); await page.getByRole('button', { name: 'Back', exact: true }).click(); await page.getByRole('button', { name: 'Skip for now' }).click(); await expect(page.getByLabel('Monday start 2', { exact: true })).toHaveValue('13:00');
    });
    test("does not force established accounts through setup and preserves internal callbacks", async ({ page }) => {
      await signIn(page, 'demo-user'); await page.goto('onboarding'); await expect(page).toHaveURL(/\/app$/); await page.goto('login?callbackUrl=%2Fapp%2Fmeetings'); await expect(page).toHaveURL(/\/app\/meetings$/); await page.goto('login?callbackUrl=https%3A%2F%2Fexample.invalid'); await expect(page).toHaveURL(/\/app$/);
    });
  });
}
