# Analytics (PostHog)

One PostHog project (US cloud, project **666931**) collects the hub and every IsDead sub-app. The contract is the hub's
`yourappisdead/ANALYTICS.md`; this file is how CalendlyIsDead follows it. (Not to be confused with the product's own
scheduling analytics page, `/app/analytics` / `lib/analytics.ts`, which is a feature for hosts.)

## Setup
- `NEXT_PUBLIC_POSTHOG_KEY` = the project's publishable token (safe in the browser); `NEXT_PUBLIC_POSTHOG_HOST=https://us.posthog.com`. Both are set on the Vercel project. No key → analytics is a no-op.
- Reverse proxy through the app's own origin: `/calendlyisdead/ingest/*` → `us.i.posthog.com` (rewrites in `next.config.mjs`, with `skipTrailingSlashRedirect: true`).
- `<Analytics />` (`lib/posthog/posthog.tsx`) is mounted once in `app/layout.tsx` and sends PostHog's built-in `$pageview` per route change. Autocapture, heatmaps, performance capture and session replay are off. The client lives in `lib/posthog/` because `lib/analytics.ts` is already the product's scheduling-stats module.
- posthog-js drops events from automated browsers. In dev, `localStorage.isdead_ph_debug = "1"` turns on verbose logs and lets automated browsers capture. Production keeps the bot filter.

## Super properties (registered on every event)
| property | value | meaning |
| --- | --- | --- |
| `product` | `calendlyisdead` | the one property to filter by (the hub sends `yourappisdead`) |
| `surface` | `landing` \| `app` | `landing` = home, pricing (and calculator), login, signup; `app` = the dashboard (`/app/*`) and everything it publishes: booking pages `/<user>/<slug>`, team pages, booking / cancel / reschedule / pay links, polls, routing forms, meeting rooms, invites |
| `platform` | `web` | |
| `env` | `production` \| `development` | |
| `account_type` | `firebase` \| `guest` \| `demo` | registered after identification |

At boot the client unregisters older taxonomies' super properties (`app`, `app_family`, `base_path`, `suite_id`, `app_id`, `source`, `site_id`, …) from the shared yourappisdead.com cookie.

## Identity
Hosts signed in with Firebase are identified by their Firebase uid (`users.firebase_uid`, shared across the family; wired in `app/app/layout.tsx` → `components/app/Shell.tsx`). Guests and the demo account are never identified; `account_type` is registered instead. Invitees on public pages are never identified. Sign-out calls `reset()` and re-registers the super properties.

## Privacy rules
- Properties are kinds, counts and booleans only. Never sent: invitee names, emails, notes, answers, cancel reasons, event titles, usernames or slugs as properties.
- `before_send` (`scrub`) reduces every URL property posthog-js attaches (any key ending in `url` / `referrer` / `pathname`, including inside `$set` / `$set_once`) to origin + path, and drops the page `title`. Secret-like path segments become `:id`: `/booking/<uid>` (cancel/reschedule links), `/pay/<uid>`, `/invite/<token>`, `/meet/<room>`, `/poll/<id>` and `/f/<id>`. Public booking pages (`/<user>/<slug>`) keep their path, because hosts publish them on purpose.

## Events
| event | properties | where |
| --- | --- | --- |
| `app_signed_up` | `method`: password | `components/LoginForm.tsx` (sent with `trackNow` before the redirect) |
| `app_signed_in` | `method`: password \| google | `components/LoginForm.tsx` (`trackNow`) |
| `app_signed_out` | | `components/app/Shell.tsx` (sign-out form submit) |
| `app_event_type_created` / `app_event_type_deleted` | | `components/EventTypesBoard.tsx` |
| `app_one_off_created` | `duration_min` | `components/OneOffPanel.tsx` |
| `app_poll_created` | `options` (count), `duration_min` | `components/PollsPanel.tsx` |
| `app_poll_booked` | | `components/PollsPanel.tsx` (host books the winning time) |
| `app_shared` | `object`: event_type \| one_off, `method`: clipboard | copy-link buttons |
| `app_booking_created` | `rescheduled`, `paid`, `embed` (bools), `guests` (count) | `components/BookingWidget.tsx` (invitee; `trackNow` before the redirect) |
| `app_booking_cancelled` | `has_reason` | `components/CancelForm.tsx` |
| `app_poll_voted` | `options` (count picked) | `components/PollVote.tsx` |
| `app_routing_form_submitted` | `routed`: redirect \| message | `components/PublicForm.tsx` |

Rules:
- Event names are `app_<object>_<action>` (or `landing_…`), snake_case, past tense. The product name is never in an event name.
- Adding an event = add it to `lib/posthog/taxonomy.ts` (the only place event names are defined) and this table. `tests/unit/posthog.test.ts` checks naming, the super properties and URL scrubbing.
