import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { BrandingPanel } from "@/components/BrandingPanel";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await requireUser(); if (!u) redirect("/login"); const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
  return <BrandingPanel username={me.username} initial={{ brandColor: me.brandColor, logoUrl: me.logoUrl, hideBranding: me.hideBranding }} />;
}
