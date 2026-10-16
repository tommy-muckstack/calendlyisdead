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

describe("database startup and booking migrations", () => {
  it("replaces owner-wide link uniqueness with personal/team namespaces and survives repeated startup", async () => {
    await setup(); await seat("retained", 0);
    await client!.exec(`DROP INDEX event_types_current_personal_slug; DROP INDEX event_types_current_team_slug;
      CREATE UNIQUE INDEX event_types_current_user_slug ON event_types ("userId", slug) WHERE "deletedAt" IS NULL;
      INSERT INTO users (id) VALUES ('other');
      INSERT INTO teams (id, slug, name) VALUES ('a', 'a', 'A'), ('b', 'b', 'B');
      INSERT INTO event_types (id, "userId", "teamId", slug, title) VALUES ('team-a', 'host', 'a', 'shared', 'A'), ('team-b', 'host', 'b', 'other', 'B');`);
    await client!.exec(ddl);
    await client!.exec(`UPDATE event_types SET slug = 'shared' WHERE id = 'team-b';
      INSERT INTO event_types (id, "userId", slug, title) VALUES ('personal', 'host', 'shared', 'Personal');`);
    await client!.exec(ddl);
    expect((await client!.query('SELECT uid, "eventTypeId" FROM bookings')).rows).toEqual([{ uid: "retained", eventTypeId: "group" }]);
    expect((await client!.query("SELECT count(*)::int AS count FROM event_types WHERE slug = 'shared'")).rows).toEqual([{ count: 3 }]);
    await expect(client!.exec(`INSERT INTO event_types (id, "userId", "teamId", slug, title) VALUES ('duplicate', 'other', 'a', 'shared', 'Duplicate');`))
      .rejects.toMatchObject({ code: "23505" });
    const indexes = (await client!.query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE tablename = 'event_types'")).rows.map(row => row.indexname);
    expect(indexes).toContain("event_types_current_personal_slug"); expect(indexes).toContain("event_types_current_team_slug");
    expect(indexes).not.toContain("event_types_current_user_slug");
  });
  it("refuses ambiguous legacy team links without rewriting URLs or deleting historical meetings", async () => {
    await setup(); await seat("retained", 0);
    await client!.exec(`DROP INDEX event_types_current_personal_slug; DROP INDEX event_types_current_team_slug;
      CREATE UNIQUE INDEX event_types_current_user_slug ON event_types ("userId", slug) WHERE "deletedAt" IS NULL;
      INSERT INTO users (id) VALUES ('other'); INSERT INTO teams (id, slug, name) VALUES ('team', 'team', 'Team');
      INSERT INTO event_types (id, "userId", "teamId", slug, title) VALUES ('a', 'host', 'team', 'ambiguous', 'A'), ('b', 'other', 'team', 'ambiguous', 'B');`);
    await expect(client!.exec(ddl)).rejects.toMatchObject({ code: "23505" });
    expect((await client!.query("SELECT id, slug FROM event_types WHERE \"teamId\" = 'team' ORDER BY id")).rows)
      .toEqual([{ id: "a", slug: "ambiguous" }, { id: "b", slug: "ambiguous" }]);
    expect((await client!.query('SELECT uid, "eventTypeId" FROM bookings')).rows).toEqual([{ uid: "retained", eventTypeId: "group" }]);
    // Simulate an explicitly reviewed correction by ID, then rerun the migration.
    await client!.exec("UPDATE event_types SET slug = 'reviewed-link' WHERE id = 'b'");
    await client!.exec(ddl); await client!.exec(ddl);
    expect((await client!.query("SELECT id, slug FROM event_types WHERE \"teamId\" = 'team' ORDER BY id")).rows)
      .toEqual([{ id: "a", slug: "ambiguous" }, { id: "b", slug: "reviewed-link" }]);
  });
  it("migrates deleted-type link reuse without losing bookings or weakening current-link uniqueness", async () => {
    await setup(); await seat("retained", 0);
    await client!.exec(`DROP INDEX event_types_current_personal_slug;
      DROP INDEX event_types_current_team_slug;
      ALTER TABLE event_types DROP COLUMN "deletedAt";
      ALTER TABLE event_types ADD CONSTRAINT "event_types_userId_slug_key" UNIQUE ("userId", slug);`);
    await client!.exec(ddl);
    expect((await client!.query('SELECT "deletedAt" FROM event_types')).rows).toEqual([{ deletedAt: null }]);
    await client!.exec(`UPDATE event_types SET "deletedAt" = now(), active = false WHERE id = 'group';
      INSERT INTO event_types (id, "userId", slug, title) VALUES ('replacement', 'host', 'group', 'New group');`);
    await client!.exec(ddl);
    expect((await client!.query('SELECT uid, "eventTypeId" FROM bookings')).rows).toEqual([{ uid: "retained", eventTypeId: "group" }]);
    expect((await client!.query('SELECT count(*)::int AS count FROM event_types')).rows).toEqual([{ count: 2 }]);
    await expect(client!.exec(`INSERT INTO event_types (id, "userId", slug, title) VALUES ('duplicate', 'host', 'group', 'Duplicate');`))
      .rejects.toMatchObject({ code: "23505" });
  });
  it("backfills legacy group limits above attendance and preserves them on later startup", async () => {
    await setup(); await seat("first", 0); await seat("second", 1); await seat("third", 2);
    await client!.exec('ALTER TABLE bookings DROP COLUMN "inviteeLimit"; UPDATE event_types SET seats = 2;');
    await client!.exec(ddl);
    expect((await client!.query('SELECT DISTINCT "inviteeLimit" FROM bookings')).rows).toEqual([{ inviteeLimit: 3 }]);
    await client!.exec('UPDATE event_types SET seats = 5;'); await client!.exec(ddl);
    expect((await client!.query('SELECT DISTINCT "inviteeLimit" FROM bookings')).rows).toEqual([{ inviteeLimit: 3 }]);
  });
  it("backfills legacy buffers once and preserves snapshots when startup is replayed", async () => {
    await setup(); await seat("legacy", 0);
    await client!.exec(`ALTER TABLE bookings DROP COLUMN "bufferBeforeMin", DROP COLUMN "bufferAfterMin";
      UPDATE event_types SET "bufferBeforeMin" = 30, "bufferAfterMin" = 45;`);
    await client!.exec(ddl);
    expect((await client!.query('SELECT "bufferBeforeMin", "bufferAfterMin" FROM bookings')).rows)
      .toEqual([{ bufferBeforeMin: 30, bufferAfterMin: 45 }]);
    await client!.exec('UPDATE event_types SET "bufferBeforeMin" = 0, "bufferAfterMin" = 0;');
    await client!.exec(ddl);
    expect((await client!.query('SELECT "bufferBeforeMin", "bufferAfterMin" FROM bookings')).rows)
      .toEqual([{ bufferBeforeMin: 30, bufferAfterMin: 45 }]);
  });
  it("can resume a partial buffer migration without replacing an existing zero snapshot", async () => {
    await setup(); await seat("partial", 0);
    await client!.exec(`ALTER TABLE bookings DROP COLUMN "bufferAfterMin";
      UPDATE event_types SET "bufferBeforeMin" = 30, "bufferAfterMin" = 45;`);
    await client!.exec(ddl);
    expect((await client!.query('SELECT "bufferBeforeMin", "bufferAfterMin" FROM bookings')).rows)
      .toEqual([{ bufferBeforeMin: 0, bufferAfterMin: 45 }]);
  });
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
