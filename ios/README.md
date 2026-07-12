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
| `IncomeTrackerIntents` | App Intents extension |
| `IncomeTrackerTests` | Unit and snapshot tests |

## Re-generating the Xcode Project

Whenever `project.yml` changes, re-run `xcodegen generate` from the `ios/` directory. The generated `.xcodeproj` is excluded from version control — always regenerate it locally.

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
(or a dedicated Connections screen) and present `ImportReviewSheet` with the
fetched rows. Dedupe keys are `fk-<transaction UUID>`, so re-syncs are no-ops.

### Screenshot import — `Importer/ScreenshotImporter.swift`

On-device Vision OCR over a screenshot of any banking app's transaction list
(or a receipt). Rows are capped at 0.75 confidence so they always land in a
review bucket. Wire a PhotosPicker/share-extension entry point that calls
`ScreenshotImporter().importRows(from:state:)` and presents the review sheet.

Note: these Swift files were authored off-device and have not been compiled
against the iOS SDK yet — expect to fix small API drift (FinanceKit's query
types evolved between 17.4 and 18.x) on first build.
