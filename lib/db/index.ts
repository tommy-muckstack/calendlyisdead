import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { defaultWeekly } from "../slots";
import { eq } from "drizzle-orm";

type DB = any;
const g = globalThis as unknown as { __db?: Promise<DB> };

async function make(): Promise<DB> {
  const ddl = fs.readFileSync(path.join(process.cwd(), "lib/db/ddl.sql"), "utf8");
  let db: DB;
  if (process.env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const sql = postgres(process.env.DATABASE_URL, { max: 5 });
    await sql.unsafe(ddl);
    db = drizzle(sql, { schema });
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data/pglite");
    fs.mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    await client.exec(ddl);
    db = drizzle(client, { schema });
  }
  await seed(db);
  return db;
}

export function getDb(): Promise<DB> {
  return (g.__db ??= make());
}

export const DEMO_USER_ID = "demo-user";
export const DEMO_MATE_ID = "demo-mate";
async function seed(db: DB) {
  // demo accounts only exist outside production or when DEMO_MODE=1
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "1") return;
  const { users, schedules, eventTypes } = schema;
  // second demo account (a teammate), idempotent so older dev databases get it too
  await db.insert(users).values({ id: DEMO_MATE_ID, name: "Sam Rivera", email: "sam@calendlyisdead.local", username: "sam", timezone: "America/Chicago" }).onConflictDoNothing();
  await db.insert(schedules).values({ id: "sam-schedule", userId: DEMO_MATE_ID, timezone: "America/Chicago", weekly: defaultWeekly(), overrides: {} }).onConflictDoNothing();
  const existing = await db.select().from(users).where(eq(users.id, DEMO_USER_ID));
  if (existing.length) return;
  await db.insert(users).values({ id: DEMO_USER_ID, name: "Demo Host", email: "demo@calendlyisdead.local", username: "demo", timezone: "America/New_York" });
  await db.insert(schedules).values({ id: "demo-schedule", userId: DEMO_USER_ID, timezone: "America/New_York", weekly: defaultWeekly(), overrides: {} });
  await db.insert(eventTypes).values([
    { id: "demo-30", userId: DEMO_USER_ID, scheduleId: "demo-schedule", slug: "30min", title: "Quick chat", durationMin: 30, location: "Google Meet", description: "A focused 30 minutes. Bring a question." },
    { id: "demo-60", userId: DEMO_USER_ID, scheduleId: "demo-schedule", slug: "deep-dive", title: "Deep dive", durationMin: 60, color: "#E8692C", bufferAfterMin: 15, location: "Zoom" },
  ]);
}
export { schema };
