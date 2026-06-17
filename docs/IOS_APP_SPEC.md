# Income Tracker — iOS App Specification

> **Status:** Implementation-ready spec for an autonomous coding agent.
> **Target:** A native iOS app that brings the existing **Income Tracker** web app
> (React 19 + Vite + Supabase, see `src/`) to iPhone with first-class iOS UX.
> **Source of truth for business logic:** `src/finance.ts`, `src/types.ts`,
> `src/importer.ts`, `src/supabase.ts`. Port these faithfully — do not reinvent the math.

---

## 0. How to use this document (for the implementing agent)

1. Read `src/types.ts` and `src/finance.ts` **before writing any Swift**. The domain
   model and every calculation must match the web app exactly so a user's cloud-synced
   ledger renders identically on both platforms.
2. Build in the **phase order** in §18. Each phase is independently buildable and testable.
3. Where this document and the TypeScript source disagree, **the TypeScript source wins**
   for data/calculations; **this document wins** for iOS UI, gestures, and animation.
4. Every screen section below has: **Layout**, **Data**, **Gestures**, **Animations**,
   **Haptics**, **Accessibility**, and **Empty/Loading/Error states**. Implement all seven.
5. Definition of done per screen: matches layout spec, all gestures wired, animations use
   the tokens in §11, VoiceOver-navigable, Dynamic Type to XXL without clipping, passes
   the snapshot + unit tests in §19.

---

## 1. Product summary

Income Tracker is a **local-first personal finance app**. The user records monthly income
and expenses, tracks accounts (cash, savings, investments, debt), sets savings goals with a
waterfall planner, imports bank CSVs, and reads computed insights (net-worth forecast,
health score, financial signals). Data lives on-device and optionally syncs to Supabase
when signed in.

### Feature parity targets (from the web app)

| Web view | iOS equivalent | Priority |
|----------|----------------|----------|
| Dashboard | `DashboardScreen` (tab 1) | P0 |
| Ledger (month budget) | `LedgerScreen` (tab 2) | P0 |
| Accounts | `AccountsScreen` (tab 3) | P0 |
| Goals | `GoalsScreen` (tab 4) | P1 |
| Insights | `InsightsScreen` (tab 5) | P1 |
| Settings / Management Hub | `SettingsScreen` (modal/profile) | P0 |
| CSV import + review | `ImportFlow` (sheet) | P1 |
| Google sign-in + cloud sync | Sign in with Apple + Google via Supabase | P0 |
| Feedback submission | `FeedbackSheet` | P2 |

### iOS-only additions (net-new value, justify the native build)

- **Home Screen + Lock Screen widgets** (surplus, net worth, next bill due).
- **Live Activity / Dynamic Island** for an in-progress CSV import or sync.
- **Face ID / Optic ID gate** wired to the existing `privacyMode` concept.
- **Local notifications** for bill due dates (from `Account.dueDay` / `minimumPayment`).
- **Swipe actions, context menus, haptics, drag-to-reorder** native interactions.
- **Siri Shortcuts / App Intents**: "Add expense", "What's my surplus this month?".

---

## 2. Tech stack & project setup

| Concern | Choice | Notes |
|---------|--------|-------|
| Language | **Swift 6** (strict concurrency) | |
| UI | **SwiftUI** (primary) + UIKit bridges where needed | UIKit only for: drag-reorder edge cases, haptic engine, document picker. |
| Min target | **iOS 17.0** | Enables SwiftData, `ScrollView` APIs, `.symbolEffect`, `ContentUnavailableView`, `@Observable`, Charts polish. |
| Charts | **Swift Charts** (`import Charts`) | Replaces the hand-rolled SVG charts in `src/App.tsx`. |
| Persistence | **SwiftData** (`@Model`) | Local-first mirror of `LedgerState`. |
| Networking / sync | **supabase-swift** (`supabase-community/supabase-swift`) | Same project as web: `hgzacqveqrccnvjwumkz`. |
| Auth | **Sign in with Apple** (primary) + **Google** via Supabase OAuth | Apple sign-in is an App Store requirement when offering Google. |
| Auth helper | `AuthenticationServices` (ASAuthorizationController) | |
| Keychain | `KeychainAccess` or hand-rolled wrapper | Store Supabase session + privacy toggle. |
| Dependency mgmt | **Swift Package Manager** only | No CocoaPods. |
| Min Xcode | 16 | |
| Architecture | **MVVM + Repository**, `@Observable` view models | |
| Analytics | PostHog iOS SDK (optional, mirror web) | Gate behind consent. |

**Why native, not Capacitor/React Native:** the brief demands iOS-specific gestures,
animations, haptics, widgets, and Live Activities. These require native SwiftUI/UIKit.
A Capacitor wrapper would reuse `finance.ts` but cannot deliver the interaction quality
requested. The tradeoff accepted here is **re-porting the calculation engine to Swift**
(§5), covered by a golden-file parity test against the TS output (§19).

### Bundle / target structure

```
IncomeTracker.xcodeproj
├── IncomeTracker/                 (main app target)
│   ├── App/                       App entry, root tab view, deep links
│   ├── Models/                    SwiftData @Model + value types (port of types.ts)
│   ├── Engine/                    Calculation engine (port of finance.ts)
│   ├── Importer/                  CSV parsing (port of importer.ts)
│   ├── Sync/                      Supabase client, auth, merge logic
│   ├── DesignSystem/              Colors, typography, spacing, haptics, components
│   ├── Features/
│   │   ├── Dashboard/
│   │   ├── Ledger/
│   │   ├── Accounts/
│   │   ├── Goals/
│   │   ├── Insights/
│   │   ├── Settings/
│   │   ├── Import/
│   │   └── Feedback/
│   └── Resources/                 Assets.xcassets, Localizable.strings
├── IncomeTrackerWidgets/          (widget extension)
├── IncomeTrackerIntents/          (App Intents / Siri)
└── IncomeTrackerTests/            (unit + parity + snapshot tests)
```

