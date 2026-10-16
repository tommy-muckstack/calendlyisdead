import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { changeOnboarding, OnboardingError, readOnboarding } from "@/lib/onboarding";
import { OnboardingMutation } from "@/lib/onboarding-validation";
export const runtime = "nodejs";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() {
  const user = await requireUser(); if (!user) return json({ error: "Sign in to continue setup." }, 401);
  try { const state = await readOnboarding(user.id); return state ? json(state) : json({ error: "This account does not need setup." }, 404); }
  catch { return json({ error: "Could not load setup. Please try again." }, 500); }
}
export async function POST(request: NextRequest) {
  const user = await requireUser(); if (!user) return json({ error: "Sign in to continue setup." }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Request origin is not allowed." }, 403);
  const body = await request.text(); if (body.length > 32_000) return json({ error: "Setup details are too long." }, 413);
  let raw: unknown; try { raw = JSON.parse(body); } catch { return json({ error: "Invalid setup details." }, 400); }
  const parsed = OnboardingMutation.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Check your setup details." }, 400);
  try { return json(await changeOnboarding(user.id, parsed.data)); }
  catch (error) { return error instanceof OnboardingError ? json({ error: error.message, code: error.code }, error.status) : json({ error: "Could not save setup. Your edits are still here; please try again." }, 500); }
}
