import { z } from "zod";

export const MAX_PHOTO_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_DATA_LENGTH = 512 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export function validProfileTimezone(value: string): boolean {
  if (!value.trim() || value !== value.trim()) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}
export const ProfilePatch = z.object({
  name: z.string().trim().min(1).max(120),
  welcomeMessage: z.string().max(1000),
  timezone: z.string().max(100).refine(validProfileTimezone, "Choose a valid time zone."),
  image: z.string().max(MAX_PHOTO_DATA_LENGTH).regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/).nullable(),
}).strict().partial().refine(value => Object.keys(value).length > 0);
export const ProfileData = z.object({ name: z.string(), welcomeMessage: z.string(), timezone: z.string(), image: z.string().nullable(), username: z.string().nullable() });
export type Profile = z.infer<typeof ProfileData>;
export function profileData(user: { name: string | null; welcomeMessage: string; timezone: string; image: string | null; username: string | null }): Profile {
  return { name: user.name ?? "", welcomeMessage: user.welcomeMessage, timezone: user.timezone, image: user.image, username: user.username };
}
