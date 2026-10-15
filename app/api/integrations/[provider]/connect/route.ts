import { BP } from "@/lib/basepath";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { oauth, OAuthName, redirectUri, newState } from "@/lib/calendars/oauth-routes";
export const runtime = "nodejs";
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.redirect(new URL(BP + "/login", req.url));
  const { provider } = await params; const o = oauth[provider as OAuthName];
  if (!o) return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  if (!o.configured()) return NextResponse.redirect(new URL(`${BP}/app/calendars?error=${provider}_not_configured`, req.url));
  const res = NextResponse.redirect("about:blank"); const state = newState(res);
  res.headers.set("location", o.authUrl(state, redirectUri(req, provider)));
  return res;
}
