import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = (await requireUser())!; const db = await getDb();
  const [sc] = await db.select().from(schema.schedules).where(eq(schema.schedules.userId, u.id));
  return <AvailabilityEditor initial={{ timezone: sc.timezone, weekly: sc.weekly, overrides: sc.overrides ?? {} }} />;
}
