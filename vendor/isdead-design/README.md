# isdead-design

Shared design system for the **IsDead** open-source clones: CalendlyIsDead, SuperhumanIsDead and WisprFlowIsDead. There is one package with one theme per product being replaced, so every clone's colors, radii, spacing, shadows, type scale and fonts match the original as closely as we can measure them. The art is original. We don't use logos, icons, illustrations or proprietary fonts from the originals.

Apache-2.0. Bundled fonts are under the SIL Open Font License 1.1 (see `fonts/*/OFL*.txt`).

## Layout

```
tokens/<theme>.json      source of truth: color, radius, space, shadow, type, control, font
css/<theme>.css          generated: @font-face + --ids-* CSS variables
css/components.css       component classes (.ids-btn, .ids-input, .ids-card, .ids-divider, .ids-nav, .ids-auth, .ids-hero, .ids-section, .ids-footer ...)
tailwind/preset.cjs      generated Tailwind preset mapped to the CSS variables (works for any theme)
src/index.tsx            React components: Button, LinkButton, Input, Label, Card, Divider, Pill, NavBar, AuthCard, Hero, Section, Footer
dist/                    compiled JS + .d.ts
swift/IsDeadTokens.swift generated SwiftUI tokens (superhuman, wisprflow) for the Mac apps
fonts/<theme>/           open-licensed font files per theme
templates/marketing-site.md   the one-homepage + /login + app template every IsDead site follows
scripts/build.mjs        regenerates css/, tailwind/ and swift/ from tokens/
```

## Themes and fonts

| Theme | Source | Font | Why |
|---|---|---|---|
| `calendly` | live calendly.com CSS (brand-2026 tokens), login screenshot, booking CSS | **Geist** (OFL) | calendly.com's 2026 marketing pages use Geist themselves. Their in-app Proxima Nova is proprietary and is not shipped. |
| `superhuman` | DuperHuman `docs/SUPERHUMAN_SPEC.md` (pixel-sampled live app) | **Inter** (OFL) | Superhuman's grotesk, SuperMailSerif and Adelle are proprietary. Inter is the closest open stand-in. |
| `wisprflow` | WisprFlowIsDead `docs/WISPRFLOW_SPEC.md` §10 (wisprflow.ai CSS) | **Figtree** body + **EB Garamond** display (both OFL) | These are the fonts Wispr Flow itself uses. |

Fonts register under an `IsDead ` prefix (e.g. `"IsDead Geist"`) so they never collide with system installs.

**Recreated lookalike fonts.** We tried MyMan's font workbench (`integrations/font-workbench`) for generating lookalikes from rendered type. It runs only inside the macOS app (Apple Vision OCR + WKWebView), so it can't be scripted here. For now the themes ship the closest open-licensed fonts. If a workbench-generated OTF is made later, drop it into `fonts/<theme>/`, point `tokens/<theme>.json` → `font.files` at it, and rebuild.

## Use

Web (Next.js or any bundler):

```ts
import "@isdead/design/css/calendly.css";   // one theme
import "@isdead/design/css/components.css";
import { AuthCard, Button, Input, Divider, NavBar } from "@isdead/design";
```

Add `data-ids-theme="calendly"` to `<html>` and the `ids-root` class to `<body>`.

Tailwind: `presets: [require("@isdead/design/tailwind")]`, then `bg-primary`, `rounded-xl`, `font-display`, and so on.

Vendoring, which is what CalendlyIsDead does so the Vercel build needs no registry: copy this repo to `vendor/isdead-design` and alias it with `"paths": { "@isdead/design": ["./vendor/isdead-design/src/index.tsx"] }`.

SwiftUI: add `swift/IsDeadTokens.swift` and the theme's fonts to the target, then use `IsDeadTheme.superhuman.primary` and so on.

## Develop

`npm i && npm run build` regenerates everything from `tokens/`. Edit the tokens, never the generated files.

## Status

- `calendly`: measured and applied across CalendlyIsDead.
- `superhuman`, `wisprflow`: **drafts** from the teardown specs. Superhuman's dark theme and Wispr's in-app chrome are still estimates. These aren't applied to those apps yet.

Not affiliated with Calendly, Superhuman or Wispr. All trademarks belong to their owners.
