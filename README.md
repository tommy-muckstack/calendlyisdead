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

Env (all optional in dev): `DATABASE_URL` (Postgres/Neon), `AUTH_SECRET`, `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`.

## Tests
`npm test` (slot generation and time-zone/DST unit tests), `npm run e2e` (Playwright: book, reschedule, cancel, double-booking, editor auto-save).

## Status
M0-M3 done: auth (email magic link, Google), Drizzle schema, availability (weekly hours, date overrides, buffers, notice, date range, time zones), one-on-one event types with an auto-saving slide-in editor, booking page, confirmation, email + .ics, reschedule/cancel.
