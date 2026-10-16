import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { WorkspaceMutation } from "../../lib/workspace-validation";
import { loginDestination } from "../../lib/onboarding-validation";
const auth = vi.hoisted(() => vi.fn(async () => ({ id: "demo-user" }) as { id: string } | null));
const mail = vi.hoisted(() => vi.fn<typeof import("../../lib/email").sendMail>());
vi.mock("@/auth", () => ({ requireUser: auth }));
vi.mock("@/lib/email", () => ({ sendMail: mail }));
let db: Awaited<ReturnType<typeof import("../../lib/db").getDb>>, S: typeof import("../../lib/db/schema"), service: typeof import("../../lib/workspaces"), api: typeof import("../../app/api/workspace/route"), accept: typeof import("../../app/api/workspace/invitations/accept/route").POST;
const owner = "demo-user", mate = "demo-mate";
const creation = (name = "QA workspace") => ({ action: "create" as const, id: crypto.randomUUID(), name });
const state = (userId = owner) => service.readWorkspace(userId);
const version = async (userId = owner) => (await state(userId))!.version;
async function setup(userId = owner) { return service.changeWorkspace(userId, creation()); }
async function invite(email = "sam@calendlyisdead.local", role: "admin" | "user" = "user", by = owner) {
  const input = { action: "invite" as const, id: crypto.randomUUID(), email, role, version: await version(by) };
  const response = await service.changeWorkspace(by, input);
  return { input, response, token: response.invitationUrl!.split("/").at(-1)! };
}
async function join(role: "admin" | "user" = "user") { const invitation = await invite(undefined, role); await service.acceptWorkspaceInvitation(mate, { token: invitation.token }); return invitation; }
const request = (body: unknown, extra: Record<string, string> = {}) => new NextRequest("http://localhost/calendlyisdead/api/workspace", { method: "POST", headers: { "Content-Type": "application/json", ...extra }, body: JSON.stringify(body) });
const remove = async (userId = mate, by = owner) => service.changeWorkspace(by, { action: "remove", userId, version: await version(by) });
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("APP_URL", "http://localhost:3000/calendlyisdead/");
  vi.stubEnv("PGLITE_DIR", path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-workspaces-")), "db"));
  const database = await import("../../lib/db"); db = await database.getDb(); S = database.schema;
  service = await import("../../lib/workspaces"); api = await import("../../app/api/workspace/route"); accept = (await import("../../app/api/workspace/invitations/accept/route")).POST;
  await db.insert(S.users).values({ id: "outsider", email: "outsider@example.invalid", name: "Other workspace" });
});
afterAll(async () => { await db.$client.close(); });
beforeEach(async () => { await db.delete(S.workspaces); await db.delete(S.workspaceCreations); auth.mockResolvedValue({ id: owner }); mail.mockReset(); mail.mockResolvedValue(true); });
describe("workspace membership and isolation", () => {
  it("keeps solo accounts unchanged until an explicit creation", async () => { expect(await state()).toBeNull(); const result = await setup(); expect(result.workspace).toMatchObject({ role: "owner", name: "QA workspace", version: 1 }); expect(result.workspace!.members).toHaveLength(1); expect(await state(mate)).toBeNull(); });
  it("serializes duplicate creations and preserves later edits on retry", async () => {
    const input = creation(); const created = await Promise.all([service.changeWorkspace(owner, input), service.changeWorkspace(owner, input)]); expect(created[0].workspace!.id).toBe(created[1].workspace!.id);
    await service.changeWorkspace(owner, { action: "rename", name: "New name", version: 1 }); expect((await service.changeWorkspace(owner, input)).workspace!.name).toBe("New name"); expect(await db.select().from(S.workspaces)).toHaveLength(1);
    await expect(service.changeWorkspace(owner, { ...input, name: "Different payload" })).rejects.toMatchObject({ status: 409 });
    await expect(service.changeWorkspace(mate, input)).rejects.toMatchObject({ status: 409 }); expect(await state(mate)).toBeNull();
  });
  it("rejects a second workspace and stale mutations", async () => {
    await setup(); await expect(setup()).rejects.toMatchObject({ status: 409 }); await service.changeWorkspace(owner, { action: "rename", name: "Changed", version: 1 }); await expect(service.changeWorkspace(owner, { action: "rename", name: "Stale", version: 1 })).rejects.toMatchObject({ status: 409 }); expect((await state())!.name).toBe("Changed");
  });
  it("requires accepted membership and returns only public directory fields", async () => {
    await setup(); const inv = await invite(); expect(await state(mate)).toBeNull(); expect((await state())!.members).toHaveLength(1); await service.acceptWorkspaceInvitation(mate, { token: inv.token });
    const member = (await state(mate))!; expect(member.role).toBe("user"); expect(member.members).toHaveLength(2); expect(member.invitations).toEqual([]); expect(Object.keys(member.members[0]).sort()).toEqual(["email", "id", "name", "role", "userId"]); expect(JSON.stringify(member)).not.toMatch(/firebase|tokenHash|requestHash/);
    await expect(service.changeWorkspace(mate, { action: "rename", name: "Unauthorized", version: member.version })).rejects.toMatchObject({ status: 403 });
  });
  it("separates organizations and checks target membership on every mutation", async () => {
    await setup(); await setup("outsider"); const external = await invite("new@example.invalid", "user", "outsider");
    for (const action of ["remove", "role"] as const) await expect(service.changeWorkspace(owner, { action, userId: "outsider", ...(action === "role" ? { role: "admin" } : {}), version: await version() })).rejects.toMatchObject({ status: 404 });
    for (const action of ["resend", "revoke"]) await expect(service.changeWorkspace(owner, { action, invitationId: external.input.id, version: await version() })).rejects.toMatchObject({ status: 404 });
    expect((await state())!.members).toHaveLength(1); expect((await state("outsider"))!.invitations).toHaveLength(1);
  });
  it("lets admins manage users but reserves ownership transfer for the owner", async () => {
    await setup(); await join("admin"); await service.changeWorkspace(mate, { action: "rename", name: "Admin edit", version: await version(mate) }); expect((await state())!.name).toBe("Admin edit");
    await expect(service.changeWorkspace(mate, { action: "role", userId: mate, role: "owner", version: await version() })).rejects.toMatchObject({ status: 403 });
    await service.changeWorkspace(owner, { action: "role", userId: mate, role: "owner", version: await version() }); expect((await state())!.role).toBe("admin"); expect((await state(mate))!.role).toBe("owner");
    for (const change of [{ action: "remove", userId: mate }, { action: "role", userId: mate, role: "user" }]) await expect(service.changeWorkspace(owner, { ...change, version: await version() })).rejects.toMatchObject({ status: 403 });
    expect((await state())!.members.filter(member => member.role === "owner")).toHaveLength(1);
  });
  it("revokes authority immediately when an admin is demoted", async () => {
    await setup(); await join("admin"); const issued = await invite("outsider@example.invalid", "admin", mate);
    await service.changeWorkspace(owner, { action: "role", userId: mate, role: "user", version: await version() }); await expect(invite("nobody@example.invalid", "user", mate)).rejects.toMatchObject({ status: 403 });
    await expect(service.acceptWorkspaceInvitation("outsider", { token: issued.token })).rejects.toMatchObject({ status: 404 }); expect((await state())!.invitations).toEqual([]);
    await service.changeWorkspace(owner, { action: "role", userId: mate, role: "admin", version: await version() }); await expect(service.acceptWorkspaceInvitation("outsider", { token: issued.token })).rejects.toMatchObject({ status: 404 });
  });
  it("preserves personal schedules, events, and unrelated teams on removal", async () => {
    await setup(); await join(); const schedules = await db.select().from(S.schedules).where(eq(S.schedules.userId, mate)); await remove(); expect(await state(mate)).toBeNull(); expect(await db.select().from(S.schedules).where(eq(S.schedules.userId, mate))).toEqual(schedules); expect((await db.select().from(S.users).where(eq(S.users.id, mate)))[0].email).toBe("sam@calendlyisdead.local");
  });
  it("supports empty-workspace deletion without resurrecting a lost create response", async () => {
    const input = creation(); await service.changeWorkspace(owner, input); const invitation = await invite(); await service.changeWorkspace(owner, { action: "disband", version: await version() }); expect(await state()).toBeNull(); await expect(service.changeWorkspace(owner, input)).rejects.toMatchObject({ status: 410 }); await expect(service.acceptWorkspaceInvitation(mate, { token: invitation.token })).rejects.toMatchObject({ status: 404 }); expect((await setup()).workspace!.role).toBe("owner");
  });
  it("blocks deleting a populated workspace or deleting as an admin", async () => {
    await setup(); await join("admin"); await expect(service.changeWorkspace(owner, { action: "disband", version: await version() })).rejects.toMatchObject({ status: 409 }); await expect(service.changeWorkspace(mate, { action: "disband", version: await version() })).rejects.toMatchObject({ status: 403 });
  });
});
describe("invitation lifecycle", () => {
  beforeEach(async () => { await setup(); });
  it("normalizes email, hashes secrets, and sends an invitation without expiry", async () => {
    const inv = await invite("SAM@CALENDLYISDEAD.LOCAL"); const [stored] = await db.select().from(S.workspaceInvitations); expect(stored.email).toBe("sam@calendlyisdead.local"); expect(stored.tokenHash).not.toBe(inv.token); expect(inv.token).toMatch(/^[a-f0-9]{64}$/); expect(inv.response.invitationUrl).toBe(`http://localhost:3000/calendlyisdead/invite/workspace/${inv.token}`); expect(stored.expiresAt).toBeNull();
    const sent = mail.mock.calls[0][0] as unknown as { to: string; text: string; idempotencyKey: string }; expect(sent.to).toBe("sam@calendlyisdead.local"); expect(sent.text).toContain(inv.response.invitationUrl); expect(sent.text).toContain("no expiration date"); expect(sent.idempotencyKey).not.toContain(inv.token); expect(JSON.stringify(inv.response.workspace)).not.toContain(inv.token);
  });
  it("does not send duplicate invitations on concurrent/lost-response retries", async () => {
    const input = { action: "invite", id: crypto.randomUUID(), email: "sam@calendlyisdead.local", role: "user", version: await version() }; const results = await Promise.all([service.changeWorkspace(owner, input), service.changeWorkspace(owner, input)]); expect(mail).toHaveBeenCalledTimes(1); expect(results.filter(result => result.invitationUrl)).toHaveLength(1); expect((await state())!.invitations).toHaveLength(1);
    await expect(service.changeWorkspace(owner, { ...input, role: "admin" })).rejects.toMatchObject({ status: 409 }); await expect(invite()).rejects.toMatchObject({ status: 409 });
  });
  it("offers a share link when delivery fails without falsely reporting email sent", async () => {
    mail.mockResolvedValue(false); const result = await invite(); expect(result.response.invitationUrl).toBeTruthy(); expect(result.response.workspace!.invitations[0].delivery).toBe("undelivered"); await service.acceptWorkspaceInvitation(mate, { token: result.token }); expect((await state(mate))!.role).toBe("user");
  });
  it("tolerates a throwing provider and keeps a retryable invitation", async () => { mail.mockRejectedValue(new Error("provider secret details")); expect((await invite()).response.workspace!.invitations[0].delivery).toBe("undelivered"); });
  it("does not accept wrong accounts or leak the intended email in the error", async () => {
    const inv = await invite(); await expect(service.acceptWorkspaceInvitation("outsider", { token: inv.token })).rejects.toMatchObject({ status: 403, code: "wrong_account" }); await expect(service.readWorkspaceInvitation("outsider", { token: inv.token })).rejects.toThrow("Sign in with the email address this invitation was sent to."); expect((await state())!.members).toHaveLength(1);
    await service.acceptWorkspaceInvitation(mate, { token: inv.token }); expect((await state(mate))!.role).toBe("user");
  });
  it("only accepts once and cannot reuse an accepted invitation after removal", async () => {
    const inv = await invite("sam@calendlyisdead.local", "admin"); await Promise.all([service.acceptWorkspaceInvitation(mate, { token: inv.token }), service.acceptWorkspaceInvitation(mate, { token: inv.token })]); expect((await state())!.members).toHaveLength(2); expect(await service.readWorkspaceInvitation(mate, { token: inv.token })).toMatchObject({ alreadyJoined: true });
    await remove(); await expect(service.acceptWorkspaceInvitation(mate, { token: inv.token })).rejects.toMatchObject({ status: 404 }); await join(); await expect(service.acceptWorkspaceInvitation(mate, { token: inv.token })).rejects.toMatchObject({ status: 404 }); expect((await state(mate))!.role).toBe("user");
  });
  it("still expires legacy invitations at their exact boundary", async () => { const inv = await invite(); await db.update(S.workspaceInvitations).set({ expiresAt: new Date() }).where(eq(S.workspaceInvitations.id, inv.input.id)); await expect(service.acceptWorkspaceInvitation(mate, { token: inv.token })).rejects.toMatchObject({ status: 404 }); expect(await state(mate)).toBeNull(); });
  it("rotates expired tokens on resend and rejects stale resend requests", async () => {
    const inv = await invite(); await db.update(S.workspaceInvitations).set({ expiresAt: new Date(0) }).where(eq(S.workspaceInvitations.id, inv.input.id)); const input = { action: "resend", invitationId: inv.input.id, version: await version() }; const renewed = await service.changeWorkspace(owner, input); expect(renewed.invitationUrl).not.toBe(inv.response.invitationUrl); expect(renewed.workspace!.invitations[0].expiresAt).toBeNull(); await expect(service.acceptWorkspaceInvitation(mate, { token: inv.token })).rejects.toMatchObject({ status: 404 }); await expect(service.changeWorkspace(owner, input)).rejects.toMatchObject({ status: 409 }); await service.acceptWorkspaceInvitation(mate, { token: renewed.invitationUrl!.split("/").at(-1)! }); expect(mail).toHaveBeenCalledTimes(2);
  });
  it("revokes invitations and rejects attempts to resend an accepted one", async () => {
    const inv = await invite(); await service.changeWorkspace(owner, { action: "revoke", invitationId: inv.input.id, version: await version() }); await expect(service.acceptWorkspaceInvitation(mate, { token: inv.token })).rejects.toMatchObject({ status: 404 }); const accepted = await join(); await expect(service.changeWorkspace(owner, { action: "resend", invitationId: accepted.input.id, version: await version() })).rejects.toMatchObject({ status: 404 }); await expect(invite()).rejects.toMatchObject({ status: 409 });
  });
  it("enforces one organization per user and leaves invitations available after a failed join", async () => {
    await setup(mate); const inv = await invite(); await expect(service.acceptWorkspaceInvitation(mate, { token: inv.token })).rejects.toMatchObject({ status: 409 }); await service.changeWorkspace(mate, { action: "disband", version: await version(mate) }); await service.acceptWorkspaceInvitation(mate, { token: inv.token }); expect((await state(mate))!.id).toBe((await state())!.id);
  });
  it("serializes competing acceptances for the same user into different workspaces", async () => {
    await setup("outsider"); const first = await invite(), second = await invite(undefined, "admin", "outsider"); const results = await Promise.allSettled([service.acceptWorkspaceInvitation(mate, { token: first.token }), service.acceptWorkspaceInvitation(mate, { token: second.token })]); expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1); expect(await db.select().from(S.workspaceMembers).where(eq(S.workspaceMembers.userId, mate))).toHaveLength(1);
  });
  it("revokes invitations issued by a removed admin", async () => { await join("admin"); const issued = await invite("outsider@example.invalid", "user", mate); await remove(); await expect(service.acceptWorkspaceInvitation("outsider", { token: issued.token })).rejects.toMatchObject({ status: 404 }); });
  it("rolls acceptance and its receipt back on an update failure", async () => {
    const inv = await invite(); await db.$client.exec(`CREATE FUNCTION reject_workspace_update() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_workspace_update BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION reject_workspace_update();`);
    try { await expect(service.acceptWorkspaceInvitation(mate, { token: inv.token })).rejects.toThrow(); expect(await state(mate)).toBeNull(); expect((await db.select().from(S.workspaceInvitations))[0].acceptedMembershipId).toBeNull(); } finally { await db.$client.exec('DROP TRIGGER reject_workspace_update ON workspaces; DROP FUNCTION reject_workspace_update();'); }
    await service.acceptWorkspaceInvitation(mate, { token: inv.token }); expect((await state(mate))!.role).toBe("user");
  });
  it("rolls creation back when the owner membership cannot be inserted", async () => {
    await db.$client.exec(`CREATE FUNCTION reject_workspace_member() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_workspace_member BEFORE INSERT ON workspace_members FOR EACH ROW EXECUTE FUNCTION reject_workspace_member();`);
    const input = creation("Other"); try { await expect(service.changeWorkspace(mate, input)).rejects.toThrow(); expect(await db.select().from(S.workspaces).where(eq(S.workspaces.id, input.id))).toEqual([]); expect(await db.select().from(S.workspaceCreations).where(eq(S.workspaceCreations.id, input.id))).toEqual([]); } finally { await db.$client.exec('DROP TRIGGER reject_workspace_member ON workspace_members; DROP FUNCTION reject_workspace_member();'); }
  });
  it("replays the schema migration without changing membership or invitation state", async () => { const inv = await invite(); await db.$client.exec(fs.readFileSync(path.join(process.cwd(), "lib/db/ddl.sql"), "utf8")); await service.acceptWorkspaceInvitation(mate, { token: inv.token }); expect((await state())!.members).toHaveLength(2); });
});
describe("workspace HTTP and redirect boundary", () => {
  it("authenticates read and both write endpoints before accepting input", async () => { auth.mockResolvedValue(null); expect((await api.GET()).status).toBe(401); expect((await api.POST(request(creation()))).status).toBe(401); expect((await accept(request({ token: "a".repeat(64) }))).status).toBe(401); });
  it("rejects cross-origin requests and bounds payloads", async () => { expect((await api.POST(request(creation(), { origin: "https://other.example" }))).status).toBe(403); expect((await accept(request({ token: "a".repeat(64) }, { origin: "https://other.example" }))).status).toBe(403); expect((await api.POST(request({ data: "x".repeat(16_001) }))).status).toBe(413); expect(await state()).toBeNull(); });
  it("rejects malformed JSON, unsupported roles and foreign ownership fields", async () => {
    expect((await api.POST(new NextRequest("http://localhost/api/workspace", { method: "POST", body: "{" }))).status).toBe(400);
    for (const input of [{ ...creation(), userId: mate }, { action: "invite", id: crypto.randomUUID(), email: "sam@calendlyisdead.local", role: "owner", version: 1 }, { action: "role", userId: mate, role: "superadmin", version: 1 }]) expect((await api.POST(request(input))).status).toBe(400); expect(WorkspaceMutation.safeParse({ ...creation(), name: " " }).success).toBe(false);
  });
  it("returns no-store responses and exposes permission failures without internal details", async () => { const response = await api.POST(request(creation())); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); auth.mockResolvedValue({ id: mate }); const denied = await api.POST(request({ action: "rename", name: "Other", version: 1 })); expect(denied.status).toBe(403); expect(await denied.json()).toMatchObject({ code: "admin_required" }); expect((await api.GET()).headers.get("cache-control")).toBe("private, no-store"); });
  it("requires a valid invitation token at the API boundary", async () => { for (const token of ["bad", "a".repeat(65), 10]) expect((await accept(request({ token }))).status).toBe(400); expect((await accept(request({ token: "a".repeat(64) }))).status).toBe(404); });
  it("preserves workspace invitation destinations while blocking external or malformed callbacks", () => { const invite = `/invite/workspace/${"a".repeat(64)}`; expect(loginDestination(invite, "/calendlyisdead")).toBe(invite); expect(loginDestination(`/calendlyisdead${invite}`, "/calendlyisdead")).toBe(invite); for (const input of ["https://other.example" + invite, "//other.example" + invite, "/invite/workspace/short", "/invite/workspace/" + "a".repeat(65), "/invite/workspace/" + "%2f".repeat(64)]) expect(loginDestination(input, "/calendlyisdead")).toBe("/app"); });
});


