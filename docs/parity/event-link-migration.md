# Event booking-link migration

This change belongs to `fix/event-link-namespaces`. No production database has
been inspected or migrated. Code publication is authorized by the October 16 QA prompt. The deployment preflight below remains required; no production migration is authorized by this publication step.

The old index reserves every creator/slug pair, even across unrelated personal
and team pages, but allows two creators on one team to publish the same team URL.
The replacement indexes reserve current personal user/slug and team/slug pairs
separately. Turned-off types still reserve their links; deleted types do not.

## Before deployment

Use the existing database administration connection to run this **read-only**
query before applying the migration or deploying code that applies DDL at startup.
The JSON lookup also works on the original schema before `deletedAt` was added.
Treat results as private account data; do not commit them.

```sql
SELECT e."teamId", e.slug, array_agg(e.id ORDER BY e.id) AS event_ids
FROM event_types e
WHERE e."teamId" IS NOT NULL
  AND (to_jsonb(e)->>'deletedAt') IS NULL
GROUP BY e."teamId", e.slug
HAVING count(*) > 1
ORDER BY e."teamId", e.slug;
```

An empty result means the legacy team rows satisfy the new unique index. If rows
are returned, a team owner must decide which event keeps the published URL and
choose distinct links for the others. Make the reviewed changes by event ID and
update any links shared externally. Do not delete events or bookings to resolve
the collision. The old lookup had no deterministic choice between duplicate
rows, so there is no reliable winner to select automatically.

The DDL deliberately refuses conflicting data with a unique-constraint error.
It does not silently rename, deactivate or merge events. Both new indexes are
created before the old owner-wide constraint/index is dropped. If a migration
runner commits statements individually, a failed attempt may leave the new
personal index alongside the old index; neither records nor their URLs are
rewritten. Correct the reviewed conflicts, rerun the preflight, then rerun the
idempotent migration before deployment. Do not deploy with unresolved conflicts:
the app also applies this DDL on cold start, which would fail in that state.

Existing links are retained byte-for-byte. New generated links use at most 60
lowercase ASCII letters/digits/hyphens, including collision suffixes. Legacy links
outside that editor format are not rewritten by this migration.

## Local evidence and limits

PGlite regression tests cover the old owner-wide index, migration/replay, personal
and multiple-team reuse, duplicate rejection across team creators, retained
meetings, and a rejected migration followed by an explicitly reviewed correction.
API tests cover concurrent create/rename requests and independent namespaces.
PGlite serializes transactions; this is not a multi-connection PostgreSQL load test.
Browser screenshots and real deployment verification remain pending.
