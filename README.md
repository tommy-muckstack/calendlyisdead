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
- Booking emails print to the server log (and `.data/outbox/`) unless `RESEND_API_KEY` is set.

Env (all optional in dev): `DATABASE_URL` (Postgres/Neon), `AUTH_SECRET` (signs the demo cookie and encrypts stored calendar tokens), `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` (Google *calendar* connect only), `AUTH_MICROSOFT_ID`/`AUTH_MICROSOFT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`.

## Sign-in (shared across yourappisdead.com)
Firebase Authentication, email/password + Google, shared by every IsDead app (`lib/isdead-auth`, canonical copy in isdead-design/auth).
The browser signs in with the Firebase JS SDK and POSTs the ID token to `/calendlyisdead/api/session`; firebase-admin verifies it,
maps the Firebase uid to `users.firebase_uid` (linking an existing row by *verified* email), and sets an httpOnly `isdead_session`
session cookie with `Path=/`, so /superhumanisdead and /wisprflowisdead see the same sign-in. Sign out clears it and revokes refresh tokens.

Env: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`,
`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `FIREBASE_SERVICE_ACCOUNT_JSON` (whole JSON key), optional `ISDEAD_COOKIE_DOMAIN`.
Without them the login page says "Sign-in not configured" (demo button still works with `DEMO_MODE=1`).

## Profile

Settings → Profile (`/app/profile`) edits your display name, scheduling-page welcome message, photo and account time zone. Use **Save changes** to persist the draft; a failed save retains your edits for retry. Changing the account time zone updates meeting filters and account-limit boundaries without changing existing availability schedules or booking instants.

Photos must be at least 90 × 90 pixels and smaller than 5 MB. JPG, PNG, WebP and GIF uploads become a centered 256px square PNG with metadata removed; animated images become static. Photos are stored in the app database (local PGlite during keyless development), without a separate upload service. Language, country, date/time format and login/security settings are not implemented yet; see [the parity report](docs/PARITY_REPORT.md).

## Calendar sync
- **Google**: its own OAuth client (`AUTH_GOOGLE_ID`), separate from Firebase sign-in. Add redirect URI `{APP_URL}/api/integrations/google/callback`; scopes `calendar.readonly` + `calendar.events`. Free/busy via the freeBusy API; bookings written with `sendUpdates=none` (we send our own invite) and a Meet link when the location is Google Meet.
- **Outlook / Microsoft 365**: Entra app (multi-tenant + personal accounts), redirect `{APP_URL}/api/integrations/microsoft/callback`, delegated `Calendars.ReadWrite offline_access User.Read`.
- **iCloud**: CalDAV at caldav.icloud.com with the Apple ID and an app-specific password.
- **Demo calendar**: keyless mock (dev or `DEMO_MODE=1`), busy 12-1pm ET on weekdays.
- Each user can connect several accounts, choose which calendars are checked for conflicts, and one calendar new bookings are added to. If a provider fails, its busy times are skipped and the connection is flagged.

## Teams and automations
- Teams at `/team/<slug>`: collective (everyone must be free), round robin (spread evenly, or by priority then evenly), managed event types (copied into each member's account; locked fields follow the template). Invites go out by email and must be accepted by the invited address.
- Group event types: several invitees per time, up to the seat limit.
- Secret events: use **Make secret** in a personal event's menu, or the team event's administrator controls, to hide it from the public scheduling page. The direct booking link still works. **Make public** restores the listing; turning an event off separately disables new bookings. Assigned managed events can be hidden by their individual hosts; visibility is not a template lock.
- Booking date ranges: event editor → Availability supports rolling calendar days or weekdays, a fixed inclusive start/end date, or indefinite future availability. Use **Save changes**. Weekdays count Monday–Friday when extending the horizon; actual weekend/holiday availability still comes from the schedule. Fixed dates use the selected schedule's timezone (the creator's default schedule for team events). Existing events keep their rolling calendar-day count until edited; existing meetings are retained. Duplicates, source-created single-use links and managed assignments carry the range.
- Locked booking time zones: event editor → Booking page options → **Lock the timezone** fixes the zone invitees see and use to book, including direct links and rescheduling. Choose a named zone so daylight saving rules apply. This does not change the host's availability or move existing meetings. Unlocking restores the invitee timezone picker. Duplicates, single-use links from an event and managed assignments carry the setting.
- Start time increments: event editor → Booking page options controls spacing independently of meeting duration. New events default to 30-minute starts; presets and custom whole-minute intervals from 5 to 1440 are supported. Existing events retain their previous duration-based spacing during migration. Duplicates and managed assignments carry the setting, and administrators can lock it for assigned hosts.
- Account meeting limits: Settings → Scheduling → Advanced availability (`/app/availability/advanced`) automatically saves daily, weekly and monthly caps across all event types. Hosts manage their own caps; event owners/team admins can view them in the event editor. Event-specific limits remain separate.
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

Website usage telemetry: optional PostHog integration for US project 666931. See [the shared website/subapp taxonomy](docs/ANALYTICS.md) for configuration, event meanings, redaction, environment gates and rollout to other apps. This is separate from the host-facing booking analytics.

`npm run lint` (Next.js/React/TypeScript rules; existing type debt remains visible as warnings), `npm run typecheck`, `npm run build`, and `npm test` (unit + PGlite integration tests: slots, DST, teams, workflows, payments, polls, one-off links, assistant, profiles), `npm run e2e` (Playwright: book, reschedule, cancel, double-booking, explicit event-editor/profile saving and automatic account-limit saving).

## Status
M0-M9 built (see docs/PLAN.md), including meeting polls and one-off links. Launch thread draft: `docs/launch/X_THREAD_DRAFT.md` (not posted). Not deployed.

## Hosting under a sub-path

The app is served at `https://yourappisdead.com/calendlyisdead` via Next.js `basePath` (set in `next.config.mjs`, override with `NEXT_PUBLIC_BASE_PATH` at build time). Server-side absolute links use `APP_URL` (include the base path, e.g. `https://yourappisdead.com/calendlyisdead`); Auth.js runs at `${basePath}/api/auth`, so set `AUTH_URL=https://yourappisdead.com/calendlyisdead/api/auth`. Client code uses `BP`/`withBase` from `lib/basepath.ts` for `fetch`, plain `<a>` and `location.href`.

- Cron: `/calendlyisdead/api/cron/workflows` (vercel.json)
- OAuth callbacks: `${APP_URL}/api/auth/callback/google`, `${APP_URL}/api/integrations/{google,microsoft}/callback`
- Stripe webhook: `${APP_URL}/api/stripe/webhook`; inbound mail: `${APP_URL}/api/inbound/email`
- `npm run db:migrate` applies `lib/db/ddl.sql` to `DATABASE_URL` (the app also applies it on cold start).
- Without `RESEND_API_KEY`, mail is logged and skipped; booking and cancelling still succeed.
