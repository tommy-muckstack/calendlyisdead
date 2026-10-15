import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { BP } from "@/lib/basepath";
import { GUEST_COOKIE, GUEST_MAX_AGE_S, cookieOptions, guestEnabled, newGuestId, signGuest } from "@/lib/isdead-auth/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// GET ?next=/app → mint a guest session (if there is no session yet) and bounce back into the app.
// Relative Location on purpose: behind the yourappisdead.com rewrite this function sees its own
// *.vercel.app origin, and an absolute redirect would carry the visitor off the public domain.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("next") || "/app";
  const next = /^\/(?!\/)[\w\-./?=&%]*$/.test(raw) ? raw : "/app";
  const go = (path: string) => new NextResponse(null, { status: 307, headers: { Location: BP + path } });
  if (!guestEnabled()) return go("/login?callbackUrl=" + encodeURIComponent(next));
  const res = go(next);
  if (!(await auth())) res.cookies.set(GUEST_COOKIE, signGuest(newGuestId()), cookieOptions(GUEST_MAX_AGE_S));
  return res;
}
