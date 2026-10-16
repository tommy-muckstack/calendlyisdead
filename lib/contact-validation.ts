import { z } from "zod";
import { validBookingTimezone } from "./booking-timezone";
import { ContactRulesQuery } from "./contact-view-validation";

const text = (max: number) => z.string().trim().max(max);
export const ContactFields = z.object({
  name: text(200).min(1, "Enter a name."), email: text(254).email("Enter a valid email address.").toLowerCase(),
  phone: text(60), jobTitle: text(150), company: text(150),
  linkedIn: text(500).refine(value => {
    if (!value) return true;
    try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
  }, "Enter a complete http or https URL."),
  timezone: text(100).refine(value => !value || validBookingTimezone(value), "Choose a valid time zone."),
  country: text(100), city: text(150), state: text(150),
});
export type ContactDraft = z.infer<typeof ContactFields>;
export const CONTACT_LABELS: Record<keyof ContactDraft, string> = {
  name: "Name", email: "Email address", phone: "Phone", jobTitle: "Job title", company: "Company", linkedIn: "LinkedIn",
  timezone: "Time zone", country: "Country", city: "City", state: "State",
};
export const EMPTY_CONTACT: ContactDraft = { name: "", email: "", phone: "", jobTitle: "", company: "", linkedIn: "", timezone: "", country: "", city: "", state: "" };
export const ContactData = ContactFields.extend({ id: z.string().uuid(), version: z.number().int().positive(), source: z.enum(["", "manual", "booking", "import"]).optional() });
export type ContactRecord = z.infer<typeof ContactData>;
export const CreateContact = ContactFields.extend({ id: z.string().uuid() }).strict();
export const UpdateContact = ContactFields.extend({ version: z.number().int().positive() }).strict();
export const DeleteContact = z.object({ version: z.number().int().positive() }).strict();
export const ContactFilters = z.object({
  q: text(200).default(""), page: z.coerce.number().int().min(1).max(100000).default(1),
  sort: z.enum(["name", "updated"]).default("name"),
  collection: z.string().uuid().optional(), rules: ContactRulesQuery.optional(),
});
export type ContactFilter = z.infer<typeof ContactFilters>;
