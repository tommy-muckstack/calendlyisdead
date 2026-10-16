import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { readWorkspace } from "@/lib/workspaces";
import { WorkspaceSettings } from "@/components/WorkspaceSettings";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser(); if (!user) redirect("/login");
  return <WorkspaceSettings initial={await readWorkspace(user.id)} me={user.id} section="workspace" />;
}
