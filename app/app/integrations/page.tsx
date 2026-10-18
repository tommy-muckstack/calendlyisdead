import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { integrationStates } from "@/lib/integrations/state";
import { IntegrationsDirectory } from "@/components/IntegrationsDirectory";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser(); if (!user) redirect("/login");
  return <IntegrationsDirectory states={await integrationStates(user.id, user.addToCalendarId)} />;
}
