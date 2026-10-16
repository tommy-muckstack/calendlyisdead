import { z } from "zod";

const count = z.number().int().min(1).max(2_147_483_647).nullable();
export const MeetingLimitsSchema = z.object({ meetingLimitPerDay: count, meetingLimitPerWeek: count, meetingLimitPerMonth: count }).strict();
export const MeetingLimitsPatch = MeetingLimitsSchema.partial().refine(value => Object.keys(value).length > 0);
export type MeetingLimits = z.infer<typeof MeetingLimitsSchema>;
export const HostLimitsResponse = z.object({ hosts: z.array(MeetingLimitsSchema.extend({ id: z.string(), name: z.string(), timezone: z.string(), isMe: z.boolean() })) });
export const LIMIT_FIELDS = ["meetingLimitPerDay", "meetingLimitPerWeek", "meetingLimitPerMonth"] as const;
export const LIMIT_LABELS = { meetingLimitPerDay: "Daily", meetingLimitPerWeek: "Weekly", meetingLimitPerMonth: "Monthly" } as const;
export function meetingLimits(user: MeetingLimits): MeetingLimits {
  return { meetingLimitPerDay: user.meetingLimitPerDay, meetingLimitPerWeek: user.meetingLimitPerWeek, meetingLimitPerMonth: user.meetingLimitPerMonth };
}
