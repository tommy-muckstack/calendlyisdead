import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ddl = fs.readFileSync(path.join(process.cwd(), "lib/db/ddl.sql"), "utf8");
let client: PGlite | undefined;
afterEach(async () => { await client?.close(); client = undefined; });

async function setup(directory?: string) {
  client = new PGlite(directory);
  await client.exec(ddl);
  await client.exec(`INSERT INTO users (id) VALUES ('host');
    INSERT INTO event_types (id, "userId", slug, title, kind, seats) VALUES ('group', 'host', 'group', 'Group', 'group', 3);`);
}
async function seat(uid: string, number: number, status = "confirmed") {
  await client!.query(`INSERT INTO bookings (uid, "eventTypeId", "hostId", start, "end", "inviteeName", "inviteeEmail", "inviteeTz", seat, status)
    VALUES ($1, 'group', 'host', '2026-11-02T15:00:00Z', '2026-11-02T16:00:00Z', 'Test attendee', 'test@example.invalid', 'UTC', $2, $3)`,
    [uid, number, status]);
}

describe("database startup with group bookings", () => {
  it("reopens a persisted database containing multiple attendees without losing their bookings", async () => {
    const directory = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cid-db-restart-")), "db");
    await setup(directory);
    await seat("first", 0); await seat("second", 1);
    await client!.close();
    client = new PGlite(directory);
    await client.exec(ddl);
    const result = await client.query('SELECT uid, seat FROM bookings ORDER BY seat');
    expect(result.rows).toEqual([{ uid: "first", seat: 0 }, { uid: "second", seat: 1 }]);
    // Startup is replayed on every cold start, not just once per schema version.
    await client.exec(ddl);
    await seat("third", 2);
    await expect(seat("duplicate", 1)).rejects.toMatchObject({ code: "23505" });
  });
  it("upgrades the old single-attendee index and preserves its existing reservation", async () => {
    await setup();
    await seat("original", 0);
    await client!.exec(`DROP INDEX bookings_no_double2;
      ALTER TABLE bookings DROP COLUMN seat;
      CREATE UNIQUE INDEX bookings_no_double ON bookings ("hostId", start) WHERE status = 'confirmed';`);
    await client!.exec(ddl);
    expect((await client!.query('SELECT uid, seat FROM bookings')).rows).toEqual([{ uid: "original", seat: 0 }]);
    await seat("next-attendee", 1);
    await expect(seat("duplicate", 0)).rejects.toMatchObject({ code: "23505" });
    const indexes = await client!.query("SELECT indexname FROM pg_indexes WHERE tablename = 'bookings'");
    expect(indexes.rows.map((row: any) => row.indexname)).not.toContain("bookings_no_double");
    expect(indexes.rows.map((row: any) => row.indexname)).toContain("bookings_no_double2");
  });
  it("enforces per-seat uniqueness on a fresh database while allowing a cancelled seat to be reused", async () => {
    await setup();
    await seat("cancelled", 0, "cancelled");
    await seat("replacement", 0);
    await seat("another-seat", 1);
    await expect(seat("duplicate", 0)).rejects.toMatchObject({ code: "23505" });
  });
});
