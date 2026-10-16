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
| B2 | In-app browser Node execution tool is unavailable. Playwright Chromium/headless shell and Firefox fail before opening a page, including escalated execution (`bootstrap_check_in`, SIGABRT). The installed system Chrome was also tested with Playwright's chrome channel on 2026-10-15; both normal and escalated launches end in SIGABRT. macOS app-launch fallback previously failed (`kLSNoExecutableErr`). No debug listener was found on port 9222. | A user-opened isolated Chrome session has been requested; no login is needed until it launches. Otherwise restore Playwright execution or obtain worker captures and authenticated reference observations. |
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
| E11 | Free/busy title exceptions and conflict notifications | missing | P2 | Original documents exact/partial title exceptions for booking over selected meetings, with conflict alerts. No matching event settings or behavior in this source. This is separate from preventing unintended booking races. | pending B2 |
| E12 | Monthly and all-event meeting limits | missing | P2 | Original documents monthly and account-wide limits; local event fields currently cover daily/weekly limits only. | pending B2 |
| E13 | Start increments, locked timezone, hidden event settings | missing | P2 | Source uses duration as the slot increment and has no corresponding editor fields; inspect original settings and allowed values. | pending B2 |
| B01 | Invitee event/host summary | unverified | P3 | `BookingWidget`; needs paired reference with equivalent event. | pending B2 |
| B02 | Calendar/month/day states and mobile sizing | unverified | P2 | `.cal` has 300px minimum width plus container padding; test 390px and narrower widths for overflow. | pending B2 |
| B03 | Time-slot selection and progression | unverified | P1 | Local time selection/Next exists; compare state changes and scroll behavior. | pending B2 |
| B04 | Timezone picker, search, time format | differs | P2 | Local fix includes UTC and the current valid alias in the native select, and derives the zone from the URL so back/forward navigation restores it. Search and original picker/time-format comparison remain outstanding. | pending B2 |
| B05 | Invitee form, guest fields and validation | unverified | P1 | Name/email/guests/questions/notes implemented; compare required/invalid/submit states. | pending B2 |
| B06 | Availability loading, empty and failed requests | differs | P1 | Local fix validates response data, separates failures from empty results, offers retry, times out after 20 seconds, and cancels/ignores obsolete requests. Ten request-layer tests pass; twelve browser scenarios covering B06/B07 are authored but unexecuted. Original/UI comparison remains. | pending B2 |
| B07 | Submission loading and network failures | differs | P1 | Local fix restores the button after network/JSON/server failures, preserves entered details and announces an unconfirmed result without automatic POST retries. Malformed success no longer routes to an undefined booking. Browser execution/original comparison remains. | pending B2 |
| B08 | Confirmation and add-to-calendar | unverified | P2 | `app/booking/[uid]/page.tsx`; compare content and actions. | pending B2 |
| B09 | Cancel, reasons, result and repeated cancellation | unverified | P1 | Existing E2E source covers happy path; execution blocked. | pending B2 |
| B10 | Reschedule, preserved answers and cancellation | unverified | P1 | Existing happy-path E2E source; inspect state and notification semantics. | pending B2 |
| B11 | Personal/team booking indexes and inactive events | unverified | P2 | Dynamic user/team pages exist; compare empty/not-found states. | pending B2 |
| B12 | Invalid booking URL month/timezone parameters | differs | P1 | Reproduced RangeError for invalid month/zone. Local fix validates month, zone, date and offset-bearing slot before rendering, recovers to the calendar, and cleans invalid parameters on navigation. Nineteen unit cases pass; browser/original comparison remains. | pending B2 |
| V01 | Availability schedules, defaults and weekly hours | unverified | P1 | `AvailabilityEditor`; compare all controls and persistence. | pending B2 |
| V02 | Date overrides, holidays and overlap validation | differs | P1 | Local fix on current main rejects invalid clock times, calendar dates, weekdays and empty timezone before saving. All 13 API/database regressions pass; valid 24:00 ends, leap dates and closed days persist. Original/browser parity remains unverified. | pending B2 |
| M01 | Meetings list, filters, search and export | differs | P1 | New authenticated Calendar → Meetings timeline with upcoming/past/cancelled/all, literal search, event/date filters, pagination and streaming CSV. Functional tests pass; organization-wide reporting, external events and paired UI comparison remain. | pending B2 |
| M02 | Host meeting detail | differs | P2 | New owner-scoped detail includes invitee/guests/answers, timezone, location/join link, cancellation reason and existing reschedule/cancel actions. Full original detail/interaction comparison still required. | pending B2 |
| M03 | Private host notes | missing | P2 | Existing invitee notes are displayed; separate private host notes/editor are not implemented. | pending B2 |
| M04 | Mark and undo invitee no-show | missing | P2 | No persisted no-show state or controls yet. | pending B2 |
| M05 | Connected Google/Outlook events in calendar timeline | missing | P2 | Current timeline reads app bookings; provider free/busy integration does not yet supply external event detail. | pending B2 |
| M06 | Organization-wide meeting filters/export and reporting fields | missing | P2 | Current view is scoped to participating host records. Role-authorized cross-host reports, UTM/CRM/consent fields remain; payment changes are excluded. | pending B2 |
| M07 | Show, edit and remove buffers on scheduled meetings | missing | P2 | Original documents meeting-level buffer controls. Local reservation snapshots now exist, but the timeline/detail has no buffer toggle or editor yet. | pending B2 |
| C01 | Contacts list/detail, history and actions | missing | P2 | No contacts route or component. | pending B2 |
| I01 | Integration directory and connection controls | unverified | P2 | `CalendarsPanel`; Google/Microsoft/iCloud/demo supported in source. | pending B2 |
| I02 | Provider failure, conflict calendars, write-back | unverified | P1 | Local provider tests pass; live accounts and error UI not compared. | pending B2 |
| I03 | Include buffers on connected calendars and sync their removal | missing | P2 | Original documents optional calendar buffer entries and deleting them through the provider. Local scheduling protection does not implement this provider synchronization. | pending B2 |
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
| T02 | Buffers, minimum notice, daily/weekly limits | differs | P1 | Local transaction checks enforce concurrent limits and protected intervals. Saved buffers now protect cross-event/group/poll bookings, and existing group sessions count toward meeting caps. Original behavior and broader notice/limit boundaries still require comparison. | pending B2 |
| T03 | Double booking, concurrent overlap and group seats | differs | P0 | Different-start overlapping reservations reproduced. Local fix serializes participating hosts and rechecks slots inside the reservation transaction, including group seats, round robin, collective meetings and reschedule rollback. Ten deterministic PGlite regressions pass. Multi-connection PostgreSQL and browser verification remain. | pending B2 |
| T04 | Email/ICS confirmation, cancel and reschedule | unverified | P1 | Local outbox transport and ICS builder exist; compare method/UID/sequence/timezone/content using disposable accounts. | pending B2 |
| T05 | One-off links, polls and team flows | unverified | P2 | Source routes and local tests exist; original plan access may limit comparison. | pending B2 |
| T06 | Poll reservation races and concurrent single-use link consumption | differs | P0 | Single-use consumption and poll bookings now use host-locked transactions locally. Poll overlap/duplicate booking and concurrent duplicate votes were reproduced; eleven poll regressions pass, including atomic closure, rollback and vote replacement. PostgreSQL/browser verification remains. | pending B2 |
| T07 | Existing-booking buffers across event types | differs | P1 | Eleven failures reproduced and fixed locally. Reservations retain their own buffers; conflict checks include them across event types, group sessions, round robin/collective and polls. Sixteen new tests cover concurrency, boundaries, midnight/DST and migration. Historical buffers must be approximated from current settings during migration. Browser/PostgreSQL checks remain. | pending B2 |
| T08 | Group-session daily/weekly limits | differs | P1 | Six failing local reproductions fixed: distinct sessions now count toward limits while existing sessions retain their remaining seats. Cancellation, weekly reset, other invitee timezones, repeated DST times and concurrent creation are covered. Original group-limit edge behavior and browser parity remain unverified. | pending B2 |
| T09 | Single-use link customization and One-off meeting distinction | differs | P2 | Original single-use links support personalized contact/details and link management; One-off meetings have a separate explicit-time flow. Current source uses one one_off kind and lacks the full customization/management distinction. Verify original rescheduling rules for each flow before changing them. | pending B2 |
| T10 | Database startup after group reservations | differs | P1 | Reopening a persisted database with two attendees failed when startup recreated an obsolete host/start unique index. Local fix retains only the seat-aware index. Restart, legacy upgrade, preserved reservations and cancelled-seat reuse pass in PGlite; deployed PostgreSQL verification remains pending. | nonvisual regression; browser flows pending B2 |
| T11 | Scheduled group capacity and locked event settings | differs | P1 | [Original group documentation](https://calendly.com/help/group-event-type-overview) distinguishes per-meeting capacity from future defaults and locks duration/location after booking. Local capacity checks still use current event defaults; the editor/API can change duration/location. Session limit editing and remaining-seat display settings are also missing. | pending B2 |

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
| Host meetings timeline, detail and CSV | [Draft PR #6](https://github.com/tommy-muckstack/calendlyisdead/pull/6) | Local implementation; 105 tests, TypeScript and build pass, including 14 ownership/filter/DST/export tests. Browser comparison and lint blocked. |
| Booking request failure recovery | [Draft PR #7](https://github.com/tommy-muckstack/calendlyisdead/pull/7) | 115 unit/integration tests, TypeScript and production build pass. Twelve Playwright scenarios at 1440/390px are discoverable and separately typechecked, but execution remains blocked. Lint script still missing. |
| Booking link validation and timezone selection | [Draft PR #8](https://github.com/tommy-muckstack/calendlyisdead/pull/8) | 134 unit/integration tests, standalone TypeScript and production build pass. Four additional browser cases are discoverable/typechecked but unexecuted. Lint/browser evidence blocked. |
| Atomic event reservations and rescheduling | [Draft PR #9](https://github.com/tommy-muckstack/calendlyisdead/pull/9) | Four pre-change race failures reproduced; all 144 tests, standalone TypeScript and production build pass, including ten focused PGlite regressions. Lint remains missing. Poll/one-off follow-up and multi-connection PostgreSQL/browser checks remain. |
| Single-use reservation consumption | [Draft PR #10](https://github.com/tommy-muckstack/calendlyisdead/pull/10) | Pre-change concurrent double consumption reproduced. All 146 tests, TypeScript and production build pass. Two new tests cover concurrent consumption and rollback/retry. Browser/PostgreSQL checks and lint remain blocked. |
| Poll reservations, closure and vote replacement | [Draft PR #11](https://github.com/tommy-muckstack/calendlyisdead/pull/11) | Six new assertions failed before the fix. All 157 tests, TypeScript and build pass, including eleven poll regressions. Lint/browser/PostgreSQL contention checks remain blocked. |
| Group session meeting limits | [Draft PR #12](https://github.com/tommy-muckstack/calendlyisdead/pull/12) | Six pre-change failures reproduced. All 168 tests, TypeScript and production build pass, including eleven new database/slot regressions. Original behavior, browser evidence, PostgreSQL contention and lint remain unverified/blocked. |
| Database startup with group attendees | [Draft PR #13](https://github.com/tommy-muckstack/calendlyisdead/pull/13) | Persisted-database restart failure reproduced and fixed. All 171 tests, TypeScript and production build pass, including three migration/constraint cases. Lint and deployed PostgreSQL/browser verification remain pending. |
| Saved booking buffers and cross-event protection | `fix/booking-buffer-protection` / local only | Eleven pre-change failures reproduced. All 187 tests, TypeScript and production build pass, with sixteen new regressions. No production migration or publication. Lint/browser/PostgreSQL verification remains pending. |

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

### Booking link validation

Before: malformed `month` or `tz` led to an invalid Luxon weekday and `Array(NaN)`, reproduced locally as `RangeError: Invalid array length`. Invalid dates/slots could also reach the details display. After: invalid links show a warning and a usable calendar, with a valid visitor timezone (UTC fallback), current local month and no selected slot. Navigation replaces invalid calendar parameters while retaining unrelated prefill fields. Offset-bearing timestamps preserve both instants in the repeated DST hour. UTC and valid aliases stay available in the timezone select; the URL drives selection on browser history changes. Picker search and broader timezone UI parity are still outstanding.

Nineteen new unit cases cover malformed/empty inputs, real leap dates, aliases, local month boundaries and ambiguous/invalid slots. All 134 tests pass, along with standalone TypeScript, separate browser-test TypeScript checking and the production build. Four Playwright cases at 1440/390px are authored and discoverable, not executed (B2). `npm run lint` still reports the missing script (B3). No visual match is certified, and the change remains local.

### Atomic event reservations

Deterministic pre-change tests allowed both requests to pass availability before either reservation began. Four cases incorrectly accepted both bookings: overlapping meetings with different starts, daily-limit overflow, weekly-limit overflow and adjacent buffered slots. Non-overlapping bookings correctly succeeded as a control.

The local fix locks host rows in consistent order and rechecks local reservations, limits, notice and buffers inside a read-committed transaction before inserting. This follows PostgreSQL's documented [row-lock semantics](https://www.postgresql.org/docs/current/explicit-locking.html) and [read-committed snapshots](https://www.postgresql.org/docs/current/transaction-iso.html). Provider checks stay in the initial availability phase; no provider I/O occurs while locks are held. Round robin chooses among hosts still available, collective reservations commit together, group seat inserts handle conflicts without aborting the transaction, and a reschedule cancels/replaces its original booking atomically. Existing payment/Stripe branches and configuration are unchanged.

Ten focused tests use an isolated local PGlite database and stub calendar, conferencing, mail and workflow effects. They cover the four reproduced failures, non-overlapping success, exact group capacity, round-robin fallback, collective all-or-nothing reservation, rollback on a failed move and competing moves of one booking. This validates fresh reservation checks and rollback, **not cross-process PostgreSQL lock contention**; no local PostgreSQL server was found for that additional test. Browser parity remains unverified. Poll writes and one-off link consumption remain explicit separate gaps (T06).

Final local checks: 144 tests in 15 files pass, standalone TypeScript passes, and the production build passes. `npm run lint` fails because no lint script exists. The baseline workspace-root/Node-version warnings and browser blocker remain. Source review also identified separate buffer-ownership and group-limit defects (T07/T08); the transaction fix does not claim to resolve those scheduling rules.

Additional reference observations: [free/busy rules](https://calendly.com/help/free-busy-rules-overview) allow configured title exceptions and conflict notifications; [poll setup](https://calendly.com/help/how-to-set-up-a-meeting-poll) includes multiple hosts, up to 40 time options, poll editing/deleting and participant review before booking. These controls are not established as replicated by existing source/tests. The linked help content also identifies monthly/global limits and slot-increment/timezone settings for further comparison. Public documentation does not establish visual parity.

### Single-use reservation consumption

Reference: [single-use links](https://calendly.com/help/how-to-create-a-single-use-link) expire after one booking. A deterministic pre-change test showed two simultaneous requests at different times both succeeded. The local fix conditionally sets usedAt inside the same host-locked transaction as the booking. Only one request can consume the link; a failed reservation rolls back both the booking and consumption, allowing a later retry. Checkout, paid-hold and payment-confirmation branches are unchanged.

All 146 tests pass, including concurrent single-use consumption and transaction-failure rollback/retry. Standalone TypeScript and production build pass; lint remains unavailable. Tests use isolated local PGlite with provider/mail effects stubbed and reserved email addresses. This is not multi-connection PostgreSQL or browser parity evidence. No remote publication occurred.

### Poll reservations and voting

Before: concurrent selections of different options booked the same poll twice; separate polls and regular bookings could overlap; concurrent re-votes created duplicate email entries. The rollback check also failed because poll booking did not use a transaction. Six new assertions failed on the previous source.

After: poll booking uses the same host-row lock as event-type reservations, checks local overlap, then creates its event/reservation and closes the poll in one read-committed transaction. Voting locks the poll and replaces a vote atomically, so closure and the final attendee list agree. Failed transactions send no notifications; provider writes and mail happen only after reservation commit. Authorization and option/vote checks are preserved. Intentional conflict overrides, provider conflict checks and existing-event buffer ownership remain separate parity work; no such behavior is claimed here.

All 157 unit/integration tests pass, including eleven poll cases for duplicate/overlapping reservations, poll-vs-regular competition, adjacent/cancelled meetings, ownership/options/votes, rollback/retry, concurrent re-votes, vote-vs-closure and failed vote replacement. Standalone TypeScript and production build pass. Lint is unavailable, and browser/multi-connection PostgreSQL verification remains pending. Tests use local PGlite, reserved addresses and stubbed delivery effects; no external mail, paid services or remote publication occurred.

### Group session meeting limits

Before: filtering existing group sessions out of the limit count left every other time available, even after reaching the configured daily or weekly cap. Six database regression cases failed, including two concurrent requests creating separate sessions under a one-session daily limit.

After: distinct confirmed sessions count toward the cap; remaining seats at the same instant remain bookable. Capacity, busy intervals, minimum notice and working hours still apply. Cancelling one attendee frees a seat; cancelling the last frees a session allowance. Tests also cover weekly reset, another invitee timezone and the two distinct instants in the repeated DST hour. Counting sessions is consistent with the existing distinct-start model; public meeting-limit documentation does not settle all original group-event edge cases, so this is not a parity certification.

All 168 unit/integration tests pass, including eleven new cases. An initial focused run timed out in one case; that case passed in isolation and the subsequent full suite passed without changing timeouts. A TypeScript inference error was corrected before the final standalone typecheck and production build passed. Lint remains unavailable. Browser and multi-connection PostgreSQL checks remain pending. Tests use isolated local PGlite and stub delivery effects. The fix remains local, with no remote build or deployment.

### Database startup with group attendees

Before: after two attendees booked one group session, replaying the startup DDL attempted to create the obsolete unique index on host/start before dropping it. The duplicate start times caused `could not create unique index "bookings_no_double"`, preventing database initialization. A regression test reproduced this by closing and reopening a persisted local database.

After: startup no longer recreates that obsolete index. Existing legacy indexes are still removed by the upgrade, and the current host/start/seat index still prevents duplicate confirmed seats. Three database tests cover persisted restart and repeated DDL replay, upgrading the old schema while preserving reservations, fresh initialization, duplicate rejection and reuse of cancelled seats. No booking data is removed by the fix.

All 171 unit/integration tests, standalone TypeScript and the production build pass. Lint remains unavailable. Tests use isolated local PGlite; no production migration, cloud database or provider was accessed. Deployed PostgreSQL and browser flow verification remain pending. The change remains local and unpublished.

### Saved booking buffers and cross-event protection

Reference: [Calendly buffer behavior](https://calendly.com/help/how-to-use-buffers), updated August 20, 2026. Existing meetings retain their prior buffers when event defaults change. Protected before/after intervals combine across meetings, may extend outside working hours, and affect multi-host availability. Meeting-level editing and connected-calendar buffer synchronization are distinct controls, tracked in M07/I03.

Before: eleven regressions failed because only the new event's buffers were considered, same-event group sessions were omitted entirely from local busy intervals, and reservations did not save buffer values. A zero-buffer event or poll could book inside another event's buffer. Changing group defaults could also hide remaining seats in an existing session.

After: each reservation saves before/after minutes; local availability and transaction rechecks query the full protected interval. Group seats retain their session's buffers and ignore only that exact session's own busy interval. Adjacent group sessions remain protected. Poll reservations use the same buffer-aware conflict query. Provider I/O stays outside the reservation transaction, and payment branches are unchanged.

Migration limitation: legacy rows have no historical buffer values. The idempotent migration freezes their current event settings once, preserves already saved values (including zero), and supports retry after a partial migration. This is an approximation for old data, not recovered history. No production migration was run. Existing provider free/busy matching for group sessions still identifies them by start time; unrelated external events sharing that start need separate investigation.

All 187 tests in 19 files pass, including thirteen booking/database regressions, two migration cases and a repeated-DST-hour case. They cover cancellation/rescheduling, exact boundaries, stacked buffers, midnight, group settings, round robin/collective, polls and concurrent reservations. An older one-off fixture attempted to book inside an earlier meeting's buffer; it now verifies that rejection and books the next valid slot. Standalone TypeScript and production build pass. Lint remains unavailable. Browser screenshots/styles and multi-connection PostgreSQL checks remain pending; no parity match is certified. New provider effects are stubbed, and the existing suite uses the local outbox. Changes remain local and unpublished.

### QA #40 — publication verification, October 16

The new QA prompt explicitly requests small PRs, superseding the inferred publication hold above. This draft publishes only the meetings timeline/detail/export area on top of PR #3. All capabilities remain free. The new prompt also identifies missing notes/no-show controls and original filters/empty-state styling; these remain open alongside the documented gaps. No visual match is certified.

Fresh isolated-checkout verification of the product source: 105 tests in 12 files pass, production build and standalone TypeScript pass. `npm run lint` was attempted and fails because this historical base has no lint script; lint tooling exists later in the local review stack and must reach this branch before final approval. Installed dependencies were reused from the current local checkout. Original/before/after screenshots and 1440px/390px native interaction checks remain blocked by browser startup. No real accounts, calendars, emails, payment details or secrets were used. Publishing source/PR metadata to GitHub may trigger existing previews; test databases, outbox and raw logs stay local.

### Booking request recovery — publication verification, October 16

Fresh isolated checkout: 115 unit/database tests in 13 files, production build and standalone TypeScript pass. npm run lint was attempted and fails because this historical base has no lint script; tooling is a later pending change. Installed dependencies were reused from the current local checkout. Twelve 1440px/390px request-recovery Playwright scenarios are authored, not executed. This fixes source-observed loading, stale-response and submission failure behavior; the QA prompt's booking layout/flow findings #30–#39 remain open.

The product files are unchanged from local source commit `e38239ef8a7406c1f9174b3f8ffac3cd66a67947`. Only contributor/report publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.

### Booking link validation — publication verification, October 16

Fresh isolated checkout: 134 unit/database tests in 14 files, production build and standalone TypeScript pass. npm run lint was attempted and fails because this historical base has no lint script; tooling is a later pending change. Installed dependencies were reused from the current local checkout. Four 1440px/390px link-validation Playwright scenarios are authored, not executed. Coverage includes invalid dates/zones/months, local month boundaries and distinct repeated DST instants. Friendly/searchable timezone UI in QA #33 remains open.

The product files are unchanged from local source commit `8f9800cd73e536d4997c6649818042b0dec6a892`. Only contributor/report publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.

### Atomic event reservations — publication verification, October 16

Fresh isolated checkout: 144 unit/database tests in 15 files, production build and standalone TypeScript pass. npm run lint was attempted and fails because this historical base has no lint script; tooling is a later pending change. Installed dependencies were reused from the current local checkout. Ten focused reservation tests cover competing overlaps, limits, buffers, group seats, round-robin fallback, collective atomicity and reschedule rollback. PGlite tests do not prove multi-connection PostgreSQL locking; that check and native-browser evidence remain outstanding. Single-use consumption, poll reservations, buffer ownership and group-session counting are separate fixes later in the stack.

The product files are unchanged from local source commit `6c348592635c267f443344093886d9e926c81965`. Only contributor/report publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.

### Single-use reservation consumption — publication verification, October 16

Fresh isolated checkout: 146 unit/database tests in 15 files, production build and standalone TypeScript pass. The two added cases verify one winner for simultaneous bookings at different times and rollback/retry when reservation fails. Mail/provider effects are stubbed and addresses reserved. npm run lint was attempted and fails because this historical base has no lint script; tooling is a later pending change. Dependencies were reused locally. Real PostgreSQL multi-connection contention and browser comparison remain unverified. This does not close the separate One-off meeting UI and single-use customization gaps.

The product files are unchanged from local source commit `3ce4538cd0b6803b1ca56f4c560bd3444abb5992`. Only contributor/report publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.

### Atomic poll booking and voting — publication verification, October 16

Fresh isolated checkout: 157 unit/database tests in 16 files, production build and standalone TypeScript pass. Eleven poll cases verify booking once, cross-poll/regular-booking overlap, adjacent/cancelled meetings, ownership/options, atomic rollback, concurrent revotes and closure. Mail/provider effects are stubbed and addresses reserved. npm run lint was attempted and fails because this historical base has no lint script; tooling is a later pending change. Dependencies were reused locally. Real PostgreSQL contention and browser comparison remain unverified. External-provider conflict checks, conflict overrides, buffer ownership and broader original poll controls remain separate work.

The product files are unchanged from local source commit `ec68cbd3a47591ed37025cb380b012b2e5a8031c`. Only contributor/report publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.

### Group-session meeting limits — publication verification, October 16

Fresh isolated checkout: 168 unit/database tests in 17 files, production build and standalone TypeScript pass. Eleven new database/slot cases cover counting group sessions once, keeping existing seats joinable at daily/weekly caps, cancellation, timezone boundaries, competing new sessions and unchanged one-on-one counting. npm run lint was attempted and fails because this historical base has no lint script; tooling is a later pending change. Dependencies were reused locally. Original cap edge rules, real PostgreSQL contention and browser comparison remain unverified. Saved session capacity and booked buffer ownership are separate later fixes.

The product files are unchanged from local source commit `11645e1b6359f571e7fc68735227dd64537f946b`. Only contributor/report publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.

### Database restart with group bookings — publication verification, October 16

Fresh isolated checkout: 171 unit/database tests in 18 files, production build and standalone TypeScript pass. Three startup cases verify replaying the real DDL over saved group attendees, upgrading a legacy index and retaining one-on-one uniqueness. No production migration was run. npm run lint was attempted and fails because this historical base lacks the script; tooling is a later pending change. Dependencies were reused locally. Browser/original comparison and deployed PostgreSQL validation remain unverified.

The product files are unchanged from local source commit `53842ee162c86f3bc9269242ffaa86df05de866b`. Only contributor/report publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.

### Persisted booking buffers — publication verification, October 16

Fresh isolated checkout: 187 unit/database tests in 19 files, production build and standalone TypeScript pass. Sixteen new regression/migration/DST cases cover saved before/after buffers, stacked boundaries, midnight, group seats, cancellation/rescheduling, polls and concurrent reservations. Legacy rows can only freeze current event buffers once; lost historical values cannot be reconstructed. No production migration was run. npm run lint was attempted but the historical base lacks its script; tooling is a later pending change. Dependencies were reused locally. Multi-connection PostgreSQL, original/browser comparison and ambiguous external-calendar group matching remain open.

The product files are unchanged from local source commit `73b9ca6461a0b02da8382bee0fb9fb8be5060f4b`. Only contributor/report publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.
