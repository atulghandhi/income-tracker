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

Bump `UPDATED` in `scripts/build-content.mjs` whenever content is meaningfully revised. It feeds every visible "Updated" line, `dateModified` in the structured data, and the sitemap.

## Adding a page

1. Add an entry to the right data file. Copy a neighbour; keep the voice (answer first, no em-dashes, short and long sentences mixed, a bit of opinion).
2. Give it `published: "YYYY-MM-DD"` and, for anything with facts or prices, `checked` and `sources`.
3. Reference it from at least two other pages via `related` keys and, for banks or comparisons, the landing page or noscript block in `index.html` if it is important.
4. Run `npm run content`, open the HTML, read it once as a stranger would.
5. Add a line to `changelog.mjs` if a person would notice.

## After each deploy

1. `npm run indexnow` submits every sitemap URL to IndexNow (Bing, DuckDuckGo, Yandex). Google ignores IndexNow.
2. Google Search Console: add `https://www.theincometracker.com/` as a property (DNS or HTML-file verification; drop the verification file in `public/`), submit `/sitemap.xml` once, then use URL Inspection on anything new you want crawled quickly. This is the single most valuable thing not yet done: without it there is no query data to steer the next round of pages.
3. Bing Webmaster Tools: import the site from Search Console (one click) so Bing has the sitemap too.
4. Check the Vercel Analytics dashboard for `cta_click`, `calc_used`, `template_download` and, in the app, `landing_ref`. The `ref` value tells you which page sent the visitor.

## What to write next (in order of expected return)

1. Bank pages for anything readers ask about that is missing (Tesco Bank, Marcus, Zopa, Kroo, Monzo Business, Starling Business). Same template; verify the steps against the bank's help page first.
2. "Is it safe" style privacy content, which AI answer engines cite heavily: e.g. "does a budgeting app need my bank login", "what does open banking share".
3. Seasonal calculators and guides: Self Assessment countdown (December and January), new tax year (April), Christmas budget (October and November).
4. One comparison page per app that appears in Search Console queries with "vs" or "alternative".

## Facts that carry dates

Anything with a number from outside (tax thresholds, allowances, competitor prices, bank export limits) has a `checked` date on the page and the source under it. Re-check on a schedule: tax figures each April, competitor prices twice a year, bank steps when a reader reports a change (the contact form is on every page).
