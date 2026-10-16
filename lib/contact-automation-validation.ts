import { z } from "zod";
import { CollectionData } from "./contact-list-validation";
const listIds = z.array(z.string().uuid()).min(1, "Choose at least one list.").max(100, "Choose up to 100 lists.").refine(ids => new Set(ids).size === ids.length, "Choose each list only once.");
export const ContactListAutomation = z.object({ eventTypeId: z.string().min(1).max(200), configured: z.boolean(), enabled: z.boolean(), listIds: z.array(z.string().uuid()).max(100), version: z.number().int().nonnegative() })
  .refine(value => value.configured ? value.listIds.length > 0 && value.version > 0 : !value.enabled && !value.listIds.length, "Invalid automation state.");
export type ListAutomation = z.infer<typeof ContactListAutomation>;
export const SaveListAutomation = z.object({ action: z.literal("save"), listIds, enabled: z.boolean(), version: z.number().int().nonnegative() }).strict();
export const ToggleListAutomation = z.object({ action: z.literal("toggle"), enabled: z.boolean(), version: z.number().int().positive() }).strict();
export const ChangeListAutomation = z.discriminatedUnion("action", [SaveListAutomation, ToggleListAutomation]);
export type ListAutomationChange = z.infer<typeof ChangeListAutomation>;
export const DeleteListAutomation = z.object({ version: z.number().int().positive() }).strict();
export const ContactAutomationState = z.object({ automation: ContactListAutomation, lists: z.array(CollectionData), eventTitle: z.string() });
export type AutomationState = z.infer<typeof ContactAutomationState>;
export const emptyListAutomation = (eventTypeId: string): ListAutomation => ({ eventTypeId, configured: false, enabled: false, listIds: [], version: 0 });
