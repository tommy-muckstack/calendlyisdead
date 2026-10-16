CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, name text, email text UNIQUE, "emailVerified" timestamp, image text, username text UNIQUE, timezone text NOT NULL DEFAULT 'America/New_York');
ALTER TABLE users ADD COLUMN IF NOT EXISTS "welcomeMessage" text NOT NULL DEFAULT 'Pick a meeting type to see open times.';
CREATE TABLE IF NOT EXISTS accounts ("userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE, type text NOT NULL, provider text NOT NULL, "providerAccountId" text NOT NULL, refresh_token text, access_token text, expires_at integer, token_type text, scope text, id_token text, session_state text, PRIMARY KEY (provider, "providerAccountId"));
CREATE TABLE IF NOT EXISTS sessions ("sessionToken" text PRIMARY KEY, "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires timestamp NOT NULL);
CREATE TABLE IF NOT EXISTS "verificationTokens" (identifier text NOT NULL, token text NOT NULL, expires timestamp NOT NULL, PRIMARY KEY (identifier, token));
CREATE TABLE IF NOT EXISTS schedules (id text PRIMARY KEY, "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE, name text NOT NULL DEFAULT 'Working hours', timezone text NOT NULL, weekly jsonb NOT NULL, overrides jsonb NOT NULL DEFAULT '{}', "isDefault" boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS event_types (id text PRIMARY KEY, "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE, "scheduleId" text REFERENCES schedules(id), slug text NOT NULL, title text NOT NULL, description text NOT NULL DEFAULT '', "durationMin" integer NOT NULL DEFAULT 30, location text NOT NULL DEFAULT '', color text NOT NULL DEFAULT '#0E7C66', "bufferBeforeMin" integer NOT NULL DEFAULT 0, "bufferAfterMin" integer NOT NULL DEFAULT 0, "minNoticeMin" integer NOT NULL DEFAULT 240, "rangeDays" integer NOT NULL DEFAULT 60, active boolean NOT NULL DEFAULT true, kind text NOT NULL DEFAULT 'one_on_one', UNIQUE ("userId", slug));
CREATE TABLE IF NOT EXISTS bookings (uid text PRIMARY KEY, "eventTypeId" text NOT NULL REFERENCES event_types(id) ON DELETE CASCADE, "hostId" text NOT NULL REFERENCES users(id), start timestamptz NOT NULL, "end" timestamptz NOT NULL, "inviteeName" text NOT NULL, "inviteeEmail" text NOT NULL, "inviteeTz" text NOT NULL, notes text NOT NULL DEFAULT '', guests jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'confirmed', "cancelReason" text, "rescheduledFrom" text, "createdAt" timestamptz NOT NULL DEFAULT now());
-- Seat-aware uniqueness is installed below after the seat column exists. Do not
-- recreate the legacy host/start index: persisted group attendees share a start.
ALTER TABLE users ADD COLUMN IF NOT EXISTS "addToCalendarId" text;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "holidayCountry" text;
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS questions jsonb NOT NULL DEFAULT '[]';
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS "maxPerDay" integer;
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS "maxPerWeek" integer;
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS "maxPerMonth" integer;
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS secret boolean NOT NULL DEFAULT false;
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS "lockedTimezone" text;
-- Null keeps the existing rolling rangeDays value; explicit ranges are atomic.
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS "dateRange" jsonb;
-- Preserve the old duration-based spacing once, then keep spacing independent.
-- New templates use 30 minutes even when their duration differs.
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS "startIntervalMin" integer;
UPDATE event_types SET "startIntervalMin" = "durationMin" WHERE "startIntervalMin" IS NULL;
ALTER TABLE event_types ALTER COLUMN "startIntervalMin" SET DEFAULT 30;
ALTER TABLE event_types ALTER COLUMN "startIntervalMin" SET NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "meetingLimitPerDay" integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "meetingLimitPerWeek" integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "meetingLimitPerMonth" integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '{}';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "externalCalendarId" text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "externalEventId" text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "meetingUrl" text;
CREATE TABLE IF NOT EXISTS calendar_connections (id text PRIMARY KEY, "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider text NOT NULL, "accountEmail" text NOT NULL DEFAULT '', secret text NOT NULL, status text NOT NULL DEFAULT 'ok', "createdAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS user_calendars (id text PRIMARY KEY, "connectionId" text NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE, "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE, "externalId" text NOT NULL, name text NOT NULL, "isPrimary" boolean NOT NULL DEFAULT false, "canWrite" boolean NOT NULL DEFAULT true, "checkConflicts" boolean NOT NULL DEFAULT false, UNIQUE ("connectionId", "externalId"));
-- M4
CREATE TABLE IF NOT EXISTS teams (id text PRIMARY KEY, slug text UNIQUE NOT NULL, name text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS team_members ("teamId" text NOT NULL REFERENCES teams(id) ON DELETE CASCADE, "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE, role text NOT NULL DEFAULT 'member', PRIMARY KEY ("teamId", "userId"));
CREATE TABLE IF NOT EXISTS team_invites (token text PRIMARY KEY, "teamId" text NOT NULL REFERENCES teams(id) ON DELETE CASCADE, email text NOT NULL, role text NOT NULL DEFAULT 'member', "invitedBy" text NOT NULL, expires timestamptz NOT NULL, "acceptedAt" timestamptz);
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS "teamId" text REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS seats integer NOT NULL DEFAULT 1;
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS "rrMode" text NOT NULL DEFAULT 'even';
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS "managedParentId" text;
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS "lockedFields" jsonb NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS event_type_hosts ("eventTypeId" text NOT NULL REFERENCES event_types(id) ON DELETE CASCADE, "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE, priority integer NOT NULL DEFAULT 2, PRIMARY KEY ("eventTypeId", "userId"));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS seat integer NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "groupUid" text;
DROP INDEX IF EXISTS bookings_no_double;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_no_double2 ON bookings ("hostId", start, seat) WHERE status = 'confirmed';
-- M5
CREATE TABLE IF NOT EXISTS workflows (id text PRIMARY KEY, "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE, name text NOT NULL, trigger text NOT NULL, "offsetMin" integer NOT NULL DEFAULT 0, channel text NOT NULL DEFAULT 'email', recipient text NOT NULL DEFAULT 'invitee', subject text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '', "eventTypeIds" jsonb NOT NULL DEFAULT '[]', active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS scheduled_messages (id text PRIMARY KEY, "workflowId" text NOT NULL REFERENCES workflows(id) ON DELETE CASCADE, "bookingUid" text NOT NULL REFERENCES bookings(uid) ON DELETE CASCADE, "sendAt" timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending', error text, "sentAt" timestamptz, UNIQUE ("workflowId", "bookingUid"));
CREATE TABLE IF NOT EXISTS routing_forms (id text PRIMARY KEY, "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE, name text NOT NULL, fields jsonb NOT NULL DEFAULT '[]', rules jsonb NOT NULL DEFAULT '[]', fallback jsonb NOT NULL DEFAULT '{"type":"message","value":"Thanks! We will be in touch."}');
CREATE TABLE IF NOT EXISTS form_responses (id text PRIMARY KEY, "formId" text NOT NULL REFERENCES routing_forms(id) ON DELETE CASCADE, answers jsonb NOT NULL, "routedTo" jsonb NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now());
-- M6-M9
ALTER TABLE users ADD COLUMN IF NOT EXISTS "brandColor" text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "logoUrl" text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "hideBranding" boolean NOT NULL DEFAULT false;
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS "priceCents" integer NOT NULL DEFAULT 0;
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'usd';
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS "redirectUrl" text;
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS "usedAt" timestamptz;
-- Retain event definitions for booked meetings when a type is deleted. A new
-- type may reuse its public link; historical bookings still reference the old ID.
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz;
-- Booking URLs are scoped to a personal page OR a team page, not the creator.
-- Both constraints must be installed before removing the legacy owner-wide one.
-- Existing ambiguous team links intentionally fail this migration: review them
-- with docs/parity/event-link-migration.md; never silently change published URLs.
CREATE UNIQUE INDEX IF NOT EXISTS event_types_current_personal_slug ON event_types ("userId", slug) WHERE "deletedAt" IS NULL AND "teamId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS event_types_current_team_slug ON event_types ("teamId", slug) WHERE "deletedAt" IS NULL AND "teamId" IS NOT NULL;
ALTER TABLE event_types DROP CONSTRAINT IF EXISTS "event_types_userId_slug_key";
DROP INDEX IF EXISTS event_types_current_user_slug;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "paymentStatus" text NOT NULL DEFAULT 'none';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "paymentRef" text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "amountCents" integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS page_views ("eventTypeId" text NOT NULL REFERENCES event_types(id) ON DELETE CASCADE, day text NOT NULL, count integer NOT NULL DEFAULT 0, PRIMARY KEY ("eventTypeId", day));
CREATE TABLE IF NOT EXISTS polls (id text PRIMARY KEY, "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE, title text NOT NULL, "durationMin" integer NOT NULL DEFAULT 30, location text NOT NULL DEFAULT '', options jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'open', chosen text, "bookingUid" text, "createdAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS poll_votes (id text PRIMARY KEY, "pollId" text NOT NULL REFERENCES polls(id) ON DELETE CASCADE, name text NOT NULL, email text NOT NULL, picks jsonb NOT NULL DEFAULT '[]', "createdAt" timestamptz NOT NULL DEFAULT now());
ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid text;
CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_key ON users (firebase_uid);
-- Old bookings did not record buffers. Freeze their current event settings once;
-- historical values from before this migration cannot be reconstructed.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "bufferBeforeMin" integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "bufferAfterMin" integer;
UPDATE bookings b SET "bufferBeforeMin" = COALESCE(b."bufferBeforeMin", e."bufferBeforeMin"), "bufferAfterMin" = COALESCE(b."bufferAfterMin", e."bufferAfterMin") FROM event_types e WHERE b."eventTypeId" = e.id AND (b."bufferBeforeMin" IS NULL OR b."bufferAfterMin" IS NULL);
ALTER TABLE bookings ALTER COLUMN "bufferBeforeMin" SET DEFAULT 0;
ALTER TABLE bookings ALTER COLUMN "bufferAfterMin" SET DEFAULT 0;
ALTER TABLE bookings ALTER COLUMN "bufferBeforeMin" SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN "bufferAfterMin" SET NOT NULL;
-- Original group limits were not stored. Preserve current defaults, at least
-- the number already attending, and never overwrite a saved session limit.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "inviteeLimit" integer;
UPDATE bookings b SET "inviteeLimit" = CASE WHEN e.kind = 'group' THEN GREATEST(e.seats, (SELECT count(*)::int FROM bookings s WHERE s."hostId" = b."hostId" AND s."eventTypeId" = b."eventTypeId" AND s.start = b.start AND s.status = 'confirmed'), 1) ELSE 1 END FROM event_types e WHERE b."eventTypeId" = e.id AND b."inviteeLimit" IS NULL;
ALTER TABLE bookings ALTER COLUMN "inviteeLimit" SET DEFAULT 1;
ALTER TABLE bookings ALTER COLUMN "inviteeLimit" SET NOT NULL;

CREATE TABLE IF NOT EXISTS contacts (
  id text PRIMARY KEY, "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL, email text NOT NULL, phone text NOT NULL DEFAULT '', "jobTitle" text NOT NULL DEFAULT '', company text NOT NULL DEFAULT '', "linkedIn" text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT '', country text NOT NULL DEFAULT '', city text NOT NULL DEFAULT '', state text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_active_owner_email ON contacts ("userId", lower(email)) WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS contacts_owner_email_history ON contacts ("userId", lower(email));
CREATE INDEX IF NOT EXISTS bookings_contact_lookup ON bookings ("hostId", lower(btrim("inviteeEmail")));
CREATE TABLE IF NOT EXISTS contact_meetings (
  "contactId" text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  "bookingUid" text NOT NULL REFERENCES bookings(uid) ON DELETE CASCADE,
  PRIMARY KEY ("contactId", "bookingUid")
);
CREATE TABLE IF NOT EXISTS contact_settings (
  "userId" text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  "bookingEnabled" boolean NOT NULL DEFAULT true, exclusions jsonb NOT NULL DEFAULT '[]',
  version integer NOT NULL DEFAULT 1, "backfilledAt" timestamptz
);
ALTER TABLE contact_meetings ADD COLUMN IF NOT EXISTS "inviteeEmail" text;
CREATE TABLE IF NOT EXISTS contact_fields (
  id text PRIMARY KEY, "userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL, type text NOT NULL, options jsonb NOT NULL DEFAULT '[]', currency text NOT NULL DEFAULT '',
  "eventTypeId" text, "questionId" text, version integer NOT NULL DEFAULT 1, "deletedAt" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_fields_owner_name ON contact_fields ("userId", lower(name)) WHERE "deletedAt" IS NULL;
CREATE TABLE IF NOT EXISTS contact_field_values (
  "contactId" text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  "fieldId" text NOT NULL REFERENCES contact_fields(id) ON DELETE CASCADE,
  value jsonb NOT NULL, PRIMARY KEY ("contactId", "fieldId")
);
