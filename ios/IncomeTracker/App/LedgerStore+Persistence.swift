// LedgerStore+Persistence.swift
// Persistence and sync extension on LedgerStore.
//
// Local storage is the App Group UserDefaults suite shared with the widget
// extension and App Intents, so both can read the state without launching the
// main app. The blob is the same JSON the web app stores, decoded leniently
// (see Types.swift) so any client version can load any other's data.

import Foundation

// MARK: - Constants

private let kStateKey = "ledgerState_v\(CURRENT_SCHEMA_VERSION)"
/// Keys written by earlier schema versions. Read as a fallback on first launch after an
/// upgrade so local data isn't orphaned, then deleted once the current key is written.
private let kLegacyStateKeys = ["ledgerState_v7"]
/// Sync v2 bookkeeping: the last ledger JSON this device knows the server holds and
/// its revision (see Sync/SyncEngine.swift), plus this install's device id.
private let kSyncMetaKey = "ledgerState_syncV2Meta"
private let kDeviceIdKey = "ledgerState_deviceId"
/// Written by the pre-v2 sync; removed on first launch of this version.
private let kLegacySyncedStampKey = "ledgerState_syncedStamp"
private let kAppGroupID = "group.com.incometracker"

// MARK: - LedgerStore + Persistence

extension LedgerStore {

    // MARK: - Hydration (launch and sign-in)

    /// Loads the persisted state from local storage, then (if the user is signed in)
    /// hands over to the SyncEngine, which reconciles with the cloud: an untouched
    /// device adopts the cloud, a device that synced before merges both sides, and a
    /// device whose own data has no shared history with the account asks the user
    /// (combine / use account / use this device) via `sync.mergeConflict`.
    /// Local data is on screen before the network is touched.
    func hydrate(sync: SyncCoordinator) async {
        if let running = hydrationTask {
            await running.value
        }
        let task = Task { await performHydration(sync: sync) }
        hydrationTask = task
        await task.value
        if hydrationTask == task {
            hydrationTask = nil
        }
    }

    private func performHydration(sync: SyncCoordinator) async {
        saveStatus = .loading
        clearUndoHistory()
        didLoadLocalWithoutHydration = false
        UserDefaults(suiteName: kAppGroupID)?.removeObject(forKey: kLegacySyncedStampKey)

        let localState = loadFromUserDefaults()
        state = localState ?? LedgerState.initial
        snapToCurrentMonth()

        defer { isHydrated = true }

        guard sync.isSignedIn, let userId = sync.currentUser?.id else {
            saveStatus = .loaded
            return
        }

        sync.isSyncing = true
        defer { sync.isSyncing = false }
        let engine = ensureSyncEngine(sync: sync)
        let outcome = await engine.start(userId: userId)
        if outcome == .offline {
            sync.lastSyncError = sync.lastSyncError ?? "Cloud unavailable. Your changes are kept on this device."
        }
    }

    /// The engine, its host adapter and bookkeeping store, created once per launch.
    @discardableResult
    func ensureSyncEngine(sync: SyncCoordinator) -> SyncEngine {
        if let syncEngine { return syncEngine }
        let host = StoreSyncHost(store: self, sync: sync)
        syncHost = host
        let engine = SyncEngine(transport: sync, store: host, host: host, deviceId: Self.deviceId())
        syncEngine = engine
        return engine
    }

    /// Foreground refresh: picks up edits made on another device while this one was
    /// in the background. Merges rather than asks, so it never interrupts the user.
    func refreshFromCloudIfIdle(sync: SyncCoordinator) async {
        guard isHydrated, sync.isSignedIn else { return }
        syncEngine?.requestPull()
    }

    /// Used by App Intents when the app was launched in the background just to run
    /// them: RootView's hydration never happens, so read the on-disk ledger directly.
    func ensureLocalStateLoaded() {
        guard !isHydrated, !didLoadLocalWithoutHydration else { return }
        didLoadLocalWithoutHydration = true
        if let local = loadFromUserDefaults() {
            state = local
        }
    }

