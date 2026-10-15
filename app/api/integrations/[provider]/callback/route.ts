import { BP } from "@/lib/basepath";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { oauth, OAuthName, redirectUri } from "@/lib/calendars/oauth-routes";
import { googleOAuth } from "@/lib/calendars/google";
import { msOAuth } from "@/lib/calendars/microsoft";
import { saveConnection } from "@/lib/calendars";
export const runtime = "nodejs";
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const u = await requireUser(); if (!u) return NextResponse.redirect(new URL(BP + "/login", req.url));
  const { provider } = await params; const o = oauth[provider as OAuthName];
  const back = (q: string) => { const r = NextResponse.redirect(new URL(`${BP}/app/calendars?${q}`, req.url)); r.cookies.delete({ name: "cal_oauth_state", path: BP + "/api/integrations" }); return r; };
  const sp = req.nextUrl.searchParams;
  if (!o) return back("error=unknown_provider");
  if (sp.get("error")) return back(`error=${encodeURIComponent(sp.get("error")!)}`);
  const state = req.cookies.get("cal_oauth_state")?.value;
  if (!state || state !== sp.get("state")) return back("error=bad_state");
  try {
    const t: any = await o.exchange(sp.get("code")!, redirectUri(req, provider));
    if (!t.refresh_token) return back("error=no_refresh_token");
    const email = provider === "google" ? googleOAuth.emailFromIdToken(t.id_token) : await msOAuth.email(t);
    delete t.id_token;
    await saveConnection(u.id, provider, email, t);
    return back(`connected=${provider}`);
  } catch (e: any) { console.warn(`[calendar] ${provider} connect failed: ${e.message}`); return back("error=connect_failed"); }
}