---

## 3. Architecture

### Local-first data flow (mirror of the web app)

```
            ┌─────────────────────────────────────────────┐
            │                 SwiftData                     │
            │  Single LedgerStateModel (mirror of state)    │
            └───────▲───────────────────────────▲──────────┘
                    │ read/write                 │ hydrate on launch
            ┌───────┴───────┐           ┌────────┴─────────┐
            │  ViewModels    │           │  SyncCoordinator │
            │  (@Observable) │           │  (Supabase)      │
            └───────▲───────┘           └────────▲─────────┘
                    │ bind                         │ debounced push (300ms)
            ┌───────┴───────┐                      │ pull on sign-in
            │   SwiftUI      │              ┌───────┴────────┐
            │   Views        │              │  ledgerlite_*  │ (Postgres + RLS)
            └────────────────┘              └────────────────┘
```

- **Single source of truth on device:** one `LedgerStateModel` row, exactly like the web app
  keeps one `LedgerState` object. All mutations go through a `LedgerStore` (`@Observable`)
  that wraps SwiftData and emits change events.
- **Autosave:** every mutation marks the store dirty; a 300ms debounce persists to SwiftData
  and (if authed) pushes to Supabase via `saveCloudLedgerState`. Mirror `src/supabase.ts`.
- **Sync conflict:** on sign-in, if cloud and local both have data and differ, present the
  **MergeConflictSheet** (§9.7) — identical decision to web's `MergeConflictModal`
  (keep local vs. use cloud, no auto-merge).
- **Schema version:** `CURRENT_SCHEMA_VERSION = 7` (see `finance.ts:25`). Persist it; if a
  cloud payload has a higher version than the app supports, show a "please update" gate.

### Concurrency

- `LedgerStore` is `@MainActor`. Calculations in `Engine/` are pure, `Sendable`, and run on a
  background actor for large forecasts (60-month net-worth outlook, goal waterfall).
- Supabase calls are `async`; UI shows the `SaveStatusPill` (§9.6) state machine:
  `loading → saved`, `change → saving → saved`, `error → offline`.

---

## 4. Domain model (Swift port of `src/types.ts`)

Port every type. Use `struct` value types for the ledger payload (Codable, matches the JSON
that syncs to Supabase) and a thin SwiftData `@Model` wrapper holding the encoded blob +
indexed fields. This guarantees the synced JSON is byte-compatible with the web app.

> **Critical:** the Codable encoding must produce the **same JSON shape** as the web app's
> `LedgerState` (camelCase keys, same enum string values). Add a round-trip test that loads a
> web-exported JSON fixture and re-encodes it without drift (§19).

```swift
// Enums — string raw values MUST match the TS union string literals.
enum CurrencyCode: String, Codable, CaseIterable { case GBP, USD, EUR, CAD, AUD, INR, JPY }
enum GoalFundingMode: String, Codable { case fixed, fill, auto }
enum TransactionKind: String, Codable { case income, expense, debtPayment = "debt-payment", transfer }
enum AccountClass: String, Codable { case cash, savings, investment, debt }
enum AssetAccountType: String, Codable { case current, savings, isa, investment, pension, otherAsset = "other-asset" }
enum DebtAccountType: String, Codable { case creditCard = "credit-card", loan, overdraft, other }
enum FinancialSignalTone: String, Codable { case good, info, warning, danger }
enum GoalStatus: String, Codable { case complete, onTrack = "on-track", tight, atRisk = "at-risk", noDeadline = "no-deadline" }

struct IncomeEntry: Codable, Identifiable, Hashable {
    let id: String
    var source: String
    var amount: Double
    var color: String        // hex; see palette in finance.ts:47
    var recurring: Bool      // manual entries default true; imported default false
    var date: String?        // ISO yyyy-MM-dd
    var imported: ImportedTransactionMeta?
}

struct ExpenseEntry: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var category: String
    var amount: Double
    var color: String
    var recurring: Bool
    var date: String?
    var imported: ImportedTransactionMeta?
}

struct MonthBudget: Codable, Hashable {
    var incomes: [IncomeEntry]
    var expenses: [ExpenseEntry]
    var note: String
}

struct SavingsGoal: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var target: Double
    var saved: Double
    var color: String
    var priority: Int            // 1 = highest, ascending
    var fundingMode: GoalFundingMode
    var monthlyAmount: Double
    var deadlineMonths: Int      // 0 = none
    var interestRate: Double     // AER %, compounded monthly; 0 = flat
    var note: String
    var createdAt: String
}

struct Account: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var accountClass: AccountClass
    var type: AccountType        // union of Asset/Debt types
    var balance: Double
    var rate: Double             // APR (debt) / AER (savings) / expected return (investment)
    var promoRate: Double
    var promoMonths: Int
    var monthlyContribution: Double  // assets only
    var creditLimit: Double          // debt only
    var minimumPayment: Double       // debt only
    var dueDay: Int                  // debt only, 1–28ish
    var includeInNetWorth: Bool
    var color: String
    var note: String
}

struct CategoryRule: Codable, Identifiable, Hashable {
    let id: String; var pattern: String; var category: String
    var kind: TransactionKind; var createdAt: String; var updatedAt: String
}

struct ImportedTransactionMeta: Codable, Hashable {
    var batchId: String; var fileName: String; var rowNumber: Int
    var hash: String; var originalDescription: String; var importedAt: String
}

struct ImportBatch: Codable, Identifiable, Hashable {
    let id: String; var fileName: String; var importedAt: String
    var totalRows: Int; var importedRows: Int; var skippedRows: Int
    var transactionRefs: [ImportedTransactionRef]
}

struct LedgerState: Codable {
    var schemaVersion: Int
    var currency: CurrencyCode
    var selectedMonth: String                 // "yyyy-MM"
    var months: [String: MonthBudget]
    var goals: [SavingsGoal]
    var goalPlannerSurplus: Double?
    var goalsHorizonMonths: Int               // default 60
    var ledgerGoalId: String?
    var savingsTarget: Double
    var accounts: [Account]
    var assumedInvestmentReturn: Double
    var categoryRules: [CategoryRule]
    var importBatches: [ImportBatch]
    var privacyMode: Bool
    var lastSavedAt: String
}
```

