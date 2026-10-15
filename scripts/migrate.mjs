// Applies lib/db/ddl.sql (idempotent CREATE ... IF NOT EXISTS) to DATABASE_URL.
// The app also applies it on cold start; this lets you migrate ahead of a deploy.
// Uses Neon's HTTPS driver for neon.tech URLs (works where port 5432 is blocked), postgres.js otherwise.
import fs from "node:fs";
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
const ddl = fs.readFileSync(new URL("../lib/db/ddl.sql", import.meta.url), "utf8");
if (/neon\.tech/.test(url)) {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  for (const stmt of ddl.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) await sql.query(stmt);
  const t = await sql.query("select count(*)::int n from information_schema.tables where table_schema = 'public'");
  console.log(`migrated: ${t[0].n} tables in public schema`);
} else {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1 }); await sql.unsafe(ddl);
  const t = await sql`select count(*)::int n from information_schema.tables where table_schema = 'public'`;
  console.log(`migrated: ${t[0].n} tables in public schema`); await sql.end();
}
