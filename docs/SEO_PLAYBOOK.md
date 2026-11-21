# SEO and AI-search playbook

How the content side of The Income Tracker is built, and the short list of things to do after each deploy. Everything here is deliberately boring: pages are plain HTML generated from data files, so adding a page is a 10-minute job and nothing depends on a CMS.

## How the pages are built

`npm run content` (also runs automatically before `npm run build`) executes `scripts/build-content.mjs`, which reads the data modules in `scripts/content/` and writes static pages into `public/`:

| Data file | Pages | Notes |
| --- | --- | --- |
| `banks.mjs` | `/import/<bank>-csv.html` + `/import/` hub | One page per bank. `steps` are HTML, everything else is escaped. Each entry carries `sources`, `checked` and `published`. The `ANSWERS` map at the bottom holds the search listing and the at-a-glance answers; see the 16 November section. |
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

## 15 November 2026: Bing Site Scan fixes and the US homepage

Bing reported too many pages with identical titles and descriptions. Two causes, both fixed:

- **App URLs served the homepage.** `/dashboard`, `/ledger` and the other app pages were rewritten to `index.html`, so each carried the homepage title, description and `index, follow`. `scripts/prerender-home.mjs` now writes `dist/app-shell/<view>.html` per page with its own title (`VIEW_META` in `src/routes.ts`), `noindex, follow` and no canonical; `vercel.json` rewrites each URL to its shell and adds an `X-Robots-Tag: noindex` header. `/insights` is now a real 308 to `/dashboard`.
- **Tracking links minted homepage duplicates.** Static pages linked to `/?ref=nav`, `/?ref=calc-…`, `/?feedback=1` and so on, about 50 distinct URLs with the homepage title. They now use fragments (`/#ref=…`, `/#feedback`), which are not separate URLs. The app still reads the old query forms. In Bing Webmaster Tools, also set `ref`, `feedback` and `sample` as ignored URL parameters so the already-crawled variants drop out.

Also: every meta description is now 160 characters or fewer (Bing flags longer ones), and `check-seo.mjs` fails the build on a description over 160 or under 50, a title over 70, any `/?…` link, an app view without a noindex shell, or a missing hreflang pair.

**US homepage.** `/us/` is the same landing component rendered with US copy (`src/landingContent.ts`): dollars, US banks, Plaid-free wording, US FAQ and its own `en-US` head, canonical and JSON-LD. `/` and `/us/` carry reciprocal hreflang with `/` as x-default. A first-time visitor on `/` whose browser says US (time zone and language, the same detection the app uses) sees the US copy in place, without a redirect; crawlers always get the page the URL names. "US version" and "UK version" links switch, and the choice is remembered. Entering the app from `/us/` starts a US ledger. The importer also accepts `.qfx` files now, which US banks offer widely.

After deploying: submit `/` and `/us/` with `npm run indexnow -- --since 2026-11-15 --submit`, and inspect `/us/` in Bing Webmaster Tools.

## 16 November 2026: first Bing query data, and what it changed

The first Bing Webmaster Tools keyword export (17 queries, 23 impressions, 1 click, positions 2 to 10) and three days of PostHog events. Small numbers, so treat this as direction and not proof. Two things were clear enough to act on.

**The queries are questions about one bank.** 13 of the 17 were of the form "can I export CSV from Revolut", "Santander download csv from app", "export all Wise transactions greater than a year", "how can I download Barclaycard transactions as a CSV file instead". The pages ranked on page one and got almost no clicks.

**Content visitors reached the homepage and stopped.** 11 people followed a CTA from a content page to `/`. None recorded another event. The CTA said "Open the tracker" and delivered a marketing page to someone already holding a statement file.

The rule that came out of it has three parts, and each belongs in a different place.

1. **The search listing promises.** Title and description say exactly what the person searched for and stop there: "Download a Santander CSV, app or online: step-by-step guide". Name the awkward variant in their query (the app, past a year, instead of a PDF) so they can see their case is covered. Do not put the steps or the answer in the listing: a listing that says "Download transactions, then midata (CSV)" has made the click unnecessary. Never promise a CSV from a bank that only issues PDFs.
2. **The page delivers, in the first screen.** The "In short" box answers the question. The at-a-glance box under it answers the two follow-ups nearly every query carried: can the mobile app do it, and how far back does it go. Then the steps. A follow-up that needs more than a line gets its own section (`sections` in `banks.mjs`, as on the Wise page).
3. **Then hand over, not sell.** Under the steps is a drop zone. The visitor drops the file they just downloaded, it is parked in IndexedDB on this origin, and `/ledger#ref=…&handoff=1` opens the app with the import review already showing (`src/handoff.ts`). No homepage, no setup wizard on top. The file never leaves the browser. Completing that import also sets `hasSeenLanding`, so the bare domain opens their ledger next time.

