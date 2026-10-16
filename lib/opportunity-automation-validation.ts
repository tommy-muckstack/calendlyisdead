import { z } from "zod";
import { OpportunityStage } from "./opportunity-validation";
export const OPPORTUNITY_VARIABLES = { my_name: "My name", invitee_full_name: "Invitee full name", invitee_first_name: "Invitee first name", invitee_last_name: "Invitee last name", meeting_name: "Meeting name" } as const;
export function validOpportunityTemplate(value: string) {
  const remaining = value.replace(/\{\{([a-z_]+)\}\}/g, (token, key: string) => Object.hasOwn(OPPORTUNITY_VARIABLES, key) ? "" : token);
  return !remaining.includes("{{") && !remaining.includes("}}");
}
export const OpportunityAutomationFields = z.object({ name: z.string().trim().min(1, "Enter an automation name.").max(200), eventTypeId: z.string().min(1, "Choose an event type.").max(200), stage: OpportunityStage, opportunityName: z.string().trim().min(1, "Enter an opportunity name.").max(200).refine(validOpportunityTemplate, "Use the supported variables from Insert variable."), enabled: z.boolean() });
export type OpportunityAutomationDraft = z.infer<typeof OpportunityAutomationFields>;
export const EMPTY_OPPORTUNITY_AUTOMATION: OpportunityAutomationDraft = { name: "", eventTypeId: "", stage: "new_lead", opportunityName: "", enabled: true };
export const OpportunityAutomationData = OpportunityAutomationFields.extend({ id: z.string().uuid(), version: z.number().int().positive(), eventTitle: z.string().nullable() });
export type OpportunityAutomation = z.infer<typeof OpportunityAutomationData>;
export const OpportunityAutomationState = z.object({ rows: z.array(OpportunityAutomationData), total: z.number().int().nonnegative(), page: z.number().int().positive(), events: z.array(z.object({ id: z.string(), title: z.string() })), hostName: z.string() });
export type OpportunityAutomationStateData = z.infer<typeof OpportunityAutomationState>;
export const CreateOpportunityAutomation = OpportunityAutomationFields.extend({ id: z.string().uuid() }).strict();
export const ChangeOpportunityAutomation = z.discriminatedUnion("action", [OpportunityAutomationFields.extend({ action: z.literal("save"), version: z.number().int().positive() }).strict(), z.object({ action: z.literal("toggle"), enabled: z.boolean(), version: z.number().int().positive() }).strict()]);
export const OpportunityAutomationFilters = z.object({ eventId: z.string().min(1).max(200).optional(), page: z.coerce.number().int().min(1).max(1000000).default(1), q: z.string().trim().max(200).default("") });
export const sameOpportunityAutomation = (a: OpportunityAutomationDraft, b: OpportunityAutomationDraft) => JSON.stringify(OpportunityAutomationFields.parse(a)) === JSON.stringify(OpportunityAutomationFields.parse(b));
export function renderOpportunityName(template: string, values: { hostName: string; inviteeName: string; meetingName: string }) {
  const full = values.inviteeName.trim(), parts = full.split(/\s+/u), replacements: Record<keyof typeof OPPORTUNITY_VARIABLES, string> = { my_name: values.hostName.trim(), invitee_full_name: full, invitee_first_name: parts[0], invitee_last_name: parts.slice(1).join(" "), meeting_name: values.meetingName.trim() };
  const expanded = template.replace(/\{\{([a-z_]+)\}\}/g, (token, key: string) => Object.hasOwn(replacements, key) ? replacements[key as keyof typeof replacements] : token).replace(/\s+/gu, " ").trim();
  return (expanded || full || values.meetingName.trim() || "Opportunity").slice(0, 200).replace(/[\uD800-\uDBFF]$/, "");
}
