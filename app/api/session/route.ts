import { NextRequest, NextResponse } from "next/server";
import { upsertFirebaseUser, adoptGuestAsUser } from "@/auth";
import { createSessionFromIdToken, firebaseConfigured, SESSION_COOKIE, DEMO_COOKIE, GUEST_COOKIE, verifyGuest, cookieOptions } from "@/lib/isdead-auth/server";
export const runtime = "nodejs";
// POST { idToken } → verifies with firebase-admin, maps uid → users row, sets the shared session cookie.
export async function POST(req: NextRequest) {
  if (!firebaseConfigured()) return NextResponse.json({ error: "Sign-in is not configured yet." }, { status: 503 });
  const { idToken } = await req.json().catch(() => ({}));
  if (typeof idToken !== "string" || !idToken) return NextResponse.json({ error: "idToken required" }, { status: 400 });
  let s; try { s = await createSessionFromIdToken(idToken); } catch (e) { console.error("session: createSessionFromIdToken failed", (e as { code?: string })?.code, String((e as Error)?.message).slice(0, 200)); return NextResponse.json({ error: "Sign-in failed. Try again." }, { status: 401 }); }
  // A guest signing in for the first time keeps their work: the guest row becomes the account.
  const guest = verifyGuest(req.cookies.get(GUEST_COOKIE)?.value);
  const adopted = guest ? await adoptGuestAsUser(guest, s.identity).catch(() => null) : null;
  const u = adopted ?? await upsertFirebaseUser(s.identity);
  if ("error" in u) return NextResponse.json({ error: u.error }, { status: 403 });
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(SESSION_COOKIE, s.cookie, cookieOptions());
  res.cookies.set(DEMO_COOKIE, "", { ...cookieOptions(0) });
  res.cookies.set(GUEST_COOKIE, "", { ...cookieOptions(0) });
  return res;
}
