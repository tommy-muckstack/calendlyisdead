# CalendlyIsDead tombstone mark

`tombstone-source.png` is the original image supplied and approved for the app's
identity by the project owner on 2026-10-15 ("Black Tombstone with Transparent X").
It is retained byte-for-byte. It is not a Calendly logo or a Google Material Symbol.

Run `node scripts/build-brand-icons.mjs` after installing the locked dependencies
to reproduce the exports locally. The script uses the image's alpha as the shape
and fills it with the existing app blue, `#006BFF`, through an SVG filter. The X
and background remain transparent; the Apple touch icon has a white backing.
No image-generation service, fonts, remote assets or additional packages are used.

Exports:

- `public/logo.svg`: self-contained SVG **container with a 512px bitmap**, used by
  the shared Logo, marketing header/login/signup wordmark, footer and SVG favicon.
  It is not a traced vector. Original canvas padding and proportions are retained.
- `public/favicon.ico`: transparent PNG entries at 16, 32 and 48px.
- `public/apple-touch-icon.png`: 180px icon on white for Apple home screens.
- `public/icon-192.png` and `public/icon-512.png`: transparent manifest icons.

Keep the CalendlyIsDead name and independence disclaimer. Customer-uploaded logos,
third-party provider logos and functional navigation icons have separate meanings
and are not replacements for this app identity.
