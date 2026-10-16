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
  it("adds opportunity storage and retains records, stage history and deletion receipts across startup", async () => {
    await setup(); await client!.exec('DROP TABLE opportunity_moves; DROP TABLE opportunities; DROP TABLE opportunity_deletions;'); await client!.exec(ddl);
    await client!.exec(`INSERT INTO contacts (id, "userId", name, email) VALUES ('client', 'host', 'Client', 'qa@example.invalid');
      INSERT INTO opportunities (id, "userId", "contactId", name, stage, amount, notes, version) VALUES ('deal', 'host', 'client', 'Consulting', 'completed', '123456789012345.123456', 'Saved notes', 3);
      INSERT INTO opportunity_moves (id, "opportunityId", "from", "to") VALUES ('move', 'deal', 'proposal_sent', 'completed');
      INSERT INTO opportunity_deletions (id, "userId", version) VALUES ('deleted', 'host', 4);`);
    await client!.exec(ddl); expect((await client!.query('SELECT name, stage, amount, notes, version FROM opportunities')).rows).toEqual([{ name: "Consulting", stage: "completed", amount: "123456789012345.123456", notes: "Saved notes", version: 3 }]); expect((await client!.query('SELECT "from", "to" FROM opportunity_moves')).rows).toEqual([{ from: "proposal_sent", to: "completed" }]); expect((await client!.query('SELECT id, version FROM opportunity_deletions')).rows).toEqual([{ id: "deleted", version: 4 }]);
    await client!.exec(`DELETE FROM opportunities WHERE id = 'deal';`); expect((await client!.query('SELECT * FROM opportunity_moves')).rows).toEqual([]); expect((await client!.query('SELECT id FROM contacts')).rows).toEqual([{ id: "client" }]);
  });
  it("adopts a single legacy question mapping without populating or changing contact values", async () => {
    await setup(); await client!.exec(`DROP TABLE contact_question_automations;
      INSERT INTO contacts (id, "userId", name, email) VALUES ('person', 'host', 'Legacy', 'legacy@example.invalid');
      INSERT INTO contact_fields (id, "userId", name, type, "eventTypeId", "questionId") VALUES ('field', 'host', 'Answers', 'invitee_question', 'group', 'purpose');
      INSERT INTO contact_field_values ("contactId", "fieldId", value) VALUES ('person', 'field', '{"data":"Retained"}');`);
    await client!.exec(ddl); expect((await client!.query('SELECT "fieldId", "questionId", enabled, "legacyConflict", version FROM contact_question_automations')).rows).toEqual([{ fieldId: "field", questionId: "purpose", enabled: true, legacyConflict: false, version: 1 }]);
    expect((await client!.query('SELECT value FROM contact_field_values')).rows).toEqual([{ value: { data: "Retained" } }]);
    await client!.exec(`UPDATE contact_question_automations SET enabled = false, version = 2;`); await client!.exec(ddl); expect((await client!.query('SELECT enabled, version FROM contact_question_automations')).rows).toEqual([{ enabled: false, version: 2 }]);
    await client!.exec(`UPDATE contact_question_automations SET "deletedAt" = now(), version = 3;`); await client!.exec(ddl); expect((await client!.query('SELECT enabled, version, "deletedAt" IS NOT NULL AS deleted FROM contact_question_automations')).rows).toEqual([{ enabled: false, version: 3, deleted: true }]);
  });
  it("pauses ambiguous legacy question mappings and retains every field", async () => {
    await setup(); await client!.exec(`INSERT INTO contact_fields (id, "userId", name, type, "eventTypeId", "questionId") VALUES ('one', 'host', 'One', 'invitee_question', 'group', 'one'), ('two', 'host', 'Two', 'invitee_question', 'group', 'two');`);
    await client!.exec(ddl); expect((await client!.query('SELECT "fieldId", "questionId", enabled, "legacyConflict" FROM contact_question_automations')).rows).toEqual([{ fieldId: null, questionId: null, enabled: false, legacyConflict: true }]); expect((await client!.query('SELECT id FROM contact_fields ORDER BY id')).rows).toEqual([{ id: "one" }, { id: "two" }]);
    await client!.exec(`UPDATE contact_question_automations SET "fieldId" = 'one', "questionId" = 'one', "legacyConflict" = false, enabled = true, version = 2;`); await client!.exec(ddl); expect((await client!.query('SELECT "fieldId", enabled, version FROM contact_question_automations')).rows).toEqual([{ fieldId: "one", enabled: true, version: 2 }]);
  });
  it("does not adopt foreign, removed or poll sources", async () => {
    await setup(); await client!.exec(`INSERT INTO users (id) VALUES ('foreign'); INSERT INTO event_types (id, "userId", slug, title, kind) VALUES ('poll', 'host', 'poll', 'Poll', 'poll');
      INSERT INTO contact_fields (id, "userId", name, type, "eventTypeId", "questionId") VALUES ('foreign', 'foreign', 'Foreign', 'invitee_question', 'group', 'purpose'), ('missing', 'host', 'Missing', 'invitee_question', 'gone', 'purpose'), ('poll', 'host', 'Poll', 'invitee_question', 'poll', 'purpose');`);
    await client!.exec(ddl); expect((await client!.query('SELECT * FROM contact_question_automations')).rows).toEqual([]); expect((await client!.query('SELECT id FROM contact_fields')).rows).toHaveLength(3);
  });
  it("adds field automation settings without rewriting prior booking receipts", async () => {
    await setup(); await seat("meeting", 0); await client!.exec('DROP TABLE contact_field_automations;'); await client!.exec(ddl);
    expect((await client!.query('SELECT * FROM contact_field_automations')).rows).toEqual([]);
    await client!.exec(`INSERT INTO contact_field_automations ("userId", "eventTypeId", actions, enabled, version, "deletedAt") VALUES ('host', 'group', '[]', false, 3, now());
      INSERT INTO contact_list_automation_runs ("userId", "bookingUid", "inviteeEmail") VALUES ('host', 'meeting', 'test@example.invalid');`); await client!.exec(ddl);
    expect((await client!.query('SELECT enabled, version, "deletedAt" IS NOT NULL AS deleted FROM contact_field_automations')).rows).toEqual([{ enabled: false, version: 3, deleted: true }]);
    expect((await client!.query('SELECT "bookingUid" FROM contact_list_automation_runs')).rows).toEqual([{ bookingUid: "meeting" }]);
  });
  it("adds contact automation state and preserves pauses, tombstones and booking receipts on replay", async () => {
    await setup(); await seat("meeting", 0); await client!.exec('DROP TABLE contact_list_automation_runs; DROP TABLE contact_list_automations;'); await client!.exec(ddl);
    expect((await client!.query('SELECT * FROM contact_list_automations')).rows).toEqual([]);
    await client!.exec(`INSERT INTO contact_list_automations ("userId", "eventTypeId", "listIds", enabled, version, "deletedAt") VALUES ('host', 'group', '[]', false, 3, now());
      INSERT INTO contact_list_automation_runs ("userId", "bookingUid", "inviteeEmail") VALUES ('host', 'meeting', 'test@example.invalid');`); await client!.exec(ddl);
    expect((await client!.query('SELECT enabled, version, "deletedAt" IS NOT NULL AS deleted FROM contact_list_automations')).rows).toEqual([{ enabled: false, version: 3, deleted: true }]);
    expect((await client!.query('SELECT "bookingUid", "inviteeEmail" FROM contact_list_automation_runs')).rows).toEqual([{ bookingUid: "meeting", inviteeEmail: "test@example.invalid" }]);
  });
  it("adds contact collections and provenance without rewriting legacy contacts or saved membership", async () => {
    await setup(); await client!.exec('DROP TABLE contact_list_members; DROP TABLE contact_collections; DROP TABLE contact_membership_receipts; ALTER TABLE contacts DROP COLUMN source;');
    await client!.exec(`INSERT INTO contacts (id, "userId", name, email) VALUES ('person', 'host', 'Legacy', 'legacy@example.invalid');`); await client!.exec(ddl);
    expect((await client!.query('SELECT source FROM contacts')).rows).toEqual([{ source: "" }]);
    await client!.exec(`INSERT INTO contact_collections (id, "userId", name, kind, rules, version) VALUES ('list', 'host', 'Saved list', 'list', '{"match":"all","conditions":[]}', 4);
      INSERT INTO contact_list_members ("collectionId", "contactId") VALUES ('list', 'person');
      INSERT INTO contact_membership_receipts ("userId", id, "requestHash", result) VALUES ('host', 'request', 'hash', '{"changedCount":1}');
      UPDATE contacts SET source = 'manual';`); await client!.exec(ddl);
    expect((await client!.query('SELECT source FROM contacts')).rows).toEqual([{ source: "manual" }]);
    expect((await client!.query('SELECT name, version FROM contact_collections')).rows).toEqual([{ name: "Saved list", version: 4 }]);
    expect((await client!.query('SELECT "contactId" FROM contact_list_members')).rows).toEqual([{ contactId: "person" }]);
    expect((await client!.query('SELECT result FROM contact_membership_receipts')).rows).toEqual([{ result: { changedCount: 1 } }]);
  });
  it("adds notes and reminder claims without resetting saved edits or delivery state", async () => {
    await setup(); await client!.exec('DROP TABLE contact_notes; DROP TABLE contact_reminder_digests;'); await client!.exec(ddl);
    await client!.exec(`INSERT INTO contacts (id, "userId", name, email) VALUES ('person', 'host', 'QA', 'qa@example.invalid');
      INSERT INTO contact_notes (id, "userId", "contactId", body, "reminderDate", version) VALUES ('note', 'host', 'person', 'Saved note', '2027-03-14', 2);
      INSERT INTO contact_reminder_digests (id, "userId", day, timezone, "to", subject, body, status, "createdAt", "attemptedAt") VALUES ('digest', 'host', '2027-03-14', 'UTC', 'host@example.invalid', 'Summary', 'Saved', 'sent', now(), now());`);
    await client!.exec(ddl); expect((await client!.query('SELECT body, "reminderDate", version FROM contact_notes')).rows).toEqual([{ body: "Saved note", reminderDate: "2027-03-14", version: 2 }]);
    expect((await client!.query('SELECT status FROM contact_reminder_digests')).rows).toEqual([{ status: "sent" }]);
  });
  it("adds transfer storage and preserves receipts and export snapshots across replay", async () => {
    await setup(); await client!.exec('DROP TABLE contact_imports; DROP TABLE contact_exports;'); await client!.exec(ddl);
    await client!.exec(`INSERT INTO contact_imports ("userId", id, "requestHash", result) VALUES ('host', 'import', 'hash', '{"rows":[]}');
      INSERT INTO contact_exports ("userId", id, "requestHash", csv, count, email, "expiresAt") VALUES ('host', 'export', 'hash', 'Name,Email', 1, 'unavailable', '2026-11-01T00:00:00Z');`);
    await client!.exec(ddl); expect((await client!.query('SELECT result FROM contact_imports')).rows).toEqual([{ result: { rows: [] } }]);
    expect((await client!.query('SELECT csv, count, email FROM contact_exports')).rows).toEqual([{ csv: "Name,Email", count: 1, email: "unavailable" }]);
  });
  it("adds custom fields and preserves typed values, versions and deleted definitions across replay", async () => {
    await setup(); await seat("meeting", 0);
    await client!.exec('DROP TABLE contact_question_automations; DROP TABLE contact_field_values; DROP TABLE contact_fields;'); await client!.exec(ddl);
    await client!.exec(`INSERT INTO contacts (id, "userId", name, email) VALUES ('contact', 'host', 'QA', 'qa@example.invalid');
      INSERT INTO contact_fields (id, "userId", name, type, version) VALUES ('number', 'host', 'Amount', 'number', 2), ('deleted', 'host', 'Old', 'text', 3);
      UPDATE contact_fields SET "deletedAt" = now() WHERE id = 'deleted';
      INSERT INTO contact_field_values ("contactId", "fieldId", value) VALUES ('contact', 'number', '{"data":"123456789012345.123456"}');`);
    await client!.exec(ddl);
    expect((await client!.query('SELECT value FROM contact_field_values')).rows).toEqual([{ value: { data: "123456789012345.123456" } }]);
    expect((await client!.query('SELECT id, version, "deletedAt" IS NOT NULL AS deleted FROM contact_fields ORDER BY id')).rows).toEqual([{ id: "deleted", version: 3, deleted: true }, { id: "number", version: 2, deleted: false }]);
    expect((await client!.query('SELECT uid FROM bookings')).rows).toEqual([{ uid: "meeting" }]);
  });
  it("adds contact preferences without modifying records and retains opt-out, exclusions and backfill progress on replay", async () => {
    await setup(); await seat("retained", 0);
    await client!.exec('DROP TABLE contact_settings;'); await client!.exec(ddl);
    await client!.exec(`INSERT INTO contact_settings ("userId") VALUES ('host');`);
    expect((await client!.query('SELECT "bookingEnabled", exclusions, version, "backfilledAt" FROM contact_settings')).rows).toEqual([{ bookingEnabled: true, exclusions: [], version: 1, backfilledAt: null }]);
    await client!.exec(`UPDATE contact_settings SET "bookingEnabled" = false, exclusions = '["company.invalid"]', version = 3, "backfilledAt" = now();`); await client!.exec(ddl);
    expect((await client!.query('SELECT "bookingEnabled", exclusions, version, "backfilledAt" IS NOT NULL AS imported FROM contact_settings')).rows).toEqual([{ bookingEnabled: false, exclusions: ["company.invalid"], version: 3, imported: true }]);
    expect((await client!.query('SELECT uid FROM bookings')).rows).toEqual([{ uid: "retained" }]);
  });
  it("adds per-attendee history addresses without losing old links and preserves captured addresses on replay", async () => {
    await setup(); await seat("meeting", 0);
    await client!.exec(`INSERT INTO contacts (id, "userId", name, email) VALUES ('contact', 'host', 'Second attendee', 'second@example.invalid');
      INSERT INTO contact_meetings ("contactId", "bookingUid") VALUES ('contact', 'meeting'); ALTER TABLE contact_meetings DROP COLUMN "inviteeEmail";`);
    await client!.exec(ddl);
    expect((await client!.query('SELECT "contactId", "bookingUid", "inviteeEmail" FROM contact_meetings')).rows).toEqual([{ contactId: "contact", bookingUid: "meeting", inviteeEmail: null }]);
    await client!.exec(`UPDATE contact_meetings SET "inviteeEmail" = 'second@example.invalid';`); await client!.exec(ddl);
    expect((await client!.query('SELECT "inviteeEmail" FROM contact_meetings')).rows).toEqual([{ inviteeEmail: "second@example.invalid" }]);
  });
  it("adds contact records and history without changing meetings, and preserves deleted contacts on replay", async () => {
    await setup(); await seat("retained", 0);
    await client!.exec('DROP TABLE contact_list_members; DROP TABLE contact_notes; DROP TABLE contact_field_values; DROP TABLE contact_meetings; DROP TABLE opportunity_moves; DROP TABLE opportunities; DROP TABLE contacts;'); await client!.exec(ddl);
    await client!.exec(`INSERT INTO contacts (id, "userId", name, email) VALUES ('contact', 'host', 'QA', 'qa@example.invalid');
      INSERT INTO contact_meetings ("contactId", "bookingUid") VALUES ('contact', 'retained');
      UPDATE contacts SET "deletedAt" = now(), version = 2;`); await client!.exec(ddl);
    expect((await client!.query('SELECT name, version, "deletedAt" IS NOT NULL AS deleted FROM contacts')).rows).toEqual([{ name: "QA", version: 2, deleted: true }]);
    expect((await client!.query('SELECT uid FROM bookings')).rows).toEqual([{ uid: "retained" }]);
    expect((await client!.query('SELECT "contactId", "bookingUid" FROM contact_meetings')).rows).toEqual([{ contactId: "contact", bookingUid: "retained" }]);
  });
  it("retains legacy day counts and explicit ranges across migration and replay", async () => {
    await setup(); await seat("retained", 0);
    await client!.exec('ALTER TABLE event_types DROP COLUMN "dateRange"; UPDATE event_types SET "rangeDays" = 17;'); await client!.exec(ddl);
    expect((await client!.query('SELECT "dateRange", "rangeDays" FROM event_types')).rows).toEqual([{ dateRange: null, rangeDays: 17 }]);
    await client!.exec(`UPDATE event_types SET "dateRange" = '{"kind":"indefinite"}';
      INSERT INTO event_types (id, "userId", slug, title) VALUES ('new', 'host', 'new', 'New');`); await client!.exec(ddl);
    expect((await client!.query('SELECT id, "dateRange", "rangeDays" FROM event_types ORDER BY id')).rows)
      .toEqual([{ id: "group", dateRange: { kind: "indefinite" }, rangeDays: 17 }, { id: "new", dateRange: null, rangeDays: 60 }]);
    expect((await client!.query('SELECT uid FROM bookings')).rows).toEqual([{ uid: "retained" }]);
  });
  it("defaults to automatic booking timezones and preserves locks and historical meetings on replay", async () => {
    await setup(); await seat("retained", 0);
    await client!.exec('ALTER TABLE event_types DROP COLUMN "lockedTimezone";'); await client!.exec(ddl);
    expect((await client!.query('SELECT "lockedTimezone" FROM event_types')).rows).toEqual([{ lockedTimezone: null }]);
    await client!.exec(`UPDATE event_types SET "lockedTimezone" = 'Asia/Tokyo';
      INSERT INTO event_types (id, "userId", slug, title) VALUES ('new', 'host', 'new', 'New');`); await client!.exec(ddl);
    expect((await client!.query('SELECT id, "lockedTimezone" FROM event_types ORDER BY id')).rows)
      .toEqual([{ id: "group", lockedTimezone: "Asia/Tokyo" }, { id: "new", lockedTimezone: null }]);
    expect((await client!.query('SELECT uid, "inviteeTz", start FROM bookings')).rows).toEqual([{ uid: "retained", inviteeTz: "UTC", start: new Date("2026-11-02T15:00:00Z") }]);
  });
  it("defaults existing and new events to public and preserves visibility, on/off status and meetings on replay", async () => {
    await setup(); await seat("retained", 0);
    await client!.exec('ALTER TABLE event_types DROP COLUMN secret;'); await client!.exec(ddl);
    expect((await client!.query('SELECT secret, active FROM event_types')).rows).toEqual([{ secret: false, active: true }]);
    await client!.exec(`UPDATE event_types SET secret = true, active = false;
      INSERT INTO event_types (id, "userId", slug, title) VALUES ('new', 'host', 'new', 'New');`); await client!.exec(ddl);
    expect((await client!.query('SELECT id, secret, active FROM event_types ORDER BY id')).rows)
      .toEqual([{ id: "group", secret: true, active: false }, { id: "new", secret: false, active: true }]);
    expect((await client!.query('SELECT uid FROM bookings')).rows).toEqual([{ uid: "retained" }]);
  });
  it("preserves old duration-based spacing once, defaults new events to 30 and leaves edits alone on replay", async () => {
    await setup(); await seat("retained", 0);
    await client!.exec('ALTER TABLE event_types DROP COLUMN "startIntervalMin"; UPDATE event_types SET "durationMin" = 45;'); await client!.exec(ddl);
    expect((await client!.query('SELECT "startIntervalMin" FROM event_types')).rows).toEqual([{ startIntervalMin: 45 }]);
    await client!.exec(`UPDATE event_types SET "startIntervalMin" = 7, "durationMin" = 60;
      INSERT INTO event_types (id, "userId", slug, title, "durationMin") VALUES ('new', 'host', 'new', 'New', 90);`); await client!.exec(ddl);
    expect((await client!.query('SELECT id, "startIntervalMin", "durationMin" FROM event_types ORDER BY id')).rows)
      .toEqual([{ id: "group", startIntervalMin: 7, durationMin: 60 }, { id: "new", startIntervalMin: 30, durationMin: 90 }]);
    expect((await client!.query('SELECT uid FROM bookings')).rows).toEqual([{ uid: "retained" }]);
  });
  it("adds editable welcome text with the existing page copy and preserves profile fields on replay", async () => {
    await setup(); await seat("retained", 0);
    await client!.exec('ALTER TABLE users DROP COLUMN "welcomeMessage";'); await client!.exec(ddl);
    expect((await client!.query('SELECT "welcomeMessage" FROM users')).rows).toEqual([{ welcomeMessage: "Pick a meeting type to see open times." }]);
    await client!.exec(`UPDATE users SET "welcomeMessage" = '', name = 'Saved name', timezone = 'UTC', image = 'https://example.invalid/preserved.png';`); await client!.exec(ddl);
    expect((await client!.query('SELECT "welcomeMessage", name, timezone, image FROM users')).rows)
      .toEqual([{ welcomeMessage: "", name: "Saved name", timezone: "UTC", image: "https://example.invalid/preserved.png" }]);
    expect((await client!.query('SELECT uid FROM bookings')).rows).toEqual([{ uid: "retained" }]);
  });
  it("adds disabled-by-default account limits and preserves configured values and meetings on replay", async () => {
    await setup(); await seat("retained", 0);
    await client!.exec('ALTER TABLE users DROP COLUMN "meetingLimitPerDay", DROP COLUMN "meetingLimitPerWeek", DROP COLUMN "meetingLimitPerMonth";');
    await client!.exec(ddl);
    expect((await client!.query('SELECT "meetingLimitPerDay", "meetingLimitPerWeek", "meetingLimitPerMonth" FROM users')).rows)
      .toEqual([{ meetingLimitPerDay: null, meetingLimitPerWeek: null, meetingLimitPerMonth: null }]);
    await client!.exec('UPDATE users SET "meetingLimitPerDay" = 2, "meetingLimitPerWeek" = 8, "meetingLimitPerMonth" = 20;'); await client!.exec(ddl);
    expect((await client!.query('SELECT "meetingLimitPerDay", "meetingLimitPerWeek", "meetingLimitPerMonth" FROM users')).rows)
      .toEqual([{ meetingLimitPerDay: 2, meetingLimitPerWeek: 8, meetingLimitPerMonth: 20 }]);
    expect((await client!.query('SELECT uid FROM bookings')).rows).toEqual([{ uid: "retained" }]);
  });
  it("adds nullable monthly limits without rewriting meetings and preserves configured limits on replay", async () => {
    await setup(); await seat("retained", 0);
    await client!.exec('ALTER TABLE event_types DROP COLUMN "maxPerMonth";');
    await client!.exec(ddl);
    expect((await client!.query('SELECT "maxPerMonth" FROM event_types')).rows).toEqual([{ maxPerMonth: null }]);
    await client!.exec('UPDATE event_types SET "maxPerMonth" = 12;'); await client!.exec(ddl);
    expect((await client!.query('SELECT "maxPerMonth" FROM event_types')).rows).toEqual([{ maxPerMonth: 12 }]);
    expect((await client!.query('SELECT uid, "eventTypeId" FROM bookings')).rows).toEqual([{ uid: "retained", eventTypeId: "group" }]);
  });
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
