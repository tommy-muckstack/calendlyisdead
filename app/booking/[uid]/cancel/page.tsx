import { CancelForm } from "@/components/CancelForm";
export default async function Page({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  return <main style={{ maxWidth: 520, margin: "60px auto", padding: 24 }}><div className="card" style={{ padding: 28 }}><CancelForm uid={uid} /></div></main>;
}
