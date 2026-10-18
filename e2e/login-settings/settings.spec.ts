import { expect, test, type Page } from "@playwright/test";
const account = { status: "ready", uid: "offline-login-qa", email: "account@example.invalid", emailVerified: true, providers: ["password"] };
async function syntheticLogin(page: Page, sessionStatus: number) {
  const requests: { passwordUpdates: number; verificationMessages: number; sessions: number } = { passwordUpdates: 0, verificationMessages: 0, sessions: 0 };
  const jwt = () => { const now = Math.floor(Date.now() / 1000); return [Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: account.uid, user_id: account.uid, email: account.email, email_verified: true, auth_time: now, iat: now, exp: now + 3600, firebase: { sign_in_provider: "password" } })).toString("base64url"), "offline-signature"].join("."); };
  await page.route("https://identitytoolkit.googleapis.com/**", async route => {
    const url = route.request().url(), body = route.request().postDataJSON();
    if (url.includes("accounts:lookup")) return route.fulfill({ json: { users: [{ localId: account.uid, email: account.email, emailVerified: true, providerUserInfo: [{ providerId: "password", email: account.email, rawId: account.email }] }] } });
    if (url.includes("accounts:sendOobCode")) { expect(body.requestType).toBe("VERIFY_AND_CHANGE_EMAIL"); expect(body.newEmail).toBe("new@example.invalid"); requests.verificationMessages++; return route.fulfill({ json: { email: account.email } }); }
    if (url.includes("accounts:update")) { expect(body.password).toBe("new-password-qa"); requests.passwordUpdates++; }
    else if (!url.includes("accounts:signInWithPassword")) return route.abort();
    return route.fulfill({ json: { localId: account.uid, email: account.email, idToken: jwt(), refreshToken: "offline-refresh", expiresIn: "3600", registered: true } });
  });
  await page.route("https://securetoken.googleapis.com/**", route => route.fulfill({ json: { user_id: account.uid, id_token: jwt(), refresh_token: "offline-refresh", expires_in: "3600" } }));
  await page.route("**/api/settings/login", route => route.fulfill({ json: account }));
  await page.route("**/api/session", route => { requests.sessions++; return route.fulfill({ status: sessionStatus, ...(sessionStatus === 204 ? {} : { json: { error: "Sign-in failed. Try again." } }) }); });
  await page.getByRole("button", { name: "Refresh login settings", exact: true }).click(); await expect(page.getByText(account.email, { exact: true })).toBeVisible();
  return requests;
}
for (const width of [1440, 390]) test.describe(`Login settings at ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  test.beforeEach(async ({ page }) => {
    await page.route("**/*", route => { const host = new URL(route.request().url()).hostname; return ["127.0.0.1", "localhost"].includes(host) ? route.continue() : route.abort(); });
    await page.request.post("api/session/demo?who=host"); await page.goto("app/profile/login");
  });
  test("keeps General/Login reachable and identifies the demo honestly", async ({ page }, info) => {
    const nav = page.getByRole("navigation", { name: "Profile tabs" }); await expect(nav.getByRole("link", { name: "Login", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("status")).toContainText("demo account"); await expect(page.getByRole("button", { name: "Change password", exact: true })).toHaveCount(0);
    await nav.getByRole("link", { name: "General", exact: true }).click(); await expect(page.getByLabel("Name", { exact: true })).toBeVisible(); await nav.getByRole("link", { name: "Login", exact: true }).click();
    await nav.getByRole("link", { name: "General", exact: true }).focus(); await page.keyboard.press("Tab"); await expect(nav.getByRole("link", { name: "Login", exact: true })).toBeFocused();
    await page.screenshot({ path: info.outputPath("login-demo.png") });
    await info.attach("login-tab-styles.json", { contentType: "application/json", body: JSON.stringify(await nav.evaluate(element => { const s = getComputedStyle(element); return { fontFamily: s.fontFamily, fontSize: s.fontSize, gap: s.gap, width: s.width, overflow: element.scrollWidth > element.clientWidth }; })) });
  });
  test("shows a failed refresh and allows recovery", async ({ page }) => {
    await page.route("**/api/settings/login", route => route.fulfill({ status: 503, json: { status: "error" } }));
    await page.getByRole("button", { name: "Refresh login settings", exact: true }).click(); await expect(page.getByRole("alert")).toBeFocused();
    await page.unroute("**/api/settings/login"); await page.getByRole("button", { name: "Refresh login settings", exact: true }).click(); await expect(page.getByRole("alert")).toHaveCount(0);
  });
  for (const sessionStatus of [204, 503]) test(`changes a password with session response ${sessionStatus}`, async ({ page }, info) => {
    const requests = await syntheticLogin(page, sessionStatus);
    await page.getByRole("button", { name: "Change password", exact: true }).click(); await page.getByLabel("Current password", { exact: true }).fill("old-password-qa");
    await page.getByRole("button", { name: "Verify login", exact: true }).click(); await expect(page.getByLabel("Current password", { exact: true })).toHaveCount(0);
    await page.getByLabel("New password", { exact: true }).fill("new-password-qa"); await page.getByLabel("Confirm new password", { exact: true }).fill("different-password");
    await page.getByRole("button", { name: "Save password", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("do not match"); expect(requests.passwordUpdates).toBe(0);
    await page.getByLabel("Confirm new password", { exact: true }).fill("new-password-qa"); await page.getByRole("button", { name: "Save password", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Your password has changed"); expect(requests.passwordUpdates).toBe(1); expect(requests.sessions).toBe(1);
    await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
    if (sessionStatus !== 204) await expect(page.getByRole("button", { name: "Sign out and sign in again", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`login-password-${sessionStatus}.png`) });
  });
  test("requests email verification without claiming that the address already changed", async ({ page }, info) => {
    const requests = await syntheticLogin(page, 204); await page.getByRole("button", { name: "Change email", exact: true }).click();
    await page.getByLabel("Current password", { exact: true }).fill("old-password-qa"); await page.getByRole("button", { name: "Verify login", exact: true }).click();
    await page.getByLabel("New login email", { exact: true }).fill("new@example.invalid"); await page.getByRole("button", { name: "Send verification link", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("current email stays active"); await expect(page.getByText(account.email, { exact: true })).toBeVisible(); expect(requests.verificationMessages).toBe(1); expect(requests.sessions).toBe(0);
    await page.screenshot({ path: info.outputPath("login-email-pending.png") });
  });
});
