# CalendlyIsDead parity report

Audit started: 2026-10-15. **Incomplete; no parity matches certified. Audit baseline is open as draft PR #1.**

Product constraint confirmed by the user: **the replica is completely free**. Full parity must not introduce subscriptions, paid feature gates, upgrade prompts or trial limits. Prices and access restrictions on the original are intentional exceptions. Visual and functional comparisons still apply to the surrounding experience.

The user explicitly confirmed that paid capabilities themselves must be built and made free. Original plan gating never justifies leaving a feature missing. A necessary paid-service dependency requires the closest working free equivalent and a specific documented limitation.

## Scope

User clarification, 2026-10-15: marketing parity is limited to **homepage and login**. Pricing and other marketing pages are excluded (EX2). All logged-in functionality remains in scope, including capabilities sold on paid original plans. Core invitee booking/confirmation/cancel/reschedule flows remain in the end-to-end scheduling audit. Standalone signup-page styling is excluded; account creation/onboarding behavior needed to reach the app is retained.

## Baseline and evidence quality

- Canonical repository: <https://github.com/tommy-muckstack/calendlyisdead>, main `d3a85d227027ba069fb04a60b1c8607279bf883e`, verified through the connected GitHub app on 2026-10-15.
- The initial local checkout (`fe8a6c2`) was 15 commits behind. It has been replaced for this audit with current source; imported file, tree and commit hashes were verified against GitHub. Initial findings about missing pricing/signup, Auth.js sign-in, absent base path and missing mobile navigation were superseded.
- Current source uses Next.js 15, shared Firebase Authentication, Drizzle/Postgres and local PGlite. Default route prefix is `/calendlyisdead`. No original `AGENTS.md`, `CONTRIBUTING.md` or `.env.example` exists. No environment files, payment code or secrets have been modified.
- Requested deployed targets: <https://yourappisdead.com/calendlyisdead> and <https://calendlyisdead.vercel.app/calendlyisdead>. Runtime/deployment mapping still requires browser verification.
- Original public text was inspected via [homepage](https://calendly.com/) and [login](https://calendly.com/login). Text/source observations are **not screenshots, computed styles or interactive evidence**.
- Neither disposable account has been created. No email was sent to a real person. No payment details were entered.

### Blocking conditions

| ID | Evidence | Required next step |
| --- | --- | --- |
| B1 | RESOLVED: connected GitHub app can read/write; CLI Git/gh still fail to connect. | The October 16 QA prompt authorizes small PRs. Publish scoped draft branches through the connector; never merge. Test artifacts stay local; existing preview automation can run. |
| B2 | In-app browser Node execution tool is unavailable. Standalone Playwright full Chromium and headless shell both failed at macOS launch, including escalated execution (`bootstrap_check_in`, process closed). Newly available Chromium 1248 and Firefox 1555 were retried on 2026-10-15: both still terminate before opening a page, including escalated execution (Firefox SIGABRT). macOS app-launch fallback also failed (`kLSNoExecutableErr`). | Restore working Playwright execution or obtain worker captures and authenticated reference observations. |
| B3 | Current `npm run lint` fails: missing script. No lint config/dependency exists; npm registry DNS failed and ESLint is not cached. | Add lint tooling once the dependency can be installed; this is not a pass. |
| B4 | Current source now confirms Firebase auth and `/calendlyisdead` prefix, but deployed behavior is unverified. | Check both deployed targets in the browser. |
| B5 | RESOLVED on current source: local fonts replace the old remote-font dependency; production build passed. | Rebuild each code PR. |

Browser and lint blockers are not accepted product exceptions. No screenshot pairs exist yet. Draft PRs may expose verified source/test fixes with these limitations clearly stated; no visual matches are certified.

## Status definitions

- `match`: verified against the original for the named state at both widths, with evidence.
- `differs`: a concrete mismatch or defect exists; record whether evidence is source, browser or behavioral test.
- `missing`: the feature/screen is absent from this snapshot's source.
- `unverified`: not enough evidence to assign one of the three parity outcomes. This temporary audit state does **not** satisfy completion.

Severity: P0 = data loss/double booking; P1 = blocked core task; P2 = feature/interaction mismatch; P3 = visual/detail mismatch. Severity on an unverified row is the priority of the check, not a confirmed defect.

## Screen and feature matrix

Every row requires 1440px and 390px checks; in-scope nested states must be expanded into individual evidence entries as they are inspected.

| ID | Screen / feature / states | Status | Severity | Evidence / outstanding comparison | Screenshots |
| --- | --- | --- | --- | --- | --- |
| L01 | Landing navigation, mega-menus, mobile menu | unverified | P2 | `components/mk/chrome.tsx` now has Product/Solutions/Resources/Pricing and mobile navigation; compare menu content, focus, hover and dismissal. | pending B2 |
| L02 | Landing hero, copy, CTAs | unverified | P3 | Current desktop hero and mobile measured layout need fresh paired captures; old green/cream snapshot findings are superseded. | pending B2 |
| L03 | Landing sections and product stories | differs | P2 | Mobile `MeasuredPage` renders flattened absolute-position items; generic link routing sends CTAs to login and other links home, losing actual section/action destinations. | pending B2 |
| L04 | Landing fonts, colors, spacing, images and icons | unverified | P3 | Current local Geist/Instrument Sans/Newsreader fonts and refreshed styling; computed-style measurements still needed. | pending B2 |
| L05 | Landing hover/focus, animation and reduced motion | unverified | P3 | Check every interactive control and animated section. | pending B2 |
| L06 | Footer and independence disclaimer | differs | P3 | Footer navigation labels all link home. Independence disclaimer remains in README but is absent from the rendered homepage; restore visible disclosure. | pending B2 |
| L07 | Cookie banner and preferences | unverified | P2 | Footer Cookie Settings links home; determine actual tracking/storage needs before adding any consent flow. | pending B2 |
| P01 | Dedicated pricing page and plan cards | differs | P2 | EX2: pricing marketing audit removed from scope by user on 2026-10-15. No pricing PR planned. | not required
| P02 | Billing toggle, add-ons and totals | differs | P2 | EX2: pricing marketing audit removed from scope by user on 2026-10-15. No pricing PR planned. | not required
| P03 | Feature comparison rows and responsive table | differs | P2 | EX2: pricing marketing audit removed from scope by user on 2026-10-15. No pricing PR planned. | not required
| P04 | Pricing FAQ and CTA | differs | P2 | EX2: pricing marketing audit removed from scope by user on 2026-10-15. No pricing PR planned. | not required
| A01 | Login layout and email flow | unverified | P1 | `LoginForm` now has Firebase email-first/password progression; compare original flow, styles and validation. | pending B2 |
| A02 | Signup and onboarding | unverified | P1 | Dedicated signup exists. Marketing styling excluded by EX2; test disposable account creation and functional onboarding into the app. | pending B2 |
| A03 | Forgot password | unverified | P2 | Login form reset mode invokes Firebase resetPassword; compare navigation, validation and error/recovery states. | pending B2 |
| A04 | Google button/logo/interaction | unverified | P2 | Google control now uses shared Google artwork; verify rendered size, spacing, accessible name and current official guidelines. | pending B2 |
| A05 | Microsoft and enterprise SSO controls | differs | P2 | Microsoft button only sets an unavailable error. Enterprise SSO capability absent; paid scope requires working free equivalents. | pending B2 |
| A06 | Validation, provider errors, expired links | unverified | P1 | Firebase error mapping and busy handling exist; expired/reset/provider failure states need account/browser tests. | pending B2 |
| S01 | App shell, home/scheduling and desktop navigation | differs | P2 | New AppShell has scheduling tabs and onboarding panel; Collapse sidebar button has no handler and onboarding task rows have no actions. | pending B2 |
| S02 | Mobile app navigation | unverified | P1 | Current AppShell has horizontally scrolling mobile navigation; old hidden-sidebar-only finding superseded. Test reachability and overflow at 390px. | pending B2 |
| S03 | Keyboard shortcuts and focus states | unverified | P2 | Event editor handles Escape; audit global shortcuts and focus order. | pending B2 |
| E01 | Event-type cards, filters, empty state | unverified | P2 | `EventTypesBoard`; no browser reference or empty-account capture. | pending B2 |
| E02 | Create event: one-on-one/group/collective/round robin/managed | unverified | P1 | Personal creation immediately POSTs; personal/group editor and separate team flows exist. Compare all original steps/fields. | pending B2 |
| E03 | Basics: name, duration, type, color, active state | unverified | P2 | Editor fields present; inspect validation and save/reload behavior. | pending B2 |
| E04 | Location, conferencing, description and link | unverified | P2 | Text/datalist location field; compare original location-specific fields. | pending B2 |
| E05 | Availability schedule selection | differs | P1 | Local fix preserves null scheduleId in editor PATCH and API validation. Real route/database tests verify clearing an explicit schedule, following a changed default, ownership rejection and empty-ID rejection. Browser parity remains unverified. | pending B2 |
| E06 | Limits, buffers, notice, future range | unverified | P1 | Fields exist; numerical boundary and scheduling checks needed. | pending B2 |
| E07 | Questions: types, required, choices, reorder/delete | unverified | P2 | Four local question types; compare original options and validation. | pending B2 |
| E08 | Event notifications and cancellation policy | missing | P2 | No event notification editor or cancellation-policy controls; separate workflows exist. | pending B2 |
| E09 | Redirect and confirmation options | unverified | P2 | Redirect URL exists; compare free equivalents without changing payments. | pending B2 |
| E10 | Editor autosave, errors, close/reopen, focus | unverified | P1 | Debounced save; check closing before timer fires and keyboard dialog behavior. | pending B2 |
| B01 | Invitee event/host summary | unverified | P3 | `BookingWidget`; needs paired reference with equivalent event. | pending B2 |
| B02 | Calendar/month/day states and mobile sizing | unverified | P2 | `.cal` has 300px minimum width plus container padding; test 390px and narrower widths for overflow. | pending B2 |
| B03 | Time-slot selection and progression | unverified | P1 | Local time selection/Next exists; compare state changes and scroll behavior. | pending B2 |
| B04 | Timezone picker, search, time format | differs | P2 | Native IANA select without search; list from `supportedValuesOf` omits UTC and aliases that may be selected. Source finding. | pending B2 |
| B05 | Invitee form, guest fields and validation | unverified | P1 | Name/email/guests/questions/notes implemented; compare required/invalid/submit states. | pending B2 |
| B06 | Availability loading, empty and failed requests | differs | P1 | Local fix validates response data, separates failures from empty results, offers retry, times out after 20 seconds, and cancels/ignores obsolete requests. Ten request-layer tests pass; twelve browser scenarios covering B06/B07 are authored but unexecuted. Original/UI comparison remains. | pending B2 |
| B07 | Submission loading and network failures | differs | P1 | Local fix restores the button after network/JSON/server failures, preserves entered details and announces an unconfirmed result without automatic POST retries. Malformed success no longer routes to an undefined booking. Browser execution/original comparison remains. | pending B2 |
| B08 | Confirmation and add-to-calendar | unverified | P2 | `app/booking/[uid]/page.tsx`; compare content and actions. | pending B2 |
| B09 | Cancel, reasons, result and repeated cancellation | unverified | P1 | Existing E2E source covers happy path; execution blocked. | pending B2 |
| B10 | Reschedule, preserved answers and cancellation | unverified | P1 | Existing happy-path E2E source; inspect state and notification semantics. | pending B2 |
| B11 | Personal/team booking indexes and inactive events | unverified | P2 | Dynamic user/team pages exist; compare empty/not-found states. | pending B2 |
| B12 | Invalid booking URL month/timezone parameters | differs | P1 | Source review: invalid month/timezone yields an invalid Luxon date, then `Array(first.weekday % 7)` receives NaN and throws. Validate incoming query parameters before calendar rendering. | pending B2 |
| V01 | Availability schedules, defaults and weekly hours | unverified | P1 | `AvailabilityEditor`; compare all controls and persistence. | pending B2 |
| V02 | Date overrides, holidays and overlap validation | differs | P1 | Local fix on current main rejects invalid clock times, calendar dates, weekdays and empty timezone before saving. All 13 API/database regressions pass; valid 24:00 ends, leap dates and closed days persist. Original/browser parity remains unverified. | pending B2 |
| M01 | Meetings list, filters, search and export | differs | P1 | New authenticated Calendar → Meetings timeline with upcoming/past/cancelled/all, literal search, event/date filters, pagination and streaming CSV. Functional tests pass; organization-wide reporting, external events and paired UI comparison remain. | pending B2 |
| M02 | Host meeting detail | differs | P2 | New owner-scoped detail includes invitee/guests/answers, timezone, location/join link, cancellation reason and existing reschedule/cancel actions. Full original detail/interaction comparison still required. | pending B2 |
| M03 | Private host notes | missing | P2 | Existing invitee notes are displayed; separate private host notes/editor are not implemented. | pending B2 |
| M04 | Mark and undo invitee no-show | missing | P2 | No persisted no-show state or controls yet. | pending B2 |
| M05 | Connected Google/Outlook events in calendar timeline | missing | P2 | Current timeline reads app bookings; provider free/busy integration does not yet supply external event detail. | pending B2 |
| M06 | Organization-wide meeting filters/export and reporting fields | missing | P2 | Current view is scoped to participating host records. Role-authorized cross-host reports, UTM/CRM/consent fields remain; payment changes are excluded. | pending B2 |
| C01 | Contacts list/detail, history and actions | missing | P2 | No contacts route or component. | pending B2 |
| I01 | Integration directory and connection controls | unverified | P2 | `CalendarsPanel`; Google/Microsoft/iCloud/demo supported in source. | pending B2 |
| I02 | Provider failure, conflict calendars, write-back | unverified | P1 | Local provider tests pass; live accounts and error UI not compared. | pending B2 |
| R01 | Routing forms, rules, public flow, fallbacks | unverified | P2 | `RoutingPanel`, `PublicForm`, routing tests; compare full flow. | pending B2 |
| W01 | Workflow templates, editor, triggers and results | unverified | P2 | `WorkflowsPanel`; email/SMS adapters. Do not deliver tests to real people. | pending B2 |
| N01 | Analytics metrics, filters, charts and empty state | unverified | P2 | Local analytics route exists; paired data and screen checks needed. | pending B2 |
| U01 | Account/profile settings and profile photo | missing | P2 | Branding settings exist, but no account/profile settings route. | pending B2 |
| U02 | Branding settings | unverified | P2 | `BrandingPanel`; compare allowed controls and persistence. | pending B2 |
| H01 | Share menus, generated links and embeds | unverified | P2 | Copy/View and embed builder exist; compare menus, base path and query retention. | pending B2 |
| H02 | Clipboard success/failure feedback | differs | P2 | `EventTypesBoard` reports Link copied without awaiting clipboard write; missing clipboard also reports success. | pending B2 |
| X01 | Empty states across authenticated screens | unverified | P2 | Capture with a fresh disposable account and no seeded data. | pending B2 |
| X02 | Loading/skeleton states across screens | unverified | P2 | Capture slow requests; avoid interpreting network failure as empty data. | pending B2 |
| X03 | Error states, 404 and inaccessible resources | unverified | P1 | Next default not-found handling; compare custom routes and status codes. | pending B2 |
| X04 | Accessibility: labels, keyboard, dialogs, contrast | differs | P2 | Event cards remain click-only; event/settings dialogs lack focus management. Menus and icon buttons require full keyboard audit. | pending B2 |
| T01 | Timezones, DST, date boundaries and leap days | unverified | P1 | Existing slot tests pass, including spring/fall DST and invitee-zone rebucketing; not original parity proof. | pending B2 |
| T02 | Buffers, minimum notice, daily/weekly limits | unverified | P1 | Existing unit tests pass; cross-event and concurrent boundaries remain to test. | pending B2 |
| T03 | Double booking, concurrent overlap and group seats | unverified | P0 | Unique index covers `(hostId,start,seat)` only; different-start overlap races require reproduction and transactional review. | pending B2 |
| T04 | Email/ICS confirmation, cancel and reschedule | unverified | P1 | Local outbox transport and ICS builder exist; compare method/UID/sequence/timezone/content using disposable accounts. | pending B2 |
| T05 | One-off links, polls and team flows | unverified | P2 | Source routes and local tests exist; original plan access may limit comparison. | pending B2 |

## Constraints and potential exceptions

- **EX2 — Marketing scope (user-confirmed 2026-10-15):** Only homepage and login require marketing parity. Pricing, calculator, separate signup styling and other marketing pages are excluded. This does not remove logged-in features or their paid-plan equivalents from scope.

- **EX1 — Free replica economics (user-confirmed 2026-10-15):** All replica features are free. Original subscription prices, paid tiers/add-ons, upgrades and time-limited trials must not be recreated. The free equivalent is full access with truthful pricing/access copy. This exception covers economic restrictions only; it does not excuse missing features, visual discrepancies, broken behavior or fake integrations. Existing host booking-payment/Stripe behavior is outside the authorized modification scope.
- Preserve the independent name/logo and disclaimer. Recreate visual assets and use licensed fonts. This is a user-required boundary; exact trademark/asset equivalence is not a target.
- Payment/Stripe and secrets are excluded from modification by the user. Pricing presentation may be compared without altering payment behavior.
- Free-equivalent limitations must be verified individually. No unavailable feature has yet been excused just because the reference charges for it.
- Beyond EX1, EX2 and the explicit asset/payment boundaries, no product limitation is approved as a completion exception. Live behavior and screenshots are still required before certifying matches.

## Verification log

Current main baseline (`d3a85d2`), 2026-10-15:

| Check | Result | Notes |
| --- | --- | --- |
| Dependencies | PASS with warning | `npm ci --offline`: 239 packages installed. Firebase packages require Node >=24.12; local Node is 22.17. Use a supported Node version for final acceptance. |
| Unit/integration tests | PASS | `npm test`: 75 tests, 9 files. |
| TypeScript | PASS | `npx tsc --noEmit --incremental false`. |
| Lint | BLOCKED | `npm run lint`: missing script (B3). Build output does not establish a lint pass. |
| Production build | PASS | `npm run build` compiles, typechecks and generates routes. Existing workspace-root warning remains. |
| Capture-tool syntax/help | PASS | Script syntax/help checked; execution blocked by B2. |
| Browser/E2E | BLOCKED | No screenshots or computed styles captured. |
| GitHub PR publication | PASS | Draft PR #1 opened through the connected GitHub app. CLI DNS still fails. |

## Review queue

| Logical area | Branch / PR | State |
| --- | --- | --- |
| Current audit baseline, free capabilities, scope, capture tooling | [PR #1](https://github.com/tommy-muckstack/calendlyisdead/pull/1) | Current-main source review; no visual claims. |
| Event-type default schedule | [PR #3](https://github.com/tommy-muckstack/calendlyisdead/pull/3) | 91 tests, standalone TypeScript and production build pass on current main plus PR #2. Browser evidence and lint remain blocked. |
| Availability input validation | [PR #2](https://github.com/tommy-muckstack/calendlyisdead/pull/2) | Replayed on current main; 88 tests pass (13 availability regressions). Browser evidence and lint remain blocked. |
| Host meetings timeline, detail and CSV | [Draft PR #6](https://github.com/tommy-muckstack/calendlyisdead/pull/6) | 105 tests, standalone TypeScript and build pass. Historical base lacks lint tooling; browser comparison remains blocked. |
| Booking request failure recovery | `fix/booking-request-errors` / local only | 115 unit/integration tests, TypeScript and production build pass. Twelve Playwright scenarios at 1440/390px are discoverable and separately typechecked, but execution remains blocked. Lint script still missing. |

## Capturing evidence with other workers

Run `node scripts/parity-capture.mjs --help`. Use the same label, viewport heights and page state for reference and clone captures. Initial screenshots alone do not cover menus, keyboard behavior, signup, booking or error states; workers should add explicit interaction evidence. Keep account credentials/storage state in ignored `.data/`. Inspect captures for account details or tokens before sharing/committing. Report the browser version, URL, state, exact differences and original plan restrictions. Do not mark rows matched without both sides.

### Optional REA investigation tooling

The user supplied [morluto/rea](https://github.com/morluto/rea). Its authored code is [MIT licensed](https://github.com/morluto/rea/blob/main/LICENSE); third-party materials retain their licenses. Relevant capabilities are [browser observation and capture/screenshot comparison](https://github.com/morluto/rea/blob/main/docs/browser-observation.md) and [offline HAR/network-capture analysis](https://github.com/morluto/rea/blob/main/docs/web-network-captures.md). These can help align observations from the same actions on both products. Missing observations must remain unknown rather than becoming matches.

REA has not been installed or executed here. Its browser inspection still needs a working Chrome-family browser; it does not resolve B2. Capture comparison may be useful when worker evidence arrives. Only sanitized test-account evidence should be shared. No target source maps, proprietary scripts, credentials or session material should be copied into the replica. No REA code has been copied into this repository.


### Availability validation change

Compared the real schedule PUT handler and persisted PGlite state before/after. Invalid `98:00`, `09:61`, `24:01`, weekdays outside 1–7, nonexistent dates and empty timezone now return 400 without changing saved hours. Valid split days, closed days, leap dates and `24:00` range ends remain supported. No UI, payment, auth or secret changes. Screenshots are pending B2; API/database tests are not a visual parity claim.

### Default event schedule change

Selecting Default schedule after choosing explicit hours now clears the saved schedule ID. Reloaded booking availability follows the host’s current default, including subsequent default changes. Three API/database regressions cover persistence, fallback behavior, ownership and empty IDs. The editor retains null in its request body. Screenshots and keyboard interaction remain pending B2; no visual parity claim.

### Host meetings functionality

Reference behavior: [Calendly meeting management](https://calendly.com/help/how-to-manage-your-meetings) (updated August 20, 2026) and [meeting export](https://calendly.com/help/tracking-and-reporting) (updated October 13, 2026). Public documentation establishes the timeline, search/filter, detail and export requirements; it does not establish visual parity.

The new host-only timeline/detail and CSV export use existing booking records and are available to every account without a plan gate. Calendar connections remain reachable from the Calendar tabs. Collective hosts see their own persisted participant row. Queries and export are constrained by the signed-in host; private provider/payment fields are not selected. CSV preserves filters, exports all matching pages in batches, and escapes spreadsheet formulas from invitee text. No emails are sent by viewing or exporting meetings.

Before: no host meetings list/detail/export. After: working routes, dated results, filters, pagination, accessible labels and links, loading/error/empty states, details, and existing cancel/reschedule destinations. New private notes, no-show, external-calendar timeline entries and organization reporting are explicitly still missing, not accepted exceptions. Browser screenshots and visual/keyboard checks remain blocked by B2. Tests use isolated PGlite and reserved addresses.

### Publication and cost clarification (October 15 history)

After the user asked about local storage and costs, further pushes/PRs were put on hold pending their preference. PRs #1–#3 already exist on GitHub. GitHub reports a completed Vercel preview for PR #3; no GitHub Actions runs were listed for that commit. Billing impact is unknown. No paid services were purchased or billing settings changed. The new meetings implementation remains local only.

The initial local dev-server HTTP smoke attempt returned 404 for the export endpoint while Watchpack repeatedly restarted with EMFILE errors. That attempt did not reach sign-in or send mail; the dev server was stopped. A subsequent production-build server with `DEMO_MODE=1`, empty `DATABASE_URL` and isolated local PGlite passed HTTP checks: anonymous CSV export returns 401, demo sign-in returns 204, the authenticated meetings page returns 200 with the Calendar connections link, CSV export returns 200 with its expected header/content type, and an invalid date filter returns 400. The production server was then stopped. Session cookies stayed in process memory, and no cloud database or email provider was used. This is server/HTTP evidence, not browser or visual evidence.

### Booking request failure recovery

Source comparison found that unavailable/malformed slot responses were shown as no availability, rejected fetches could leave loading indefinitely, and older requests could replace a newer month/timezone. The local change distinguishes loading, failure and a successful empty calendar; it adds retry, a 20-second availability timeout, request cancellation and request-keyed results. Returning from invitee details reloads availability. Booking submission now restores its controls after failures and keeps form values. An uncertain POST result explicitly asks the invitee to check for confirmation before retrying; there is no automatic booking retry. Existing successful checkout, redirect and confirmation branches are preserved; no payment/backend/secret changes were made.

Verification: all 115 unit/integration tests pass, including ten new availability response/cancellation tests. Standalone TypeScript and production build pass. Twelve Playwright cases cover HTTP failure/retry, stale month responses, timeout and network/non-JSON/malformed-success submissions at both requested widths. Test discovery and a separate E2E TypeScript check pass; **these browser cases have not executed** because B2 persists. They intercept every booking POST, so they do not send email or create real meetings. No screenshots, computed-style measurements or original behavior equivalence are claimed. Publication resumed under the October 16 QA prompt; see the publication verification below.

### QA #40 — publication verification, October 16

The new QA prompt explicitly requests small PRs, superseding the inferred publication hold above. This draft publishes only the meetings timeline/detail/export area on top of PR #3. All capabilities remain free. The new prompt also identifies missing notes/no-show controls and original filters/empty-state styling; these remain open alongside the documented gaps. No visual match is certified.

Fresh isolated-checkout verification of the product source: 105 tests in 12 files pass, production build and standalone TypeScript pass. `npm run lint` was attempted and fails because this historical base has no lint script; lint tooling exists later in the local review stack and must reach this branch before final approval. Installed dependencies were reused from the current local checkout. Original/before/after screenshots and 1440px/390px native interaction checks remain blocked by browser startup. No real accounts, calendars, emails, payment details or secrets were used. Publishing source/PR metadata to GitHub may trigger existing previews; test databases, outbox and raw logs stay local.

### Booking request recovery — publication verification, October 16

Fresh isolated checkout: 115 unit/database tests in 13 files, production build and standalone TypeScript pass. npm run lint was attempted and fails because this historical base has no lint script; tooling is a later pending change. Installed dependencies were reused from the current local checkout. Twelve 1440px/390px request-recovery Playwright scenarios are authored, not executed. This fixes source-observed loading, stale-response and submission failure behavior; the QA prompt's booking layout/flow findings #30–#39 remain open.

The product files are unchanged from local source commit `e38239ef8a7406c1f9174b3f8ffac3cd66a67947`. Only contributor/report publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.
