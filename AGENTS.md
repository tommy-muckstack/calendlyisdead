# CalendlyIsDead contributor guidance

## Establish the baseline

- Read `README.md`, `docs/PLAN.md`, and `docs/PARITY_REPORT.md` before changes.
- Inspect the checked-out source and current remote before assuming the stack or deployment. Current main uses Next.js 15, shared Firebase Authentication, Drizzle and Postgres/PGlite. Do not migrate authentication or storage based on an outdated task description.
- Keep unrelated working-tree changes intact. Use an isolated branch or worktree per logical fix.
- There is currently no `.env.example`. Local demo development works without credentials; `npm ci` and `npm run dev` use PGlite. Routes default to `/calendlyisdead`; Firebase sign-in needs configured credentials. Never copy production configuration into tests.

## Parity workflow

- Publication resumed (2026-10-16): the new CALENDLYISDEAD_FIX_PROMPT.md explicitly requests small PRs, superseding the earlier inferred hold. Publish scoped draft PRs with verification gaps stated; never merge. Keep test data and credentials local. Existing GitHub/Vercel automation may run on publication; do not provision paid services or claim hosting/AI use is cost-free.

- Current scope (user-confirmed 2026-10-15): marketing comparison covers the **homepage and login page only**. Pricing and other marketing pages are excluded. All logged-in functionality remains in scope, including original paid capabilities. Keep end-to-end invitee booking, confirmation, cancellation and rescheduling checks as core scheduling verification.

- Authentication scope (user-confirmed 2026-10-15): support **email/password and Google only** for signup and login. Do not add Microsoft sign-in or enterprise SSO. This does not remove Microsoft/Outlook calendar integrations.

- The replica is **completely free**. All replica features must remain available without subscriptions, paid tiers, upgrade prompts or trial limits. Original prices and feature gates are intentional economic differences, not behavior to reproduce. Do not introduce fake checkout or sales flows.
- Paid capabilities on the original are explicitly **in scope**: implement their functionality and make access free. A paid label is never grounds to omit a feature. For an unavoidable paid-service dependency, build the closest working free equivalent and document its precise limitation; do not substitute a disabled control or promotional placeholder.
- Compare the live original and clone in a real Playwright browser at **1440px** and **390px** widths. Record date, viewport height, browser version, URL, state and source commit.
- Capture original, clone-before and clone-after screenshots, plus computed styles for the relevant elements. Include hover, focus, open menus, validation, loading and error states where applicable. `scripts/parity-capture.mjs` captures an initial page at both widths; it does not replace interactive flow testing.
- Update `docs/PARITY_REPORT.md` in every parity PR. A `match` requires evidence for the stated scope. Source inspection or passing tests alone does not establish visual or behavioral parity.
- Keep untested work explicitly `unverified`. Environmental blockers are not justified product exceptions. Document a genuine exception with its reason, closest working equivalent and remaining limitation.
- One PR per logical area. Explain the user-visible problem, changes, what was compared, before/after evidence, verification and remaining gaps. Open PRs for review; **do not merge**.
- Optional investigation reference supplied by the user: [morluto/rea](https://github.com/morluto/rea). Its browser-observation and capture-comparison workflows may help document behavior. Use it as audit tooling, preserve its license if code is reused, and keep implementation independent of proprietary target code. It does not replace real browser testing.

## Accounts, data and assets

- Use disposable test accounts and addresses. Never use Google or Microsoft sign-in on the original during this audit. Stop at CAPTCHAs or other access barriers and report them.
- Do not enter payment details, send messages to real people, or modify payment/Stripe behavior or secrets.
- Local mail uses `.data/outbox/` without provider credentials. Verify mail transport before any booking, invitation or notification test. Use reserved test addresses locally.
- Keep `.env*`, account credentials, session/storage-state files, mail tokens, private screenshots and logs out of commits. Raw capture output defaults to ignored `.data/`; inspect and redact evidence before adding it to `docs/parity/`.
- Recreate assets or use appropriately licensed alternatives. Keep license attribution. Use OFL fonts where proprietary fonts need a substitute. Do not copy Calendly's proprietary code, stylesheets, assets, logos or marks beyond the existing repository usage. Preserve the existing independence disclaimer/footer.
- Do not add fake testimonials, fabricated usage counts, decorative controls that imply unsupported functionality, or false success messages.

## Verification

- Run lint, TypeScript checking and production build before each PR, plus focused behavioral tests for changed logic. Report failed or unavailable checks honestly.
- Current commands: `npm test`, `npx tsc --noEmit --incremental false`, `npm run build`, `npm run e2e`. This snapshot has **no lint script/configuration**; that is an open tooling gap, not a passing lint check.
- Existing E2E configuration deletes `.data/e2e` and `.data/outbox` and starts its own server. Use a dedicated checkout with only disposable data for it.
- Test timezone/DST boundaries, buffers, notice, daily/weekly limits and simultaneous conflicting bookings when changing scheduling logic. Verify email/ICS artifacts locally.
- Check keyboard access, focus visibility/return, labels, overflow, empty/loading/error states, and browser console/network errors for UI changes.
- Do not label a PR fully validated when required browser evidence or checks are blocked. Record the exact blocker and the next concrete check.
