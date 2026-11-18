# Growth loop playbook (fortnightly routine)

This file is the script a scheduled Claude routine follows on the 1st and 15th of
every month. Each run reads what web users did in PostHog over the last fortnight,
judges the experiments the previous run started, and ships a small batch of fixes,
improvements and at most one new experiment as a pull request.

**Scope: the web app only.** That means `src/`, `public/`, `scripts/`, `index.html`,
`tests/` and the docs that describe them. Never touch `ios/`, and ignore any event
that does not carry `app = 'income-tracker-web'`.

Edit this file to change how the routine behaves. The routine reads it fresh from
`main` every run.

---

## 0. Settings

| Setting | Value | Meaning |
|---|---|---|
| PostHog project | `IncomeTracker`, id `344213`, EU cloud (`eu.posthog.com`) | Switch to it before any query. Other projects in the org (`santa-switch`, `ROWS`, `Default project`) are unrelated. |
| Window | last 14 days, compared with the 14 days before | The "fortnight" every number refers to. |
| Ledger | PostHog notebook titled **"Growth loop ledger"** in project 344213 | Source of truth for runs and experiments. It survives whether or not a PR gets merged. |
| Max changes per run | 3 shipped items + 1 new experiment | Small batches keep each PR reviewable and keep attribution clean. |
| Auto-merge | **off** | Open a PR and stop. The owner merges. Change only if the owner edits this line. |
| Min sample for an A/B split | 200 unique users per variant in the window | Below that, use a before/after experiment (see §4). |

---

## 1. Set up

1. Make sure the repo `atulghandhi/income-tracker` is checked out and you are on an
   up-to-date copy of `main` (`git fetch origin main && git checkout -B <your branch> origin/main`).
   Use the branch the session gives you; if none is given, name it `growth-loop/YYYY-MM-DD`.
2. `npm ci`, then `npm run build` once to confirm `main` is green before you change
   anything. If `main` is already broken, fixing that is this run's first item.
3. In PostHog, `switch-project` to 344213 and load the `querying-posthog-data` skill
   (`learn posthog:querying-posthog-data`). Confirm events exist with `read-data-schema`
   before querying them. Never guess event names.
4. Open the **Growth loop ledger** notebook. If it does not exist, create it with
   two sections: "Experiments" (a table: id, hypothesis, change, primary metric,
   baseline, target, start date, PR, status, result) and "Run log".
5. List open PRs on the repo. If a previous growth-loop PR is still open and
   unmerged, do not stack a second one on top of the same files. Note it in the
   run log, judge its experiment as "not shipped yet", and either rebase it onto
   `main` (if it only conflicts trivially) or leave it and pick work that touches
   other files.

## 2. Read the fortnight

Pull these numbers for the current window and the previous one. Use typed query
tools (trends, funnels, retention, paths) where they fit; use `execute-sql` for
anything custom. Always filter `properties.app = 'income-tracker-web'`.

**Acquisition (static site and landing pages)**
- `static_pageview` unique visitors, broken down by `page` and `source`.
- `cta_click` by `ref`, and click-through rate per page (clicks / pageviews).
- `landing_ref` by `ref`: which pages and CTAs actually deliver people into the app.

**Activation (first session in the app)**
- Funnel: `landing_ref` → `onboarding_completed` (vs `onboarding_skipped`) →
  first `entry_added` or `import_committed`, within 1 day.
- `onboarding_*` property `skipped_steps` and `added` to see where people bail.

**Effort and the import path** (the metrics in `docs/AUTOMATION_PLAN.md` §1)
- `import_reviewed` (rows, auto, check, needs) → `import_committed`. Drop-off here
  usually means a parser or review-screen problem.
- `import_row_corrected` per import, `rule_learned`, `handoff_import` with `found=false`.
- `entry_added` by `method` (manual vs quick_add) and `category_prefilled`.

**Retention and engagement**
- Weekly retention on any app event once there is more than a handful of users.
- Feature usage: `nav_tool`, `layout_changed`, `allocation_changed`,
  `subscription_*`, `reminder_added`, `install_prompt`, `new_month_nudge`.

**Errors and friction** (proxies until error tracking exists)
- Imports reviewed but never committed, `handoff_import found=false`,
  `pdf_notice`, repeat corrections on the same source.
- If error tracking or a `client_error` event exists by now, top issues by users affected.

Write the raw numbers into the notebook's run-log entry as SQL or insight cells,
so the next run (and the owner) can re-run them.

### Reading small numbers honestly

Traffic is small (dozens of visitors a fortnight when this was written). That
changes how you reason:
- Report counts, not just percentages. "3 of 4" is not "75%" in any useful sense.
- A change from 2 to 4 events is noise. Say so rather than calling it a win.
- A single user's behaviour can still point at a real bug. Treat one stuck user
  as a lead to reproduce, not as a trend.
- When data cannot answer a question, the fix is often better instrumentation.

## 3. Judge last cycle's experiments

For every ledger row with status `running`:
1. Check the PR merged and the change is live (merge date ≤ window start, or
   measure only from the merge date). If it never shipped, mark `not shipped` and
   carry it forward or drop it.
2. Compare the primary metric over the post-change window with the baseline
   recorded at launch. Use the decision rule written down when it started; do not
   invent a new one after seeing the data.
