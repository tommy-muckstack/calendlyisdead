import { z } from "zod";
import { normalizeFieldValue, type ContactField } from "./contact-field-validation";
export const CONTACT_SOURCES = { "": "Unknown", manual: "Manual entry", booking: "Booking", import: "CSV import" } as const;
export const VIEW_FIELDS = { name: "Name", email: "Email address", phone: "Phone number", company: "Company", jobTitle: "Job title", city: "City", state: "State", country: "Country", timezone: "Time zone", source: "Source", createdAt: "Created on", firstMeeting: "First meeting", lastMeeting: "Last meeting", nextMeeting: "Next meeting" } as const;
export const FILTER_OPERATORS = { is: "Is", contains: "Contains", starts_with: "Starts with", blank: "Is blank", today: "Is today", yesterday: "Is yesterday", within: "Is within", not_within: "Is not within", before: "Is before date", after: "Is after date", between: "Is between dates", gt: "Is greater than", lt: "Is less than" } as const;
const Field = z.union([z.enum(Object.keys(VIEW_FIELDS) as [keyof typeof VIEW_FIELDS, ...(keyof typeof VIEW_FIELDS)[]]), z.string().uuid()]);
export const ViewCondition = z.object({ field: Field, operator: z.enum(Object.keys(FILTER_OPERATORS) as [keyof typeof FILTER_OPERATORS, ...(keyof typeof FILTER_OPERATORS)[]]), value: z.string().trim().max(2000).default(""), to: z.string().trim().max(10).default(""), days: z.number().int().min(1).max(36500).default(7), direction: z.enum(["past", "future"]).default("past") }).strict();
export type ContactCondition = z.infer<typeof ViewCondition>;
export const ContactRules = z.object({ match: z.enum(["all", "any"]), conditions: z.array(ViewCondition).max(20) }).strict();
export type ContactRuleSet = z.infer<typeof ContactRules>;
export const EMPTY_RULES: ContactRuleSet = { match: "all", conditions: [] };
export const ContactRulesQuery = z.preprocess(value => { if (typeof value !== "string") return value; if (value.length > 50000) return null; try { return JSON.parse(value); } catch { return null; } }, ContactRules);
export type FilterField = { id: string; label: string; type: "text" | "date" | "number" | "currency" | "tag" | "multi_select"; options?: string[]; custom?: ContactField };
export function filterFields(fields: ContactField[]): FilterField[] {
  return [...Object.entries(VIEW_FIELDS).map(([id, label]) => ({ id, label, type: (["createdAt", "firstMeeting", "lastMeeting", "nextMeeting"].includes(id) ? "date" : id === "source" ? "tag" : "text") as FilterField["type"], ...(id === "source" ? { options: Object.keys(CONTACT_SOURCES).filter(Boolean) } : {}) })), ...fields.map(field => ({ id: field.id, label: field.name, type: field.type === "invitee_question" ? "text" as const : field.type, options: field.options, custom: field }))];
}
export function fieldOperators(field: FilterField): ContactCondition["operator"][] {
  if (field.type === "date") return ["is", "today", "yesterday", "within", "not_within", "before", "after", "between", ...(field.id === "createdAt" ? [] : ["blank" as const])];
  if (field.type === "number" || field.type === "currency") return ["is", "gt", "lt", "blank"];
  if (field.type === "multi_select") return ["contains", "blank"];
  if (field.type === "tag" || field.id === "timezone") return ["is", "blank"];
  return ["is", "contains", ...((field.id === "phone" || field.custom) ? ["starts_with" as const] : []), "blank"];
}
export const validFilterDate = (value: string) => { const date = new Date(`${value}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(+date) && date.toISOString().slice(0, 10) === value; };
export function normalizeContactRules(input: ContactRuleSet, fields: ContactField[]): ContactRuleSet {
  const rules = ContactRules.parse(input), choices = filterFields(fields);
  return { ...rules, conditions: rules.conditions.map(condition => {
    const field = choices.find(field => field.id === condition.field);
    if (!field) throw new Error("A field used by these filters is no longer available. Edit the filters to continue.");
    if (!fieldOperators(field).includes(condition.operator)) throw new Error(`Choose a supported condition for ${field.label}.`);
    if (["blank", "today", "yesterday", "within", "not_within"].includes(condition.operator)) return condition;
    if (!condition.value) throw new Error(`Enter a value for ${field.label}.`);
    if (field.type === "date" && (!validFilterDate(condition.value) || (condition.operator === "between" && (!validFilterDate(condition.to) || condition.to < condition.value)))) throw new Error(`Choose valid dates in order for ${field.label}.`);
    if ((field.type === "tag" || field.type === "multi_select") && !field.options?.includes(condition.value)) throw new Error(`Choose an available option for ${field.label}.`);
    if (field.custom && (field.type === "number" || field.type === "currency")) return { ...condition, value: String(normalizeFieldValue(field.custom, condition.value)) };
    return condition;
  }) };
}
