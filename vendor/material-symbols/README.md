# Google Material Symbols

Locally bundled subset of [Google Material Symbols Outlined](https://github.com/google/material-design-icons), licensed under Apache-2.0 (see LICENSE). Retrieved 2026-10-15. No remote font or runtime asset requests.

Modified representation: SVG path data is wrapped in reusable React components in `components/app/icons.tsx`, using currentColor, configurable pixel size and decorative accessibility attributes. Paths retain Google's geometry. These are general interface symbols, not Calendly assets.

Source file URLs and Git blob hashes are recorded in `sources.json` for reproducibility.

The `auto_awesome` source uses a native 24 × 24 coordinate system. Its React
wrapper uses `0 0 24 24`; the other bundled symbols use `0 -960 960 960`.
Preserving each source's coordinates prevents clipping when sizing the SVG.

The `work` symbol was added for Opportunities on 2026-10-16, from the official Google repository using its recorded blob hash.
