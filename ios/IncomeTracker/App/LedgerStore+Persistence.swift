// LedgerStore+Persistence.swift
// Persistence and sync extension on LedgerStore.
//
// Local storage currently uses UserDefaults(suiteName:) shared with the
// widgets via the App Group so they can read the state without launching the
// main app.
//
// TODO: migrate persistLocally() / hydrate() to SwiftData once the
//       ModelContainer is set up and the schema is stable.

import Foundation

// MARK: - Constants

private let kStateKey = "ledgerState_v\(CURRENT_SCHEMA_VERSION)"
private let kAppGroupID = "group.com.incometracker"

// MARK: - LedgerStore + Persistence

extension LedgerStore {

    // MARK: - Hydration (called once on launch)

    /// Loads the persisted state from local storage, then — if the user is
    /// signed in — fetches the cloud state and merges or presents a conflict.
    ///
    /// Merge strategy (mirrors src/supabase.ts):
    ///   • If only one side exists, use it.
    ///   • If both exist and cloud.lastSavedAt > local.lastSavedAt, prefer cloud.
    ///   • If both exist and local.lastSavedAt > cloud.lastSavedAt, prefer local
    ///     (the device was used offline and will push on next syncToCloud call).
    ///   • If timestamps are equal or the delta is within 5 s, prefer cloud
    ///     (server is the source of truth for ties).
    ///   • If the two states diverge meaningfully (both have recent activity),
    ///     set sync.mergeConflict so the user can pick a winner.
    func hydrate(sync: SyncCoordinator) async {
        saveStatus = .loading
        defer {
            // Whatever path resolved the state, open on the real current month.
            snapToCurrentMonth()
            saveStatus = .loaded
        }

        // 1. Load local state.
        let localState = loadFromUserDefaults()

        // 2. If not signed in, just restore local (or use .initial).
        guard sync.isSignedIn, let userId = sync.currentUser?.id else {
            state = localState ?? LedgerState.initial
            return
        }

        // 3. Try to load cloud state.
        do {
            sync.isSyncing = true
            defer { sync.isSyncing = false }

            let cloudState = try await sync.loadCloudState()

            switch (localState, cloudState) {
            case (nil, nil):
                // Fresh install, no data anywhere.
                state = LedgerState.initial
                await persistLocally()
                try? await sync.saveCloudState(state, userId: userId)

            case (let local?, nil):
                // Local only — push to cloud.
                state = local
                try? await sync.saveCloudState(state, userId: userId)

            case (nil, let cloud?):
                // Cloud only — save locally.
                state = cloud
                await persistLocally()

            case (let local?, let cloud?):
                // Both exist — resolve by timestamp.
                let chosen = resolveConflict(local: local, cloud: cloud, sync: sync)
                state = chosen
                await persistLocally()
                // Push the winner back to cloud if local was newer.
                if chosen.lastSavedAt == local.lastSavedAt &&
                   local.lastSavedAt != cloud.lastSavedAt
                {
                    try? await sync.saveCloudState(state, userId: userId)
                }
            }
        } catch {
            // Network failure — fall back to local state.
            state = localState ?? LedgerState.initial
        }
    }

    // MARK: - Local persistence

    /// Encodes `state` as JSON and writes it to the shared UserDefaults suite.
    /// Also pushes a fresh widget snapshot and reschedules bill reminders so
    /// home-screen widgets and Siri shortcuts see up-to-date data immediately.
    ///
    /// TODO: replace with a SwiftData insert/update on the LedgerStateModel entity.
    func persistLocally() async {
        guard let data = try? JSONEncoder.ledger.encode(state) else { return }
        let defaults = UserDefaults(suiteName: kAppGroupID)
        defaults?.set(data, forKey: kStateKey)
        defaults?.synchronize()

        // MARK: - Widget snapshot update hook
        // Writes the latest figures into the shared App Group container so that
        // all IncomeTrackerWidgets timelines see fresh data. WidgetKit is also
        // told to reload all timelines immediately (inside `WidgetDataProvider.write`).
        WidgetDataProvider.write(buildWidgetSnapshot(from: state))

        // MARK: - Bill notification reschedule hook
        // Re-derive the bill reminders from the current account list every time
        // the state is persisted. This handles additions, deletions, and changes
        // to due days or minimum payments without any extra call sites.
        Task { await NotificationScheduler.scheduleBillReminders(accounts: state.accounts) }
    }

    // MARK: - Cloud sync

    /// Pushes the current state to Supabase if the user is signed in.
    func syncToCloud(sync: SyncCoordinator) async {
        guard sync.isSignedIn, let userId = sync.currentUser?.id else { return }
        do {
            sync.isSyncing = true
            try await sync.saveCloudState(state, userId: userId)
            saveStatus = .loaded
        } catch {
            sync.lastSyncError = error.localizedDescription
            saveStatus = .offline
        }
        sync.isSyncing = false
    }

