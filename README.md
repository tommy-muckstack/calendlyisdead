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

## Conferencing, payments, embeds, branding, analytics
- **Zoom / Google Meet**: set an event type's location to "Zoom" or "Google Meet". Meet links come from Google Calendar write-back; Zoom uses a server-to-server OAuth app (`ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, optional `ZOOM_USER`). With no keys, bookings get a labelled demo room at `/meet/<id>`.
- **Paid bookings (Stripe)**: set a price under "Payment and confirmation". The slot is held for 30 minutes while the invitee pays; emails, calendar events and workflows only fire once paid. Set `STRIPE_SECRET_KEY` (use a `sk_test_` key for test mode) and `STRIPE_WEBHOOK_SECRET`, and point a Stripe webhook at `/api/stripe/webhook` (`checkout.session.completed`, `checkout.session.expired`). Without keys a demo checkout at `/pay/<uid>` simulates payment. Rescheduling keeps the payment.
- **Redirect after booking**: optional URL per event type; gets `invitee_name`, `invitee_email`, `event_start`.
- **Embeds** (`/app/embed` builds the snippet; live demo at `/embed-demo.html`): `<script src="/embed.js">` then an inline `<div class="cid-inline" data-url=…>`, a popup widget (`CalendlyIsDead.initPopupWidget({url,text,color})`) or a popup text link (`data-cid-popup`). Frames auto-resize and post `{source:"calendlyisdead",type:"booked"}` to the parent page.
- **Branding** (`/app/branding`): brand color, logo, hide "Powered by". Embeds can override color with `?primary=RRGGBB`.
- **Analytics** (`/app/analytics`): new/cancelled/rescheduled/completed, page views and conversion per event type, revenue, popular-times heatmap.
- **Meeting polls** (`/app/polls`, public `/poll/<id>`) and **one-off links** (`/app/one-off`, single-use).

## Email assistant (AI email-thread booker)
`/app/assistant`: paste a thread; it extracts people, length, days/parts of day, explicit times and time zone, intersects that with your real availability, and drafts a reply with one-click booking links (prefilled name/email). It never sends mail. Works keyless with a built-in parser; set `LLM_API_KEY` (+ optional `LLM_BASE_URL`, `LLM_MODEL`, any OpenAI-compatible API) to use an LLM. Inbound mail: POST `{to, from, subject, text}` to `/api/inbound/email` with `Authorization: Bearer $INBOUND_SECRET`, addressed to `<username>+<event-slug>@your-domain`; it returns the proposal and draft.

## Tests
`npm test` (unit + PGlite integration tests: slots, DST, teams, workflows, payments, polls, one-off links, assistant), `npm run e2e` (Playwright: book, reschedule, cancel, double-booking, editor auto-save).

## Status
M0-M9 built (see docs/PLAN.md), including meeting polls and one-off links. Launch thread draft: `docs/launch/X_THREAD_DRAFT.md` (not posted). Not deployed.
