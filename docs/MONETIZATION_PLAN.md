# Income Tracker — Monetization Plan

> **Status:** Planning document. Nothing in this file is implemented yet.
> **Scope:** How the app makes money, in what order to build it, revenue goals over
> time, and the features/infrastructure that must exist *before* charging anyone.
> **Audience:** Whoever builds the next 12–24 months of this product (human or agent).

---

## 1. Where the app is today (honest starting point)

What already exists and is monetizable:

| Asset | State | Monetization relevance |
|---|---|---|
| Web app (React 19 + Vite) | Shipped | The product itself |
| Monthly ledger (income/expenses, recurring flags) | Shipped | Core free feature |
| Accounts + net-worth tracking & forecast | Shipped | Strong Pro anchor |
| Savings goals + waterfall planner (`GoalsView.tsx`, `finance.ts`) | Shipped | Strong Pro anchor |
| CSV bank import + category rules + dedupe (`importer.ts`) | Shipped | Natural gating point (volume/automation) |
| Insights: health score, signals, forecast | Shipped | Pro anchor |
| Supabase auth (Google) + cloud sync (`supabase.ts`) | Shipped | **Identity backbone for billing** |
| Local-first storage (`storage.ts`) | Shipped | Trust/privacy differentiator — keep free |
| Polished landing page (`LandingPage.tsx`) | Shipped | Conversion surface — needs pricing section |
| Feedback table (Supabase migration) | Shipped | Qualitative signal for pricing research |
| iOS app spec (`docs/IOS_APP_SPEC.md`) | Spec only | Second platform + App Store IAP channel |
| Vercel Analytics + PostHog | Wired | Funnel measurement (needs revenue events) |

What does **not** exist yet (and blocks monetization):

