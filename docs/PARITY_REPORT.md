# CalendlyIsDead parity report

Audit started: 2026-10-15. **Incomplete; no parity matches certified. Audit baseline is open as draft PR #1.**

Product constraint confirmed by the user: **the replica is completely free**. Full parity must not introduce subscriptions, paid feature gates, upgrade prompts or trial limits. Prices and access restrictions on the original are intentional exceptions. Visual and functional comparisons still apply to the surrounding experience.

The user explicitly confirmed that paid capabilities themselves must be built and made free. Original plan gating never justifies leaving a feature missing. A necessary paid-service dependency requires the closest working free equivalent and a specific documented limitation.

## Scope

User clarification, 2026-10-15: marketing parity is limited to **homepage and login**. Pricing and other marketing pages are excluded (EX2). All logged-in functionality remains in scope, including capabilities sold on paid original plans. Core invitee booking/confirmation/cancel/reschedule flows remain in the end-to-end scheduling audit. Standalone signup-page styling is excluded; account creation/onboarding behavior needed to reach the app is retained.

Authentication clarification, 2026-10-15: signup and login support **email/password and Google only** (EX3). Microsoft sign-in and enterprise SSO are excluded by the user. Microsoft/Outlook calendar connections remain in scope.

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
| B2 | In-app browser Node execution tool is unavailable. Playwright Chromium/headless shell and Firefox fail before opening a page, including escalated execution (`bootstrap_check_in`, SIGABRT). The installed system Chrome was also tested with Playwright's chrome channel on 2026-10-15; both normal and escalated launches end in SIGABRT. macOS app-launch fallback previously failed (`kLSNoExecutableErr`). The installed WebKit fallback also aborts before page creation, both normally and outside the sandbox. No debug listener was found on port 9222. | A user-opened isolated Chrome session has been requested; no login is needed until it launches. Otherwise restore Playwright execution or obtain worker captures and authenticated reference observations. |
| B3 | RESOLVED locally: ESLint dependencies are now cached and installed. `npm run lint` runs the Next.js Core Web Vitals and TypeScript presets, with zero errors and 276 warnings on the current event-menu fixes. | Continue running lint on every change. Explicit `any` remains a warning during incremental type cleanup; the remaining warnings are not a clean lint result. |
| B4 | Current source now confirms Firebase auth and `/calendlyisdead` prefix, but deployed behavior is unverified. | Check both deployed targets in the browser. |
| B5 | RESOLVED on current source: local fonts replace the old remote-font dependency; production build passed. | Rebuild each code PR. |

