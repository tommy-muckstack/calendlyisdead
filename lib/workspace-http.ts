import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireUser } from "@/auth";
import { WorkspaceError } from "./workspaces";
export const workspaceJson = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
export const workspaceFailure = (error: unknown) => error instanceof WorkspaceError ? workspaceJson({ error: error.message, code: error.code }, error.status) : error instanceof ZodError ? workspaceJson({ error: "Check your workspace details and try again." }, 400) : workspaceJson({ error: "The change could not be confirmed. Refresh People before trying again." }, 500);
export async function workspaceRequest(request: NextRequest, change: (id: string, raw: unknown) => Promise<unknown>) {
  const user = await requireUser(); if (!user) return workspaceJson({ error: "Sign in to manage your workspace." }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return workspaceJson({ error: "Request origin is not allowed." }, 403);
  const body = await request.text(); if (body.length > 16_000) return workspaceJson({ error: "Workspace details are too long." }, 413);
  let raw: unknown; try { raw = JSON.parse(body); } catch { return workspaceJson({ error: "Invalid workspace details." }, 400); }
  try { return workspaceJson(await change(user.id, raw)); } catch (error) { return workspaceFailure(error); }
}
