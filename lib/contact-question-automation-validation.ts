import { z } from "zod";
import { ContactFieldData } from "./contact-field-validation";
export const QuestionAutomation = z.object({ eventTypeId: z.string(), configured: z.boolean(), enabled: z.boolean(), fieldId: z.string().uuid().nullable(), questionId: z.string().nullable(), version: z.number().int().nonnegative(), legacyConflict: z.boolean() });
export const QuestionAutomationState = z.object({ automation: QuestionAutomation, field: ContactFieldData.nullable(), eventTitle: z.string(), questions: z.array(z.object({ id: z.string(), label: z.string() })), fieldCount: z.number().int().nonnegative() });
export type QuestionAutomationData = z.infer<typeof QuestionAutomationState>;
export const SaveQuestionAutomation = z.object({ action: z.literal("save"), fieldId: z.string().uuid(), questionId: z.string().min(1).max(40), enabled: z.boolean(), version: z.number().int().nonnegative() }).strict();
export const ChangeQuestionAutomation = z.discriminatedUnion("action", [SaveQuestionAutomation, z.object({ action: z.literal("toggle"), enabled: z.boolean(), version: z.number().int().positive() }).strict()]);
export type QuestionAutomationChange = z.infer<typeof ChangeQuestionAutomation>;
export const mappedFieldName = (event: string, question: string) => `${event} - ${question}`.trim().slice(0, 100);
export function questionMappingProblem(state: QuestionAutomationData) {
  const { automation, field, questions } = state;
  if (automation.legacyConflict) return "This event had multiple question mappings. They are paused. Choose one question to create a new mapping; existing fields and values are kept.";
  if (!automation.configured) return "";
  if (!field || field.type !== "invitee_question" || field.eventTypeId !== automation.eventTypeId || field.questionId !== automation.questionId) return "The destination field is unavailable. Choose a question to create a replacement field, or pause or delete this automation.";
  if (!questions.some(question => question.id === automation.questionId)) return "The selected question is unavailable. Choose another question, or pause or delete this automation.";
  return "";
}
