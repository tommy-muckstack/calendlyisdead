import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import { BP } from "./basepath";
import { sendMail, type Mail } from "./email";
import { WorkspaceAcceptance, WorkspaceMutation, type WorkspaceData } from "./workspace-validation";
const { workspaces: W, workspaceMembers: M, workspaceInvitations: I, workspaceCreations: C, users: U } = schema;
type DB = Awaited<ReturnType<typeof getDb>>;
type Member = typeof M.$inferSelect;
type Invitation = typeof I.$inferSelect;
export class WorkspaceError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const fail = (status: number, code: string, message: string): never => { throw new WorkspaceError(status, code, message); };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const admin = (member: Member) => member.role === "owner" || member.role === "admin";
const pending = and(isNull(I.acceptedMembershipId), isNull(I.revokedAt));
const invalid = (): never => fail(404, "invitation_unavailable", "This invitation is no longer available. Ask your workspace admin for a new one.");
const stale = (): never => fail(409, "workspace_changed", "The workspace changed. Refresh People before trying again.");
async function memberFor(tx: DB, userId: string): Promise<Member | undefined> {
  return (await tx.select().from(M).where(eq(M.userId, userId)))[0];
}
/** All membership mutations take the workspace lock before the affected user lock. */
async function ownedWorkspace(tx: DB, userId: string, lock: "share" | "update") {
  const membership = await memberFor(tx, userId);
  if (!membership) return null;
  const [workspace] = await tx.select().from(W).where(eq(W.id, membership.workspaceId)).for(lock);
  const current = await memberFor(tx, userId);
  return workspace && current?.workspaceId === workspace.id ? { workspace, member: current } : null;
}
async function data(tx: DB, userId: string): Promise<WorkspaceData | null> {
  const current = await ownedWorkspace(tx, userId, "share"); if (!current) return null;
  const { workspace, member } = current;
  const members: WorkspaceData["members"] = await tx.select({ id: M.id, userId: M.userId, role: M.role, name: U.name, email: U.email }).from(M).innerJoin(U, eq(M.userId, U.id)).where(eq(M.workspaceId, workspace.id)).orderBy(M.joinedAt, M.id);
  const invitations: Invitation[] = admin(member) ? await tx.select().from(I).where(and(eq(I.workspaceId, workspace.id), pending)).orderBy(I.email) : [];
  return { id: workspace.id, name: workspace.name, version: workspace.version, role: member.role, members,
    invitations: invitations.map(inv => ({ id: inv.id, email: inv.email, role: inv.role, expiresAt: inv.expiresAt.toISOString(), delivery: inv.delivery })) };
}
export async function readWorkspace(userId: string) {
  const db = await getDb(); return db.transaction((tx: DB) => data(tx, userId), { isolationLevel: "read committed" });
}
async function lockUser(tx: DB, userId: string) {
  const [user]: (typeof U.$inferSelect)[] = await tx.select().from(U).where(eq(U.id, userId)).for("no key update");
  if (!user) fail(404, "user_missing", "This account is unavailable."); return user;
}
function delivery(invitation: Invitation, name: string, token: string) {
  const origin = (process.env.APP_URL ?? process.env.AUTH_URL ?? `http://localhost:3000${BP}`).replace(/\/$/, "");
  const url = `${origin}/invite/workspace/${token}`;
  const mail: Mail = { to: invitation.email, subject: `Join ${name} on CalendlyIsDead`, text: `You have been invited to join ${name}.\n\nSign in with this email address and accept your invitation:\n${url}\n\nThis link expires in 7 days. If you were not expecting this invitation, you can ignore it.`, idempotencyKey: `workspace-${invitation.id}-${invitation.tokenHash}` };
  return { invitation, mail, url };
}
export async function changeWorkspace(userId: string, raw: unknown) {
  const input = WorkspaceMutation.parse(raw), db = await getDb();
  const outbound = await db.transaction(async (tx: DB) => {
    if (input.action === "create") {
      await lockUser(tx, userId);
      const digest = hash(JSON.stringify({ name: input.name }));
      const [receipt] = await tx.select().from(C).where(eq(C.id, input.id));
      if (receipt) {
        if (receipt.userId !== userId || receipt.requestHash !== digest) stale();
        const member = await memberFor(tx, userId);
        if (member?.workspaceId !== input.id) fail(410, "workspace_removed", "This workspace was removed or your membership changed. Refresh People to continue.");
        return null;
      }
      if (await memberFor(tx, userId)) fail(409, "already_member", "You already belong to a workspace. Refresh People to continue.");
      // A competing request with this ID must not overwrite another owner's workspace.
      const inserted = await tx.insert(C).values({ id: input.id, userId, requestHash: digest }).onConflictDoNothing().returning();
      if (!inserted.length) stale();
      await tx.insert(W).values({ id: input.id, name: input.name });
      await tx.insert(M).values({ id: crypto.randomUUID(), userId, workspaceId: input.id, role: "owner" });
      return null;
    }
    const current = await ownedWorkspace(tx, userId, "update");
    if (!current || !admin(current.member)) fail(403, "admin_required", "Only a workspace owner or admin can make this change.");
    const { workspace, member } = current;
    // A lost invitation response can be retried without another invitation or email.
    const digest = input.action === "invite" ? hash(JSON.stringify({ email: input.email, role: input.role })) : "";
    if (input.action === "invite") {
      const [receipt]: Invitation[] = await tx.select().from(I).where(eq(I.id, input.id));
      if (receipt) {
        if (receipt.workspaceId !== workspace.id || receipt.invitedBy !== userId || receipt.requestHash !== digest) stale();
        return null;
      }
    }
    if (input.version !== workspace.version) stale();
    let mail: ReturnType<typeof delivery> | null = null;
    if (input.action === "rename") await tx.update(W).set({ name: input.name }).where(eq(W.id, workspace.id));
    else if (input.action === "invite") {
      const [existing] = await tx.select({ id: M.id }).from(M).innerJoin(U, eq(U.id, M.userId)).where(and(eq(M.workspaceId, workspace.id), eq(U.email, input.email)));
      if (existing) fail(409, "already_member", "This person already belongs to your workspace.");
      const [waiting] = await tx.select().from(I).where(and(eq(I.workspaceId, workspace.id), eq(I.email, input.email), pending));
      if (waiting) fail(409, "already_invited", "This person already has a pending invitation. Resend it from Pending invitations.");
      const token = randomBytes(32).toString("hex");
      const [invitation]: Invitation[] = await tx.insert(I).values({ id: input.id, workspaceId: workspace.id, email: input.email, role: input.role, invitedBy: userId, tokenHash: hash(token), requestHash: digest, expiresAt: new Date(Date.now() + 7 * 864e5) }).returning();
      mail = delivery(invitation, workspace.name, token);
    } else if (input.action === "resend" || input.action === "revoke") {
      const [invitation]: Invitation[] = await tx.select().from(I).where(and(eq(I.id, input.invitationId), eq(I.workspaceId, workspace.id), pending));
      if (!invitation) invalid();
      if (input.action === "revoke") await tx.update(I).set({ revokedAt: new Date() }).where(eq(I.id, invitation.id));
      else {
        const token = randomBytes(32).toString("hex");
        const [renewed]: Invitation[] = await tx.update(I).set({ tokenHash: hash(token), expiresAt: new Date(Date.now() + 7 * 864e5), invitedBy: userId, delivery: "pending" }).where(eq(I.id, invitation.id)).returning();
        mail = delivery(renewed, workspace.name, token);
      }
    } else if (input.action === "disband") {
      if (member.role !== "owner") fail(403, "owner_required", "Only the workspace owner can delete the workspace.");
      const members: Member[] = await tx.select().from(M).where(eq(M.workspaceId, workspace.id));
      if (members.length !== 1) fail(409, "members_remain", "Remove the other members before deleting this workspace.");
      await lockUser(tx, userId);
      await tx.delete(W).where(eq(W.id, workspace.id));
      return null;
    } else {
      const target = await memberFor(tx, input.userId);
      if (!target || target.workspaceId !== workspace.id) fail(404, "member_missing", "This member is no longer in the workspace.");
      if (target.role === "owner") fail(403, "protect_owner", "Transfer ownership to another member before changing the owner.");
      if (input.action === "remove") {
        await lockUser(tx, target.userId);
        await tx.delete(M).where(eq(M.id, target.id));
      } else {
        if (input.role === "owner") {
          if (member.role !== "owner") fail(403, "owner_required", "Only the owner can transfer workspace ownership.");
          await tx.update(M).set({ role: "admin" }).where(eq(M.id, member.id));
        }
        await tx.update(M).set({ role: input.role }).where(eq(M.id, target.id));
      }
      // Old invitations must not regain authority if the inviter is later promoted or re-added.
      if (input.action === "remove" || input.role === "user") await tx.update(I).set({ revokedAt: new Date() }).where(and(eq(I.workspaceId, workspace.id), eq(I.invitedBy, target.userId), pending));
    }
    await tx.update(W).set({ version: workspace.version + 1 }).where(eq(W.id, workspace.id));
    return mail;
  }, { isolationLevel: "read committed" });
  let invitationUrl: string | null = null;
  if (outbound) {
    // A provider failure does not roll back the invitation. The admin can share
    // this link or explicitly resend, which invalidates the previous link.
    let delivered = false; try { delivered = await sendMail(outbound.mail); } catch { /* retain usable invitation */ }
    const updated = await db.update(I).set({ delivery: delivered ? "sent" : "undelivered" }).where(and(eq(I.id, outbound.invitation.id), eq(I.tokenHash, outbound.invitation.tokenHash), pending)).returning();
    if (updated.length) invitationUrl = outbound.url;
  }
  return { workspace: await readWorkspace(userId), invitationUrl };
}
async function invitationFor(tx: DB, userId: string, token: string) {
  const [invitation]: Invitation[] = await tx.select().from(I).where(eq(I.tokenHash, hash(token)));
  if (!invitation || invitation.revokedAt) invalid();
  const [workspace] = await tx.select().from(W).where(eq(W.id, invitation.workspaceId));
  const [user]: (typeof U.$inferSelect)[] = await tx.select().from(U).where(eq(U.id, userId));
  if (!user?.email || user.email.toLowerCase() !== invitation.email) fail(403, "wrong_account", "Sign in with the email address this invitation was sent to.");
  const membership = await memberFor(tx, userId);
  if (invitation.acceptedMembershipId) {
    if (membership?.id !== invitation.acceptedMembershipId) invalid();
    return { invitation, workspace, alreadyJoined: true };
  }
  if (invitation.expiresAt.getTime() <= Date.now()) invalid();
  const inviter = await memberFor(tx, invitation.invitedBy);
  if (!workspace || inviter?.workspaceId !== workspace.id || !admin(inviter)) invalid();
  return { invitation, workspace, alreadyJoined: false };
}
export async function readWorkspaceInvitation(userId: string, raw: unknown) {
  const { token } = WorkspaceAcceptance.parse(raw), db = await getDb();
  const result = await invitationFor(db, userId, token);
  return { name: result.workspace.name, role: result.invitation.role, alreadyJoined: result.alreadyJoined };
}
export async function acceptWorkspaceInvitation(userId: string, raw: unknown) {
  const { token } = WorkspaceAcceptance.parse(raw), db = await getDb();
  await db.transaction(async (tx: DB) => {
    const [probe]: Invitation[] = await tx.select().from(I).where(eq(I.tokenHash, hash(token))); if (!probe) invalid();
    await tx.select().from(W).where(eq(W.id, probe.workspaceId)).for("update");
    await lockUser(tx, userId);
    const result = await invitationFor(tx, userId, token); if (result.alreadyJoined) return;
    if (await memberFor(tx, userId)) fail(409, "already_member", "You already belong to a workspace. Ask its owner or admin to remove you before accepting. If you own it, transfer ownership or delete the empty workspace first.");
    const id = crypto.randomUUID();
    await tx.insert(M).values({ id, workspaceId: result.workspace.id, userId, role: result.invitation.role });
    await tx.update(I).set({ acceptedMembershipId: id }).where(eq(I.id, result.invitation.id));
    await tx.update(W).set({ version: result.workspace.version + 1 }).where(eq(W.id, result.workspace.id));
  }, { isolationLevel: "read committed" });
  return { workspace: await readWorkspace(userId) };
}