The browser blocker and remaining lint debt are not accepted product exceptions. No controlled 1440px/390px screenshot pairs have been captured. The user supplied a 3440×1141 desktop side-by-side image on 2026-10-15; the two apps have different viewport widths, so it is qualitative reference evidence only. Draft PRs may expose verified source/test fixes with these limitations clearly stated; no visual matches are certified.

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
| L02 | Landing hero, copy, CTAs | unverified | P3 | Desktop/mobile hero now share real Google/email signup links under EX3. The flattened mobile auth items were replaced with keyboard-focusable links. Paired captures and focus checks remain pending. | pending B2 |
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
| A05 | Microsoft and enterprise SSO controls | differs | P2 | EX3: user explicitly limited authentication to email/password and Google. Removed the nonfunctional Microsoft button from shared login/signup and its desktop/mobile homepage promotion, plus unsupported SSO claims. Microsoft calendar connections remain supported. | visual confirmation pending B2 |
| A06 | Validation, provider errors, expired links | unverified | P1 | Firebase error mapping and busy handling exist; expired/reset/provider failure states need account/browser tests. | pending B2 |
| S01 | App shell, home/scheduling and desktop navigation | differs | P2 | User-supplied desktop image confirms header/search/card spacing and icon differences. Local styling/icon fix recorded in docs/parity/dashboard-spacing.md; after captures remain blocked. Collapse sidebar button and onboarding rows still lack actions. | user-supplied desktop baseline; after pending B2 |
| S02 | Mobile app navigation | unverified | P1 | Current AppShell has horizontally scrolling mobile navigation; old hidden-sidebar-only finding superseded. Test reachability and overflow at 390px. | pending B2 |
| S03 | Keyboard shortcuts and focus states | unverified | P2 | Event editor handles Escape; audit global shortcuts and focus order. | pending B2 |
| E01 | Event-type cards, filters, empty state | unverified | P2 | `EventTypesBoard`; no browser reference or empty-account capture. | pending B2 |
| E02 | Create event: one-on-one/group/collective/round robin/managed | unverified | P1 | Personal creation immediately POSTs; personal/group editor and separate team flows exist. Compare all original steps/fields. | pending B2 |
| E03 | Basics: name, duration, type, color, active state | differs | P2 | [Original customization guidance](https://calendly.com/help/how-to-customize-your-event-types) forbids converting one event kind into another. The clone still permits that for unbooked personal types; creation must offer the kind before saving. Group post-booking locks are implemented locally. | pending B2 |
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
| E14 | Delete event type while retaining scheduled meetings | differs | P0 | Database cascade previously removed bookings/reminders. Local fix retains historical definitions and meetings, removes current booking/editing access, handles managed copies, and protects link reuse. Original/browser comparison of deleted-type rescheduling remains outstanding. | pending B2 |
| E15 | Event card menu and duplication | differs | P2 | Local overflow menu now opens View/Edit/Embed/Duplicate/Delete/On-Off actions. Personal/group/team/managed duplication creates an editable copy with a new link, preserving settings/hosts without bookings or assignments. Fourteen database/selector cases pass. Other original menu options, workflow-copy semantics, exact managed-copy rules and browser parity remain outstanding. | pending B2 |
| E16 | Per-event viewers/editors and delegated event management | missing | P2 | [Original event permissions](https://calendly.com/help/understand-event-type-permissions) include viewer duplication and editor access. Clone currently has personal ownership and team owner/admin roles only; no per-event permission editor or delegated access model. Paid-plan gating does not exempt this feature. | pending B2 |
| E17 | Team booking-link uniqueness across owners | differs | P1 | Source has a current owner/slug unique index but no team/slug constraint. Team duplication checks both namespaces and serializes other copies; legacy team creation/PATCH do not share that lock. Different owners can rename team types to the same booking URL. Requires database/API repair and concurrency tests. | pending B2 |
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
| H02 | Clipboard success/failure feedback | differs | P2 | Event-card Copy link now awaits the clipboard result and reports a failed/missing clipboard instead of false success. Other copy controls still need a full audit. Browser rejection scenarios are authored but unexecuted. | pending B2 |
| X01 | Empty states across authenticated screens | unverified | P2 | Capture with a fresh disposable account and no seeded data. | pending B2 |
| X02 | Loading/skeleton states across screens | unverified | P2 | Capture slow requests; avoid interpreting network failure as empty data. | pending B2 |
| X03 | Error states, 404 and inaccessible resources | unverified | P1 | Next default not-found handling; compare custom routes and status codes. | pending B2 |
| X04 | Accessibility: labels, keyboard, dialogs, contrast | differs | P2 | Event titles have native edit buttons; new overflow menu implements arrow/Home/End navigation, Escape/Tab dismissal and focus return. Event editor adds initial/return focus; full dialog focus containment, other dialogs, icon buttons and real keyboard/browser verification remain outstanding. | pending B2 |
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
| T11 | Scheduled group capacity and locked event settings | differs | P1 | [Original group documentation](https://calendly.com/help/group-event-type-overview) distinguishes per-meeting capacity from future defaults and locks duration/location after booking. Local fix snapshots group capacity and adds owner-scoped per-meeting invitee-limit editing (2–9999), separate from future defaults. The editor/API now lock duration/location after the first booking, including cancelled/past bookings; changing the kind cannot bypass the lock. Reservation/edit interleavings and duplication into an independently editable group are tested locally. Remaining-seat display settings, language settings and grouped timeline presentation are missing. Legacy limits are approximated once from current settings/attendance. | pending B2 |

## Constraints and potential exceptions

- **EX2 — Marketing scope (user-confirmed 2026-10-15):** Only homepage and login require marketing parity. Pricing, calculator, separate signup styling and other marketing pages are excluded. This does not remove logged-in features or their paid-plan equivalents from scope.

- **EX1 — Free replica economics (user-confirmed 2026-10-15):** All replica features are free. Original subscription prices, paid tiers/add-ons, upgrades and time-limited trials must not be recreated. The free equivalent is full access with truthful pricing/access copy. This exception covers economic restrictions only; it does not excuse missing features, visual discrepancies, broken behavior or fake integrations. Existing host booking-payment/Stripe behavior is outside the authorized modification scope.
- **EX3 — Email and Google authentication only (user-confirmed 2026-10-15):** Microsoft signup/sign-in and enterprise SSO are intentionally excluded. Email/password and Google are the supported account methods. Microsoft/Outlook calendar OAuth is a separate integration and remains available. Firebase project/provider configuration and secrets were not changed.
- Preserve the independent name/logo and disclaimer. Recreate visual assets and use licensed fonts. This is a user-required boundary; exact trademark/asset equivalence is not a target.
- Payment/Stripe and secrets are excluded from modification by the user. Pricing presentation may be compared without altering payment behavior.
- Free-equivalent limitations must be verified individually. No unavailable feature has yet been excused just because the reference charges for it.
- Beyond EX1, EX2, EX3 and the explicit asset/payment boundaries, no product limitation is approved as a completion exception. Live behavior and screenshots are still required before certifying matches.

## Verification log

Latest combined local review stack, 2026-10-15: **241 tests in 21 files pass**, standalone TypeScript passes, production build passes. This combines the email/Google restriction, website telemetry, screenshot-informed dashboard styling and group invitee-limit changes. Each logical area retains its own local branch/commit. Lint and controlled browser comparison remain blocked; there is no new remote publication. The separate dashboard preview worktree serves the UI/auth/analytics changes locally with telemetry disabled.

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
| Saved booking buffers and cross-event protection | [Draft PR #14](https://github.com/tommy-muckstack/calendlyisdead/pull/14) | Eleven pre-change failures reproduced. All 187 tests, TypeScript and production build pass, with sixteen new regressions. No production migration or publication. Lint/browser/PostgreSQL verification remains pending. |
| Email and Google authentication only | [Draft PR #15](https://github.com/tommy-muckstack/calendlyisdead/pull/15) | Microsoft signup/login removed per EX3; the server accepts only password/Google tokens and shared cookies. Twelve pre-change failures reproduced; all 199 tests, TypeScript and production build pass. Browser evidence and lint remain blocked. |
| Shared website PostHog taxonomy and capture | [Draft PR #16](https://github.com/tommy-muckstack/calendlyisdead/pull/16) | User-requested telemetry for US project 666931: app-scoped pageviews, signup clicks and auth outcomes. All 225 tests (26 new privacy/environment cases), TypeScript and production build pass. Delivery disabled locally; production activation/browser payload inspection and lint remain pending. |
| Dashboard spacing and Material Symbols | [Draft PR #17](https://github.com/tommy-muckstack/calendlyisdead/pull/17) | Compared user-supplied desktop image and source styles; adjusted header/tabs, search/cards, panel gaps and mobile wrapping. Locally bundled Google icons with attribution. TypeScript/build and local production HTTP smoke pass; before/after browser verification and lint blocked. |
| Group session capacity and invitee-limit editing | [Draft PR #18](https://github.com/tommy-muckstack/calendlyisdead/pull/18) | Four pre-change failures reproduced. All 203 tests, TypeScript and production build pass, including 15 capacity/API/race cases and a migration case. Browser/lint/PostgreSQL contention checks remain pending. |
| Executable lint and typecheck commands | [Draft PR #19](https://github.com/tommy-muckstack/calendlyisdead/pull/19) | Next.js Core Web Vitals and TypeScript presets run successfully: zero errors, 280 warnings at this commit. All 241 tests, TypeScript and production build pass. Existing type/hook/image warnings remain visible. |
| Group event duration/location locks | [Draft PR #20](https://github.com/tommy-muckstack/calendlyisdead/pull/20) | Nine pre-change failures reproduced. All 256 tests, TypeScript and build pass; lint has zero errors and 278 warnings. Fifteen new cases cover field locks, ownership, cancellation/history and both edit/reservation orderings. UI screenshots and multi-connection PostgreSQL testing remain pending. |
| Delete event types without deleting meetings | [Draft PR #21](https://github.com/tommy-muckstack/calendlyisdead/pull/21) | Eight pre-change failures reproduced. All 270 tests, TypeScript and build pass; lint has zero errors and 278 warnings. Thirteen deletion/history/race cases plus an index-migration case cover retained meetings, reminders, managed copies and link reuse. Browser/PostgreSQL contention remain pending. |
| Event-card menu and template duplication | `feat/event-type-duplication` / local only | All 284 tests, TypeScript and production build pass. Lint has zero errors and 276 warnings. Fourteen new database/selector cases and twelve authored 1440px/390px browser scenarios; browser execution remains blocked. Delegated permissions and team-wide link uniqueness remain open. |

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

### Email and Google authentication only

The user explicitly restricted login and signup to email/password and Google (EX3). Removed the Microsoft placeholder from the shared auth form, replaced the desktop/mobile homepage signup choices with shared real links, and removed unsupported enterprise SSO claims. Microsoft/Outlook calendar integrations remain separate and unchanged. AGENTS.md records the scope for later work.

The server previously accepted any Firebase provider. Twelve regression cases demonstrated successful Microsoft, SAML/OIDC, anonymous, custom and missing-provider token exchanges, plus acceptance of shared cookies for those providers. Session creation now checks the verified sign-in provider before issuing a cookie or provisioning an app user; shared-cookie verification applies the same rule even for an account with a linked Google identity. Existing email and Google account creation, verified-email linking and sign-out tests continue to pass. No Firebase project/provider settings or secrets changed.

All 199 unit/integration tests, standalone TypeScript and the production build pass. Mobile data comparison confirms only the replaced auth items and unsupported SSO claim changed. Lint remains unavailable (missing script); browser screenshots, focus behavior and live-provider sign-in remain blocked by B2. This is a locally verified implementation of the user's exception, not a visual parity certification. No push, PR or deployment was performed.

### Website PostHog integration

User-requested operational instrumentation, separate from host-facing meeting analytics. [docs/ANALYTICS.md](ANALYTICS.md) defines the reusable website/app/platform/surface/schema taxonomy, event trigger semantics and subapp rollout. Standard `$pageview` and `website_*` auth/CTA events carry `site_id=yourappisdead` and `app_id=calendlyisdead`. Only CalendlyIsDead is instrumented in this branch; the main website and other app repositories are unchanged.

The SDK loads only on explicitly allowed production hosts with a configured capture token. Development, preview, DNT/GPC and the explicit disable switch prevent initialization/delivery. A final event/property allowlist removes raw URLs, dynamic route identifiers, referrers, names, emails, form values, arbitrary error text and person updates. Replay/autocapture/automatic exceptions/logs/remote feature loading are disabled. The anonymous same-tab identity is not an authenticated user or cross-device retention metric. Auth completion is a completed helper/session exchange, not proof of a new account or email delivery.

All 225 unit/integration tests pass, including 26 new route-redaction, payload, taxonomy, environment, deduplication and SDK-failure cases. Standalone TypeScript and the production build pass. Lint is still missing; browser payload inspection is blocked by B2. SDK calls are mocked during tests; no test events were sent to PostHog. The supplied US-project capture token is only in ignored `.env.local`, with delivery disabled. No remote configuration, billing, push, PR or deployment changed. Live ingestion after activation uses the existing project's usage/billing and is not guaranteed cost-free.

### Dashboard spacing and icons

Compared the user's 3440×1141 desktop side-by-side image with the local shell/card styles. The reference and replica occupy different widths; the central content column is fluid, so its absolute width is not treated as a defect. [Detailed before/after style changes](parity/dashboard-spacing.md) cover heading/action size, header/tab height, sidebar padding, search/avatar/card spacing, panel gaps, onboarding row height and responsive card wrapping. Replaced hand-drawn navigation/action/onboarding symbols with locally bundled Google Material Symbols Outlined (Apache-2.0), including source blob hashes and license. Event titles now offer a native keyboard-focusable edit button.

This is a source/style implementation informed by the supplied screenshot, not measured browser parity. Native Playwright WebKit was attempted as another browser fallback and aborts before page creation in both normal and escalated execution. TypeScript and the production build pass; lint remains unavailable. Controlled 1440px/390px before/after screenshots, computed styles and keyboard interaction still require B2 to be resolved. A local production HTTP smoke verifies homepage email/Google links, demo session creation, authenticated dashboard markup, Material Symbols and responsive CSS delivery. Existing missing navigation features, sidebar collapse, onboarding actions/counts and menu differences remain open; no row is certified as a match. Changes remain local.

### Group session capacity and invitee-limit editing

Reference: [original group event behavior](https://calendly.com/help/group-event-type-overview), updated October 13, 2026. Changing future defaults does not change an already scheduled session; hosts can edit the individual meeting's limit, between 2 and 9,999. Four pre-change tests showed existing sessions gained/lost capacity when defaults changed, cancellation broke retained limits and last-seat requests were rejected incorrectly.

Each reservation now stores its session's invitee limit. New attendees inherit it, and slot generation uses saved capacity. Cancelling one attendee preserves the limit on surviving reservations; cancelling every attendee allows a new session to use current defaults. Seat allocation counts attendees and finds a vacant seat rather than depending on the largest occupied seat number. Meeting details expose a host-only invitee-limit dialog/API. Edits lock the host like reservation creation, update every confirmed attendee of only that session, and reject limits below current attendance. Other hosts cannot read/edit the setting. The event editor now permits group limits from 2 to 9,999 for future meetings.

Migration limitation: legacy bookings lack historical capacity. The idempotent backfill uses the larger of current event settings and confirmed attendance once, preserving already saved values. It cannot reconstruct prior limits. No production migration was run.

All 203 unit/integration tests pass, including fifteen new capacity/API cases and one migration case. They cover default changes, cancellations/reuse, high seat numbers, owner authorization, invalid values, separate sessions, concurrent final seats, and edit-vs-booking competition using isolated local PGlite. Standalone TypeScript and production build pass. Lint remains unavailable, while real PostgreSQL contention, dialog focus/keyboard behavior and browser screenshots remain pending. Provider delivery is stubbed; no paid services or remote publication. Post-booking field locks, invitee remaining-spots display options and grouped meeting-list presentation remain open under T11.


## Local tooling fix — executable lint check

Added `npm run lint` and `npm run typecheck` with the [Next.js 15 ESLint configuration](https://nextjs.org/docs/15/app/api-reference/config/eslint). The installed `eslint-config-next` matches Next 15.5.28. Dependencies came from the local npm cache; no service was provisioned. JSX punctuation was escaped without changing rendered text, test import variables were renamed to avoid Next's reserved `module` name, and existing footer links now use the framework link component. Their placeholder destinations remain an open finding under L06/L07.

Lint completes with **zero errors and 280 warnings**: 257 existing explicit-`any` occurrences, plus unused variables/expressions, hook dependencies, raw image elements and one anonymous config export. The explicit-`any` rule is intentionally warning-level to keep the initial tooling patch separate from a repository-wide model/type rewrite; every finding remains visible. This is not a warning-free result. The full **241-test suite**, standalone TypeScript check and production build pass. No new visual matches are claimed; screenshots remain blocked by B2. Publication is now authorized; see the October 16 verification below.


## Local group-event fix — settings locked after the first booking

Compared against the [original group-event documentation](https://calendly.com/help/group-event-type-overview), updated October 13, 2026: duration and location become immutable once a group event has been booked. The local API previously accepted these edits, and a request already past its availability check could reserve an obsolete duration or location. Nine assertions reproduced the failures before the fix.

The editor now disables duration/location and the type switch, with gray fields and an accessible explanation. The server checks booking history and rejects protected changes atomically with HTTP 409, returning only the owner's current setting values. The type switch is also locked to prevent bypassing those restrictions. Unchanged protected values can accompany edits to titles, limits and other fields. The editor restores current protected values if a booking occurred while it was open, retaining unrelated edits for the next save. Dashboard lock metadata is owner-scoped and includes cancelled/past bookings; interpreting the documented “once booked” restriction as permanent still needs an authenticated original UI check.

Personal event edits share the host reservation lock. Bookings recheck the group's core settings after acquiring that lock, rejecting a stale reservation if an edit committed first. Tests force both orderings using transaction gates. All **256 tests in 22 files** pass, including fifteen new cases; TypeScript and production build pass. Lint completes with **zero errors and 278 warnings**, down from the initial tooling baseline. Calendar/email/workflow delivery is stubbed and test addresses are reserved; no remote data or paid services were used.

Remaining limits: no browser before/after captures or keyboard verification (B2), no multi-connection PostgreSQL contention run, and no reconstruction of historical group details that may have changed before this fix. The event language and duplicate-event controls are still missing; the editor directs users to create a new event type. Remaining-spot display options and grouped timeline presentation are also open under T11. No payment/Stripe or secret changes. Publication is now authorized; see the October 16 verification below.


## Local event-deletion fix — preserve scheduled meetings

Reference: [original event-type management](https://calendly.com/help/how-to-organize-and-manage-your-event-types), updated August 24, 2026, specifies that deleting a template leaves scheduled meetings intact. Source inspection found `ON DELETE CASCADE` from event types to bookings and then to reminders; eight pre-change tests reproduced data loss and lost conflict protection.

Deletion now marks the type deleted and unavailable while retaining the definition needed by historical bookings, confirmations, cancellations, notifications and analytics. Current-type selectors exclude deleted records across scheduling, public pages, team editing, routing, embeds, assistant suggestions and single-use-link creation. Managed-template deletion removes its assigned copies atomically; unassignment also preserves existing meetings, and later propagation cannot rewrite those retained definitions. Managed assignment and deletion share a transaction lock. Reservations hold a shared template lock and recheck availability/deletion before committing.

An idempotent migration changes link uniqueness to apply to current types, so a new event can reuse a deleted link. Old bookings remain attached to the original ID. Reschedule tokens cannot silently move an old booking to a replacement event at the same URL. A deleted-type reschedule request currently shows an explanation and a link back to the retained meeting; exact original behavior for that state still requires authenticated browser verification. The personal editor only removes a card after a successful DELETE response and reports an uncertain result on failure.

Validation: **270 tests in 23 files pass**, including thirteen deletion cases and one migration case. The tests cover personal/group/collective meetings, owner/team permissions, dashboard selectors, cancellation, retained and subsequently delivered reminders through a mocked mail transport, managed unassignment/reassignment, reused slugs, stale reservations/assignments and replayed startup. TypeScript and production build pass; lint reports zero errors and 278 warnings. Vitest now transforms JSX so the real server-page selectors and the deleted-type reschedule response can be exercised; this is not a browser test.

No production migration, actual mail/calendar delivery, payment-code change, secret change or publication occurred. Browser screenshots, keyboard/error-state checks and multi-connection PostgreSQL contention remain pending. No restoration UI is added. Meetings already removed by the previous cascade cannot be reconstructed by this migration. The overflow menu/duplication work remains open under E15, and the newly verified event-kind conversion mismatch is recorded under E03.


## Local event-card menu and duplication

References: [original event management](https://calendly.com/help/how-to-organize-and-manage-your-event-types) establishes the overflow actions; [Calendly community cloning guidance](https://community.calendly.com/featured-tips-tricks-32/calendly-basics-cloning-event-types-3382) describes opening the copy in the editor and a link that does not follow later title changes. [Managed event guidance](https://calendly.com/help/how-to-create-and-assign-managed-events) includes admin duplication. These are documentation comparisons, not authenticated browser evidence.

Personal cards now expose View booking page, Edit, Add to website, Duplicate, Delete and On/Off. Duplication opens an independently editable copy and clears the dashboard filter so it remains visible. Failed or uncertain requests report an error without adding a phantom card; pending mutations disable menu triggers. Clipboard success is only announced after the write completes. Add to website carries the selected event into the embed builder, including turned-off types, with an explanation that they cannot yet accept bookings.

The authenticated API copies template fields and generates a distinct bounded link. It retains personal ownership or the original team/creator, copies collective/round-robin hosts and priorities, and copies managed template field locks without assigning the new template. An owned assigned event currently becomes an independent personal copy; that specific original behavior remains unverified. Bookings, reminders, historical group locks, usage and assignments are not copied. A booked group copy can change duration/location without altering the original session. Event-specific notification settings are not implemented (E08); inheritance of separately attached workflows still needs original verification and is not claimed here. Stored payment settings remain ordinary copied template data; no payment code or Stripe behavior changed.

Event insertion and copied hosts commit together; an injected host-insertion failure proves rollback and successful retry. Host replacement now holds a template lock and replaces the full list in one transaction, preventing duplication from seeing its intermediate empty state. Invalid host replacements preserve the prior host list. Team copies serialize each other and check owner/team link namespaces, but existing create/rename paths still lack a team-wide database constraint (E17). Multi-connection PostgreSQL contention is not verified by local PGlite tests.

The new menu uses the native popover top layer to avoid clipping inside the scrolling dashboard. Implemented keyboard behavior follows the [WAI menu-button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) and [menu interaction pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/): arrow/Home/End navigation, Escape/Tab dismissal and trigger focus return. Outside focus/click and viewport movement close the menu. The editor focuses its name field (or Close when locked) and returns focus on dismissal. This is implementation review, not a verified keyboard or accessibility pass; dialog focus containment remains open.

Validation: **284 tests in 24 files pass**, including fourteen new cases covering field copies, independent edits, booked groups, active state, repeated/concurrent link allocation, ownership/team permissions, managed copies, host rollback and embed selection. Standalone TypeScript and production build pass. Lint reports **zero errors and 276 warnings**. Twelve browser scenarios at 1440px and 390px are discoverable and independently typechecked, covering menus, viewport bounds, copy editing, failures, off-event embeds, clipboard denial and managed-template editing. Browser execution/captures remain blocked by B2; no screenshots or parity matches are claimed.

Remaining original menu features include per-event permissions (E16), internal notes, language/secret visibility, team statistics, hover sharing actions and bulk operations. No subscription restrictions were introduced. No original account was created, real email sent, secret changed, paid service provisioned or remote publication performed. This branch remains local under the publication hold.

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

### Email and Google authentication scope — publication verification, October 16

Fresh isolated checkout: 199 unit/database tests in 19 files, production build and standalone TypeScript pass. Twelve provider-policy regressions verify rejecting unsupported token exchanges and shared cookies before user/session creation, including linked-Google accounts. Existing supported authentication and account-linking tests pass. npm run lint was attempted but the historical base lacks its script; tooling is a later pending change. Dependencies were reused locally. Live Firebase/Google sign-in, native focus and homepage/auth screenshots remain unverified. Microsoft calendar integration remains supported; no Firebase settings, credentials or payment behavior changed.

The product files are unchanged from local source commit `144bae3208c6b48de4a3897b4f73f561dc3b4c3f`. Only contributor/report publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.

### Shared website PostHog taxonomy — publication verification, October 16

Fresh isolated checkout: 225 unit/database tests in 20 files, production build and standalone TypeScript pass. Twenty-six added cases verify route/URL redaction, payload allowlists, shared taxonomy, environment/hostname restrictions, pageview deduplication and SDK failure isolation. SDK calls are mocked; local/preview delivery is disabled and no events were sent to project 666931. npm run lint was attempted but the historical base lacks the script; tooling is a later change. Dependencies were reused locally. Real browser payload inspection, live ingestion and production configuration remain unverified/unperformed; publication does not activate telemetry or guarantee zero ingestion cost.

The product files are unchanged from local source commit `cfc8320ef2a41dc7646b66ad1128a0b3ee15032a`. Only documentation/publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.

### Dashboard spacing and Material Symbols — publication verification, October 16

Fresh isolated checkout: 225 unit/database tests in 20 files, production build and standalone TypeScript pass. No new unit tests were added for CSS/icon substitutions. The supplied side-by-side image informed source-style adjustments; its unequal widths cannot establish 1440px/390px parity. Google Material Symbols are bundled locally with Apache-2.0 attribution/source hashes. npm run lint was attempted but this historical base lacks its script; tooling is a later change. Dependencies were reused locally. Controlled before/after captures, computed styles, focus, overflow and responsive behavior remain unverified; QA #11–#14 and later assistant-icon viewport correction remain open.

The product files are unchanged from local source commit `55abd9699e34554c6a13d242b317f79d7dac5c8c`. Only documentation/publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.

### Saved group-session capacity and invitee-limit editing — publication verification, October 16

Fresh combined checkout: 241 unit/database tests in 21 files, production build and standalone TypeScript pass. Sixteen added capacity/API/migration cases cover future-default changes, retained session limits, cancellation/reuse, high seat numbers, ownership, validation, separate sessions, concurrent final seats and edit-versus-booking. Legacy rows use a one-time current-capacity/attendance approximation because historical limits were not stored. No production migration was run. npm run lint was attempted but this historical base lacks its script; tooling is next. Dependencies were reused locally. Real PostgreSQL contention, native dialog/focus behavior and original screenshots remain unverified.

The product files are unchanged from local source commit `a174f08d11174f911cd358d6e27170f20e9fbef6 (with documentation-only a047582)`. Only documentation/publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.

### Executable lint and typecheck commands — publication verification, October 16

Fresh isolated checkout: 241 unit/database tests in 21 files, production build, standalone TypeScript and npm run lint pass. Lint reports zero errors and 280 existing warnings, not a warning-free result. Next.js Core Web Vitals/TypeScript rules remain active; explicit any is warning-level during incremental cleanup. The change escapes JSX text, uses framework links and renames reserved test variables without inventing destination fixes. Dependencies were reused locally. Browser evidence remains unavailable. This tooling change resolves the missing lint command for descendants; earlier PR snapshots remain accurately documented as lacking it.

The product files are unchanged from local source commit `e846f26dd626ce549635dc1a6f0b262bb9e8e332`. Only documentation/publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.

### Group-event settings after booking — publication verification, October 16

Fresh isolated checkout: 256 unit/database tests in 22 files, production build, standalone TypeScript and lint pass; lint has zero errors and 278 existing warnings. Fifteen added cases cover protected duration/location/type, owner-only metadata, cancelled/past history, unrelated edits and both edit-versus-reservation orderings. Original permanence semantics, native disabled-field/focus behavior, before/after screenshots and PostgreSQL multi-connection contention remain unverified. Dependencies were reused locally; external side effects are stubbed.

The product files are unchanged from local source commit `e71d2271ea9b91ebb6cc8270cee3d8f7c5a9a076`. Only documentation/publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.

### Retain meetings when deleting event types — publication verification, October 16

Fresh isolated checkout: 270 unit/database tests in 23 files, production build, standalone TypeScript and lint pass; lint has zero errors and 278 existing warnings. Thirteen deletion cases and one migration case cover retained bookings/reminders/history, public/current selectors, cancellation, managed assignment/unassignment, reused links and stale reservations/assignments. Eight pre-fix assertions reproduced loss from cascading deletion. No production migration ran; already lost records cannot be recovered. Browser/original reschedule behavior and real PostgreSQL contention remain unverified. Dependencies were reused locally; mail/calendar effects are mocked.

The product files are unchanged from local source commit `306e5f09598411cd182462401e8512f03fa606d7`. Only documentation/publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.

### Event-card menu and independent duplication — publication verification, October 16

Fresh isolated checkout: 284 unit/database tests in 24 files, production build, standalone/E2E TypeScript and lint pass; lint has zero errors and 276 existing warnings. Fourteen added database/selector cases cover personal/group/team/managed copying, ownership, independent settings/hosts/locks, collision handling and transaction rollback. Twelve menu scenarios at 1440px/390px are authored/discovered but unexecuted. QA #14 is only partially addressed: exact menus, user-row actions, ordering and styling remain open. Delegated permissions, team-link namespaces, copied-workflow behavior and native keyboard/focus comparison remain unverified or separate later work. Dependencies were reused locally.

The product files are unchanged from local source commit `3b1612f8f9f582a590b9f34df1d8b21f50d2a7e1`. Only documentation/publication metadata differs. This is a scoped draft on the preceding review branch; no before/after screenshots, native interaction or visual match are claimed. The browser runtime still cannot start. No secrets, test databases, outbox or raw logs are published.