    // MARK: - Export

    /// Returns the current state serialised as pretty-printed JSON data.
    func exportJSON() -> Data? {
        let encoder = JSONEncoder.ledger
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try? encoder.encode(state)
    }

    /// Returns the current state as a CSV string using FinanceEngine.
    func exportCSV() -> String {
        FinanceEngine.csvExport(state)
    }

    // MARK: - Import

    /// Decodes a JSON blob produced by `exportJSON()` (or the web app export),
    /// validates the schema version, and replaces the current state.
    /// Throws `ImportError` if the data is invalid or the schema is too old.
    func importJSON(_ data: Data) throws {
        let decoder = JSONDecoder.ledger

        // Decode just the schemaVersion first to guard against incompatible formats.
        struct VersionProbe: Decodable {
            let schemaVersion: Int
        }
        let probe = try decoder.decode(VersionProbe.self, from: data)
        guard probe.schemaVersion <= CURRENT_SCHEMA_VERSION else {
            throw ImportError.schemaTooNew(found: probe.schemaVersion, supported: CURRENT_SCHEMA_VERSION)
        }
        guard probe.schemaVersion >= MINIMUM_SUPPORTED_SCHEMA_VERSION else {
            throw ImportError.schemaTooOld(found: probe.schemaVersion, minimum: MINIMUM_SUPPORTED_SCHEMA_VERSION)
        }

        let imported = try decoder.decode(LedgerState.self, from: data)
        // Route through update() so the import is undoable and triggers the
        // debounced local save + cloud push like any other mutation.
        update { $0 = imported }
        snapToCurrentMonth()
    }

    // MARK: - Private helpers

    /// Reads the JSON blob from the shared UserDefaults suite and decodes it.
    private func loadFromUserDefaults() -> LedgerState? {
        guard
            let defaults = UserDefaults(suiteName: kAppGroupID),
            let data = defaults.data(forKey: kStateKey)
        else { return nil }
        return try? JSONDecoder.ledger.decode(LedgerState.self, from: data)
    }

    /// Picks between local and cloud state using timestamp comparison.
    /// Sets `sync.mergeConflict` when activity on both sides is too recent
    /// to resolve automatically (both edited within the last 5 minutes).
    private func resolveConflict(
        local: LedgerState,
        cloud: LedgerState,
        sync: SyncCoordinator
    ) -> LedgerState {
        let fmt = ISO8601DateFormatter()
        let localDate  = fmt.date(from: local.lastSavedAt)  ?? .distantPast
        let cloudDate  = fmt.date(from: cloud.lastSavedAt)  ?? .distantPast
        let delta = abs(localDate.timeIntervalSince(cloudDate))

        // If both were modified within the last 5 minutes and by meaningful
        // amounts of time apart, surface a conflict for the user to resolve.
        let fiveMinutes: TimeInterval = 5 * 60
        let conflictThreshold: TimeInterval = 30 // seconds of delta to care about

        if delta > conflictThreshold &&
           localDate > Date.now.addingTimeInterval(-fiveMinutes) &&
           cloudDate > Date.now.addingTimeInterval(-fiveMinutes)
        {
            sync.mergeConflict = SyncCoordinator.MergeConflict(local: local, cloud: cloud)
            // While the user decides, keep local state active.
            return local
        }

        // No conflict — use whichever is newer.  Cloud wins ties.
        return localDate > cloudDate ? local : cloud
    }
}

// MARK: - ImportError

enum ImportError: LocalizedError {
    case schemaTooNew(found: Int, supported: Int)
    case schemaTooOld(found: Int, minimum: Int)

    var errorDescription: String? {
        switch self {
        case .schemaTooNew(let f, let s):
            return "This backup was created by a newer version of the app (schema v\(f)). Please update to import it. Supported: v\(s)."
        case .schemaTooOld(let f, let m):
            return "This backup is too old to import (schema v\(f)). Minimum supported version is v\(m)."
        }
    }
}

// MARK: - Minimum schema version

/// The oldest schema version that can be decoded without migration.
/// Bump this when a migration path is dropped.
/// TODO: implement a migration chain (v1→v7) before bumping past 1.
private let MINIMUM_SUPPORTED_SCHEMA_VERSION = 1

// MARK: - JSON coder preset

private extension JSONEncoder {
    static let ledger: JSONEncoder = {
        let e = JSONEncoder()
        // camelCase keys for wire-compatibility with the web app (Types.swift uses camelCase).
        e.keyEncodingStrategy = .useDefaultKeys
        e.dateEncodingStrategy = .iso8601
        return e
    }()
}

private extension JSONDecoder {
    static let ledger: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .useDefaultKeys
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
