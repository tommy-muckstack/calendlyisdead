import { z } from "zod";

// Keep account provisioning and the editor out of application/static routes.
const reservedNames = new Set(["app", "api", "login", "signup", "onboarding", "pricing", "team", "booking", "meet", "pay", "poll", "invite", "f", "home", "_next"]);
export const isReservedUsername = (value: string) => reservedNames.has(value.toLowerCase());
export const PublicUsername = z.string().trim().regex(/^[a-z0-9-]{1,60}$/, "Use 1–60 lowercase letters, numbers or hyphens.")
  .refine(value => !isReservedUsername(value), "This link is reserved. Choose another link.");
export const MyLinkPatch = z.object({ username: PublicUsername, expectedUsername: z.string().max(2048).nullable() }).strict();
export const MyLinkData = z.object({ username: z.string().nullable() });
export type MyLink = z.infer<typeof MyLinkData>;
