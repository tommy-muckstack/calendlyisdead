import { z } from "zod";
import { ContactRules } from "./contact-view-validation";
export const CollectionFields = z.object({ name: z.string().trim().min(1, "Enter a name.").max(200), kind: z.enum(["list", "view"]), rules: ContactRules }).strict().refine(value => value.kind !== "list" || !value.rules.conditions.length, "Manual lists do not use saved filters.");
export const CollectionData = CollectionFields.safeExtend({ id: z.string().uuid(), version: z.number().int().positive() }).strip();
export type ContactCollection = z.infer<typeof CollectionData>;
export const CreateCollection = CollectionFields.safeExtend({ id: z.string().uuid() }).strict();
export const UpdateCollection = CollectionFields.safeExtend({ version: z.number().int().positive() }).strict();
export const DeleteCollection = z.object({ version: z.number().int().positive() }).strict();
export const ContactScope = z.object({ collectionId: z.string().uuid().optional(), collectionVersion: z.number().int().positive().optional(), q: z.string().trim().max(200).default(""), rules: ContactRules.optional() }).strict()
  .refine(value => !value.collectionVersion || !!value.collectionId, "Choose a list or view for this version.");
export type ContactSelectionScope = z.infer<typeof ContactScope>;
export const MembershipRequest = z.object({ id: z.string().uuid(), version: z.number().int().positive(), action: z.enum(["add", "remove"]), ids: z.array(z.string().uuid()).min(1).max(1000).refine(ids => new Set(ids).size === ids.length).optional(), scope: ContactScope.optional() }).strict().refine(value => !!value.ids !== !!value.scope, "Choose contacts or a filtered selection.");
export type MembershipInput = z.infer<typeof MembershipRequest>;
export const MembershipResult = z.object({ id: z.string().uuid(), collectionId: z.string().uuid(), action: z.enum(["add", "remove"]), selectedCount: z.number().int().nonnegative(), changedCount: z.number().int().nonnegative(), version: z.number().int().positive() });
export type MembershipReceipt = z.infer<typeof MembershipResult>;
