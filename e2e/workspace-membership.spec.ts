import { expect, test, type Page } from "@playwright/test";
async function cleanup(page: Page) {
  for (const who of ["mate", "host"]) {
    await page.request.post(`api/session/demo?who=${who}`);
    let workspace = (await (await page.request.get("api/workspace")).json()).workspace;
    if (!workspace) continue;
    if (workspace.role !== "owner") continue;
    for (const member of workspace.members.filter(member => member.role !== "owner")) {
      const result = await page.request.post("api/workspace", { data: { action: "remove", userId: member.userId, version: workspace.version } }); expect(result.ok()).toBe(true); workspace = (await result.json()).workspace;
    }
    expect((await page.request.post("api/workspace", { data: { action: "disband", version: workspace.version } })).ok()).toBe(true);
  }
}
async function create(page: Page) { await page.getByLabel("Workspace name", { exact: true }).fill("QA collaboration"); await page.getByRole("button", { name: "Create workspace", exact: true }).click(); await expect(page.getByRole("heading", { name: "QA collaboration", exact: true })).toBeVisible(); }
async function invite(page: Page, role = "user") {
  await page.getByLabel("Email address", { exact: true }).fill("sam@calendlyisdead.local"); await page.getByLabel("Role", { exact: true }).selectOption(role); await page.getByRole("button", { name: "Send invitation", exact: true }).click(); await expect(page.getByLabel("Invitation link", { exact: true })).toBeVisible(); return page.getByLabel("Invitation link", { exact: true }).inputValue();
}
for (const width of [1440, 390]) {
  test.describe(`workspace membership at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => { await cleanup(page); await page.goto("app/people"); });
    test("creates only on submit and shows pending delivery and copy-link fallback", async ({ page }, info) => {
      expect((await (await page.request.get("api/workspace")).json()).workspace).toBeNull(); await create(page); const link = await invite(page);
      await expect(page.getByRole("button", { name: "Pending invitations (1)", exact: true })).toHaveAttribute("aria-pressed", "true"); await expect(page.getByText(/Email not delivered/)).toBeVisible(); expect(link).toMatch(/\/invite\/workspace\/[a-f0-9]{64}$/);
      const panel = page.locator(".workspace-settings"); expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await info.attach("workspace-styles.json", { contentType: "application/json", body: JSON.stringify(await panel.evaluate(element => { const css = getComputedStyle(element); return { width: css.width, fontFamily: css.fontFamily, fontSize: css.fontSize, color: css.color, padding: css.padding }; })) });
      await page.screenshot({ path: info.outputPath("workspace-invitation-private.png") });
      await page.reload(); await expect(page.getByRole("button", { name: "Active users (1)" })).toBeVisible(); await page.getByRole("button", { name: "Pending invitations (1)" }).click(); await expect(page.getByText("sam@calendlyisdead.local", { exact: true })).toBeVisible();
      await page.getByLabel("Search people").fill("no-such-person"); await expect(page.getByText("No people match your search.")).toBeVisible();
    });
    test("invitation login callback and explicit acceptance add a member without admin controls", async ({ page, browser }, info) => {
      await create(page); const link = await invite(page), context = await browser.newContext({ viewport: { width, height: 900 } }), guest = await context.newPage();
      try {
        await guest.goto(link); await guest.getByRole("link", { name: "Sign in to accept" }).click(); const login = new URL(guest.url()); login.searchParams.set("as", "mate"); await guest.goto(login.href); await guest.getByRole("button", { name: "Use the demo account" }).click(); await expect(guest.getByRole("heading", { name: "Join QA collaboration?" })).toBeVisible();
        expect((await (await guest.request.get("http://localhost:3123/calendlyisdead/api/workspace")).json()).workspace).toBeNull(); await guest.getByRole("button", { name: "Accept invitation", exact: true }).click(); await expect(guest.getByRole("button", { name: "Active users (2)" })).toBeVisible(); await expect(guest.getByRole("button", { name: "Send invitation" })).toHaveCount(0); await guest.screenshot({ path: info.outputPath("workspace-member-directory.png") });
        await page.reload(); await expect(page.getByRole("button", { name: "Active users (2)" })).toBeVisible();
      } finally { await context.close(); }
    });
    test("resending rotates the link and revocation stops its use", async ({ page }) => {
      await create(page); const old = await invite(page); await page.getByRole("button", { name: "Resend invitation to sam@calendlyisdead.local" }).click(); await expect(page.getByLabel("Invitation link", { exact: true })).not.toHaveValue(old); const fresh = await page.getByLabel("Invitation link", { exact: true }).inputValue();
      page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Revoke invitation to sam@calendlyisdead.local" }).click(); await expect(page.getByText("No pending invitations.")).toBeVisible(); await expect(page.getByLabel("Invitation link", { exact: true })).toHaveCount(0);
      await page.request.post("api/session/demo?who=mate"); for (const link of [old, fresh]) { const token = new URL(link).pathname.split("/").at(-1); expect((await page.request.post("api/workspace/invitations/accept", { data: { token } })).status()).toBe(404); }
    });
    test("stale invitations keep the email draft and recover after refresh", async ({ page }, info) => {
      await create(page); const current = (await (await page.request.get("api/workspace")).json()).workspace; await page.request.post("api/workspace", { data: { action: "rename", name: "Updated elsewhere", version: current.version } });
      await page.getByLabel("Email address", { exact: true }).fill("sam@calendlyisdead.local"); await page.getByRole("button", { name: "Send invitation", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("workspace changed"); await expect(page.getByRole("alert")).toBeFocused(); await expect(page.getByLabel("Email address", { exact: true })).toHaveValue("sam@calendlyisdead.local"); await page.screenshot({ path: info.outputPath("workspace-stale-request.png") });
      await page.getByRole("button", { name: "Refresh People", exact: true }).click(); await expect(page.getByRole("heading", { name: "Updated elsewhere", exact: true })).toBeVisible(); await page.getByRole("button", { name: "Send invitation", exact: true }).click(); await expect(page.getByLabel("Invitation link", { exact: true })).toBeVisible();
    });
    test("transfers ownership only after confirmation and keeps a single owner", async ({ page, browser }) => {
      await create(page); const link = await invite(page), token = new URL(link).pathname.split("/").at(-1), context = await browser.newContext();
      try {
        await context.request.post("http://localhost:3123/calendlyisdead/api/session/demo?who=mate"); expect((await context.request.post("http://localhost:3123/calendlyisdead/api/workspace/invitations/accept", { data: { token } })).ok()).toBe(true);
        await page.reload(); await page.getByLabel("Role for Sam Rivera").selectOption("owner"); page.once("dialog", dialog => dialog.dismiss()); await page.getByRole("button", { name: "Apply role for Sam Rivera" }).click(); expect((await (await page.request.get("api/workspace")).json()).workspace.role).toBe("owner");
        page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Apply role for Sam Rivera" }).click(); await expect(page.getByText("Your role: Admin. Everyone has access for free.")).toBeVisible(); const state = (await (await page.request.get("api/workspace")).json()).workspace; expect(state.members.filter(member => member.role === "owner")).toHaveLength(1); await expect(page.getByLabel("Role for Sam Rivera")).toHaveCount(0);
      } finally { await context.close(); }
    });
    test("preserves invitation callbacks when switching login and signup", async ({ page, browser }) => {
      await create(page); const link = await invite(page), context = await browser.newContext({ viewport: { width, height: 900 } }), guest = await context.newPage();
      try { await guest.goto(link); await guest.getByRole("link", { name: "Sign in to accept" }).click(); const callback = new URL(guest.url()).searchParams.get("callbackUrl"); await guest.getByRole("link", { name: "Sign up for free", exact: false }).click(); expect(decodeURIComponent(new URL(guest.url()).searchParams.get("callbackUrl")!)).toContain(callback!); await guest.getByRole("link", { name: "Log In", exact: false }).last().click(); expect(new URL(guest.url()).searchParams.get("callbackUrl")).toContain(callback!); } finally { await context.close(); }
    });
  });
}
