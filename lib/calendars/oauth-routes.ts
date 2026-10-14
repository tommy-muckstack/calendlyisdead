import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { googleOAuth } from "./google";
import { msOAuth } from "./microsoft";
export const oauth = { google: googleOAuth, microsoft: msOAuth } as const;
export type OAuthName = keyof typeof oauth;
export const redirectUri = (req: NextRequest, p: string) => `${process.env.APP_URL ?? req.nextUrl.origin}/api/integrations/${p}/callback`;
export function newState(res: NextResponse) {
  const state = crypto.randomBytes(16).toString("base64url");
  res.cookies.set("cal_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/integrations", maxAge: 600 });
  return state;
}