Computed/derived types (`Projection`, `DebtSummary`, `AssetSummary`, `NetWorthSummary`,
`NetWorthPoint`, `MonthlyFlowPoint`, `FinancialSignal`, `HealthScoreBreakdown`,
`GoalMonthPoint`, `GoalOutcome`, `GoalSequenceResult`) — port 1:1 from `types.ts`
lines 147–271. These are outputs of the engine, never persisted.

---

## 5. Calculation engine (Swift port of `src/finance.ts`)

Create `Engine/FinanceEngine.swift` (+ split files). Port these **pure functions** exactly —
same names, same semantics, same rounding. They are the heart of the app and must produce
identical numbers to the web app for the same input.

| Function (finance.ts) | Swift signature | Notes |
|-----------------------|-----------------|-------|
| `monthlyRateFromAnnual` | `func monthlyRate(fromAnnual pct: Double) -> Double` | compound monthly derivation |
| `effectiveAnnualRate` | `func effectiveAnnualRate(_ a: Account, monthIndex: Int) -> Double` | promo period then base rate |
| `calculateProjection` | `func projection(for month: MonthBudget) -> Projection` | recurring vs one-off split |
| `calculateDebtSummary` | `func debtSummary(_ accts: [Account]) -> DebtSummary` | utilization, weighted APR |
| `calculateAssetSummary` | `func assetSummary(_ accts: [Account]) -> AssetSummary` | |
| `calculateNetWorthSummary` | `func netWorthSummary(_ accts: [Account]) -> NetWorthSummary` | |
| `buildNetWorthOutlook` | `func netWorthOutlook(...) -> [NetWorthPoint]` | month-by-month forecast w/ interest+growth |
| `buildMonthlyFlowPoints` | `func monthlyFlowPoints(_ s: LedgerState) -> [MonthlyFlowPoint]` | |
| `calculateHealthScore` | `func healthScore(...) -> HealthScoreBreakdown` | 5 sub-scores + estimated credit score |
| `buildFinancialSignals` | `func financialSignals(...) -> [FinancialSignal]` | anomaly/insight rules |
| `runGoalSequence` | `func runGoalSequence(...) -> GoalSequenceResult` | priority waterfall, deadlines, interest |
| `seedMonthFromPrevious` | `func seedMonth(from prev: MonthBudget?) -> MonthBudget` | carries recurring items forward |
| `buildCsvExport` | `func csvExport(_ s: LedgerState) -> String` | |
| `getCurrencyFormatter` / `getCurrencySymbol` | use `Decimal` + `NumberFormatter` / `Locale` | match locales in `currencyOptions` (finance.ts:49) |

Constants to mirror: `CURRENT_SCHEMA_VERSION = 7`, `DEFAULT_INVESTMENT_RETURN = 6`,
`ASSET_CLASSES = [cash, savings, investment]`, color palette
`["#12b886","#6c5ce7","#ff6b6b","#f59f00","#15aabf","#845ef7","#51cf66","#ff922b"]`.

> Use `Double` to match JS `number` semantics (the web app uses floats). Do **not** switch to
> `Decimal` for the engine or parity tests will drift; reserve `Decimal`/`NumberFormatter`
> for display formatting only.

**Parity test (mandatory):** generate a JSON fixture of inputs+expected outputs by running
the TS functions in Node (a small script under `IncomeTrackerTests/Fixtures/gen/`), then
assert the Swift engine reproduces every field within `1e-6`. See §19.

---

## 6. CSV import (Swift port of `src/importer.ts`)

- Port `parseBankCsv`, `buildRulePattern`, `isTransferDescription`, `sortImportRows`,
  and the `CsvImportRow` shape.
- **File access:** `UIDocumentPickerViewController` (or SwiftUI `.fileImporter`) limited to
  `.commaSeparatedText` / `.text`. Also accept CSV via the **Share Sheet** (register a
  document type + handle in `onOpenURL`).
- **Review UI:** `ImportReviewSheet` — a row-per-transaction list with kind selector
  (income / expense / debt-payment / transfer), category picker, date, duplicate flag, and an
  "include" toggle. Mirror the web `ImportReviewModal`: bulk "apply category to included",
  "skip duplicates", select-all. On confirm, learn `CategoryRule`s and sweep transfers.
- **Live Activity (optional, P3):** show parse/commit progress in the Dynamic Island for large
  files.

---

## 7. Authentication & sync

- **Sign in with Apple** is the primary button (required by App Store §4.8 when Google is
  offered). Use Supabase's `signInWithIdToken(provider: .apple)` with the Apple nonce flow.
- **Google** secondary, via `signInWithOAuth(provider: .google)` + `ASWebAuthenticationSession`,
  redirect back through a custom URL scheme `incometracker://auth-callback`.
- Persist the Supabase session in **Keychain**; restore on launch (mirror web's
  `getCurrentSession`).
- Mirror web functions: `upsertUserProfile`, `loadCloudLedgerState`, `saveCloudLedgerState`.
  Tables `ledgerlite_profiles`, `ledgerlite_states` already exist with RLS.
- **Anonymous-first:** the app is fully usable signed-out (local only). Sign-in is a sync
  upgrade, exactly like the web app. Show a non-blocking **SyncNudge** (§9.7) after first
  meaningful use.

---

## 8. Design system

The web app is **dark-only** with a deep navy palette. iOS should ship **dark by default**
but provide a derived **light** appearance and respect the system setting. Anchor on the
existing brand colors.

