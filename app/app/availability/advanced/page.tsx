import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { meetingLimits } from "@/lib/meeting-limits";
import { MeetingLimitsSettings } from "@/components/MeetingLimitsSettings";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser(); if (!user) redirect("/login");
  const db = await getDb(); const [host] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  if (!host) redirect("/login");
  return <MeetingLimitsSettings initial={meetingLimits(host)} timezone={host.timezone} />;
}
