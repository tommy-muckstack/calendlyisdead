import { z } from "zod";
import { ContactFields } from "./contact-validation";
import { CSV_BYTES, CSV_ROWS } from "./contact-csv";
import { ContactScope } from "./contact-list-validation";
const target = z.union([z.literal(""), ContactFields.keyof(), z.string().uuid()]);
export const ImportRequest = z.object({
  id: z.string().uuid(), csv: z.string().max(CSV_BYTES), mapping: z.array(target).min(2).max(50),
  policy: z.enum(["merge", "overwrite", "skip"]), preview: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict().refine(data => data.mapping.includes("name") && data.mapping.includes("email"), "Map Name and Email address.")
  .refine(data => new Set(data.mapping.filter(Boolean)).size === data.mapping.filter(Boolean).length, "Map each contact field only once.");
export type ImportInput = z.infer<typeof ImportRequest>;
export const ImportRowResult = z.object({ row: z.number().int().min(2), status: z.enum(["created", "updated", "unchanged", "skipped"]), contactId: z.string().uuid().nullable(), issues: z.array(z.string()) });
export const ImportResult = z.object({ id: z.string().uuid(), preview: z.string().regex(/^[a-f0-9]{64}$/), committed: z.boolean(), rows: z.array(ImportRowResult).min(1).max(CSV_ROWS) })
  .refine(data => data.rows.every((row, index) => row.row === index + 2 && (!data.committed || row.status === "skipped" || row.contactId !== null)), "Invalid import result.");
export type TransferResult = z.infer<typeof ImportResult>;
export const ExportRequest = z.object({ id: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(1000).optional(), all: z.literal(true).optional(), scope: ContactScope.optional() }).strict()
  .refine(data => (!!data.ids !== !!data.all) && (!data.scope || !!data.all), "Select contacts or all contacts.");
export type ExportInput = z.infer<typeof ExportRequest>;
export const ExportResult = z.object({ id: z.string().uuid(), count: z.number().int().positive(), expiresAt: z.string().datetime(), email: z.enum(["pending", "sent", "unavailable"]) });