### 8.1 Color tokens (`Assets.xcassets`, semantic, both appearances)

Map the CSS variables in `src/styles.css:1–34` to named colors. Provide Dark (authoritative)
and a derived Light value.

| Semantic name | Dark (from CSS) | Light (derive) | Usage |
|---------------|-----------------|----------------|-------|
| `bg` | `#051424` | `#F4F7FB` | app background |
| `bgDeep` | `#010F1F` | `#E9EEF5` | gradient base / sheets |
| `surface` | `#122131` | `#FFFFFF` | cards |
| `surfaceHigh` | `#1C2B3C` | `#F0F4F9` | raised cards |
| `surfaceHigher` | `#273647` | `#E4EBF3` | inputs / pressed |
| `ink` | `#D4E4FA` | `#0B1C2E` | primary text |
| `muted` | `#9EA8B7` | `#5A6B7E` | secondary text |
| `faint` | `#6F7B8C` | `#8A98A8` | tertiary text |
| `line` | `rgba(198,198,203,.12)` | `rgba(11,28,46,.10)` | hairlines |
| `lineStrong` | `rgba(198,198,203,.28)` | `rgba(11,28,46,.20)` | borders |
| `blue` (accent) | `#3291FF` | `#0A6CEC` | primary actions, selection |
| `mint` (positive) | `#00DFC1` | `#00B89E` | surplus, success, savings |
| `red` (negative) | `#FFB4AB` | `#D6453B` | overspend, danger |
| `amber` (caution) | `#F4C36A` | `#C8941F` | warnings |

Category/series colors: use the 8-color palette from `finance.ts:47` verbatim (stored on each
entry as `color`). Render charts and dots from the stored hex so they match the web exactly.

### 8.2 Typography

- **Body / UI:** SF Pro (system). Use Dynamic Type text styles (`.largeTitle`…`.caption2`).
  The web uses Inter; SF Pro is the correct iOS substitute — do not bundle Inter.
- **Numerals / money:** use **`.monospacedDigit()`** on all currency and metric values so digits
  don't jitter during count-up animations (the web uses Geist Mono for this; SF Mono digits via
  the modifier is the native equivalent).
- Scale: Title `.largeTitle.bold()`, screen section header `.headline`, metric value
  `.system(.title, design: .rounded).monospacedDigit()`, labels `.subheadline`, captions
  `.caption`.

### 8.3 Spacing, radius, elevation

- Spacing scale (pt): `4, 8, 12, 16, 20, 24, 32`. Default screen padding `16`.
- Corner radius: small `8`, card `16`, sheet `24` (continuous corner curve:
  `.clipShape(.rect(cornerRadius: 16, style: .continuous))`). Note the web uses tiny radii
  (3–8px); iOS convention is rounder — **use the iOS values**, not the web's.
- Cards: `surface` fill, 1px `line` stroke, soft shadow `radius 20, y 8, color black @ 18%`
  (dark) / `8%` (light). No glassmorphism blur on cards except sheets/nav (use `.ultraThinMaterial`).

### 8.4 SF Symbols (replace lucide-react icons)

| lucide (web) | SF Symbol (iOS) |
|--------------|-----------------|
| LayoutDashboard | `square.grid.2x2` |
| ReceiptText (Ledger) | `list.bullet.rectangle` |
| WalletCards (Accounts) | `creditcard` |
| Target (Goals) | `target` |
| LineChart (Insights) | `chart.line.uptrend.xyaxis` |
| Settings | `gearshape` |
| Plus | `plus` |
| Trash2 | `trash` |
| Search | `magnifyingglass` |
| Cloud | `icloud` |
| ShieldCheck | `checkmark.shield` |
| Eye / EyeOff (privacy) | `eye` / `eye.slash` |
| Download / Upload | `square.and.arrow.down` / `square.and.arrow.up` |
| Repeat (recurring/transfer) | `arrow.triangle.2.circlepath` |
| TrendingUp | `chart.line.uptrend.xyaxis` |
| PiggyBank | `banknote` |
| CreditCard (debt) | `creditcard.trianglebadge.exclamationmark` |
| MessageSquarePlus (feedback) | `bubble.left.and.text.bubble.right` |
| LogIn / LogOut | `person.crop.circle` / `rectangle.portrait.and.arrow.right` |

Prefer `.symbolRenderingMode(.hierarchical)` and animate state changes with
`.contentTransition(.symbolEffect(.replace))`.

### 8.5 Reusable components (build these first, in `DesignSystem/`)

- `Card` — padded rounded container (the web `Panel`).
- `MetricCard` — label + animated value + tone color + privacy masking (web `MetricCard`).
- `MoneyText` — formats a `Double` with the active `CurrencyCode`, monospaced digits, optional
  privacy blur.
- `AnimatedMoneyText` — count-up using `.contentTransition(.numericText())` or a `TimelineView`
  tween (web `AnimatedCurrency`).
- `Pill` / `StatusPill` — save-state + tone chips.
- `TonePicker` / segmented control for funding mode, kind, account class.
- `EmptyStateView` — wrap `ContentUnavailableView` with brand styling.
- `PrivacyBlur` — `.redacted`/`.blur` overlay toggled by `privacyMode`.

---

## 9. Navigation & global UI

### 9.1 Root structure

`TabView` with 5 tabs (Dashboard, Ledger, Accounts, Goals, Insights). Settings is **not** a
tab — it's reached via a profile/gear button in the top-trailing toolbar of Dashboard (and is
presented as a `.sheet` with its own `NavigationStack`), mirroring the web where Settings is a
secondary destination. Feedback and Import are sheets.

- iOS 17: standard `TabView`. If targeting iOS 18+ later, adopt the floating tab bar + sidebar
  adaptivity, but **iOS 17 bottom tab bar is the baseline**.
- Each tab hosts a `NavigationStack`. Large titles on top-level screens
  (`.navigationBarTitleDisplayMode(.large)`), inline on pushed detail screens.
