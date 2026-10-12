#!/usr/bin/env bash
# Builds the Foundation-only layers of the iOS app (models, engine, importers, the
# Sync v2 engine, merge and realtime client, LedgerStore) with the Linux Swift
# toolchain and runs the Sync v2 tests, including merge parity with the web.
#
# Usage: ios/LinuxTests/run.sh   (needs `swift` 6.x on PATH)
# UI, Keychain, widget and notification code cannot build on Linux; LinuxStubs.swift
# stands in for the few Apple-only types the store touches.
set -euo pipefail

IOS="$(cd "$(dirname "$0")/.." && pwd)"
APP="$IOS/IncomeTracker"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/Sources/Core" "$WORK/Tests/CoreTests"
for file in "$APP"/Models/*.swift "$APP"/Engine/*.swift \
  "$APP/Importer/CSVImporter.swift" "$APP/Importer/TextImporters.swift" \
  "$APP/Sync/JSONValue.swift" "$APP/Sync/LedgerMerge.swift" "$APP/Sync/UnknownFields.swift" \
  "$APP/Sync/SyncEngine.swift" "$APP/Sync/LedgerRealtime.swift" \
  "$APP/App/LedgerStore+Persistence.swift" "$IOS/LinuxTests/LinuxStubs.swift"; do
  ln -s "$file" "$WORK/Sources/Core/"
done

# The test target imports the app module as IncomeTracker; here it is Core, and the
# fixtures are found relative to the real test file.
sed -e 's/@testable import IncomeTracker/@testable import Core/' \
    -e "s|URL(fileURLWithPath: #filePath)|URL(fileURLWithPath: \"$IOS/IncomeTrackerTests/Sync/SyncV2Tests.swift\")|" \
    "$IOS/IncomeTrackerTests/Sync/SyncV2Tests.swift" > "$WORK/Tests/CoreTests/SyncV2Tests.swift"

cat > "$WORK/Package.swift" <<'SWIFT'
// swift-tools-version:5.9
import PackageDescription
let package = Package(
  name: "Core",
  targets: [
    .target(name: "Core", path: "Sources/Core"),
    .testTarget(name: "CoreTests", dependencies: ["Core"], path: "Tests/CoreTests"),
  ]
)
SWIFT

cd "$WORK"
swift test
