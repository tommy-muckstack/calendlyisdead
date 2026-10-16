import { z } from "zod";
import { ContactFieldData, normalizeFieldValue, type ContactField } from "./contact-field-validation";
export const AUTOMATION_FIELD_TYPES = ["text", "number", "tag"] as const;
export const FieldAction = z.object({ fieldId: z.string().uuid(), type: z.enum(AUTOMATION_FIELD_TYPES), value: z.union([z.string().max(2000), z.array(z.string().min(1).max(100)).min(1).max(100)]) }).strict();
export type ContactFieldAction = z.infer<typeof FieldAction>;
const actions = z.array(FieldAction).min(1, "Add at least one field.").max(10, "Choose up to 10 fields.").refine(rows => new Set(rows.map(row => row.fieldId)).size === rows.length, "Choose each field only once.");
export const ContactFieldAutomation = z.object({ eventTypeId: z.string().min(1).max(200), configured: z.boolean(), enabled: z.boolean(), actions: z.array(FieldAction).max(10), version: z.number().int().nonnegative() })
  .refine(value => value.configured ? value.actions.length > 0 && value.version > 0 : !value.enabled && !value.actions.length, "Invalid automation state.");
export const SaveFieldAutomation = z.object({ action: z.literal("save"), actions, fieldVersions: z.record(z.string().uuid(), z.number().int().positive()), enabled: z.boolean(), version: z.number().int().nonnegative() }).strict()
  .refine(value => Object.keys(value.fieldVersions).length === value.actions.length && value.actions.every(row => value.fieldVersions[row.fieldId]), "Reload the selected field definitions.");
export const ToggleFieldAutomation = z.object({ action: z.literal("toggle"), enabled: z.boolean(), version: z.number().int().positive() }).strict();
export const ChangeFieldAutomation = z.discriminatedUnion("action", [SaveFieldAutomation, ToggleFieldAutomation]);
export type FieldAutomationChange = z.infer<typeof ChangeFieldAutomation>;
export const FieldAutomationState = z.object({ automation: ContactFieldAutomation, fields: z.array(ContactFieldData), eventTitle: z.string() });
export type FieldAutomationData = z.infer<typeof FieldAutomationState>;
export const emptyFieldAutomation = (eventTypeId: string): FieldAutomationData["automation"] => ({ eventTypeId, configured: false, enabled: false, actions: [], version: 0 });
export function normalizeFieldAction(action: ContactFieldAction, fields: ContactField[]): ContactFieldAction {
  const field = fields.find(field => field.id === action.fieldId);
  if (!field) throw new Error("A selected field is no longer available. Reload and choose its replacement.");
  if (field.type !== action.type) throw new Error(`${field.name} changed type. Choose the field again and review its value.`);
  const value = normalizeFieldValue(field, action.value);
  if (value === null) throw new Error(`Enter a value for ${field.name}.`);
  return { fieldId: field.id, type: action.type, value };
}
export function fieldActionProblem(action: ContactFieldAction, fields: ContactField[]) {
  try { normalizeFieldAction(action, fields); return ""; } catch (error) { return error instanceof Error ? error.message : "Review this field."; }
}
export const orderedFieldActions = (rows: ContactFieldAction[]) => [...rows].sort((a, b) => a.fieldId.localeCompare(b.fieldId));
export const sameFieldActions = (a: ContactFieldAction[], b: ContactFieldAction[]) => JSON.stringify(orderedFieldActions(a)) === JSON.stringify(orderedFieldActions(b));
