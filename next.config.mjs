const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/calendlyisdead";
export default {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingIncludes: { "/**": ["./lib/db/ddl.sql"] },
  // PostHog reverse proxy (same origin, so ad blockers don't drop analytics). Trailing slashes are passed through untouched.
  skipTrailingSlashRedirect: true,
  async rewrites() { return [{ source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" }, { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" }]; },
};