- No payments integration (no Stripe, no IAP, nothing).
- No concept of a plan/entitlement anywhere in `types.ts` or the Supabase schema.
- No feature gating — every feature is available to everyone, signed in or not.
- No pricing page, no terms of service, no refund policy.
- No usage analytics tied to identity (can't yet answer "which features do retained
  users love?" — needed to pick the right paywall line).
- iOS app not yet built (spec only), so no App Store channel yet.

---

## 2. Recommended model: freemium subscription

**Recommendation: a single "Pro" subscription tier over a genuinely useful free tier.**

Why this model and not the alternatives:

| Model | Verdict | Reasoning |
|---|---|---|
| **Freemium subscription** | ✅ **Do this** | Matches category norms (YNAB ~£8/mo, Emma, Copilot, Monarch are all subscription). Recurring revenue matches recurring server costs (Supabase, future bank feeds). The app's monthly-budget cadence gives natural monthly engagement. |
| Ads | ❌ Never | Poisonous for a privacy-positioned finance app; local-first + "we show you ads based on your spending" is a contradiction that kills trust. CPMs on a small user base are pennies anyway. |
| One-time purchase | ❌ No (except lifetime SKU, §4) | Doesn't cover ongoing sync/bank-feed costs; category has trained users to expect subscription. |
| Selling data / affiliate "better deals" cross-sell | ❌ Not now | Regulatory and trust minefield; only worth revisiting at large scale, and only as clearly-labelled opt-in offers. |
| Donations / "pay what you want" | ❌ No | Doesn't scale, signals hobby project. |

**Positioning:** the free tier is the honest, local-first manual tracker (which it
already is today). Pro sells **automation, scale, and foresight**: unlimited import
automation, unlimited goals/accounts, the forecasting/insight engine, and eventually
automatic bank feeds. The free tier must stay good enough to be recommendable — free
users are the top of the funnel and the word-of-mouth engine.

**One hard rule: never take away something a user already relies on.** Existing users
at gating time get grandfathered (see §5, Phase 2). Clawing back shipped features is
the single most common way small finance apps torch their reputation.

---

## 3. Free vs Pro split

Design principle: gate on **scale and automation**, not on core correctness. A person
tracking one account and three goals by hand should never hit a paywall. A person
importing four bank CSVs a month with 30 category rules is getting real value — that's
who pays.

| Capability | Free | Pro |
|---|---|---|
| Monthly ledger (income/expenses, recurring) | ✅ Unlimited | ✅ |
| Local-first storage, no account needed | ✅ | ✅ |
| Cloud sync (Supabase) | ✅ 1 device history | ✅ full history + priority sync |
| Accounts (cash/savings/ISA/investment/pension/debt) | ✅ up to **3** | ✅ Unlimited |
| Savings goals + waterfall planner | ✅ up to **2 goals** | ✅ Unlimited, all funding modes |
| CSV import | ✅ **2 imports/month** | ✅ Unlimited |
| Category rules (auto-categorization) | ✅ up to **5 rules** | ✅ Unlimited |
| Net-worth forecast | ✅ 12-month horizon | ✅ Full horizon + scenario tweaks |
| Health score + signals | ✅ Score only | ✅ Score + full signals/insights detail |
| Debt payoff planning (linked payments, roll-forward) | ✅ 1 debt account | ✅ Unlimited |
| Data export (CSV/JSON) | ✅ Always free | ✅ |
| iOS widgets & app icons/themes (once iOS ships) | Basic widget | ✅ All widgets/themes |
| Automatic bank feeds (Phase 4, open banking) | — | ✅ Pro-only anchor |
| Priority support / feature votes | — | ✅ |

Notes:

- **Export is always free.** Local-first credibility requires that users can always
  leave with their data. This is a selling point, not a leak.
- The specific limits (3 accounts, 2 goals, 2 imports/mo, 5 rules) are starting
  hypotheses. Instrument first (Phase 0), then set the line just above the median
  free user and below the engaged user. Adjust before launch, not after.
- Everything currently shipped stays functional for existing users (grandfathering).

---

## 4. Pricing

UK-first app (£, ISAs, UK bank CSVs), so price in GBP with regional pricing later.

| SKU | Price | Rationale |
|---|---|---|
| Pro Monthly | **£4.99/mo** | Impulse-purchasable; well under YNAB (~£8–9/mo equiv) and Emma Plus (£9.99/mo) since we don't yet have bank feeds. |
| Pro Annual | **£39.99/yr** (~£3.33/mo, ~33% off) | Push hard toward annual: better cash flow, better retention. Default-select this on the paywall. |
| Lifetime (limited, launch only) | **£99** one-off, first ~200 buyers | Early-adopter reward + immediate cash + social proof ("200 founding members"). Cap and retire it — lifetime SKUs are a liability once bank feeds add per-user recurring cost. |

Price changes over time:

- **When bank feeds ship (Phase 4):** raise to £6.99/mo / £54.99/yr for *new*
  subscribers (bank-feed aggregators charge per connected user, so the price must
  cover it). Existing subscribers keep their price for at least 12 months —
  announce this loudly; honoring early prices is cheap goodwill.
- **App Store note:** Apple takes 15% (Small Business Program, <$1M/yr). Keep the
  same headline price on iOS and eat the margin difference — dual pricing confuses
  users. Web checkout (Stripe, ~2.9% + 30p) remains the preferred channel; the
  landing page should always route to web checkout.
- 7-day free trial on both SKUs, card required (higher-intent trials convert
  3–5x better than no-card trials in this category).

---

## 5. Roadmap: phases, requirements, and goals

Each phase lists **prerequisites (must exist before the phase counts as done)**,
the work items, and an exit criterion. Revenue goals for each period are in §6.

### Phase 0 — Measurement & groundwork (Weeks 1–4). *No money changes hands.*

You cannot place a paywall correctly without knowing what engaged users actually do.
This phase is the "requirements before monetisation" the plan depends on.

Requirements to build:

1. **Product analytics with identity.** Wire PostHog events (respecting the
   privacy posture — event names only, never transaction contents):
   `ledger_entry_added`, `csv_import_completed` (row count bucket),
   `category_rule_created`, `goal_created`, `account_added`, `forecast_viewed`,
   `health_score_viewed`, `signed_in`, `sync_enabled`, plus weekly-active retention.
   Identify signed-in users by Supabase `user_id`.
2. **Sign-in nudge (soft).** Cloud sync already requires auth; add gentle prompts at
   high-value moments (after first import, after first goal). Billing requires an
   account — the % of engaged users willing to sign in is the ceiling on
   conversion, so measure it now.
3. **Legal minimum.** Privacy policy + Terms of Service pages (static content,
   linked from landing page footer). Required by Stripe, Apple, and Google OAuth
   verification anyway.
4. **Pricing survey via existing feedback table.** One in-app question to engaged
   users ("would you pay £4/mo for X?") — cheap qualitative check on §3's split.
5. **Landing page prep.** Add a "Pricing" section with the free tier and a
   "Pro — coming soon, join the waitlist" card (waitlist = launch-day email list).

**Exit criteria:** 4+ weeks of retention/feature-usage data; waitlist collecting
emails; ToS/privacy live. **Decision gate:** if week-4 retention of signed-in users
is under ~15%, fix retention before building billing — a paywall on a leaky bucket
wastes the launch.

### Phase 1 — Billing infrastructure (Weeks 5–9). *Still no public launch.*

Technical foundation — see §7 for architecture detail.

1. Supabase schema: `subscriptions` table (user_id, stripe_customer_id,
   stripe_subscription_id, plan, status, current_period_end, source
   `stripe|apple`), RLS so users read only their own row.
2. Stripe: products/prices for the three SKUs, Stripe Checkout for purchase,
   Customer Portal for cancel/card management (build neither UI yourself).
3. Supabase Edge Function `stripe-webhook`: handles `checkout.session.completed`,
   `customer.subscription.updated/deleted`, `invoice.payment_failed` → upserts
   `subscriptions`.
4. Client entitlement layer: `useEntitlements()` hook reading the subscription row
   (cached in `LedgerState`-adjacent local storage so limits work offline;
   re-validated on sync). A single `entitlements.ts` module exports
   `limits = { accounts, goals, importsPerMonth, rules }` for free vs pro —
   **all gating reads from this one module**, no scattered plan checks.
5. Gating UI: reusable `<UpgradeGate>` component (shown when a limit is hit) and a
   `/upgrade` paywall screen: feature comparison, trial CTA, annual pre-selected.
6. Grandfathering: snapshot existing users (anyone with a cloud ledger or local
   state created before launch date) into a `legacy_free` entitlement that keeps
   today's unlimited behavior. New users get the free-tier limits.
7. Test mode end-to-end: trial start → payment → webhook → entitlement flip →
   cancel → downgrade behavior (over-limit data is never deleted, just read-only
   past the limit).

**Exit criterion:** a test user can buy, use Pro, cancel, and downgrade cleanly,
with entitlements correct on two devices.

### Phase 2 — Pro launch on web (Weeks 10–12) → first revenue

1. Flip on the free-tier limits for **new signups only**.
2. Launch sequence: waitlist email with founding-member lifetime offer → landing
   page pricing goes live → post to r/UKPersonalFinance, Hacker News (local-first
   angle plays well), personal networks.
3. In-app announcement for existing users: "you're grandfathered, here's what Pro
   adds" — converts goodwill into early subscriptions without coercion.
4. Instrument the funnel: paywall viewed → trial started → trial converted →
   month-2 retained. These four numbers drive everything in §6.
5. Weekly review cadence: adjust free limits *upward* if the paywall hits too
   early in the journey (measured, not guessed).

**Exit criterion:** first 50 paying subscribers; trial→paid conversion ≥ 40%;
refund/chargeback rate < 2%.

### Phase 3 — iOS app + IAP (Months 4–8)

The iOS spec (`docs/IOS_APP_SPEC.md`) is written; this phase funds and justifies it.

1. Build the iOS app per the spec (P0 screens first).
2. **RevenueCat** (or equivalent) for cross-platform entitlements: it reconciles
   Apple IAP receipts and Stripe subscriptions into one entitlement per user, so
   web-Pro users are Pro on iPhone and vice versa. Write its webhook into the same
   `subscriptions` table (`source: apple`).
3. StoreKit 2 paywall mirroring the web SKUs; join the Apple Small Business
   Program (15% commission) before launch.
4. Pro-only iOS candy: full widget set, alternate app icons, watch complications
   later. Widgets are the highest-retention surface on iOS — the basic widget is
   free (retention), the rich ones are Pro (conversion).
5. App Store Optimization: "income tracker", "budget planner UK", "net worth"
   keywords; screenshots led by the forecast + goals views.

**Exit criterion:** iOS app live, cross-platform entitlement verified, iOS
contributing ≥ 30% of new trials.

### Phase 4 — Bank feeds: the retention anchor (Months 9–15)

Automatic bank feeds are the single feature that moves this category from
"tried it" to "pays for years" — and they're expensive, which is *why* they're Pro-only.

1. Integrate a UK open-banking aggregator — **TrueLayer** or **GoCardless Bank
   Account Data** (both FCA-regulated AISPs; using them means the app itself does
   not need FCA authorization for account information, but confirm the agency
   model with them before build). Budget roughly £0.20–£0.60 per connected user
   per month at small volume.
2. Feed transactions into the **existing import pipeline** (`importer.ts` hash
   dedupe + category rules + debt-payment linking) — the CSV machinery becomes the
   normalization layer, which is a large head start.
3. Server-side sync worker (Supabase Edge Function on cron) pulls transactions
   for connected accounts; client merges like an import batch.
4. Raise new-subscriber pricing (§4). Bank feeds justify the increase.
5. Free users get a taste: connect **one** account, 30-day history — enough to
   feel the magic, not enough to live on.

**Exit criterion:** bank-feed users show materially higher month-6 retention than
CSV-only users (expect 1.5–2x); churn < 4%/mo among bank-feed subscribers.

### Phase 5 — Compounding growth (Months 15–24)

Only start once Phases 2–4 metrics are healthy.

- **Household/partner plan** (£6.99/mo covering 2 users, shared ledgers) — finance
  is a couples activity; this raises ARPU and halves churn (two people quitting
  is harder than one).
- **Annual review report** ("your year in money") — shareable, organic acquisition.
- **Android/PWA** hardening if inbound demand shows up.
- **Referral program:** give a month, get a month (Stripe coupons; cheap to build).
- Revisit clearly-labelled, opt-in savings-rate/switching offers **only** if scale
  justifies it and only with explicit consent — default remains: we don't monetize
  the data, we monetize the software.

---

## 6. Monetization goals over time

Assumptions (deliberately conservative; recalibrate monthly against actuals):
free→paid conversion 3% of monthly-active signed-in users at steady state (category
norm is 2–5%), trial→paid 40%+, monthly churn 5% early → 3.5% with bank feeds,
annual-plan mix 60% of subscribers.

| Milestone | Timing | MAU (signed-in) | Paying subs | MRR (blended ~£3.60/sub) | Gate to next phase |
|---|---|---|---|---|---|
| Phase 0 done | Month 1 | 200 | 0 | £0 | Retention ≥15% w4 |
| Pro launch (web) | Month 3 | 500 | 50 (incl. lifetime founders) | ~£180 + ~£3–5k one-off lifetime cash | Trial→paid ≥40% |
| Post-launch steady | Month 6 | 1,500 | 120 | ~£430 | Churn <6%/mo |
| iOS live | Month 8 | 3,000 | 250 | ~£900 | iOS ≥30% of trials |
| Bank feeds live | Month 12 | 6,000 | 550 | ~£2,200 (higher new-sub price) | Feed-user churn <4% |
| Scale check | Month 18 | 12,000 | 1,200 | ~£5,000 | CAC < 6-mo LTV |
| Sustainability | Month 24 | 20,000 | 2,200 | **~£9,500 (~£115k ARR)** | — |

Reading this table honestly: months 1–8 revenue is beer money — the real products of
that period are **retention data, billing infrastructure, and the iOS channel**.
The business case lives or dies on Phase 4 (bank feeds) lifting both willingness to
pay and long-term retention. If MAU growth stalls below ~2,000 by month 8, the
constraint is acquisition, not monetization — spend the effort on distribution
(SEO content around UK budgeting/ISA topics, the annual report share loop, ASO)
before touching pricing again.

Cost side (so goals mean profit, not just revenue): Supabase + Vercel ≤ £100/mo
until ~10k MAU; Stripe ~3%; Apple 15% on iOS-purchased subs; bank feeds the
dominant marginal cost after Phase 4 (~£0.40/connected user/mo — covered by the
Phase 4 price rise).

---

## 7. Technical architecture for payments (reference)

```
                    ┌────────────────────────┐
  Web app ─────────▶│  Stripe Checkout/Portal│──┐
  (React)           └────────────────────────┘  │  webhooks
                                                ▼
  iOS app ─────────▶┌────────────────────────┐ ┌──────────────────────────┐
  (StoreKit 2)      │  RevenueCat            │▶│ Supabase Edge Functions  │
                    └────────────────────────┘ │  stripe-webhook          │
                                               │  revenuecat-webhook      │
                                               └───────────┬──────────────┘
                                                           ▼
                                               ┌──────────────────────────┐
                                               │ subscriptions table (RLS)│
                                               └───────────┬──────────────┘
                                                           ▼
                                    client useEntitlements() ← cached locally,
                                    single source: src/entitlements.ts limits
```

Implementation rules:

- **One entitlement module.** All limits live in `src/entitlements.ts`; UI
  components ask "can I add another account?" — they never inspect plan names.
  This keeps grandfathering, promos, and limit tuning one-file changes.
- **Local-first still works.** Entitlements cache locally with a grace period
  (7 days) so a Pro user offline isn't locked out; free limits are enforced
  client-side (acceptable — this is a consumer app, not DRM; server enforces the
  only expensive resource, bank-feed pulls, in Phase 4).
- **Downgrade never deletes.** Over-limit accounts/goals/rules become read-only,
  clearly labeled, one tap from reactivating via the paywall.
- **Never build your own card forms, invoicing, or cancel flow.** Stripe Checkout
  + Customer Portal, full stop.

---

## 8. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Gating angers existing users | Medium | Grandfather everyone pre-launch (§5 Phase 1.6); communicate before flipping limits. |
| Paywall placed on the wrong feature | Medium | Phase 0 instrumentation *before* choosing final limits; adjust limits upward freely, never downward. |
| Bank-feed costs exceed revenue per user | Medium | Pro-only, price rise at Phase 4, per-user connection cap (e.g. 10 accounts). |
| Regulatory (open banking) | Low–Med | Use an FCA-regulated aggregator (TrueLayer/GoCardless) under their agency model; confirm scope in writing before building Phase 4. |
| Apple rejects or takes 30% | Low | Small Business Program (15%); web checkout remains primary channel; never link from the iOS app to web pricing in ways that violate App Review 3.1.1 (follow current rules at build time — they're in flux). |
| Lifetime SKU becomes a cost liability | Low | Hard cap (~200), retire at Phase 4, excluded from bank-feed connection guarantees beyond fair use. |
| Solo-maintainer bus factor on billing bugs | Medium | Webhook handlers idempotent + logged; Stripe is source of truth — a re-sync job can rebuild the `subscriptions` table from Stripe at any time. |

---

## 9. Immediate next actions (this quarter)

1. Wire PostHog identity + the Phase 0 event list. *(days)*
2. Ship privacy policy + ToS pages and landing-page pricing/waitlist section. *(days)*
3. Add the in-app pricing survey question via the existing feedback table. *(day)*
4. Create the `subscriptions` migration + Stripe test-mode products. *(week)*
5. Build `entitlements.ts` + `useEntitlements()` + `<UpgradeGate>` behind a flag. *(1–2 weeks)*
6. Re-read this plan when week-4 retention data lands and set the final free-tier
   limits from data, not from the guesses in §3.
