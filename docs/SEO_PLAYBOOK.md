# SEO and AI-search playbook

How the content side of The Income Tracker is built, and the short list of things to do after each deploy. Everything here is deliberately boring: pages are plain HTML generated from data files, so adding a page is a 10-minute job and nothing depends on a CMS.

## How the pages are built

`npm run content` (also runs automatically before `npm run build`) executes `scripts/build-content.mjs`, which reads the data modules in `scripts/content/` and writes static pages into `public/`:

| Data file | Pages | Notes |
| --- | --- | --- |
| `banks.mjs` | `/import/<bank>-csv.html` + `/import/` hub | One page per bank. `steps` are HTML, everything else is escaped. Each entry carries `sources`, `checked` and `published`. |
| `guides.mjs` | `/guides/<slug>.html` + hub | Answer-first articles. `topic` groups them on the hub. Optional `howto`, `sources`, `table` sections. |
| `calculators.mjs` | `/tools/<slug>.html` + hub | `compute` is browser JS. It must not contain backticks or `${`. Fields prefill from `?id=value` and the Share button builds that link. |
| `comparisons.mjs` | `/compare/<slug>.html`, the round-up, hub | Every page must say where the competitor wins. Prices carry a `checked` date. |
| `templates.mjs` | `/templates/<slug>.html` + the CSV files | Column headers must stay importable (`Date`, `Description`, `Category`, `Money in`, `Money out`). |
| `landings.mjs` | `/<slug>.html` | Search-intent product pages. |
| `changelog.mjs` | `/whats-new.html` and `/feed.xml` | Newest first. Only user-visible changes. |

The generator also writes `sitemap.xml`, `feed.xml`, `llms.txt`, `llms-full.txt`, `404.html` and `src/generated/bankGuides.ts` (the bank list the app's reminder and nudge use). It fails the build if any generated page links to a path that does not exist, so a typo in a `related` key is caught before deploy.

Set `updated: "YYYY-MM-DD"` on the individual content entry when its content changes. `modifiedAt()` in the generator keeps visible dates, structured data and sitemap dates consistent. Explicit route dates cover the homepage and hubs. Keep the historical fallback unchanged; do not refresh all dates because a build ran.

## Adding a page

1. Add an entry to the right data file. Copy a neighbour; keep the voice (answer first, no em-dashes, short and long sentences mixed, a bit of opinion).
2. Give it `published: "YYYY-MM-DD"` and, for anything with facts or prices, `checked` and `sources`.
3. Reference it from at least two other pages via `related` keys and, for banks or comparisons, the landing page or noscript block in `index.html` if it is important.
4. Run `npm run content`, open the HTML, read it once as a stranger would.
5. Add a line to `changelog.mjs` if a person would notice.

## After each deploy

1. Preview changed URLs with `npm run indexnow -- --since YYYY-MM-DD`, then add `--submit` after deployment. Live key, sitemap revision, HTTP status and canonical checks must pass before submission. Acceptance is not a promise of crawling or indexing.
2. Google Search Console: add `https://www.theincometracker.com/` as a property (DNS or HTML-file verification; drop the verification file in `public/`), submit `/sitemap.xml` once, then use URL Inspection on anything new you want crawled quickly. This is the single most valuable thing not yet done: without it there is no query data to steer the next round of pages.
3. Bing Webmaster Tools: verify the existing property (or import it from Search Console if available), submit `/sitemap.xml`, and inspect new URLs. Use the Search Performance web-search report to compare clicks, impressions, CTR and position. See `BING_SEO_2026-09-14.md`.
4. Check the Vercel Analytics dashboard for `cta_click`, `calc_used`, `template_download` and, in the app, `landing_ref`. The `ref` value tells you which page sent the visitor.

## 16 September 2026 batch

Added without query data (Search Console is still not connected to this domain, and the keyword APIs available in the session were locked), so the choice was driven by the queue below and by UK search intents the site did not yet answer.

- Banks (27 total): Tesco Bank, Barclaycard, Monzo Business, Starling Business, plus Zopa, Kroo and Marcus as honest `pdfOnly` pages. A `pdfOnly: true` entry changes the title, h1, summary and first FAQ so the page never promises a CSV that does not exist; the hub card reads "PDF" instead of "CSV".
- Guides: income and expenditure form (Standard Financial Statement), does a budgeting app need your bank login, what open banking shares and how to revoke it, Self Assessment countdown (publish early so it has indexed by December), budgeting for beginners, checking a statement for errors and unknown charges.
- Calculators: UK budget planner, rent affordability (30% rule versus the 30-times-rent referencing check), overdraft cost at an EAR, pro rata salary.
- Templates: weekly budget planner, savings tracker, debt payoff tracker, student budget.
- Landings: free budget planner UK, free expense tracker UK.
- robots.txt now lists the newer AI crawlers (Perplexity-User, DuckAssistBot, Amazonbot, meta-externalagent, MistralAI-User and others) and points at llms.txt.

## What to write next (in order of expected return)

1. Connect Google Search Console to this domain. Every item below is a guess until there is query data.
2. Seasonal: new tax year guide and calculator (publish in February for April), Christmas budget refresh (October).
3. One comparison page per app that appears in Search Console queries with "vs" or "alternative". Candidates without data: HyperJar, Nous, Monzo Plus budgeting, Starling Spaces.
4. Bank pages for anything readers ask about that is still missing (Capital One UK, MBNA, John Lewis Money, Atom, Chip). Verify against the provider's help page first.
5. Deeper privacy content that AI answer engines cite: "which budgeting apps sell data", "GDPR rights over your transaction data".

## Facts that carry dates

Anything with a number from outside (tax thresholds, allowances, competitor prices, bank export limits) has a `checked` date on the page and the source under it. Re-check on a schedule: tax figures each April, competitor prices twice a year, bank steps when a reader reports a change (the contact form is on every page).

## Production checks

`npm run build` now prerenders the actual React landing page into the production homepage, then audits all canonical pages. Run `PW_CHANNEL=chrome npx playwright test --config playwright.seo.config.ts` for desktop/mobile production tests (omit `PW_CHANNEL` when Playwright Chromium is installed, or set `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` in a remote sandbox with a pinned Chromium). Run `node --test scripts/indexnow.test.mjs` for submission safeguards.