describe("one-time workspace invitation reminders", () => {
  const now = new Date("2030-03-15T12:00:00Z");
  async function overdue(days = 7, email = "sam@calendlyisdead.local") {
    const inv = await invite(email); await db.update(S.workspaceInvitations).set({ createdAt: new Date(+now - days * 864e5) }).where(eq(S.workspaceInvitations.id, inv.input.id)); mail.mockClear(); return inv;
  }
  const reminderToken = () => mail.mock.calls[0][0].text.match(/\/invite\/workspace\/([a-f0-9]{64})/)![1];
  const run = (at = now) => service.processWorkspaceInvitationReminders(at);
  beforeEach(async () => { await setup(); });
  it("keeps new invitations usable more than seven days later", async () => { const inv = await invite(); vi.setSystemTime(new Date(Date.now() + 100 * 864e5)); try { expect((await service.readWorkspaceInvitation(mate, { token: inv.token })).alreadyJoined).toBe(false); await service.acceptWorkspaceInvitation(mate, { token: inv.token }); expect((await state(mate))!.role).toBe("user"); } finally { vi.useRealTimers(); } });
  it("waits for the exact seven-day boundary and sends only one reminder", async () => {
    const inv = await overdue(); expect(await run(new Date(+now - 1))).toEqual({ sent: 0, undelivered: 0 }); expect(mail).not.toHaveBeenCalled();
    expect(await run()).toEqual({ sent: 1, undelivered: 0 }); const message = mail.mock.calls[0][0]; expect(message.subject).toBe("Reminder: Join QA workspace on CalendlyIsDead"); expect(message.to).toBe("sam@calendlyisdead.local"); expect(message.idempotencyKey).toBe(`workspace-${inv.input.id}-reminder`); expect(message.text).toContain("no expiration date");
    expect(await run(new Date(+now + 365 * 864e5))).toEqual({ sent: 0, undelivered: 0 }); expect(mail).toHaveBeenCalledOnce(); expect((await state())!.invitations[0].reminderDelivery).toBe("sent");
  });
  it.each(["original", "reminder"])("accepts the %s link after a reminder without revoking the other", async source => {
    const inv = await overdue(); await run(); const token = reminderToken(); expect(token).not.toBe(inv.token); expect(await service.readWorkspaceInvitation(mate, { token: inv.token })).toMatchObject({ alreadyJoined: false }); expect(await service.readWorkspaceInvitation(mate, { token })).toMatchObject({ alreadyJoined: false });
    await service.acceptWorkspaceInvitation(mate, { token: source === "original" ? inv.token : token }); expect((await state())!.members).toHaveLength(2); expect(await service.readWorkspaceInvitation(mate, { token: source === "original" ? token : inv.token })).toMatchObject({ alreadyJoined: true });
  });
  it("never exposes the reminder token or hash in the People response", async () => { await overdue(); await run(); const token = reminderToken(), [row] = await db.select().from(S.workspaceInvitations); expect(row.reminderTokenHash).not.toBe(token); const serialized = JSON.stringify(await state()); expect(serialized).not.toContain(token); expect(serialized).not.toContain(row.reminderTokenHash); expect(serialized).not.toContain("reminderTokenHash"); });
  it("serializes concurrent schedulers so they cannot send two reminders", async () => { await overdue(); const results = await Promise.all([run(), run(), run()]); expect(results.reduce((total, result) => total + result.sent, 0)).toBe(1); expect(mail).toHaveBeenCalledOnce(); });
  it("does not remind accepted, revoked or expired legacy invitations", async () => {
    const accepted = await overdue(); await service.acceptWorkspaceInvitation(mate, { token: accepted.token }); const revoked = await overdue(7, "revoked@example.invalid"); await service.changeWorkspace(owner, { action: "revoke", invitationId: revoked.input.id, version: await version() }); const legacy = await overdue(7, "legacy@example.invalid"); await db.update(S.workspaceInvitations).set({ expiresAt: new Date(0) }).where(eq(S.workspaceInvitations.id, legacy.input.id)); mail.mockClear(); expect(await run()).toEqual({ sent: 0, undelivered: 0 }); expect(mail).not.toHaveBeenCalled();
  });
  it("does not send invites from removed or demoted admins", async () => { await join("admin"); const inv = await invite("outsider@example.invalid", "user", mate); await db.update(S.workspaceInvitations).set({ createdAt: new Date(+now - 8 * 864e5) }).where(eq(S.workspaceInvitations.id, inv.input.id)); await service.changeWorkspace(owner, { action: "role", userId: mate, role: "user", version: await version() }); mail.mockClear(); expect(await run()).toEqual({ sent: 0, undelivered: 0 }); expect(mail).not.toHaveBeenCalled(); });
  it("keeps manual resend authoritative over both previous links without scheduling another automatic reminder", async () => {
    const inv = await overdue(); await run(); const token = reminderToken(); const result = await service.changeWorkspace(owner, { action: "resend", invitationId: inv.input.id, version: await version() });
    for (const old of [token, inv.token]) await expect(service.acceptWorkspaceInvitation(mate, { token: old })).rejects.toMatchObject({ status: 404 });
    await run(new Date(+now + 14 * 864e5)); expect(mail).toHaveBeenCalledTimes(2); await service.acceptWorkspaceInvitation(mate, { token: result.invitationUrl!.split("/").at(-1)! }); expect((await state(mate))!.role).toBe("user");
  });
  it("does not let either old link restore a removed member", async () => { const inv = await overdue(); await run(); const token = reminderToken(); await service.acceptWorkspaceInvitation(mate, { token }); await remove(); for (const old of [token, inv.token]) await expect(service.acceptWorkspaceInvitation(mate, { token: old })).rejects.toMatchObject({ status: 404 }); });
  it.each([false, "throw"])("reports undelivered reminders after %s and leaves explicit resend available", async result => {
    const inv = await overdue(); if (result === "throw") mail.mockRejectedValueOnce(new Error("provider unavailable")); else mail.mockResolvedValueOnce(false);
    expect(await run()).toEqual({ sent: 0, undelivered: 1 }); expect((await state())!.invitations[0].reminderDelivery).toBe("undelivered"); await run(new Date(+now + 864e5)); expect(mail).toHaveBeenCalledOnce(); expect(await service.readWorkspaceInvitation(mate, { token: inv.token })).toMatchObject({ alreadyJoined: false });
    expect((await service.changeWorkspace(owner, { action: "resend", invitationId: inv.input.id, version: await version() })).invitationUrl).toBeTruthy();
  });
  it("does not overwrite a newer resend when an in-flight reminder completes", async () => {
    const inv = await overdue(); let entered: () => void, release: (sent: boolean) => void; const sending = new Promise<void>(resolve => { entered = resolve; }); mail.mockImplementationOnce(() => { entered!(); return new Promise<boolean>(resolve => { release = resolve; }); });
    const processing = run(); await sending; const newer = await service.changeWorkspace(owner, { action: "resend", invitationId: inv.input.id, version: await version() }); release!(true); await processing;
    const [row] = await db.select().from(S.workspaceInvitations); expect(row.reminderTokenHash).toBeNull(); expect(row.delivery).toBe("sent"); await service.acceptWorkspaceInvitation(mate, { token: newer.invitationUrl!.split("/").at(-1)! });
  });
  it("rolls the reminder claim back before any mail when its update fails", async () => {
    await overdue(); await db.$client.exec(`CREATE FUNCTION reject_reminder() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_reminder BEFORE UPDATE ON workspace_invitations FOR EACH ROW EXECUTE FUNCTION reject_reminder();`);
    try { await expect(run()).rejects.toThrow(); expect(mail).not.toHaveBeenCalled(); const [row] = await db.select().from(S.workspaceInvitations); expect(row.remindedAt).toBeNull(); expect(row.reminderTokenHash).toBeNull(); } finally { await db.$client.exec('DROP TRIGGER reject_reminder ON workspace_invitations; DROP FUNCTION reject_reminder();'); }
    expect(await run()).toEqual({ sent: 1, undelivered: 0 });
  });
  it("preserves a legacy expiry when replaying the migration", async () => { const inv = await overdue(); await db.update(S.workspaceInvitations).set({ expiresAt: new Date(0) }).where(eq(S.workspaceInvitations.id, inv.input.id)); await db.$client.exec(fs.readFileSync(path.join(process.cwd(), "lib/db/ddl.sql"), "utf8")); await expect(service.acceptWorkspaceInvitation(mate, { token: inv.token })).rejects.toMatchObject({ status: 404 }); expect((await state())!.invitations[0].expiresAt).toBe("1970-01-01T00:00:00.000Z"); expect(await run()).toEqual({ sent: 0, undelivered: 0 }); });
  it("handles more than one scheduler batch", async () => {
    const id = (await state())!.id; await db.insert(S.workspaceInvitations).values(Array.from({ length: 105 }, (_, i) => ({ id: crypto.randomUUID(), workspaceId: id, email: `qa-${i}@example.invalid`, role: "user" as const, invitedBy: owner, tokenHash: crypto.randomUUID(), requestHash: "test", createdAt: new Date(+now - 8 * 864e5) })));
    expect(await run()).toEqual({ sent: 105, undelivered: 0 }); expect(mail).toHaveBeenCalledTimes(105); expect(await run()).toEqual({ sent: 0, undelivered: 0 });
  });
  it("rejects an invalid scheduler time before claiming an invitation", async () => { await overdue(); await expect(run(new Date("invalid"))).rejects.toThrow("invalid_time"); expect(mail).not.toHaveBeenCalled(); });
});


it("uses the existing protected cron route for workspace reminders", async () => {
  await setup(); const inv = await invite(); const now = new Date(Date.now() + 8 * 864e5); mail.mockClear();
  const cron = await import("../../app/api/cron/workflows/route");
  vi.stubEnv("CRON_SECRET", "workspace-test-cron-only");
  try {
    expect((await cron.GET(new NextRequest(`http://localhost/api/cron/workflows?now=${now.toISOString()}`))).status).toBe(401); expect(mail).not.toHaveBeenCalled();
    const response = await cron.GET(new NextRequest(`http://localhost/api/cron/workflows?now=${now.toISOString()}`, { headers: { authorization: "Bearer workspace-test-cron-only" } }));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ workspaceInvitations: { sent: 1, undelivered: 0 } }); expect(mail).toHaveBeenCalledOnce(); expect((await state())!.invitations.find(row => row.id === inv.input.id)!.reminderDelivery).toBe("sent");
  } finally { vi.stubEnv("CRON_SECRET", ""); }
});
