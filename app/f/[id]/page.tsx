import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { PublicForm } from "@/components/PublicForm";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const db = await getDb();
  const [f] = await db.select().from(schema.routingForms).where(eq(schema.routingForms.id, id)); if (!f) notFound();
  return <main style={{ maxWidth: 520, margin: "60px auto", padding: 24 }}><div className="card" style={{ padding: 28 }}><PublicForm id={id} name={f.name} fields={f.fields} /></div></main>;
}
