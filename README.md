# The Income Tracker

A local-first income and expense tracker for the web and iOS, live at [theincometracker.com](https://www.theincometracker.com). Your data stays in your browser by default, with optional cloud sync through Supabase.

## Countries

The app is built for the UK by default and has a dedicated US experience. Pick a country from the
dropdown in the top bar (or in Settings › Country & currency); the first visit guesses it from the
browser's time zone and language.

- **United Kingdom** (and every other country) — the original UK-geared app. Other countries only
  change the currency symbol.
- **United States** — American language and spelling, US account types (checking, HYSA, CD, money
  market, HSA/FSA, 401(k)/403(b), traditional and Roth IRA, 529, brokerage, auto/student loans,
  mortgages), FICO/VantageScore credit bands, month-first statement dates, and US tools: a federal +
  state + FICA gross-to-net estimate, contribution limits with employer match, federal student-loan
  repayment plans, and medical spending against a plan's deductible and out-of-pocket maximum.

Both regions share the same plan machinery: every retirement / tax-advantaged account can carry
optional plan details (tax treatment, whether contributions come from pay or from the bank, % of pay,
employer match or fixed employer contribution, annual limits with catch-up, term), and UK users get
workplace pensions, SIPPs, LISAs, PAYE/NI/student-loan take-home estimates and ISA/pension allowance
tracking for parity. Estimates are clearly labelled as estimates — nothing here is tax advice.

Bank data comes in through Settings › Import data: CSV, OFX and QIF exports, pasted transaction lists,
and PDF statements. PDFs are read in the browser with pdf.js (nothing is uploaded): the parser
rebuilds the transaction table from the text's positions, so one layout-driven importer covers the
major UK banks (Barclays, HSBC, Lloyds, Halifax, NatWest, Santander, Nationwide, TSB, Monzo,
Starling, Revolut, Chase, first direct, Metro Bank, Virgin Money, American Express) and most US
banks, and every format lands on the same review screen. A PDF it cannot read (a scanned image,
say) gets a clear message; pasting the rows still works as a fallback.

Each page has its own URL (`/dashboard`, `/ledger`, `/accounts`, `/goals`, `/allocate`, `/insights`,
`/settings`), so a refresh stays put. The Dashboard and Insights pages are customisable: **Customise**
lets you drag, resize, remove and add widgets; the arrangement is saved per device and region.

**Allocate** (`/allocate`) decides where spare money goes. It takes the ledger's spare-per-month figure
and an optional one-off lump sum (a bonus, a refund) and splits them between the debts on Accounts, a
cash buffer, a tax bill and savings under a priority the user picks: least interest (avalanche), lower
payments soonest, quick wins (snowball), credit-score recovery (card utilisation down first), cash
buffer first, tax bill first, balanced (only overpay debts that cost more than savings earn) or a
custom percentage split. Savings have their own priority (highest safe rate, highest expected return,
tax wrappers first, or the goals on the Goals page). Every strategy is simulated month by month with
the same promo-aware compounding as the net-worth forecast and compared against paying minimums only:
total interest, debt-free date, committed payments, card utilisation, buffer and net position, with
charts of the lump-sum split and the debt path. Mortgages and UK student loans start outside the plan
and can be switched in. UK users can mark a lump sum as taxable (freelance income, rental profit,
interest, dividends or a capital gain): the tax to set aside is worked out from the salary already
taxed through PAYE and anything already received this tax year, held back before anything is
allocated, and shown with its Self Assessment due date (`src/lumpSumTax.ts`, pinned by
`tests/lumpSumTax.spec.ts`). A **Debt payoff plan** widget on Insights (and in the Dashboard tray) shows the
chosen plan's headline figures and this month's move. The page is an illustration from the user's own
figures, not advice: it says so, carries the standard assumptions, and links free debt help (MoneyHelper,
StepChange, National Debtline and Citizens Advice in the UK; the CFPB and NFCC in the US).

## Repository layout

- `src/` – the React + Vite web app
- `public/` – static pages, guides and PWA assets
- `scripts/` – content generation, prerendering, SEO checks and icon builds
- `supabase/` – database migrations and edge functions
- `ios/` – the native iOS app (see [`ios/README.md`](ios/README.md))
- `tests/` – Playwright end-to-end tests (`tests/fixtures/statements/` holds synthetic PDF bank statements)
- `docs/` – product, branding and planning notes

## Running locally

```bash
npm install
npm run dev
```

Every environment variable is optional. Copy `.env.example` to `.env.local` and fill in only the features you want; anything without its variable stays hidden. To point the app at your own Supabase project, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

With `npm run dev`, a browser profile that has never used the app starts on a filled-in sample
ledger for the detected country (US or UK), so every screen can be tried straight away. Add
`?sample=us` or `?sample=uk` to the URL to load the other country's sample over whatever is stored,
or `?sample=blank` to start empty. This is a development aid only: production builds never load it,
and automated browsers start blank unless they ask for a sample.

Other useful commands:

```bash
npm run build      # generate content, build, prerender and run SEO checks
npm test           # Playwright end-to-end tests
npm run test:calc  # the calculation suites only (projections, tax, retirement, loans, layouts)
npm run test:seo   # static-site checks against a production build (separate config and server)
```

The calculation suites (`tests/finance.spec.ts`, `tests/finance-baseline.spec.ts`, `tests/tax.spec.ts`,
`tests/retirement.spec.ts`, `tests/loans.spec.ts`, `tests/allocate.spec.ts`, `tests/lumpSumTax.spec.ts`, `tests/region.spec.ts`,
`tests/widgets.spec.ts`) pin
every figure by hand from the published rules, so a change to a bracket, threshold or forecast shows up
as a failing number rather than a vague regression. `tests/us-experience.spec.ts` drives the US and UK
flows end to end; `tests/allocate-page.spec.ts` drives the Allocate page and its widget.

`tests/pdfImporter.spec.ts` parses the synthetic statements in `tests/fixtures/statements/` (Barclays,
HSBC, Monzo and NatWest statements, each with a different table layout, plus two PDFs that must be refused)
and checks row counts, dates, signs and names against the figures printed on them; `tests/pdfImport.spec.ts`
drives the upload, review and announcement in the browser. The fixtures are generated, not scanned:
`npm run build:fixtures` rewrites them byte-for-byte from `scripts/build-statement-fixtures.mjs`, so a
layout tweak is a code change with a diff.

On a sandbox without Playwright's browser download, point `PW_CHROMIUM_PATH` at any Chromium binary.

## Licence

Released under the [MIT License](LICENSE). The licence covers the code; it does not grant use of the name "The Income Tracker" or its logo for your own product.