3. Set status to one of:
   - `won`: met the target. Keep it, remove any experiment scaffolding, write one
     line on what it taught.
   - `lost`: clearly worse, or a guardrail metric dropped. Revert it in this run's PR.
   - `inconclusive`: not enough data. Extend once (max one extra cycle), then decide
     on judgement and record that it was a judgement call.
4. Add a PostHog annotation on the merge date for anything that shipped, if one
   does not exist yet, so every chart shows when changes landed.

## 4. Decide what to do

Build a short candidate list, then pick at most 3 items plus 1 experiment.
Priority order:

1. **Broken things.** Build or test failures on `main`, a step in a funnel that
   nobody gets past, imports that fail for a specific bank or format, anything a
   user hit and could not recover from. Reproduce it locally (Playwright is
   installed; `npm run dev` and drive it) before fixing.
2. **Measurement gaps** that block a decision you need to make. Examples that
   exist today: the SPA has no app-open or page-view event, so you cannot measure
   retention or which views get used; there is no client error capture. Add
   events through `track()` in `src/analytics.ts` (add the name to the
   `AnalyticsEvent` union with a comment describing its properties).
3. **Friction on the main path**: landing page → app → first data in → returns
   next month. Fix the step with the worst drop-off first.
4. **Growth experiment.** If unique users are flat or falling, or below ~100 a
   fortnight, the experiment should aim at acquisition: a new or improved static
   landing page or bank guide (see `scripts/content/*.mjs` and
   `docs/SEO_PLAYBOOK.md`), better CTA copy or placement on the best-trafficked
   pages, or an onboarding change that gets more visitors to first data. If
   acquisition is healthy, aim at activation or retention instead.
5. **Small improvements** users clearly reach for (a feature used heavily that
   has an obvious rough edge).

Skip anything that needs the owner's call: pricing and monetization, new
third-party services or paid APIs, Supabase schema migrations, auth or sync
protocol changes, changes to the privacy policy or terms, deleting features
people use. Write those up as recommendations in the PR body instead.

### Designing the experiment

Write it down in the ledger *before* writing code:
- **Hypothesis**: "Changing X will move Y because Z."
- **Primary metric** with its exact query, plus **one guardrail** that must not drop
  (for example, onboarding completion or `import_committed`).
- **Baseline** from the last 28 days, **target**, and **decision rule**.
- **Method**:
  - Under the min sample in §0 (the normal case for now): ship to everyone and
    compare 14 days after the merge with the 28 days before. Run one experiment
    per metric at a time, so the change can be credited.
  - At or above the min sample: split users. Assign a variant deterministically
    from the analytics distinct id (`it_analytics_id` in localStorage, or the
    Supabase user id), and send it as a property (for example
    `exp_cta_copy: "b"`) on the relevant events. A PostHog feature flag or
    experiment is fine if the app has gained a flags client by then.
- Static pages have no experiment framework; for them, before/after on
  `static_pageview` → `cta_click` rate per page is the method.

## 5. Build

- Follow the style of the surrounding code. Read the relevant module and its
  tests before editing.
- Keep the privacy contract in `src/analytics.ts`: event names and small
  categorical or bucketed numbers only. Never send transaction text, amounts,
  merchants, categories, balances, emails or names. Respect Do Not Track. This is
  a personal-finance app; a privacy slip is worse than a missed metric.
- Every fix gets a test that would have caught it. Calculation code has unit
  specs under `tests/*.spec.ts`; user flows have e2e specs.
- User-visible changes go in the changelog (`scripts/content/changelog.mjs`,
  which builds `public/whats-new.html`) in the same plain voice as existing entries.
- UK English by default; US strings go through the region layer (`src/region.ts`).

## 6. Verify

All of these must pass before opening the PR. Pass `--trace off` to Playwright.

- `npm run build` (this also runs the SEO checks via `postbuild`)
- `npm run test:calc -- --trace off`
- The e2e specs that touch the files you changed, for example
  `npx playwright test tests/onboarding.spec.ts --trace off`
- If you changed static pages or content: `npm run test:seo -- --trace off`
- Drive the changed flow once in a real browser (Playwright script against
  `npm run dev`) and take a screenshot for the PR.

Never skip, delete or weaken a test to get green. If something fails that you
cannot fix, leave that item out of the PR and record why.

## 7. Ship and record

1. Commit in logical pieces, push your branch, and open **one** PR against `main`
   titled `Growth loop YYYY-MM-DD: <headline>`. The body has these sections:
   - **Fortnight in numbers**: the key metrics, this window vs last, with counts.
   - **Last cycle's experiments**: each with its verdict and the evidence.
   - **Shipped in this PR**: each item, why (the data that led to it), how it was tested.
   - **New experiment**: hypothesis, metric, baseline, target, decision rule,
     when it will be judged.
   - **Needs your call**: anything from §4's skip list worth doing, with a recommendation.
   - Links to the PostHog notebook and any saved insights.
2. Update the ledger notebook: new experiment row (status `running`, with the PR
   link), verdicts for judged ones, and a run-log entry for today.
3. Do not merge (see Auto-merge in §0). Do not push to `main`.

If the fortnight genuinely shows nothing worth changing and nothing is broken,
it is fine to ship no code: write the run-log entry, and open no PR. Say so in
the final message.

## 8. Final message

End the session with a short summary for the owner: the three numbers that
matter most this fortnight, what shipped, the experiment verdicts, the new
experiment, and the PR link.