    /// Signing out returns the device to a blank ledger (the account's data stays in
    /// the cloud for the next sign-in) and forgets everything this device knew about
    /// the account's sync history. Mirrors `handleSignOut` on the web.
    func resetAfterSignOut() {
        syncEngine?.reset()
        replaceState(LedgerState.initial, pushToCloud: false)
    }

    // MARK: - Local persistence

    /// Encodes `state` as JSON and writes it to the shared UserDefaults suite.
    /// Also pushes a fresh widget snapshot and, when the reminder inputs changed,
    /// reschedules local notifications.
    func persistLocally() async {
        guard let data = try? makeLedgerEncoder().encode(state) else { return }
        let defaults = UserDefaults(suiteName: kAppGroupID)
        defaults?.set(data, forKey: kStateKey)
        for legacyKey in kLegacyStateKeys {
            defaults?.removeObject(forKey: legacyKey)
        }

        WidgetDataProvider.write(buildWidgetSnapshot(from: state))
        rescheduleRemindersIfNeeded()
    }

    /// Re-derives local notifications from the current accounts and the user's
    /// reminder settings, skipping the work when nothing relevant changed.
    func rescheduleRemindersIfNeeded(force: Bool = false) {
        let settings = ReminderSettings.load()
        let accounts = effectiveAccounts
        let currency = state.currency
        let fingerprint = NotificationScheduler.fingerprint(accounts: accounts, settings: settings, currency: currency)
        guard force || fingerprint != lastReminderFingerprint else { return }
        lastReminderFingerprint = fingerprint
        Task {
            await NotificationScheduler.reschedule(accounts: accounts, settings: settings, currency: currency)
        }
    }

    // MARK: - Cloud sync

    /// "Sync now": pull anything new, then push anything pending.
    func syncToCloud(sync: SyncCoordinator) async {
        guard sync.isSignedIn else { return }
        let engine = ensureSyncEngine(sync: sync)
        engine.requestPull()
        engine.requestPush()
    }

    /// A random id for this install, so it recognises its own realtime echoes.
    static func deviceId() -> String {
        let defaults = UserDefaults(suiteName: kAppGroupID)
        if let existing = defaults?.string(forKey: kDeviceIdKey) { return existing }
        let id = "ios-\(UUID().uuidString.lowercased())"
        defaults?.set(id, forKey: kDeviceIdKey)
        return id
    }

    // MARK: - Export

    /// Returns the current state serialised as pretty-printed JSON data.
    func exportJSON() -> Data? {
        let encoder = makeLedgerEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try? encoder.encode(state)
    }

    /// Returns the current state as a CSV string using FinanceEngine.
    func exportCSV() -> String {
        FinanceEngine.csvExport(state)
    }

    // MARK: - Import

    /// Decodes a JSON backup produced by `exportJSON()` or the web app's export and
    /// replaces the current state. Undoable. Throws `ImportError` when the file is
    /// not a ledger or was written by a newer schema.
    func importJSON(_ data: Data) throws {
        let decoder = makeLedgerDecoder()

        struct VersionProbe: Decodable {
            let schemaVersion: Int?
        }
        guard let probe = try? decoder.decode(VersionProbe.self, from: data) else {
            throw ImportError.notALedger
        }
        if let version = probe.schemaVersion, version > CURRENT_SCHEMA_VERSION {
            throw ImportError.schemaTooNew(found: version, supported: CURRENT_SCHEMA_VERSION)
        }

        let imported: LedgerState
        do {
            imported = try decoder.decode(LedgerState.self, from: data)
        } catch {
            throw ImportError.notALedger
        }
        // Route through update() so the import is undoable and triggers the
        // debounced local save + cloud push like any other mutation.
        update { $0 = imported }
        snapToCurrentMonth()
    }

    // MARK: - Private helpers

