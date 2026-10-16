import { NextRequest } from "next/server";
import { acceptWorkspaceInvitation } from "@/lib/workspaces";
import { workspaceRequest } from "@/lib/workspace-http";
export const runtime = "nodejs";
export const POST = (request: NextRequest) => workspaceRequest(request, acceptWorkspaceInvitation);
