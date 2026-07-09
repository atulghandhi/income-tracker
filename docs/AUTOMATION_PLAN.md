# Transaction Automation Plan — driving user effort toward zero

> **Status:** Stages A–E implemented (Jul 2026). A+B live in the web app with unit
> and e2e tests; C (AI categorization) is code-complete and dormant until the
> `categorize-batch` function is deployed with an `ANTHROPIC_API_KEY`; D ships as
> uncompiled Swift services awaiting the FinanceKit entitlement + an Xcode build;
> E (open banking) is code-complete and dormant until TrueLayer credentials are
> set and the migrations/functions are deployed. Remaining external prerequisites
> are listed per stage below and in the commit messages.
> Companion to `docs/MONETIZATION_PLAN.md` — automation *is* the Pro value
> proposition, so every stage here maps to a monetization phase.
> **Goal:** A user should spend seconds per month keeping their ledger true, not minutes
> per transaction. This document is the step-by-step plan to get there, ordered from
> zero-cost wins to full bank feeds.

---

## 1. Objective and how we measure "effort"

"Automation" is vague; these four metrics are not. Instrument all of them in Phase 0
(PostHog) so every stage below has a before/after number.

| Metric | Definition | Today (est.) | End-state target |
|---|---|---|---|
| **Touches per transaction** | Taps/keystrokes-fields from intent to saved entry | ~6 (manual form) | ≤1 (confirm) or 0 |
| **Zero-touch rate** | % of ledger transactions that arrived with no user action at all | 0% | 80%+ (feeds/FinanceKit users) |
| **Review rate** | % of imported rows the user has to look at before commit | 100% (whole preview table) | <15% (only low-confidence rows) |
| **Monthly ledger time** | Time in app spent *entering/correcting* (not reading insights) | unknown — measure | <5 min/month |

Guiding principle: **every correction the user makes must teach the system** so the
same correction is never needed twice. The app already has the seed of this
(`CategoryRule` learning in `importer.ts`); this plan generalizes it.

---

## 2. Baseline audit — where effort goes today

Current entry paths and their friction, from the code:

1. **Manual entry** (`App.tsx` ledger forms): every field typed by hand — name,
   amount, category, recurring toggle. No autocomplete, no memory of past merchants.
2. **Month rollover**: `seedMonthFromPrevious()` (`src/finance.ts:124`) returns
   **empty** income/expense arrays — only the note carries over. The `recurring` flag
   feeds the run-rate forecast but recurring entries are *not* re-created in the new
   month. A user with a salary, rent, and 8 direct debits re-types ~10 entries every
   month. **This is the largest single effort leak and costs nothing to fix.**
3. **CSV import** (`src/importer.ts`): genuinely good bones —
   header auto-detection (multi-bank aliases), delimiter sniffing, quoted-field CSV
   parsing, amount normalization (parentheses negatives, comma decimals),
   date-format tolerance, stable per-row hash dedupe
   (`createTransactionHash`), and a three-layer category suggester:
   user rules (0.96) → 11 regex system rules (0.78–0.92) → bank's own category
   column (0.72) → sign heuristic (0.48/0.32 "Unsorted").
   Friction that remains: the user reviews **every** row in the preview table;
   rules match only on exact token containment; rule creation is manual; there is
   no OFX/QIF/XLSX support; corrections don't propagate to already-imported rows.
4. **No capture paths at all** for: paste-from-clipboard, screenshots, receipts,
   Siri/widgets (iOS not built yet), or any automatic feed.

---

## 3. Research summary — the automation landscape (July 2026)

What the category leaders do, and what infrastructure exists to buy vs build:

**How top-tier apps automate entry.** YNAB, Monarch, and Copilot converged on the
same stack: bank feeds as the default capture path, ML merchant
cleaning/categorization on top, recurring-transaction detection to auto-flag
subscriptions and bills, and — since 2024–25 — **Apple FinanceKit** as a
zero-cost feed for Apple Wallet–visible accounts (all three were FinanceKit launch
partners). Manual-entry-first apps survive only in the privacy niche — which is
this app's free tier, not its Pro tier.

