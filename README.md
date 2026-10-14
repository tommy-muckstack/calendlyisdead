# CalendlyIsDead
Free, open-source scheduling (Apache-2.0). Next.js + Neon Postgres + Drizzle + Auth.js, deployed on Vercel.

CalendlyIsDead is an independent open-source project, not affiliated with or endorsed by Calendly, LLC.
No Calendly assets, CSS or code; no cal.com (AGPL) code may be copied in. See docs/PLAN.md.

## Run it locally (no keys needed)
```
npm install
npm run dev        # http://localhost:3000, embedded Postgres (PGlite) in .data/, seeded demo host
```
- Demo booking page: http://localhost:3000/demo/30min
- Host dashboard: /login, then "Use the demo account" (dev only, or `DEMO_MODE=1`)
- Magic-link email and booking emails print to the server log (and `.data/outbox/`) unless `RESEND_API_KEY` is set.

Env (all optional in dev): `DATABASE_URL` (Postgres/Neon), `AUTH_SECRET` (also encrypts stored calendar tokens), `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, `AUTH_MICROSOFT_ID`/`AUTH_MICROSOFT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`.

## Calendar sync
- **Google**: same OAuth client as sign-in. Add redirect URI `{APP_URL}/api/integrations/google/callback`; scopes `calendar.readonly` + `calendar.events`. Free/busy via the freeBusy API; bookings written with `sendUpdates=none` (we send our own invite) and a Meet link when the location is Google Meet.
- **Outlook / Microsoft 365**: Entra app (multi-tenant + personal accounts), redirect `{APP_URL}/api/integrations/microsoft/callback`, delegated `Calendars.ReadWrite offline_access User.Read`.
- **iCloud**: CalDAV at caldav.icloud.com with the Apple ID and an app-specific password.
- **Demo calendar**: keyless mock (dev or `DEMO_MODE=1`), busy 12-1pm ET on weekdays.
- Each user can connect several accounts, choose which calendars are checked for conflicts, and one calendar new bookings are added to. If a provider fails, its busy times are skipped and the connection is flagged.

## Teams and automations
- Teams at `/team/<slug>`: collective (everyone must be free), round robin (spread evenly, or by priority then evenly), managed event types (copied into each member's account; locked fields follow the template). Invites go out by email and must be accepted by the invited address.
- Group event types: several invitees per time, up to the seat limit.
- Workflows: email or SMS before or after a meeting, on booking, or on cancellation, with `{{variables}}`. Due messages go out from `/api/cron/workflows` (Vercel Cron every 5 min via `vercel.json`; set `CRON_SECRET`). SMS uses Twilio when `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM` are set, otherwise it's logged.
- Routing forms at `/f/<id>`: questions plus first-match rules (is, is not, contains, is one of, ≥, ≤) that send people to an event type (prefilled), a URL, or a message.
- Demo mode has a second account (Sam, Chicago) so team features work with no keys.

## Tests
`npm test` (slot generation and time-zone/DST unit tests), `npm run e2e` (Playwright: book, reschedule, cancel, double-booking, editor auto-save).

## Status
M0-M5 done except meeting polls. Includes M1 calendar sync, M2 extras (multiple schedules, holidays, daily/weekly limits, invitee questions), M4 teams and M5 automations: auth (email magic link, Google), Drizzle schema, availability (weekly hours, date overrides, buffers, notice, date range, time zones), one-on-one event types with an auto-saving slide-in editor, booking page, confirmation, email + .ics, reschedule/cancel.
