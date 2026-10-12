# The Income Tracker

A local-first income and expense tracker for the web and iOS, live at [theincometracker.com](https://www.theincometracker.com). Your data stays in your browser by default, with optional cloud sync through Supabase.

## Repository layout

- `src/` – the React + Vite web app
- `public/` – static pages, guides and PWA assets
- `scripts/` – content generation, prerendering, SEO checks and icon builds
- `supabase/` – database migrations and edge functions
- `ios/` – the native iOS app (see [`ios/README.md`](ios/README.md))
- `tests/` – Playwright end-to-end tests
- `docs/` – product, branding and planning notes

## Running locally

```bash
npm install
npm run dev
```

Every environment variable is optional. Copy `.env.example` to `.env.local` and fill in only the features you want; anything without its variable stays hidden. To point the app at your own Supabase project, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

Other useful commands:

```bash
npm run build   # generate content, build, prerender and run SEO checks
npm test        # Playwright end-to-end tests
```

## Licence

Released under the [MIT License](LICENSE). The licence covers the code; it does not grant use of the name "The Income Tracker" or its logo for your own product.
