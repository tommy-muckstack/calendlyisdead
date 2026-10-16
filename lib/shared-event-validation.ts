import { z } from "zod";
export const SharedEventSettings = z.object({
  workspaceId: z.string().min(1),
  hosts: z.array(z.object({ membershipId: z.string().min(1), scheduleId: z.string().min(1).nullable(), priority: z.number().int().min(1).max(3) }).strict()).min(1, "Add at least one host.").max(100)
    .refine(hosts => new Set(hosts.map(h => h.membershipId)).size === hosts.length, "Choose each host once."),
  distribution: z.enum(["availability", "equal"]), reschedule: z.enum(["reassign", "same"]),
}).strict();
export type SharedEventSettings = z.infer<typeof SharedEventSettings>;
export type SharedHostDirectory = { workspaceId: string; members: {
  membershipId: string; userId: string; name: string; email: string | null; isMe: boolean;
  schedules: { id: string; name: string; timezone: string; isDefault: boolean }[];
}[] };
export class SharedEventError extends Error { constructor(public status: number, message: string) { super(message); } }
