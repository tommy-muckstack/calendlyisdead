import { z } from "zod";
export const FIELD_TYPES = { text: "Text", number: "Number", currency: "Currency", tag: "Tag", date: "Date", multi_select: "Multi-select", invitee_question: "Invitee question" } as const;
export const CURRENCIES = Intl.supportedValuesOf("currency");
export const ContactFieldDraft = z.object({
  name: z.string().trim().min(1).max(100), type: z.enum(Object.keys(FIELD_TYPES) as [keyof typeof FIELD_TYPES, ...(keyof typeof FIELD_TYPES)[]]),
  options: z.array(z.string().trim().min(1).max(100)).max(100), currency: z.string(),
  eventTypeId: z.string().max(200).nullable(), questionId: z.string().max(40).nullable(),
}).superRefine((field, ctx) => {
  if (["tag", "multi_select"].includes(field.type) && (!field.options.length || new Set(field.options.map(value => value.toLowerCase())).size !== field.options.length)) ctx.addIssue({ code: "custom", path: ["options"], message: "Enter distinct options, one per line." });
  if (!["tag", "multi_select"].includes(field.type) && field.options.length) ctx.addIssue({ code: "custom", path: ["options"], message: "This field type does not use options." });
  if (field.type === "currency" && !CURRENCIES.includes(field.currency)) ctx.addIssue({ code: "custom", path: ["currency"], message: "Choose a supported currency." });
  if (field.type !== "currency" && field.currency !== "") ctx.addIssue({ code: "custom", path: ["currency"], message: "Only currency fields use a currency." });
  if (field.type === "invitee_question" ? !field.eventTypeId || !field.questionId : field.eventTypeId !== null || field.questionId !== null) ctx.addIssue({ code: "custom", path: ["questionId"], message: "Choose an event type and question for an invitee question field." });
});
export const ContactFieldData = ContactFieldDraft.safeExtend({ id: z.string().uuid(), version: z.number().int().positive() });
export const CreateContactField = ContactFieldDraft.safeExtend({ id: z.string().uuid() }).strict();
export const UpdateContactField = ContactFieldDraft.safeExtend({ version: z.number().int().positive() }).strict();
export type FieldDraft = z.infer<typeof ContactFieldDraft>;
export type ContactField = z.infer<typeof ContactFieldData>;
export const EMPTY_FIELD: FieldDraft = { name: "", type: "text", options: [], currency: "", eventTypeId: null, questionId: null };
export const FieldValue = z.union([z.string().max(2000), z.array(z.string().max(100)).max(100), z.null()]);
export type FieldValueType = z.infer<typeof FieldValue>;
export const ContactValuesData = z.object({ contactId: z.string().uuid(), version: z.number().int().positive(), fields: z.array(ContactFieldData), values: z.record(z.string().uuid(), FieldValue) });
export type ContactValues = z.infer<typeof ContactValuesData>;
export const ContactValuesPatch = z.object({ version: z.number().int().positive(), values: z.record(z.string().uuid(), FieldValue), fieldVersions: z.record(z.string().uuid(), z.number().int().positive()) }).strict()
  .refine(value => Object.keys(value.values).length > 0 && Object.keys(value.values).length <= 10, "Choose up to 10 fields.");
export type FieldSource = { id: string; title: string; questions: { id: string; label: string }[] };

export function normalizeFieldValue(field: FieldDraft, input: FieldValueType): FieldValueType {
  if (input === null || input === "" || (Array.isArray(input) && !input.length)) return null;
  if (field.type === "multi_select") {
    if (!Array.isArray(input) || input.some(value => !field.options.includes(value))) throw new Error("Choose values from the available options.");
    return field.options.filter(value => input.includes(value));
  }
  if (typeof input !== "string") throw new Error("Enter a single value.");
  const value = input.trim(); if (!value) return null;
  if (value.length > 2000) throw new Error("Use 2000 characters or fewer.");
  if (field.type === "number" || field.type === "currency") {
    if (!/^[+-]?\d{1,15}(?:\.\d{1,6})?$/.test(value)) throw new Error("Enter a decimal number with up to 15 whole digits and 6 decimal places, without separators.");
    const [whole, fractional = ""] = value.replace(/^[+-]/, "").split("."), integer = whole.replace(/^0+/, "") || "0", fraction = fractional.replace(/0+$/, "");
    return `${value.startsWith("-") && (integer !== "0" || fraction) ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
  }
  if (field.type === "date") {
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) throw new Error("Enter a valid date.");
  }
  if (field.type === "tag" && !field.options.includes(value)) throw new Error("Choose a value from the available options.");
  return value;
}
export function displayFieldValue(field: FieldDraft, value: FieldValueType | undefined) {
  if (value === null || value === undefined) return "Not set";
  return Array.isArray(value) ? value.join(", ") : field.type === "currency" ? `${field.currency} ${value}` : value;
}
