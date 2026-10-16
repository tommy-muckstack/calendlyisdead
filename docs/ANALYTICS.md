# Website analytics convention

Owner: yourappisdead. Schema version: **1**. Initial app: **calendlyisdead**.
PostHog project: [666931, US](https://us.posthog.com/project/666931).

This is website/product usage telemetry, separate from the host-facing meeting reports in `lib/analytics.ts`. Use this convention for future subapps so cross-app funnels can filter/group on stable properties instead of maintaining an event-name list for every app.

## Event contract

Every event includes these required properties:

| Property | CalendlyIsDead value | Rule for another app |
| --- | --- | --- |
| `site_id` | `yourappisdead` | Keep for this website family. |
| `app_id` | `calendlyisdead` | Stable lowercase app slug; main website uses `website`. |
| `platform` | `web` | Distinguishes website events from future native apps. |
| `surface` | `marketing`, `auth`, `app`, `booking`, `other` | Describes the page category, not a plan tier. |
| `schema_version` | `1` | Increment for a breaking meaning/property change. |
| `environment` | `production` | Development and preview delivery is disabled. |
| `route_template` | e.g. `/booking/[uid]` | App-relative route pattern; never a raw URL or identifier. |

Custom names use **`website_<object>_<past-tense action>`** in snake_case. Keep shared actions identical between apps. Standard PostHog `$pageview` is the sole naming exception, so its web analytics tools can recognize pageviews; it carries the same website/app context. Do not emit a second custom page-view event.

| Event | Trigger | Additional properties |
| --- | --- | --- |
| `$pageview` | Initial page and subsequent pathname navigation | None. Query/hash changes are intentionally not new views. |
| `website_signup_clicked` | Homepage hero email/Google link activated by pointer or keyboard | `method`: `email`/`google`; `placement`: `homepage_hero`. |
| `website_auth_started` | Email credentials submitted, Google popup requested, or password reset requested | `method`; `flow`: `login`/`signup`/`password_reset`. |
| `website_auth_completed` | Auth helper and session exchange succeed, or reset request succeeds | `method`, `flow`. |
| `website_auth_failed` | Auth/reset helper fails | `method`, `flow`, bounded `reason`: `credentials`, `account_exists`, `validation`, `popup_closed`, `rate_limited`, `other`. |

`flow=signup` describes the screen/action, **not proof a new account was created**: Google can sign an existing account in from that screen. A successful reset request does not prove an account exists or an email was delivered. Demo sign-in is excluded. Booking actions, feature edits, server exceptions and console logs are not instrumented yet; pageviews cover their routes. Add separately documented events at successful actions before building outcome funnels.

Examples: a signup funnel is homepage `$pageview` → `website_signup_clicked` → `website_auth_completed`, filtered by `site_id=yourappisdead`, `app_id=calendlyisdead`, `platform=web`, `environment=production`. Cross-app adoption can group `$pageview` with `surface=app` by `app_id`; this measures page visits, not successful feature use.

## Configuration and delivery

Set these at **build time** in each app's environment; Next.js embeds `NEXT_PUBLIC_*` values in the browser bundle:

```text
NEXT_PUBLIC_POSTHOG_KEY=<project capture token>
NEXT_PUBLIC_POSTHOG_ENABLED=true
NEXT_PUBLIC_POSTHOG_ENVIRONMENT=production
```

The capture token is browser-public and cannot administer the project. Keep actual configuration in ignored `.env.local` or hosting environment settings; do not put a personal API key into browser code. Ingestion is fixed to `https://us.i.posthog.com`; the dashboard uses `https://us.posthog.com`.

Without a token, with `ENABLED=false`, outside a production build/environment, or outside the explicit production hostname allowlist, the SDK does not initialize. Localhost and arbitrary Vercel preview URLs cannot send even if a production token is present. Do Not Track and Global Privacy Control also disable delivery. Analytics errors never block signup or navigation. Capture uses immediate best-effort beacons; blockers, offline browsers or navigation during initial SDK loading can lose events. These are usage signals, not authoritative account/booking records.

Local verification mocks the SDK; it sends no traffic to project 666931. No project settings, billing, dashboards or hosting configuration have been changed. The provided token is saved only in the ignored local environment with delivery disabled. Code publication is authorized by the October 16 QA prompt; production activation is still disabled pending deployment and build-time configuration. Event ingestion after activation uses the project's existing allowance/billing; zero cost is not guaranteed by this code.

## Data boundary

- Only registered events and enum properties pass the final `before_send` allowlist. Names, email addresses, Firebase IDs, form/booking answers, raw errors, DOM text, document titles, URL queries/fragments, referrers and person-property updates are discarded.
- Dynamic route segments become placeholders, including booking IDs, event slugs, usernames, team names and invitation tokens. `$current_url` is reconstructed from the production hostname, base path and safe route template.
- Autocapture, session replay, heatmaps, performance capture, automatic exception/log capture, flags, surveys, experiments, tours and conversations are disabled. External feature loaders and remote configuration are disabled.
- No `identify` or account-person profiles. A separate anonymous sessionStorage namespace supports same-tab journeys across same-origin subapps and reloads. It does not provide durable user retention, cross-device identity or cross-origin stitching between the two deployment hosts. SDK-generated anonymous/session IDs are the only identities sent. PostHog still receives the network request and can apply project-level enrichment settings; this code does not alter those settings.

## Adding another subapp

1. Reuse the typed `lib/telemetry` contract/client and `WebsiteAnalytics` component. Keep `site_id`, shared event names and property meanings stable.
2. Set its `app_id`, base path, safe route catalog and explicit production hostnames. Keep the same project token and anonymous storage namespace for same-origin journeys. The SDK instance name derives from `app_id`.
3. Mount the provider once in the root layout. Do not initialize a second default SDK or add automatic pageview capture.
4. Register new events and bounded properties in `schema.ts` before instrumenting an action. Add redaction/route tests; never pass arbitrary request bodies, error messages or component props to capture.
5. Verify initial navigation, client routing, keyboard CTA activation and auth outcomes in a real browser. Confirm sanitized payloads in PostHog before relying on dashboards.

Reference: [PostHog JavaScript configuration](https://posthog.com/docs/libraries/js/config), [Next.js setup](https://posthog.com/docs/libraries/next-js), [event conventions](https://posthog.com/docs/product-analytics/capture-events). The implementation pins the installed SDK through the lockfile.
