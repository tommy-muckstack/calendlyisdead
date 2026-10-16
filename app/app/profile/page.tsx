import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { profileData } from "@/lib/profile";
import { ProfileSettings } from "@/components/ProfileSettings";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser(); if (!user) redirect("/login");
  const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  const zones = [...new Set(["UTC", user.timezone, ...supported])].sort();
  return <ProfileSettings initial={profileData(user)} zones={zones} />;
}
