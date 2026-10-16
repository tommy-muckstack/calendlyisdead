import { z } from "zod";

const domain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const exclusion = z.string().trim().toLowerCase().max(254).refine(value =>
  value.includes("@") ? z.email().safeParse(value).success : domain.test(value), "Enter a domain or email address.");
export const ContactPreferences = z.object({
  bookingEnabled: z.boolean(), exclusions: z.array(exclusion).max(100).transform(values => [...new Set(values)].sort()),
});
export const ContactSettingsData = ContactPreferences.extend({ version: z.number().int().positive() });
export const ContactSettingsPatch = ContactSettingsData.strict();
export type ContactSettings = z.infer<typeof ContactSettingsData>;
export const DEFAULT_CONTACT_SETTINGS: ContactSettings = { bookingEnabled: true, exclusions: [], version: 1 };
export const parseContactExclusions = (text: string) => text.split(/[\s,]+/).filter(Boolean);
export function contactExcluded(email: string, exclusions: string[]) {
  const address = email.trim().toLowerCase(), host = address.slice(address.lastIndexOf("@") + 1);
  return exclusions.some(value => value.includes("@") ? address === value : host === value || host.endsWith(`.${value}`));
}
