import { z } from "zod";
const name = z.string().trim().min(1, "Enter a workspace name.").max(120);
const revision = { version: z.number().int().positive() };
export const WorkspaceMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), id: z.uuid(), name }).strict(),
  z.object({ action: z.literal("rename"), name, ...revision }).strict(),
  z.object({ action: z.literal("invite"), id: z.uuid(), email: z.email().max(254).transform(value => value.toLowerCase()), role: z.enum(["admin", "user"]), ...revision }).strict(),
  z.object({ action: z.literal("role"), userId: z.string().min(1).max(128), role: z.enum(["admin", "user", "owner"]), ...revision }).strict(),
  z.object({ action: z.literal("remove"), userId: z.string().min(1).max(128), ...revision }).strict(),
  z.object({ action: z.literal("resend"), invitationId: z.uuid(), ...revision }).strict(),
  z.object({ action: z.literal("revoke"), invitationId: z.uuid(), ...revision }).strict(),
  z.object({ action: z.literal("disband"), ...revision }).strict(),
]);
export const WorkspaceAcceptance = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type WorkspaceChange = z.infer<typeof WorkspaceMutation>;
export type WorkspaceRole = "owner" | "admin" | "user";
export type WorkspaceData = {
  id: string; name: string; version: number; role: WorkspaceRole;
  members: { id: string; userId: string; name: string | null; email: string | null; role: WorkspaceRole }[];
  invitations: { id: string; email: string; role: "admin" | "user"; expiresAt: string | null; delivery: "pending" | "sent" | "undelivered"; reminderDelivery: "pending" | "sent" | "undelivered" | null }[];
};
