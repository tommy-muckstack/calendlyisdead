const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/calendlyisdead";
export default {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingIncludes: { "/**": ["./lib/db/ddl.sql"] },
};
