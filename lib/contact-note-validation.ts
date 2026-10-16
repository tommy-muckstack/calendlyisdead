import { z } from "zod";
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value; }, "Choose a valid reminder date.");
export const NoteFields = z.object({ title: z.string().trim().max(200), body: z.string().trim().max(10000), reminderDate: Day.nullable() })
  .refine(value => !!(value.title || value.body), "Enter a title or note text.");
export type NoteDraft = z.infer<typeof NoteFields>;
export const EMPTY_NOTE: NoteDraft = { title: "", body: "", reminderDate: null };
export const CreateNote = NoteFields.safeExtend({ id: z.string().uuid() }).strict();
export const EditNote = NoteFields.safeExtend({ action: z.literal("edit"), version: z.number().int().positive() }).strict();
export const CompleteNote = z.object({ action: z.literal("complete"), version: z.number().int().positive() }).strict();
export const PatchNote = z.union([EditNote, CompleteNote]);
export const DeleteNote = z.object({ version: z.number().int().positive() }).strict();
export const NoteData = NoteFields.safeExtend({ id: z.string().uuid(), contactId: z.string().uuid(), version: z.number().int().positive(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), completedAt: z.string().datetime().nullable() });
export type ContactNote = z.infer<typeof NoteData>;
export const TimelineFilters = z.object({ tab: z.enum(["all", "notes", "meetings"]).default("all"), page: z.coerce.number().int().min(1).max(100000).default(1), note: z.string().uuid().optional() });
export const ReminderFilters = z.object({ bucket: z.enum(["due", "upcoming", "all"]).default("due"), page: z.coerce.number().int().min(1).max(100000).default(1) });
