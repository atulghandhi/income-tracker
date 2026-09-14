# Income Tracker brand assets

`public/icon.svg` is the editable vector master: an ivory wallet with a half-visible mint coin and dark teal rim on the app's deep navy background. It uses paths and shapes, with no fonts or embedded raster images.

Run `npm run build:icons` after editing it (requires `brew install librsvg`). This exports the 240px PNG fallback, 180px Apple touch icon, 192px and 512px PWA icons, and the 1024px iOS app icon. It also copies the SVG into the iOS `BrandLogo` asset used by onboarding, with vector preservation enabled.

The iOS and PWA exports have an opaque, square background so the operating system can apply its own icon mask. The web SVG has rounded corners. Keep the wallet inside the central maskable safe area.

Existing web headers, authentication screens, generated content favicons, and search metadata reference `/icon.svg` or `/icon.png` and share the same artwork. Social preview artwork contains no separate logo. The legacy sibling `income-tracker-app` web checkout has the same master and web exports; regenerate those separately when updating that checkout.