**Apple FinanceKit — the big new fact for this plan.** FinanceKit originally
exposed only Apple Card/Cash (US). It now works **in the UK on iOS 18.4+** via
open banking connections in Apple Wallet, covering major UK banks including
Barclays, Barclaycard, First Direct, Halifax, HSBC, Lloyds, M&S Bank, MBNA, Monzo,
Nationwide, NatWest, RBS, and Santander. Requirements: the app must be in the
**Finance category** on the App Store (US or UK), distributed via the App Store,
and granted the FinanceKit entitlement by Apple; users control which accounts and
what time range are shared. Crucially, **there is no per-user aggregator fee** —
Apple provides the data free once entitled. For a UK iPhone-first audience this
delivers most of the value of open banking feeds at zero marginal cost, changing
the economics assumed in the monetization plan's Phase 4.

**UK open banking aggregators (for non-Wallet coverage and Android/web).**
Status as of mid-2026: **GoCardless Bank Account Data (ex-Nordigen), the famous
free tier, has stopped onboarding new customers** — it is off the table for new
builds. Realistic shortlist: **TrueLayer** (UK specialist; sales-gated pricing:
free dev tier, then monthly fee + per-use), **Yapily** (infrastructure-only,
white-label, startup-friendly PAYG), **Tink** (Visa-owned, broad coverage),
**Enable Banking** (volume-based with monthly minimum), and **Moneyhub**
(UK enterprise AIS). All require a sales conversation for real AIS pricing;
budget assumption stays ~£0.20–£0.60/connected user/month at small volume until
quoted. Regulatory posture unchanged: integrate under the aggregator's agency/
white-label AISP model so the app itself does not need FCA authorization —
confirm scope in writing.

**The 90-day rule is now friendly.** Since the FCA's 2022 change to Article 10A,
users **no longer re-authenticate with their bank every 90 days**; instead the
app (TPP side) collects a simple in-app consent reconfirmation. Historic drop-off
above 50% was driven by the old bank-redirect flow; a well-designed in-app
"keep my bank connected" prompt removes most of that churn risk. Design for it
from day one (§7, Stage E3).

**Transaction enrichment APIs (buy vs build for categorization).**
**Plaid Enrich** (ML over 500M transactions/day; per-transaction fee, sales-gated)
and **Ntropy** (used by Mercury/Ramp; free 2,000-transaction test tier, then
usage plans) both take raw descriptions and return clean merchant, category,
logo, and location. Verdict for this app: **don't buy yet.** The volumes are
small, UK-centric regex + learned rules already cover the common cases, and an
LLM batch categorizer (Stage C) costs pennies at this scale while keeping the
category set *the user's own*. Revisit enrichment APIs only if Stage C accuracy
disappoints at scale (§6, decision gate).

