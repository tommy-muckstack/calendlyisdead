import { NextRequest } from "next/server";
import { requireUser } from "@/auth";
import { changeWorkspace, readWorkspace } from "@/lib/workspaces";
import { workspaceFailure, workspaceJson, workspaceRequest } from "@/lib/workspace-http";
export const runtime = "nodejs";
export async function GET() {
  const user = await requireUser(); if (!user) return workspaceJson({ error: "Sign in to view your workspace." }, 401);
  try { return workspaceJson({ workspace: await readWorkspace(user.id) }); } catch (error) { return workspaceFailure(error); }
}
export const POST = (request: NextRequest) => workspaceRequest(request, changeWorkspace);
