# Dashboard spacing and icon review — 2026-10-15

Reference: user-supplied desktop side-by-side screenshot, 3440×1141 pixels. Original is on the left; replica is on the right. The two viewport widths differ and browser zoom/device scale are not established. The account/event data also differs. This evidence does not certify 1440px or 390px parity. The attachment contains account names and has not been committed.

The replica header and tabs pushed the search field and event list below the reference. Its heading/action buttons were larger, while onboarding rows were shorter. Hand-drawn symbols varied in silhouette, scale and color.

| Source style | Before | After |
| --- | --- | --- |
| Top account bar | 66px | 64px |
| Sidebar top padding | 0 | 16px |
| Main header top padding | 28px | 16px |
| Scheduling heading | 22px / 28px line height | 18px / 24px |
| Header action buttons | 40px high | 32px high |
| Tab spacing | 28px gap, extra top margin | 32px gap, no desktop top margin |
| Body top padding | 24px | 16px |
| Search-to-owner gap | 28px | 32px |
| Owner avatar / row gap | 28px avatar / 12px gap below | 32px / 16px |
| Main/onboarding panel gap | 8px | 16px |
| Onboarding panel width | 454px | 448px |
| Onboarding heading / row height | 22px / 92px minimum | 26px / 110px minimum |
| Event card layout | Flex row; mobile wrap | Grid with shrinkable content and separate mobile action row |
| Icon source | Individually drawn SVGs | Google Material Symbols Outlined, local SVG path subset |

The sidebar remains 256px; the main column fills the available width. Below 1280px the onboarding aside is hidden to preserve room for scheduling controls; at 900px the existing mobile navigation takes over. Mobile action buttons can wrap, long event titles wrap, search width is bounded by its container, and dynamic viewport height avoids mobile browser chrome clipping. These breakpoints need actual browser review.

Icons use currentColor, predictable sizes and decorative accessibility attributes. Focus rings cover buttons/links/inputs; the event title opens its editor through a native button, retaining pointer access through the card. [Material Symbols attribution](../../vendor/material-symbols/README.md) records the Apache-2.0 license and original source files.

Verification: standalone TypeScript, production compilation and diff checks. A local production-server HTTP smoke passed homepage email/Google link checks, demo session creation, authenticated dashboard rendering, Material Symbol markup, the accessible event-title edit control and responsive CSS asset delivery. This is not a visual or browser-interaction check. No new unit tests were added for CSS/icon substitutions. Playwright launch is blocked for all available engines, including the additional WebKit attempt. Before/after captures and keyboard checks remain pending. Existing feature/navigation/onboarding behavior gaps are tracked separately in PARITY_REPORT.md.
