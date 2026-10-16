import { z } from "zod";
import { CURRENCIES, EMPTY_FIELD, normalizeFieldValue } from "./contact-field-validation";
export const OPPORTUNITY_STAGES = { new_lead: "New lead", intro_scheduled: "Intro call scheduled", proposal_sent: "Proposal sent", completed: "Completed", check_later: "Check in later" } as const;
export const OpportunityStage = z.enum(["new_lead", "intro_scheduled", "proposal_sent", "completed", "check_later"]);
export type Stage = z.infer<typeof OpportunityStage>;
const amount = z.string().trim().max(30).transform((value, ctx) => {
  if (!value) return "";
  try { const parsed = normalizeFieldValue({ ...EMPTY_FIELD, type: "number" }, value) as string; if (parsed.startsWith("-")) throw new Error("negative"); return parsed; }
  catch { ctx.addIssue({ code: "custom", message: "Enter a nonnegative amount with up to 15 whole digits and 6 decimal places, without separators." }); return z.NEVER; }
});
const date = z.string().refine(value => { if (!value) return true; const parsed = new Date(`${value}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value; }, "Enter a valid close date.");
export const OpportunityFields = z.object({ name: z.string().trim().min(1, "Enter an opportunity name.").max(200), stage: OpportunityStage, contactId: z.string().uuid().nullable(), amount, currency: z.string().refine(value => CURRENCIES.includes(value), "Choose a supported currency."), closeDate: date, source: z.string().trim().max(500), notes: z.string().trim().max(10000) });
export type OpportunityDraft = z.infer<typeof OpportunityFields>;
export const EMPTY_OPPORTUNITY: OpportunityDraft = { name: "", stage: "new_lead", contactId: null, amount: "", currency: "USD", closeDate: "", source: "", notes: "" };
export const OpportunityData = OpportunityFields.extend({ id: z.string().uuid(), version: z.number().int().positive(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
export type Opportunity = z.infer<typeof OpportunityData>;
export const OpportunityContact = z.object({ id: z.string().uuid(), name: z.string(), email: z.string() });
export const OpportunityRow = z.object({ opportunity: OpportunityData, contact: OpportunityContact.nullable() });
export const OpportunityList = z.object({ rows: z.array(OpportunityRow), total: z.number().int().nonnegative(), page: z.number().int().positive(), stage: OpportunityStage.nullable() });
export type OpportunityListData = z.infer<typeof OpportunityList>;
export const OpportunityDetail = OpportunityRow.extend({ history: z.array(z.object({ id: z.string().uuid(), from: OpportunityStage.nullable(), to: OpportunityStage, at: z.string().datetime() })), historyTotal: z.number().int().nonnegative() });
export type OpportunityDetailData = z.infer<typeof OpportunityDetail>;
export const CreateOpportunity = OpportunityFields.extend({ id: z.string().uuid() }).strict().refine(value => !!value.contactId, { path: ["contactId"], message: "Choose a contact." });
export const UpdateOpportunity = OpportunityFields.extend({ action: z.literal("edit"), version: z.number().int().positive() }).strict();
export const MoveOpportunity = z.object({ action: z.literal("move"), stage: OpportunityStage, version: z.number().int().positive() }).strict();
export const ChangeOpportunity = z.discriminatedUnion("action", [UpdateOpportunity, MoveOpportunity]);
export const DeleteOpportunity = z.object({ version: z.number().int().positive() }).strict();
export const OpportunityFilters = z.object({ q: z.string().trim().max(200).default(""), stage: OpportunityStage.optional(), contactId: z.string().uuid().optional(), page: z.coerce.number().int().min(1).max(1000000).default(1) });
export const sameOpportunity = (a: OpportunityDraft, b: OpportunityDraft) => JSON.stringify(OpportunityFields.parse(a)) === JSON.stringify(OpportunityFields.parse(b));
