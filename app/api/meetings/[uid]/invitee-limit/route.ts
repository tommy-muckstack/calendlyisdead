import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { InviteeLimit, updateGroupInviteeLimit } from "@/lib/group-sessions";

export const runtime = "nodejs";
const Body = z.object({ inviteeLimit: InviteeLimit }).strict();
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const input = Body.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { uid } = await params;
  const result = await updateGroupInviteeLimit(user.id, uid, input.data.inviteeLimit);
  if ("error" in result) return NextResponse.json(result, { status: result.error === "not_found" ? 404 : result.error === "invalid" ? 400 : 409 });
  return NextResponse.json(result);
}
