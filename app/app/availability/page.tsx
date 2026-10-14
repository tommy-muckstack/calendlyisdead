import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import Holidays from "date-holidays";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await requireUser(); if (!u) redirect("/login"); const db = await getDb();
  const scs = await db.select().from(schema.schedules).where(eq(schema.schedules.userId, u.id));
  const countries = Object.entries(new Holidays().getCountries("en") as Record<string, string>).sort((a, b) => a[1].localeCompare(b[1]));
  return <AvailabilityEditor schedules={scs.map((s: any) => ({ id: s.id, name: s.name, isDefault: s.isDefault, timezone: s.timezone, weekly: s.weekly, overrides: s.overrides ?? {}, holidayCountry: s.holidayCountry ?? null }))} countries={countries} />;
}
