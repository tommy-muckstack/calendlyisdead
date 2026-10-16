import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { readContactSettings } from "@/lib/contact-settings";
import { ContactSettings } from "@/components/ContactSettings";
export default async function ContactsSettingsPage() {
  const user = await requireUser(); if (!user) redirect("/login");
  return <ContactSettings initial={await readContactSettings(user.id)} />;
}