Sources: [FinanceKit — Apple Developer](https://developer.apple.com/financekit/) ·
[FinanceKit docs](https://developer.apple.com/documentation/financekit) ·
[Meet FinanceKit — WWDC24](https://developer.apple.com/videos/play/wwdc2024/2023/) ·
[Open Banking APIs in the UK: Compare Providers (2026)](https://openbankingtracker.com/open-banking-apis-uk) ·
[Banking Data Aggregation APIs (2026)](https://www.openbankingtracker.com/banking-data-aggregation) ·
[TrueLayer pricing overview (Finexer, 2026)](https://blog.finexer.com/truelayer-pricing-uk/) ·
[Enable Banking FAQ](https://enablebanking.com/docs/faq/) ·
[FCA changes to 90-day reauthentication](https://www.openbanking.org.uk/news/fca-publishes-changes-to-90-day-reauthentication-rules/) ·
[TrueLayer on the 90-day rule change](https://truelayer.com/blog/compliance-and-regulation/explaining-changes-to-the-90-day-rule-for-open-banking-access/) ·
[Plaid Enrich](https://plaid.com/products/enrich/) ·
[Ntropy enrichment docs](https://docs.ntropy.com/enrichment/introduction)

---

## 4. The Automation Ladder — five stages

Each stage: what it removes for the user, step-by-step build plan (with the actual
files/modules), edge cases, exit criteria, and rough effort. Stages A–B are free-tier
quality (they make the funnel wider); C–E are Pro anchors (they make people pay).

### Stage A — Kill repeat typing (weeks 1–4 · no external services · free tier)

**Effort removed:** the ~10 identical entries a typical user re-types monthly, and
most keystrokes on the rest.

**A1. Auto-seed new months with recurring entries.** *(highest impact/effort ratio
in this entire document)*

1. Change `seedMonthFromPrevious(previous)` in `src/finance.ts` to copy forward
   every entry where `isRecurring(entry)` is true: new `id`s, same
   source/name/amount/category/color, `recurring: true`, `date` set to the same
   day-of-month clamped to month length (e.g. 31st → 30th in June); drop
   `imported` metadata (a seeded copy is not the imported row).
2. Keep one-offs behind: entries with `recurring: false` do not carry.
3. Mark seeded entries with a new optional field `seededFrom?: { monthKey: string; entryId: string }`
   (add to `IncomeEntry`/`ExpenseEntry` in `src/types.ts`) so the UI can show a
   subtle "auto-added" chip and so deleting a seeded row can offer
   "stop repeating this?" (which flips `recurring` off in the source month — the
   correction teaches the system, per §1).
4. UI: on first open of a freshly seeded month, show a one-line banner:
   "12 recurring items added automatically — review". Dismissable; no modal.
5. Amount drift: if the same merchant was imported last month with a different
   amount than the recurring template (e.g. energy bill), seed with the **most
   recent** amount and note "updated from last month".
6. Edge cases: months opened out of order (seed from latest *earlier* month with
   data, which is what `App.tsx:5088` already selects); duplicate protection when
   a CSV import later brings in the real salary line — see B6 recurring-matching,
   which must reconcile the seeded row with the imported row instead of doubling.
   Until B6 lands, dedupe seeded-vs-imported by normalized merchant + kind within
   the month and merge (keep imported metadata, keep recurring flag).
7. Tests: unit tests in `finance` for clamping, drift, out-of-order months;
   Playwright test for the rollover banner and the delete-→-stop-repeating flow.

*Effort: ~3–4 days. Exit: touches-per-transaction for recurring items drops to 0–1.*

**A2. Merchant memory + autocomplete everywhere.**

1. New module `src/merchantMemory.ts`: build an in-memory index from
   `LedgerState` — for each normalized merchant (`normalizeMerchant` already
   exists in `importer.ts`; export it): last amount, last category, kind,
   frequency count, last date. Rebuild lazily on state change (the ledger is
   small; a simple memo suffices).
2. Manual entry forms: as the user types a name/source, show top-5 suggestions
   ranked by frequency × recency; selecting one pre-fills amount (editable),
   category, color, and recurring flag. One tap turns a 6-field form into
   "confirm amount → save".
3. Category field: default to the merchant's dominant historical category; show
   most-used categories first in any picker.
4. Amount field: pre-fill the merchant's modal amount when stable (e.g. Netflix),
   otherwise leave blank but show last 3 amounts as tap-chips.
5. Tests: suggestion ranking, prefill correctness, no suggestions leaking across
   privacy mode.

*Effort: ~1 week. Exit: median touches for a repeat merchant ≤2.*

**A3. One-line quick add (local natural-language parse).**

1. Single input at the top of the ledger: `costa 4.35`, `salary 2400 recurring`,
   `tesco 42.61 yesterday`, `rent 950 on 1st`.
2. Parser (pure function, `src/quickAdd.ts`): tokenize; first decimal-looking
   token = amount; date words (`today/yesterday/mon..sun/1st..31st/dd/mm`) = date;
   keywords `recurring`/`monthly` = flag; `+` prefix or income wording = income;
   remainder = merchant → run through merchant memory (A2) and the
   `suggestCategory` pipeline (`importer.ts`) for category/kind.
3. Show a live preview chip of the parsed entry under the input; Enter commits.
   Ambiguity never blocks: worst case it lands as expense/"Unsorted" — one tap to
   fix, and the fix creates a rule (B2).
4. This parser is deliberately local and deterministic — no LLM latency/cost in
   the hot path. (The LLM tier in Stage C is for batch categorization, not entry.)
5. Tests: table-driven parser tests with ~40 fixtures including `£`/`-` signs,
   `1,234.56`, and garbage input.

*Effort: ~1 week. Exit: power users can log an expense in one line + Enter.*

**A4. Paste-to-import (clipboard capture).**

1. "Paste transactions" action in the import screen: reads clipboard text and
   feeds it to `parseBankCsv` — the existing parser already sniffs delimiters
   including tabs (`detectDelimiter`), which is what spreadsheet and
   bank-web-page copies produce.
2. Add a fallback line-mode: when no header row is detected, try per-line parse
   (`date? description amount` patterns, reusing A3's tokenizer) so a copied
   block from a banking app's transaction list still imports.
3. Everything downstream (rules, dedupe, preview) is unchanged — this is purely
   a new inlet to the existing pipeline.

*Effort: ~3 days. Exit: a copy-paste from any spreadsheet/bank page imports.*

### Stage B — Near-zero-touch imports (weeks 5–10 · free tier limits apply per monetization plan)

**Effort removed:** reviewing rows the system was already sure about; creating
rules by hand; re-categorizing history after a correction.

**B1. Confidence triage — review only the uncertain.**

1. Split the import preview into three buckets by existing `confidence`:
   **Auto** (≥0.90: saved rules 0.96, strong system rules 0.92) — collapsed,
   pre-included, one summary line ("42 matched your rules");
   **Check** (0.60–0.89) — shown compact with one-tap category chips;
   **Needs you** (<0.60, the `Unsorted` 0.32 fallback) — full row editors.
2. Single primary button: "Import 57 (review 6)". The user's attention goes only
   where the system is unsure — this alone cuts review rate from 100% to the
   sub-0.9 fraction.
3. Log per-bucket correction rates to PostHog; the 0.90 auto threshold is a
   constant in one place, tuned from that data (target: <2% of Auto rows ever
   corrected post-import).
4. Post-import correction path: editing an imported entry's category in the
   ledger must offer the same "save as rule" affordance as the preview does.

*Effort: ~1 week. Exit: review rate <25% on a typical statement.*

**B2. Rules that create themselves.**

1. On any category correction (in preview or post-import), auto-generate the
   rule via existing `buildRulePattern(description)` and save it **silently**,
   with an undoable toast ("Rule saved: 'tesco extra' → Food"). No modal, no
   form. A correction *is* consent to learn (state this in the privacy copy).
2. Rule conflicts: if a new correction contradicts an existing rule (same
   pattern, different category), update the rule and show which one changed —
   last correction wins; keep `updatedAt` (already in `CategoryRule`).
3. **B2b. Retroactive application:** when a rule is created/updated, scan all
   months for entries whose normalized description matches and whose category
   came from a *lower-confidence* source (track a new optional
   `categorySource?: "user" | "rule" | "system" | "bank" | "heuristic"` on
   entries — never override `"user"`), and offer one tap: "Apply to 14 past
   transactions". This is the "never correct twice" principle applied backwards.
4. Rule hygiene UI (settings): list rules with match counts; stale rules (0
   matches in 6 months) suggested for deletion.

*Effort: ~1 week. Exit: >60% of active users' imports hit ≥1 learned rule; rules
created per manual correction ≈ 1.*

**B3. Fuzzier matching (kill the near-miss).**

1. Today `descriptionMatchesPattern` requires every pattern token to appear as a
   substring token. Misses: `AMZN MKTP` vs `amazon`, `TFL TRAVEL CH` vs
   `tfl travel`, typo'd merchants, order variance.
2. Upgrade in two cheap steps, in `importer.ts`:
   a. **Alias table** for the UK top ~200 merchant string variants
      (AMZN→amazon, SBUX→starbucks, TFL*→tfl…) applied inside
      `normalizeMerchant` — data file, no algorithm risk;
   b. **Token-set Jaccard similarity ≥0.6** as a secondary rule-match path at
      confidence 0.85 (below exact-match 0.96, above system rules) so near
      misses land in B1's Auto/Check buckets instead of Unsorted.
3. Guard: fuzzy matches always display which rule fired (existing `note` field)
   so a wrong fuzzy hit is correctable → correction updates the rule (B2).
4. Tests: fixture set of real-shaped UK bank descriptors (extend the patterns
   already encoded in `SYSTEM_RULES`).

*Effort: ~4 days. Exit: Unsorted share of imported rows drops by half.*

**B4. More formats, zero re-mapping.**

1. **Bank presets:** ship column-map presets keyed on recognizable header
   signatures for the common UK exports (Monzo, Starling, Revolut, Barclays,
   HSBC, Lloyds, Nationwide, Santander, Amex). The existing header-alias
   detection stays as fallback; presets add per-bank quirks (Monzo's separate
   "Local amount", Amex's sign inversion).
2. **Remember the mapping:** persist `fileName pattern → resolved ColumnMap +
   sign convention` in `LedgerState` after a successful import; second upload
   from the same bank skips any ambiguity.
3. **OFX/QIF parsers** (`src/importer.ofx.ts`): both are simple line formats;
   OFX gives clean `FITID` — use it as the dedupe hash input when present
   (stronger than date|desc|amount).
4. **XLSX:** convert client-side via SheetJS (lazy-loaded chunk) then reuse the
   CSV path. **PDF statements: explicitly out of scope** — poor ROI vs OFX/CSV,
   revisit only if support requests demand it.

*Effort: ~1.5 weeks. Exit: >90% of uploads import without any column fixing.*

**B5. Recurring & subscription detection engine.**

The payoff feature of Stage B: the app starts telling the *user* what's recurring.

1. New module `src/recurrence.ts`, pure functions over `LedgerState`:
   group all entries (manual + imported) by normalized merchant + kind; for
   groups with ≥3 occurrences compute inter-occurrence gaps; classify cadence
   monthly/4-weekly/weekly/quarterly/annual when the median gap fits ±4 days
   (±2 for weekly) and amount variance is within max(£2, 15%) (utilities wobble,
   Netflix doesn't).
2. Outputs `RecurrenceCandidate { merchant, cadence, typicalAmount, lastSeen,
   nextExpected, confidence, entryRefs }`.
3. Surfaces, in build order:
   a. **"Mark as recurring?"** suggestions — one-tap converts and back-fills the
      `recurring` flag (feeds the existing run-rate/forecast math immediately);
   b. **Subscriptions panel** — detected subscriptions with monthly total and
      annualized cost (also a monetization-plan insight anchor);
   c. **A1 reconciliation** — a seeded recurring row and an imported row for the
      same candidate merge instead of duplicating (this closes A1's edge case);
   d. **Missed-payment signal** — `nextExpected` passed with no matching entry →
      gentle flag ("Council tax usually lands by the 3rd — not seen this month"),
      which doubles as an anomaly detector (free) and a hook for push
      notifications on iOS (Pro).
4. All local computation — no server, works for privacy-mode users.
5. Tests: synthetic ledgers with jittered dates/amounts, 4-weekly vs monthly
   disambiguation (the classic salary trap), annual renewals.

*Effort: ~2 weeks. Exit: ≥70% of true subscriptions in test ledgers detected with
<5% false positives; zero-touch rate starts moving (seeded + auto-matched rows).*

### Stage C — AI categorization backstop (weeks 11–16 · **Pro** · needs auth, per monetization Phase 1)

**Effort removed:** the residual "Needs you" bucket — the long tail no rule or
regex will ever cover (`SUMUP *THE CORNER CAF`, `ZETTLE_9921 J DOE`).

1. **Supabase Edge Function `categorize-batch`:** input = array of
   `{ description, amount_sign, month }` (no dates, no balances, no identity
   beyond the auth token), plus the user's own category list; model = a small
   fast LLM (e.g. Claude Haiku class) with a constrained JSON output:
   `{ category, kind, confidence, cleaned_merchant }`. Batch up to 50 rows per
   call at import time, async — the preview renders instantly with local
   suggestions and upgrades rows in place when the batch returns.
2. **Placement in the suggestion pipeline** (`suggestCategory`): user rule 0.96
   → fuzzy rule 0.85 → LLM ≥threshold (cap at 0.80 — the LLM must never outrank
   the user's own rules) → system regex → bank column → heuristic. LLM output
   feeds the same triage buckets (B1); a correction still creates a local rule
   (B2), so each user's LLM dependence *decreases* over time — the LLM is a
   backstop, not the brain.
3. **Server-side merchant cache** (`merchant_categories` table): normalized
   description hash → suggestion, shared across users. UK bank descriptors
   repeat heavily; expected steady-state cache hit rate >80%, so marginal LLM
   spend trends toward zero. Cache rows store *no* user linkage.
4. **Cost model:** ~120 uncached rows/user/month at launch → well under
   £0.01/user/month at Haiku-class pricing; cap per-user batches (e.g. 2,000
   rows/month) to bound abuse; kill-switch feature flag.
5. **Privacy gates (hard requirements):** Pro + signed-in only; explicit opt-in
   toggle ("Use AI to categorize my imports — descriptions only leave your
   device, never amounts or balances" — and enforce exactly that: send sign,
   not value); privacy-mode users excluded; documented in the privacy policy.
6. **Decision gate:** if corrected-rate on LLM-labelled rows stays >15% after
   tuning, evaluate Ntropy (2k-transaction free test tier makes the bake-off
   cheap) before investing further — buy accuracy rather than grind on prompts.

*Effort: ~2 weeks incl. evals (build a 500-row labelled UK descriptor fixture set
first; measure every prompt change against it). Exit: Unsorted rate <5% for Pro
users; LLM correction rate <10%; cache hit >60% by week 4.*

### Stage D — iOS-native capture (alongside iOS app build · months 4–8 · Pro flag-ship)

**Effort removed:** opening the app at all.

**D1. Apple FinanceKit — free bank feeds for Wallet users (the strategic move).**

Given FinanceKit's UK expansion (§3), the iOS app gets real automatic transaction
feeds **before** and **cheaper than** Stage E aggregator work:

1. Prereqs (do these early — Apple approval has lead time): App Store **Finance**
   category listing; request the FinanceKit **entitlement** via Apple's process;
   iOS 18.4+ target for the feature (graceful hide below).
2. Consent UX: Apple's account picker handles scope (accounts + time range).
   In-app, frame it as "Connect Apple Wallet" — one screen, no bank credentials.
3. Data flow: `FinanceStore` query for transactions + balances on connected
   accounts; **background delivery** registration so new transactions arrive
   without opening the app; map FinanceKit's transaction model into the exact
   shape `parseBankCsv` rows take (description, ISO date, signed amount) and
   push them through the *same* suggestion/dedupe/triage pipeline — FinanceKit
   rows carry a stable transaction ID: use it as the dedupe key (like OFX
   `FITID`, B4).
4. FinanceKit also supplies its own merchant/category hints — treat them exactly
   like the CSV "bank category column" (confidence 0.72 tier); local rules still win.
5. Balances: auto-update the linked `Account` balance on each sync — this quietly
   automates the *accounts* side of the app too (net-worth snapshots stop being
   manual).
6. Notification: local push "3 new transactions categorized — 1 needs you",
   deep-linking into the triage view (B1 reused on iOS).
7. Sync ledger changes to Supabase as usual so the web app shows feed-sourced
   rows too.
8. **Gating:** FinanceKit connection is **Pro** (it is exactly the "automatic
   feeds" anchor from the monetization plan §3, arriving early at zero marginal
   cost). Free users see the connect screen with the upgrade gate.

*Effort: ~3 weeks inside the iOS build. Exit: a Monzo/HSBC-in-Wallet user reaches
>70% zero-touch rate with no aggregator cost. Risks: entitlement approval delay
(apply at project start); bank coverage gaps (fall back to CSV/E).*

**D2. Screenshot / share-sheet import (Vision OCR).**

For banks not in Wallet and users who won't connect anything:

1. Share-sheet extension + in-app "import from screenshot": user screenshots
   their banking app's transaction list, shares to Income Tracker.
2. `VNRecognizeTextRequest` (on-device, free, private) → text lines → the A4
   line-mode parser → normal preview pipeline. Column inference by x-position
   clustering of text boxes (date column, description, trailing amount).
3. Accept imperfection: this is a triage-heavy path by design; everything lands
   in B1's buckets. On-device only — screenshots never upload.
4. Also accept receipt photos → single-entry draft (merchant = largest text /
   known alias, amount = bottom-most currency match, date if present).

*Effort: ~2 weeks. Exit: a 10-row screenshot imports with ≤3 corrections.*

**D3. App Intents: Siri, widgets, Shortcuts.**

1. `AddExpenseIntent(merchant, amount, category?)` — enables "Hey Siri, log
   twelve pounds at Nando's", Lock Screen/Home widget quick-add buttons for the
   user's top-4 merchants (from A2's memory), and user-built Shortcuts
   automations (e.g. location-triggered "log gym?" prompt — users build the
   automation; the app just exposes the verb).
2. Reuses A3's parser semantics; A2's memory fills category/color.
3. Interactive widget "confirm pending" button surfaces B1's review count.

*Effort: ~1 week. Exit: entries created outside the app appear correctly synced.*

### Stage E — Full open banking feeds (months 9–15 · Pro · = monetization Phase 4)

**Effort removed:** everything that remains — Android/web users and non-Wallet
banks get the same zero-touch feed iOS/Wallet users got in D1.

**E1. Aggregator selection (updated from the monetization plan).**

1. GoCardless Bank Account Data is **closed to new customers** — remove it from
   consideration. Run a two-week spike against sandboxes of **TrueLayer** and
   **Yapily**, scoring: UK bank coverage vs our users' actual banks (survey via
   the feedback table), webhook support for new transactions, sandbox quality,
   agency-model AISP terms (no own FCA permission needed — get it in writing),
   and quoted price at 500/2k/10k connected users. Tink and Enable Banking are
   the fallbacks if both disappoint.
2. **Abstraction layer from day one:** define our own
   `FeedProvider` interface (connect, list accounts, fetch transactions since
   cursor, webhook verify) so the aggregator is swappable — D1's FinanceKit
   integration should already conform to a client-side subset of this interface,
   proving the shape.
3. Decision owner + deadline; provider choice is a one-way door only if E2 skips
   the abstraction.

**E2. Sync architecture.**

1. `bank_connections` table (user_id, provider, provider_connection_id, status,
   consent_expires_at, last_synced_at, cursor) — RLS per user; tokens encrypted
   via Supabase Vault, never sent to the client.
2. Connect flow: client opens provider's hosted auth (bank selection + SCA
   happens on the provider/bank side; we never see credentials) → callback Edge
   Function stores the connection.
3. Ingest: provider webhook where supported + scheduled Edge Function (cron,
   e.g. every 6h) as sweep; fetch transactions since cursor; normalize to the
   canonical row shape; write to a `feed_transactions` staging table.
4. Client merge: on app open/sync, staged rows flow through the **same local
   pipeline** — suggestion layers, B5 recurrence matching, B1 triage,
   A1-seeded-row reconciliation. Feed rows carry provider transaction IDs as
   dedupe keys; **cross-source dedupe** (same purchase from FinanceKit *and*
   aggregator, or feed + old CSV) falls back to `createTransactionHash` within
   a ±2-day window.
5. Server enforces the only expensive resource: connection count and sync
   frequency by plan (monetization plan §7).

**E3. Consent lifecycle (the churn defuser).**

1. 90-day reconsent is in-app (no bank redirect): schedule a reconfirmation
   prompt at day 80 — one tap "Keep connected", shown in-app and via push (D1's
   notification channel). Track reconfirm rate; target >90% (industry pre-change
   drop-off was >50% *with* bank redirects — the whole point of doing this well).
2. Expired/revoked connections degrade gracefully: account stays, rows stay,
   status chip shows "reconnect to resume auto-import"; nothing is deleted.
3. Provide "disconnect + delete staged data" in settings (GDPR hygiene and
   stated privacy posture).

**E4. Ledger intelligence that feeds unlock.**

1. **Transfer pair detection:** opposite-sign equal-amount rows across two
   connected accounts within ±2 days → auto-classify both as `transfer`
   (existing kind), excluded from income/expense totals; the current
   transfer-rule sweep (`isTransferDescription`) remains for single-sided cases.
2. **Debt auto-linking:** feed rows matching debt-payment rules auto-link via
   existing `debtAccountId` machinery — the balance roll-forward becomes fully
   automatic for connected credit cards; card balance from the feed reconciles
   the computed balance (flag drift >£1 as a signal).
3. **Balance reconciliation:** provider balances update `Account.balance` on
   each sync; net-worth history stops depending on manual updates anywhere.

*Stage E effort: ~6–8 weeks. Exit: zero-touch rate >80% for connected users;
feed-user month-6 retention ≥1.5× CSV-only (the monetization plan's Phase 4 gate);
reconsent success >90%.*

---

## 5. Data model changes (cumulative, all optional/backward-compatible)

| Type | New fields | Stage |
|---|---|---|
| `IncomeEntry`/`ExpenseEntry` | `seededFrom?`, `categorySource?` | A1, B2 |
| `LedgerState` | `columnMapMemory?`, `merchantAliases?` (user-added) | B4, B3 |
| new `RecurrenceCandidate` (computed, not stored) | — | B5 |
| Supabase | `merchant_categories` (shared cache), `bank_connections`, `feed_transactions` | C, E |

Migration style follows the existing pattern (`App.tsx:5126` — tolerate absent
fields, default sensibly). Nothing here breaks old local snapshots.

---

## 6. Effort-metric targets over time

| Checkpoint | Zero-touch rate | Review rate | Touches/txn (median) | Unsorted rate |
|---|---|---|---|---|
| Today | 0% | 100% | ~6 | ~20–30% of imports |
| Stage A done (month 1) | ~15% (seeded recurring) | 100% | 2 | unchanged |
| Stage B done (month 2–3) | ~25% | <25% | 1–2 | ~10% |
| Stage C done (month 4, Pro) | ~25% | <15% | 1 | <5% |
| Stage D done (month 8, iOS+Wallet Pro) | >70% (connected users) | <15% | ≤1 | <5% |
| Stage E done (month 12–15, Pro) | >80% (connected users) | <10% | ≤1 | <3% |

These slot into the monetization plan's phase gates: Stage A–B improvements land
before the Pro launch (they lift retention, §5 Phase 0 gate), C launches *with*
Pro (a visible paid feature on day one), D1 gives Phase 3 its headline feature,
and E *is* Phase 4.

---

## 7. Free vs Pro alignment (delta to monetization plan §3)

| Automation feature | Free | Pro |
|---|---|---|
| Recurring auto-seed, merchant memory, quick add, paste import (Stage A) | ✅ | ✅ |
| Confidence triage, self-creating rules (within the 5-rule free cap), fuzzy matching, bank presets, OFX/QIF (Stage B) | ✅ | ✅ unlimited rules |
| Recurring/subscription detection + missed-payment signals (B5) | Detection ✅; signals summary only | ✅ full panel + notifications |
| AI categorization (Stage C) | — | ✅ |
| FinanceKit Wallet feed (D1) | — | ✅ |
| Screenshot OCR import (D2) | 2/month (mirrors CSV cap) | ✅ unlimited |
| Siri/widgets quick add (D3) | Basic | ✅ full |
| Open banking feeds (Stage E) | 1 account taster (per monetization plan) | ✅ |

Rationale unchanged from the monetization plan: manual-effort reducers are free
(wider funnel, better retention); *automatic* capture and intelligence are Pro.

---

## 8. Privacy commitments (bind all stages)

1. Stages A, B, D2 are 100% local computation — say so loudly; it is the moat.
2. Stage C sends **descriptions + sign only**, opt-in, Pro, never in privacy mode;
   shared cache stores no user linkage.
3. Stages D1/E: transaction data lands in the user's own RLS-protected rows;
   provider tokens server-side encrypted; disconnect = delete staged data.
4. No stage ever sells, shares, or monetizes transaction data itself
   (monetization plan §2 hard rule).

---

## 9. Build order summary & immediate next actions

Dependency chain: **A1→B5c** (seeding needs recurrence matching to close its dedupe
edge), **A2→A3/D3** (memory powers parsing and intents), **B1→C/D1/D2/E** (triage
is the universal review surface), **B2→C** (rules must outrank and absorb LLM
output), **D1→E2** (FinanceKit proves the FeedProvider shape).

This quarter, in order:

1. Instrument the four §1 effort metrics in PostHog. *(1–2 days — do first; every
   stage's exit criterion depends on it)*
2. Ship **A1** recurring auto-seed. *(3–4 days, biggest single win)*
3. Ship **A2** merchant memory, then **A3** quick add and **A4** paste import. *(~2.5 weeks)*
4. Ship **B1** triage + **B2** self-creating rules. *(~2 weeks)*
5. Ship **B3/B4/B5** (fuzzy, presets/OFX, recurrence engine). *(~4 weeks)*
6. Build the Stage C labelled fixture set (500 UK descriptors) while Pro billing
   (monetization Phase 1) is under construction, so `categorize-batch` can launch
   with the Pro tier.
7. File the Apple Finance-category + FinanceKit entitlement request as soon as
   the iOS project starts — the approval clock gates D1.
