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
