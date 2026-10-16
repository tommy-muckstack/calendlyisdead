import { expect, test, type Page } from "@playwright/test";
import { initialEventFields } from "../lib/event-creation-validation";
async function prepare(page: Page) {
  for (const who of ["mate", "host"]) {
    await page.request.post(`api/session/demo?who=${who}`);
    let w = (await (await page.request.get("api/workspace")).json()).workspace;
    if (!w || w.role !== "owner") continue;
    for (const member of w.members.filter(member => member.role !== "owner")) w = (await (await page.request.post("api/workspace", { data: { action: "remove", userId: member.userId, version: w.version } })).json()).workspace;
    expect((await page.request.post("api/workspace", { data: { action: "disband", version: w.version } })).ok()).toBe(true);
  }
  const created = await page.request.post("api/workspace", { data: { action: "create", id: crypto.randomUUID(), name: "Shared event QA" } }); expect(created.ok()).toBe(true);
  let w = (await created.json()).workspace;
  const invited = await page.request.post("api/workspace", { data: { action: "invite", id: crypto.randomUUID(), email: "sam@calendlyisdead.local", role: "user", version: w.version } }); expect(invited.ok()).toBe(true);
  const invitation = await invited.json(); const token = new URL(invitation.invitationUrl).pathname.split("/").at(-1);
  await page.request.post("api/session/demo?who=mate"); expect((await page.request.post("api/workspace/invitations/accept", { data: { token } })).ok()).toBe(true);
  await page.request.post("api/session/demo?who=host"); w = (await (await page.request.get("api/workspace")).json()).workspace;
  await page.goto("app"); return w;
}
for (const width of [1440, 390]) test.describe(`shared events at ${width}px`, () => {
  test.use({ viewport: { width, height: 900 } });
  test.beforeEach(async ({ page }) => { await prepare(page); });
  for (const [kind, label] of [["collective", "Collective"], ["round_robin", "Round robin"]] as const) test(`${label} draft selects accepted hosts and persists only on Create`, async ({ page }, info) => {
    let posts = 0; page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/api/event-types")) posts++; });
    await page.locator(".cs-actions").getByRole("button", { name: "Create", exact: true }).click(); const menu = page.getByRole("menu", { name: "Create", exact: true });
    await expect(menu.getByRole("menuitem", { name: label, exact: true })).toBeVisible(); await page.screenshot({ path: info.outputPath("shared-create-menu.png") });
    await menu.getByRole("menuitem", { name: label, exact: true }).click(); const panel = page.getByRole("dialog", { name: "New event type" });
    await panel.getByLabel("Name", { exact: true }).fill(`Shared ${kind} ${width} ${Date.now()}`); await panel.getByRole("button", { name: /^Hosts/ }).click(); await expect(panel.getByText("Demo Host (you)")).toBeVisible(); await panel.getByRole("button", { name: "+ Sam Rivera", exact: true }).click(); expect(posts).toBe(0);
    if (kind === "round_robin") { await panel.getByLabel("Distribution method").selectOption("equal"); await panel.getByLabel("Rescheduling preferences").selectOption("same"); }
    await info.attach("shared-host-styles.json", { contentType: "application/json", body: JSON.stringify(await panel.evaluate(element => { const s = getComputedStyle(element); return { fontFamily: s.fontFamily, fontSize: s.fontSize, padding: s.padding, width: s.width, color: s.color, overflow: element.scrollWidth > element.clientWidth }; })) });
    await page.screenshot({ path: info.outputPath("shared-host-draft.png") });
    const response = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/event-types")); await panel.getByRole("button", { name: "Create", exact: true }).click(); const result = await (await response).json(); expect(result.event.kind).toBe(kind); expect(result.event.shared.hosts).toHaveLength(2); expect(posts).toBe(1);
    await expect(page.getByRole("dialog", { name: "Edit event type" })).toBeVisible(); await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click(); await expect(page.getByRole("heading", { name: "Shared event types" })).toBeVisible();
    const profile = await page.request.get("demo"); expect(await profile.text()).not.toContain(result.event.title);
    await page.request.post("api/session/demo?who=mate"); await page.goto("app"); const card = page.getByTestId("event-type").filter({ hasText: result.event.title }); await expect(card.locator("a[aria-label^='View']")).toHaveAttribute("href", `/calendlyisdead/demo/${result.event.slug}`); await page.screenshot({ path: info.outputPath("shared-cohost-card.png") });
    await page.request.post("api/session/demo?who=host"); expect((await page.request.delete(`api/event-types/${result.event.id}`)).ok()).toBe(true);
  });
  test("Cancel leaves no event and stale edits retain their values", async ({ page }, info) => {
    const w = (await (await page.request.get("api/workspace")).json()).workspace;
    await page.locator(".cs-actions").getByRole("button", { name: "Create", exact: true }).click(); await page.getByRole("menuitem", { name: "Collective", exact: true }).click(); const draft = page.getByRole("dialog", { name: "New event type" }); await draft.getByLabel("Name", { exact: true }).fill("Unsaved shared draft"); page.once("dialog", dialog => dialog.accept()); await draft.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(page.getByTestId("event-type").filter({ hasText: "Unsaved shared draft" })).toHaveCount(0);
    const input = { draftId: crypto.randomUUID(), autoSlug: true, settings: { ...initialEventFields("collective", null), title: "Shared conflict QA", slug: "shared-conflict" }, shared: { workspaceId: w.id, hosts: w.members.map(member => ({ membershipId: member.id, scheduleId: null, priority: 2 })), distribution: "availability", reschedule: "reassign" } };
    const response = await page.request.post("api/event-types", { data: input }); expect(response.ok()).toBe(true); const event = (await response.json()).event; await page.reload(); await page.getByRole("button", { name: `Edit ${event.title}`, exact: true }).click(); const editor = page.getByRole("dialog", { name: "Edit event type" }); await editor.getByLabel("Name", { exact: true }).fill("My unsaved edit"); expect((await page.request.patch(`api/event-types/${event.id}`, { data: { sharedVersion: event.sharedVersion, title: "Updated elsewhere" } })).ok()).toBe(true); await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(editor.getByRole("alert")).toContainText("membership changed"); await expect(editor.getByLabel("Name", { exact: true })).toHaveValue("My unsaved edit"); await expect(editor.getByRole("alert")).toBeFocused(); await page.screenshot({ path: info.outputPath("shared-stale-edit.png") }); await page.request.delete(`api/event-types/${event.id}`);
  });
});
