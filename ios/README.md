# Income Tracker iOS

## Prerequisites

- macOS 15 or later
- Xcode 16 or later
- XcodeGen: `brew install xcodegen`

## Setup

Generate the Xcode project from the spec:

```bash
cd ios
xcodegen generate
```

Then open the project in Xcode:

```bash
open IncomeTracker.xcodeproj
```

Before building, set your `DEVELOPMENT_TEAM` in `project.yml` (or via Xcode's Signing & Capabilities tab) to match your Apple Developer account.

## Running Tests

Run the unit test suite against an iOS Simulator:

```bash
xcodebuild test \
  -scheme IncomeTrackerTests \
  -destination 'platform=iOS Simulator,name=iPhone 16'
```

### Swift Engine Parity Tests

Engine parity tests live in `IncomeTrackerTests/Engine/` and mirror the TypeScript business-logic tests. If a `Package.swift` is present in the `ios/` directory you can run them directly with the Swift Package Manager:

```bash
swift test
```

### Node Fixture Generation

JSON fixtures used by the test suite are generated from the shared fixture generator in the web repo. To regenerate them:

```bash
cd IncomeTrackerTests/Fixtures/gen
node generate-fixtures.js
```

> **Note:** `generate-fixtures.js` expects the web repo root to be available in `PATH` (or configured via the script's own config). Make sure the web repository is checked out alongside this one before running.

## Project Structure

| Target | Description |
|--------|-------------|
| `IncomeTracker` | Main iOS application |
| `IncomeTrackerWidgets` | WidgetKit extension |
| (in-app) `Intents/AppIntents.swift` | Siri / Shortcuts intents, compiled into the app so they share `LedgerStore` |
| `IncomeTrackerTests` | Unit and snapshot tests |

## Re-generating the Xcode Project

Whenever `project.yml` changes, re-run `xcodegen generate` from the `ios/` directory. The generated `.xcodeproj` is excluded from version control — always regenerate it locally.

## How the app is put together

Everything a user does funnels through one `@Observable` store (`Models/LedgerStore.swift`):

- `update { }` is a user edit: undoable, stamps `lastSavedAt` with millisecond
  precision (the same shape the web writes), debounced local save, then a cloud
  push. `applyQuietly { }` is for navigation and launch-time normalisation and only
  stamps when ledger data actually changed, so opening last month never makes this
  device look like the newest writer.
- Cloud pushes are gated until `hydrate` finishes, saves never overlap, and the
  app flushes pending writes when it goes to the background.
- Hydration (`App/LedgerStore+Persistence.swift`) shows local data first, then
  resolves against the cloud with a three-way check (which side moved since the last
  sync) before falling back to the web's coarse equivalence test and, only then, the
  merge-conflict sheet.
- JSON decoding is lenient (`Models/LenientDecoding.swift`, custom `init(from:)`
  in `Models/Types.swift`) and mirrors the web's `normalizeState`: legacy `goal` /
  `debts` / `apr` / `interestFreeMonths` keys, unknown enum values and missing
  fields all load with the same defaults the web applies.

Ported engine pieces, all Foundation-only and verified against vectors generated
from the TypeScript sources:

| File | Web source | What it does |
|------|-----------|--------------|
| `Importer/CSVImporter.swift` | `src/importer.ts` | CSV parsing (CRLF-safe), column detection, JS-compatible duplicate hashes, category rules, the import commit (fresh ids, rule learning, transfer sweep, 25-batch cap) |
| `Importer/TextImporters.swift` | `src/importer.ts` | OFX, QIF, pasted lines, sign-inversion detection, transfer pairs, Windows-1252 fallback decoding |
| `Engine/QuickAdd.swift` | `src/quickAdd.ts` | "costa 4.35", "salary 2400 recurring", "tesco 42.61 yesterday" |
| `Engine/MerchantMemory.swift` | `src/merchantMemory.ts` | Suggestions and usual amounts from the ledger itself |
| `Engine/Recurrence.swift` | `src/recurrence.ts` | Subscriptions, "looks recurring" suggestions, missed payments, seeded-vs-imported reconciliation |

Screens (`Features/`): the Ledger tab is the home screen with a quick-log bar docked
above the keyboard (Return adds and keeps the cursor in the field); the full entry
form gives the decimal pad an "Add another" key. Import from a file (CSV/OFX/QIF),
the clipboard or a screenshot goes through one `ImportFlow` modifier and one review
sheet. Settings holds reminders (bill due, daily log, monthly import), Face ID lock,
appearance, and learned rules. Widgets, Siri intents and deep links
(`incometracker://ledger|dashboard|accounts|goals|insights|log`) are routed by
`App/AppRouter.swift`.

### Verifying without Xcode

The Foundation layers compile with the Linux Swift 6 toolchain. A harness that
type-checks them and replays the web-generated parity vectors lives in
`IncomeTrackerTests/Engine/ImporterParityTests.swift`; the same assertions run on
macOS through `xcodebuild test`. SwiftUI files cannot be compiled on Linux, so the
first Xcode build after a large change is expected to surface small API drift.

## Automatic transaction capture (Stage D of docs/AUTOMATION_PLAN.md)

Two capture services live alongside the CSV importer and feed the same
`ImportReviewSheet` → `LedgerStore.commitCSVImport` pipeline:

### Apple Wallet feed — `Sync/FinanceKitService.swift`

Imports transactions from accounts the user shares via Apple Wallet
(FinanceKit, iOS 17.4+; UK banks such as Monzo/HSBC/Barclays from iOS 18.4).
No per-user aggregator fee.

External prerequisites before this does anything:

1. Request the FinanceKit entitlement from Apple (manual approval), then
   uncomment `com.apple.developer.financekit` in `project.yml`.
2. List the app in the **Finance** category on the App Store (US or UK).
3. `NSFinancialDataDescription` is already set in `project.yml`.

Wiring: drop `WalletFeedSection(state:onRowsFetched:)` into `SettingsSheet`
(or a dedicated Connections screen) and stage the fetched rows with
`ImportFlow.stage(rows:fileName:totalRows:into:)`. Dedupe keys are
`fk-<transaction UUID>`, so re-syncs are no-ops. It is deliberately not mounted
until the entitlement is granted.

### Screenshot import — `Importer/ScreenshotImporter.swift`

On-device Vision OCR over a screenshot of any banking app's transaction list
(or a receipt). Rows are capped at 0.75 confidence so they always land in a
review bucket. Reachable from every "Import" menu ("Scan a screenshot") via
`Features/Shared/ImportFlow.swift`.

Note: these Swift files were authored off-device and have not been compiled
against the iOS SDK yet — expect to fix small API drift (FinanceKit's query
types evolved between 17.4 and 18.x) on first build.