    /// Reads the JSON blob from the shared UserDefaults suite and decodes it,
    /// falling back to keys written by earlier schema versions.
    private func loadFromUserDefaults() -> LedgerState? {
        guard let defaults = UserDefaults(suiteName: kAppGroupID) else { return nil }
        let decoder = makeLedgerDecoder()
        for key in [kStateKey] + kLegacyStateKeys {
            if let data = defaults.data(forKey: key),
               let decoded = try? decoder.decode(LedgerState.self, from: data) {
                return decoded
            }
        }
        return nil
    }
}

// MARK: - Sync host

/// Connects the SyncEngine to the store (the ledger on screen) and the coordinator
/// (sign-in state, conflict sheet, errors). Also keeps the engine's bookkeeping in the
/// App Group defaults beside the ledger.
@MainActor
final class StoreSyncHost: LedgerSyncHost, SyncMetaStore {
    private weak var store: LedgerStore?
    private weak var sync: SyncCoordinator?

    init(store: LedgerStore, sync: SyncCoordinator) {
        self.store = store
        self.sync = sync
    }

    var syncLocalState: LedgerState { store?.state ?? .initial }

    func syncReplaceLocal(_ next: LedgerState) {
        store?.replaceFromSync(next)
    }

    func syncNormalize(_ state: LedgerState) -> LedgerState {
        LedgerStore.normalizedForSync(state)
    }

    func syncStatusChanged(_ status: SyncEngine.Status) {
        guard let store else { return }
        switch status {
        case .loading: store.saveStatus = .loading
        case .saving: store.saveStatus = .saving
        case .saved:
            store.saveStatus = .loaded
            sync?.lastSyncedAt = .now
            sync?.lastSyncError = nil
        case .offline: store.saveStatus = .offline
        case .updateRequired:
            store.saveStatus = .offline
            sync?.lastSyncError = "Your data was saved by a newer version of Income Tracker. Update the app to keep syncing; your changes are kept on this iPhone."
        }
    }

    func syncNeedsChoice(local: LedgerState, cloud: LedgerState) {
        sync?.mergeConflict = SyncCoordinator.MergeConflict(local: local, cloud: cloud)
    }

    func syncRemoteApplied() {
        sync?.lastSyncedAt = .now
    }

    func loadMeta(userId: String) -> SyncMeta? {
        guard let data = UserDefaults(suiteName: kAppGroupID)?.data(forKey: kSyncMetaKey),
              let meta = try? JSONDecoder().decode(SyncMeta.self, from: data),
              meta.userId == userId else { return nil }
        return meta
    }

    func saveMeta(_ meta: SyncMeta) {
        guard let data = try? JSONEncoder().encode(meta) else { return }
        UserDefaults(suiteName: kAppGroupID)?.set(data, forKey: kSyncMetaKey)
    }

    func clearMeta() {
        UserDefaults(suiteName: kAppGroupID)?.removeObject(forKey: kSyncMetaKey)
    }
}

// MARK: - ImportError

enum ImportError: LocalizedError {
    case notALedger
    case schemaTooNew(found: Int, supported: Int)

    var errorDescription: String? {
        switch self {
        case .notALedger:
            return "That file isn't an Income Tracker backup. Export one from Settings → Data on the web or in the app."
        case .schemaTooNew(let found, let supported):
            return "This backup was created by a newer version of the app (schema v\(found)). Please update to import it. Supported: v\(supported)."
        }
    }
}

// MARK: - JSON coders

/// Fresh coders per use: a shared instance whose `outputFormatting` is mutated for an
/// export would leak pretty-printing into every later save (and race with it).
func makeLedgerEncoder() -> JSONEncoder {
    let encoder = JSONEncoder()
    encoder.keyEncodingStrategy = .useDefaultKeys // camelCase, wire-compatible with the web app
    return encoder
}

func makeLedgerDecoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .useDefaultKeys
    return decoder
}