Where it lives: `ANSWERS` at the bottom of `scripts/content/banks.mjs` holds each bank's listing, `app`, `history`, extra FAQs and sections. `glanceHtml`, `dropZoneHtml`, `previewHtml` and `DROP_SCRIPT` in `build-content.mjs` render them. Facts for Santander, HSBC, Wise, Tide and Zopa were re-read against each bank's own help page on 16 November; the Zopa page had the wrong statement day for the current account (it is the 8th; savings statements are the 1st) and that is corrected.

Also changed: the savings tracker page now says "spreadsheet" (query: "free savings tracker spreadsheet uk", position 2, no clicks), the no-open-banking page is titled for "without linking your bank account" and says honestly what you trade for it, and the income and expenditure guide answers "what is the reason for filling one in" in those words.

### How to tell if it worked

- Bing Webmaster Tools, 28 days after deploy against the 28 before: clicks and CTR on `/import/*` pages. Position should hold; CTR is the number that should move.
- PostHog: `static_pageview` now carries `source` (bing, google, duckduckgo, chatgpt and so on, a name from a short list and never a URL or query). `file_handoff` fires on the guide when a file is dropped, `handoff_import` in the app when it is collected. The funnel is `static_pageview` on `/import/*` to `file_handoff` to `import_committed`.
- If `file_handoff` is rare while `cta_click` on the "No file yet?" link is common, people are reading the guide before they have exported anything. Then the next step is a reminder to come back, not a bigger drop zone.

Untested and worth an experiment next: every other CTA on the site still goes to the homepage. Sending `#ref=` arrivals straight into the app is the obvious trial, but the homepage also does the explaining for someone with no file, so measure it first.

## 21 November 2026: first Google Search Console export (last 3 months)

84 clicks, 18,657 impressions, average position 24.6 (22.4 in the UI's default view). The average is not a fair score of the site, and chasing it would be a mistake.

- **The average is dragged by head terms the site cannot win yet.** The rent affordability calculator alone (1,116 impressions at position 81, for "how much rent can I get/afford", where Rightmove, Zoopla and MSE own page one, and the first query is landlord intent anyway) adds about 3.4 points. Add the best-free-budgeting-apps round-up (37), the budget planner (50), the overdraft and pro-rata calculators and the templates hub, and the remaining pages average about 13.6. Head terms like "expense tracker" (19), "track expenses" (23) and "budget apps uk" (61) are an authority problem: SE Ranking finds 4 backlinks from 4 domains. Links move those, not on-page edits.
- **UK 33, US 9.** US impressions rank far better but convert at 0.26%, because a £, UK-titled page rarely gets an American click.
- **Statement queries rank far worse than CSV queries for the same bank.** "starling export csv" 5, "how to export wise transactions" 9, "how to download metro bank statement in csv" 10, but "how to download metro bank statement" 43, "tide statements" 43 and "barclays csv statement" 87. The Barclays and Metro Bank pages were titled and written for exporting transactions and never answered the statement question. Both now do, with answers from each bank's own help page (titles, `app`, `history`, FAQs, sources). Check them in four weeks; if they move, give Halifax, Lloyds and NatWest the same treatment.
- **Calculator impressions are mostly hidden queries.** The Christmas calculator (3,639 impressions, position 6, 0.19% CTR) and weekly-to-monthly (2,025, position 6, 0.35%) get most impressions from anonymised queries. The one visible one ("till christmas", position 2) suggests countdown-style searches Google answers itself, so the low CTR is probably not a listing problem. "christmas budget calculator" itself sits at 74.
- **Long AI-style queries** ("best budgeting tools to track household spending with a free plan") rank 4 to 10 with no clicks. They look like AI-assistant or rank-tracker searches, so treat them as AI visibility, not traffic.

Track clicks and the number of queries in the top 10, not average position. Average position gets worse every time Google starts testing the site on a broader term, which is a good sign.

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