- Tab bar uses `.ultraThinMaterial` background; selected item tinted `blue`.

### 9.2 Month context

The selected month (`selectedMonth`) is global state shown in the Ledger and Dashboard. A
**month switcher** appears as a centered title control on Ledger: tappable to open a
`.sheet` month picker (wheel or compact calendar), with `chevron.left/right` for prev/next.
Swiping horizontally on the Ledger content also changes month (§10.2).

### 9.3 Global search

`.searchable` on Ledger filters transactions by name/category (web parity). Provide a
`Cmd+K`-equivalent: a search button in the toolbar. Results highlight matched rows.

### 9.4 Privacy mode

Toggle in Settings **and** a quick toggle (long-press the profile icon → "Hide amounts").
When on, all money values render via `PrivacyBlur`. Optionally gate app open with **Face ID**
(`LocalAuthentication`) when privacy mode is enabled — store preference in Keychain. On failed
/ unavailable biometrics, fall back to showing blurred values until manually revealed.

### 9.5 Save status

A subtle `StatusPill` in the nav bar reflects the sync state machine (loading/saving/saved/
offline). Auto-hides 2s after reaching "saved". Mirrors the web `StatusPill`.

### 9.6 Empty / loading / error (global rules)

- Loading hydration: branded splash → skeleton shimmer on cards (`.redacted(reason:.placeholder)`).
- Empty: `ContentUnavailableView` with a relevant SF Symbol, one-line guidance, and a primary CTA.
- Error (sync): non-blocking toast + `StatusPill` "offline"; never lose local edits.

### 9.7 Global sheets

- **SyncNudge** — bottom card, appears ~60s after first use if signed out; "Back up your data"
  → Sign in. Dismissible, remembered.
