import { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { BP } from "@/lib/basepath";
// Next strips basePath from route-handler URLs, but Auth.js matches actions against
// its own basePath (`${BP}/api/auth`), so put the prefix back before handing the request over.
const withPrefix = (req: NextRequest) => {
  const u = new URL(req.url);
  if (BP && !u.pathname.startsWith(BP + "/")) { u.pathname = BP + u.pathname; return new NextRequest(u.toString(), { method: req.method, headers: req.headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body, duplex: "half" } as any); }
  return req;
};
export const GET = (req: NextRequest) => handlers.GET(withPrefix(req));
export const POST = (req: NextRequest) => handlers.POST(withPrefix(req));
export const runtime = "nodejs";