- **MergeConflictSheet** — two large choice cards ("Keep this device's data" / "Use cloud
  data") with transaction + month counts. No auto-merge. Non-dismissible until chosen.
- **FeedbackSheet** — type segmented control (Bug / Feature / General), subject, description,
  optional email; submits to `ledgerlite_feedback` (table already exists). Success → checkmark
  animation, auto-dismiss after 2s.

---

## 10. Screen specifications

> Each screen lists Layout · Data · Gestures · Animations · Haptics · Accessibility ·
> States. Animation/haptic tokens are defined in §11–12.

### 10.1 Dashboard (`DashboardScreen`, tab 1, P0)

**Layout** (vertical `ScrollView`):
1. Greeting header + month label + profile/gear button (top-trailing).
2. **Net-worth hero card**: large `AnimatedMoneyText` net worth, sparkline of the
   `buildNetWorthOutlook` forecast, horizon segmented control (12 / 24 / 60 mo).
3. **Metric row** (2×2 grid of `MetricCard`): Income, Outputs, Surplus, Savings rate — for
   `selectedMonth` from `calculateProjection`.
4. **Mini transaction history**: latest entries of the month (tap → Ledger).
5. **Accounts/debt summary** strip: total assets, total debt, utilization.
6. **Quick actions**: "Add transaction", "Import CSV", "Manage accounts".

**Data:** `projection(for: currentMonth)`, `netWorthSummary`, `debtSummary`,
`netWorthOutlook(horizon:)`.

**Gestures:** pull-to-refresh (force a sync pull); horizontal swipe on the hero chart scrubs
the forecast and shows a value tooltip; tap metric → drill into Insights; long-press a quick
action → context menu of related actions.

**Animations:** on appear, cards stagger in (`.transition(.move(.bottom)+.opacity)`, 40ms
stagger). Metric values **count up** with `numericText` content transition. Horizon change
**crossfades + re-springs** the sparkline (`matchedGeometryEffect` on the axis baseline).
Net-worth number morphs with `.contentTransition(.numericText(value:))`.

**Haptics:** `.selection` on horizon change and chart scrub ticks; `.impact(.light)` on quick
action tap.

**Accessibility:** hero exposes an accessibility value "Net worth £X, projected £Y in 24
months". Chart has an `.accessibilityChartDescriptor`. Metric cards are single elements with
combined label+value.

**States:** no data → `ContentUnavailableView("Add your first month", systemImage:
"list.bullet.rectangle")` + CTA to Ledger.

### 10.2 Ledger (`LedgerScreen`, tab 2, P0)

The core data-entry screen. Web shows two columns (Income | Expenses); on iPhone, stack as
**two sections in one list** (Income section, then Expenses section grouped by category).

**Layout:**
- Month switcher as the navigation title control (tap → month picker; chevrons; swipe).
- Section **Income**: rows of `IncomeRow` (source, amount, recurring indicator). Section
  footer shows total.
- Section **Expenses**: grouped by `category` with collapsible headers showing category
  subtotal + color dot. Rows show name, amount, recurring indicator.
- Floating **"+" button** (bottom-trailing) → Add sheet (income or expense, segmented).
- A live **surplus bar** pinned under the nav bar (income − expenses for the month).

**Data:** `months[selectedMonth]`, `calculateProjection`. New months seed via
`seedMonthFromPrevious` (carry recurring items) — prompt "Start from last month?" the first
time a future empty month is opened.

**Gestures (the iOS centerpiece):**
- **Swipe row leading→trailing**: reveal **Delete** (`trash`, destructive red) and
  **Duplicate**. `.swipeActions`.
- **Swipe trailing→leading**: **toggle recurring** (`arrow.triangle.2.circlepath`) and
  **Edit**.
- **Tap row**: inline edit (push a detail editor or expand-in-place with a focused `TextField`
  + numeric keypad). Commit on return/blur (web parity).
- **Long-press an expense row**: context menu — Move to category ▸ (submenu of categories),
  Mark recurring, Make one-off, Delete. Mirrors the web right-click category menu.
- **Drag-to-recategorize**: long-press + drag an expense onto a category header to regroup
  (`.draggable` / `.dropDestination`). Provide a drag preview chip with the row's color dot.
- **Collapse/expand** category: tap header; chevron rotates.
- **Horizontal swipe on whole list** (from screen edge or two-finger): previous/next month,
  with a paged slide transition.
- **Pull-to-refresh**: sync.

**Animations:**
- Row insert/delete: spring slide + fade; deleting collapses the row height.
- Recurring toggle: the `arrow.triangle.2.circlepath` symbol does `.symbolEffect(.bounce)`;
  row tints briefly.
- Category collapse: `.animation(.snappy)` height change; chevron `rotationEffect`.
- Drag: source row dims to 0.5, target header highlights with `mint` ring; on drop, the row
  **flies** to the new section via `matchedGeometryEffect`.
- Month change: horizontal `.push`/paging transition; totals re-count-up.
- Surplus bar fills left-positive (mint) / right-negative (red) with a spring width change.

**Haptics:** `.impact(.rigid)` when a swipe action fully reveals; `.notification(.success)`
on successful add; `.impact(.medium)` on drag pickup; `.selection` on drop into a category;
`.impact(.soft)` on month page change.

**Accessibility:** rows are buttons with custom actions ("Delete", "Toggle recurring", "Edit",
"Move to category") exposed via `.accessibilityActions` so VoiceOver users get swipe/menu
parity. Category headers announce subtotal and collapsed state.

**States:** empty month → `ContentUnavailableView` "No entries yet" + "Add income" / "Add
expense" / "Copy last month".

### 10.3 Accounts (`AccountsScreen`, tab 3, P0)

**Layout:** segmented filter (All / Cash / Savings / Investment / Debt). Section per class.
Each `AccountRow`: name, balance, class color, and a secondary line (rate / utilization /
contribution depending on class). Top summary card: net worth = assets − debt, with a
horizontal stacked bar (assets vs debt). "+" adds an account.

**Account editor** (detail / sheet): name, class picker (cash/savings/investment/debt — drives
which fields show), type, balance, rate (APR/AER/return label adapts to class), promo rate +
promo months, monthly contribution (assets), credit limit / minimum payment / due day (debt),
include-in-net-worth toggle, color, note. Inline numeric editing with the right keypad.

**Data:** `accounts`, `assetSummary`, `debtSummary`, `netWorthSummary`.

**Gestures:** swipe to delete; long-press → duplicate / toggle include-in-net-worth; tap →
editor; drag-to-reorder within a class section (`.onMove`, persists order).

**Animations:** balance edits re-count-up; the stacked net-worth bar springs to new
proportions; promo-period fields **slide/expand** in when promo months > 0; class change
**crossfades** the field set.

**Haptics:** `.selection` on class/segment change; `.impact(.light)` on reorder pickup;
`.notification(.warning)` if utilization crosses 80% after an edit.

**Accessibility:** rate fields labelled with their meaning per class ("Annual interest 4.5%",
"APR 24.9%"). Utilization announced as percentage with a quality hint.

**States:** no accounts → CTA "Add your first account".

### 10.4 Goals (`GoalsScreen`, tab 4, P1)

**Layout:** list of goal cards ordered by `priority` ascending; each shows name, progress ring
(saved/target), funding mode chip, ETA/`completionDate`, and a status badge
(`on-track`/`tight`/`at-risk`/`complete`/`no-deadline`) colored by tone. A header "planner
surplus" control sets `goalPlannerSurplus` (or "derive from ledger"). Below: a **timeline
visualization** (Swift Chart) showing when each goal completes across the
`goalsHorizonMonths` horizon (default 60).

**Goal editor:** name, target, already-saved, funding mode (fixed/auto/fill segmented),
monthly amount (when fixed), deadline months, interest rate (AER), color, note.

**Data:** `runGoalSequence(...)` → `GoalSequenceResult` (timeline + per-goal outcomes +
`avgUnallocatedSurplus`). Re-run on any goal/surplus edit (background actor; show a brief
recompute shimmer).

**Gestures:** **drag-to-reorder** to change priority (the waterfall re-simulates live);
swipe to delete; tap → editor; long-press → duplicate. Scrub the timeline chart to read
month-by-month allocation per goal.

**Animations:** progress rings animate with `.trim` + spring on value change. Reordering a
goal triggers a **live re-simulation**: bars in the timeline re-flow with a spring; affected
goals' ETAs count to new values. Status badge color crossfades. Completing a goal fires a
subtle confetti `.symbolEffect`/particle burst (respect Reduce Motion).

**Haptics:** `.impact(.medium)` reorder pickup; `.selection` on drop; `.notification(.success)`
when an edit moves a goal to "on-track"; `.notification(.warning)` when it slips to "at-risk".

**Accessibility:** each goal card announces "Goal name, 60% saved, on track, completes March
2027". Timeline chart provides an audio-graph descriptor.

**States:** no goals → CTA "Set your first goal".

### 10.5 Insights (`InsightsScreen`, tab 5, P1)

**Layout:**
1. **Health score gauge** (0–100) with a `Gauge` view + estimated credit score, and an
   expandable breakdown (cash flow, debt load, utilization, payment pressure, savings — five
   sub-scores from `calculateHealthScore`).
2. **Financial signals** list (`buildFinancialSignals`): cards toned good/info/warning/danger,
   each tap-to-expand for detail.
3. **Chart switcher** (segmented): Inflow vs Outflow history, Cash-flow volatility, Net-worth
   outlook — Swift Charts.
4. **Category breakdown** bar chart for the month.
5. **Monthly flow** line chart (`buildMonthlyFlowPoints`).

**Data:** `healthScore(...)`, `financialSignals(...)`, `monthlyFlowPoints`, `netWorthOutlook`.

**Gestures:** tap signal → expand; chart scrub with a moving annotation; switch chart via
segmented control or horizontal swipe between charts (paged).

**Animations:** gauge needle springs to score on appear; sub-score bars grow with stagger;
chart switch crossfades + re-draws lines with a left-to-right `.trim` reveal; signal expand
uses `.snappy` height.

**Haptics:** `.selection` on chart switch and scrub ticks; `.impact(.light)` on signal expand.

**Accessibility:** gauge exposes value + qualitative label ("Health 72, good"). Each chart has
a descriptor. Signals read title + tone + summary.

**States:** insufficient data → `ContentUnavailableView` "Not enough data yet — add a month of
income and expenses."

### 10.6 Settings (`SettingsScreen`, sheet, P0)

Grouped `Form`/`List`:
- **Account**: signed-in identity (avatar, email) or "Sign in to sync" (Apple/Google). Sign out.
- **Cloud vault** note (RLS) + last synced time + "Sync now".
- **Data control**: Export JSON, Export CSV (share sheet); Import CSV, Import JSON (file
  importer); recent import history with per-batch **undo** (swipe to remove a batch).
- **Currency** picker (the 7 codes).
- **Privacy mode** toggle + **Require Face ID** toggle.
- **Appearance**: System / Light / Dark.
- **Reduce motion** note (respects system; optional in-app "animations" toggle to mirror web).
- **Transfer rules**: add/remove payee patterns (auto-skip inter-account transfers).
- **Feedback**: opens `FeedbackSheet`.
- **Danger zone**: "Clear selected month".

**Gestures/animations/haptics:** standard `Form` behaviors; swipe-to-remove on rules and
import batches; success/Failure haptics on export/import; confirmation dialog on destructive
"clear month".

---

## 11. Animation system (tokens)

Define a central `Motion` enum so every screen pulls from the same springs. Respect
`@Environment(\.accessibilityReduceMotion)` — when true, **replace springs with quick fades**
(≤120ms) and disable particle/confetti effects.

```swift
enum Motion {
    // Primary spring for most state changes (cards, sheets, value morphs).
    static let standard = Animation.spring(response: 0.42, dampingFraction: 0.82)
    // Snappy for collapses, toggles, small UI.
    static let snappy   = Animation.snappy(duration: 0.28, extraBounce: 0.05)
    // Bouncy for delightful moments (goal complete, add success).
    static let bouncy   = Animation.spring(response: 0.5, dampingFraction: 0.62)
    // Paging / month change.
    static let page     = Animation.spring(response: 0.45, dampingFraction: 0.9)
    static let stagger  = 0.04 // seconds between staggered items
}
```

Rules:
- **Money values** animate via `.contentTransition(.numericText())` (count-up/down). Never
  animate currency by opacity-swapping whole labels.
- **List mutations** use spring slide+fade; deletions collapse height.
- **Symbols** use `.symbolEffect(.bounce)` on success/toggle and
  `.contentTransition(.symbolEffect(.replace))` on state swaps (eye/eye.slash, etc.).
- **Cross-screen movement** (drag row to category, horizon change baseline) uses
  `matchedGeometryEffect`.
- **Sheets** use the system spring; large sheets adopt detents (`.medium`, `.large`).
- **Charts** redraw with a left→right `.trim` reveal on first appear and on series switch.
- Honor Reduce Motion everywhere; gate confetti behind both Reduce Motion off and an
  explicit success.

---

## 12. Haptics

Wrap `UIFeedbackGenerator` in a `Haptics` helper (prepare generators ahead of frequent
events like scrubbing). Map:

| Event | Feedback |
|-------|----------|
| Selection change (segment, picker, scrub tick) | `UISelectionFeedbackGenerator` |
| Light tap / button | `.impact(.light)` |
| Drag pickup (reorder / recategorize) | `.impact(.medium)` |
| Swipe action fully revealed | `.impact(.rigid)` |
| Month page change | `.impact(.soft)` |
| Add / save success | `.notification(.success)` |
| Threshold warning (utilization ≥80%, goal at-risk) | `.notification(.warning)` |
| Destructive confirm | `.notification(.error)` (on actual delete) |

Never fire haptics during VoiceOver scrubbing beyond selection ticks; never fire on every
keystroke.

---

## 13. Widgets (`IncomeTrackerWidgets`, P2)

Use **WidgetKit + App Intents** with a shared App Group for the latest computed snapshot
(write a small `WidgetSnapshot` to the App Group on each save).

- **Small**: this month's surplus (mint/red) + savings rate.
- **Medium**: net worth + 12-mo forecast sparkline + next bill due (from `Account.dueDay` /
  `minimumPayment`).
- **Lock Screen** (`.accessoryRectangular` / `.accessoryInline`): surplus or next bill due.
- Respect privacy mode: if enabled, widgets show masked values (•••) unless device unlocked
  semantics allow (Lock Screen always masked when privacy on).
- Refresh on save and via a timeline reload; deep-link taps into the relevant tab.

---

## 14. Notifications & App Intents

- **Bill reminders:** schedule `UNCalendarNotificationTrigger`s from each debt account's
  `dueDay` (e.g. "Credit card minimum £35 due in 3 days"). Opt-in in Settings.
- **App Intents / Siri Shortcuts:** "Add an expense to Income Tracker", "What's my surplus
  this month?" (returns `projection.monthlySurplus`), "Show my net worth". Donate intents
  after relevant actions for Spotlight/Shortcuts surfacing.
- **Live Activity (P3):** CSV import progress + sync in Dynamic Island.

---

## 15. Accessibility (mandatory, not optional)

- **VoiceOver:** every interactive element labelled; swipe/menu actions exposed via
  `.accessibilityActions`; charts ship `AXChartDescriptor` audio graphs.
- **Dynamic Type:** layouts must survive `.accessibility5` — use scalable fonts, no fixed
  heights on text rows, allow wrapping. Test at XXL.
- **Reduce Motion:** swap springs for fades, disable particles (§11).
- **Reduce Transparency:** swap materials for solid `surface` fills.
- **Contrast:** verify all text meets WCAG AA on both appearances (the muted/faint tokens on
  `bg` are the risk — bump in Light mode as specified).
- **Bold Text / larger touch targets:** min 44×44pt hit areas on all row actions.
- **Privacy:** never read out exact amounts via VoiceOver when privacy mode masks them on
  screen (announce "amount hidden").

---

## 16. Persistence & migration details

- SwiftData `@Model LedgerStateRecord { var id: String; var json: Data; var schemaVersion: Int;
  var updatedAt: Date }` — single row. The `json` is the Codable-encoded `LedgerState` (the
  exact sync payload). Decode into the value-type `LedgerState` for use.
- On launch: load local → if signed in, fetch cloud → compare → merge-conflict or adopt.
- Keep an in-memory `LedgerState`; all mutations produce a new value (copy-on-write), assigned
  back to the store, which debounces persistence + sync (300ms), mirroring the web.
- **Undo/redo:** keep a bounded stack of recent `LedgerState` snapshots (e.g. last 20) to power
  shake-to-undo and the import "undo batch" feature.

---

## 17. Security & privacy

- Supabase session in **Keychain** (not UserDefaults).
- Face ID gate via `LAContext` when privacy mode on.
- No third-party analytics PII; gate PostHog behind consent; never log amounts.
- The `ledgerlite_feedback` insert path mirrors web (anon allowed). Don't attach the ledger to
  feedback.
- App Transport Security: HTTPS only.

---

## 18. Implementation phases (build order for the agent)

**Phase 0 — Foundations**
- Xcode project, SPM deps (supabase-swift), targets, App Group, color/asset catalog, design
  system primitives (§8.5), `Motion`, `Haptics`.

**Phase 1 — Model + Engine + parity tests** *(no UI)*
- Port `types.ts` → `Models/`. Port `finance.ts` → `Engine/`. Port `importer.ts` → `Importer/`.
- Stand up the Node fixture generator and Swift **parity tests** (§19). Gate the phase on green.

**Phase 2 — Local store + Ledger + Dashboard (P0, offline only)**
- `LedgerStore` over SwiftData, autosave debounce. Ledger screen (entry, swipe, drag, month
  switch). Dashboard. Settings shell (currency, privacy, export/import JSON/CSV, clear month).
- Fully usable signed-out. Ship-able internally here.

**Phase 3 — Accounts + net worth (P0)**
- Accounts screen + editor, summaries, net-worth bar, forecast on Dashboard.

**Phase 4 — Auth + Sync (P0)**
- Sign in with Apple + Google via Supabase; profile upsert; cloud load/save; SyncNudge;
  MergeConflictSheet; SaveStatusPill.

**Phase 5 — Goals + Insights (P1)**
- Goals (waterfall, reorder, timeline) and Insights (gauge, signals, charts).

**Phase 6 — CSV import flow (P1)**
- Document/share import, review sheet, rule learning, transfer sweep, import history + undo.

**Phase 7 — iOS delight (P2/P3)**
- Widgets, App Intents/Siri, bill notifications, Face ID gate, Feedback sheet, Live Activity.

Each phase: build, unit + snapshot tests, manual pass on the §15 accessibility checklist.

---

## 19. Testing plan

- **Parity tests (critical):** Node script runs the TS engine over a matrix of fixtures
  (varied months, accounts with promos, multi-goal waterfalls, edge cases: zero income,
  all one-off, deep debt). Emit `inputs+outputs.json`. Swift tests decode and assert the Swift
  engine matches each numeric field within `1e-6` and each enum/label exactly.
- **JSON round-trip:** load a real web `Export JSON` file → decode `LedgerState` → re-encode →
  assert key-for-key equality (guards sync compatibility).
- **Unit tests:** store mutations, debounce, undo stack, importer categorization + dedupe,
  currency formatting per locale.
- **Snapshot tests:** each screen in light/dark, Dynamic Type M and XXL, privacy on/off,
  empty/loading/error states. (swift-snapshot-testing.)
- **UI tests:** add-expense flow, swipe-delete, month change, sign-in stub, import review,
  merge-conflict choice.
- **Accessibility audit:** XCUITest `performAccessibilityAudit()` per screen (iOS 17+).

---

## 20. App Store & ops

- **Sign in with Apple required** because Google sign-in is offered (Guideline 4.8).
- Privacy nutrition label: data is user-owned; if synced, declare "Financial Info — linked,
  app functionality, not for tracking."
- App icon: reuse the brand mark (`public/icon.svg`) rendered to all required sizes.
- Offline-first: app must be fully functional with no network (no hard sign-in wall).
- Versioning: keep `schemaVersion` aligned with web (`7`); add a forward-compat gate.

---

## 21. Open decisions (flag to product owner before/﻿during build)

1. **Light mode**: ship a derived light theme (spec'd) or **dark-only** to match web exactly?
   Default in this spec: ship both, dark default.
2. **iPad**: out of scope for v1 (iPhone-first). Layouts use adaptive stacks so an iPad pass is
   cheap later.
3. **Apple-only vs Apple+Google sign-in**: spec includes both; Apple is mandatory if Google
   stays.
4. **Widgets/Live Activity** timing: P2/P3 — cut from v1 if timeline is tight without affecting
   parity.

---

### Appendix A — File references in this repo (read these)

- `src/types.ts` — domain model (port verbatim).
- `src/finance.ts` — calculation engine (port verbatim; parity-tested).
- `src/importer.ts` — CSV parsing + rules.
- `src/supabase.ts` — auth + sync contract (tables, functions, project id).
- `src/App.tsx` — UI behaviors, the existing components, and the exact interaction semantics
  (swipe/drag/category-menu, save-state machine, sync nudge, merge conflict).
- `src/styles.css` — color tokens and spacing to mirror (top of file).
- `supabase/migrations/` — DB schema incl. `ledgerlite_feedback`.
