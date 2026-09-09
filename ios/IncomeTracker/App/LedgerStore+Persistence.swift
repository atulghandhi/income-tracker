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
/// `lastSavedAt` of the last state this device exchanged with the cloud (pushed or
/// adopted). Lets hydration tell "only this device changed" from "only the cloud
/// changed" without asking the user.
private let kSyncedStampKey = "ledgerState_syncedStamp"
private let kAppGroupID = "group.com.incometracker"

// MARK: - LedgerStore + Persistence

extension LedgerStore {

    // MARK: - Hydration (launch and sign-in)

    /// Loads the persisted state from local storage, then — if the user is signed in —
    /// fetches the cloud copy and either adopts it, pushes the local one, or raises a
    /// conflict for the user to settle. Local data is on screen before the network is
    /// touched, so a slow connection never shows an empty ledger.
    ///
    /// Resolution when both sides exist (mirrors the web app, plus a three-way check
    /// using the stamp of the last synced state):
    ///   • local has no transactions or accounts → cloud wins
    ///   • cloud unchanged since this device last synced → local wins and is pushed
    ///   • local unchanged since this device last synced → cloud wins
    ///   • same counts and totals per month → cloud wins (nothing to lose)
    ///   • otherwise → `sync.mergeConflict`, and nothing is pushed until it is resolved
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

        let localState = loadFromUserDefaults()
        state = localState ?? LedgerState.initial
        snapToCurrentMonth()

        var finalStatus: SaveStatus = .loaded
        defer {
            isHydrated = true
            saveStatus = finalStatus
        }

        guard sync.isSignedIn, let userId = sync.currentUser?.id else { return }

        sync.isSyncing = true
        defer { sync.isSyncing = false }

        do {
            let cloudState = try await sync.loadCloudState()
            // The user may have typed while the request was in flight; judge the live state.
            let local = state

            guard let cloud = cloudState else {
                // Nothing in the cloud yet: back up whatever this device has.
                try await sync.saveCloudState(local, userId: userId)
                recordSyncedStamp(local.lastSavedAt)
                return
            }

            let synced = lastSyncedStamp()
            if !local.hasLocalData {
                await adoptCloudState(cloud)
            } else if synced != nil && cloud.lastSavedAt == synced {
                // Only this device moved since the last sync (an offline edit, a Siri
                // shortcut): push it, no questions asked.
                try await sync.saveCloudState(local, userId: userId)
                recordSyncedStamp(local.lastSavedAt)
            } else if synced != nil && local.lastSavedAt == synced {
                await adoptCloudState(cloud)
            } else if local.isRoughlyEquivalent(to: cloud) {
                await adoptCloudState(cloud)
            } else {
                // Both sides carry real, different data. Keep local on screen and let
                // the user choose; the merge sheet calls replaceState with the winner.
                sync.mergeConflict = SyncCoordinator.MergeConflict(local: local, cloud: cloud)
            }
        } catch {
            finalStatus = .offline
            sync.lastSyncError = error.localizedDescription
        }
    }

    /// Replaces the ledger with the cloud copy and persists it, without bumping
    /// `lastSavedAt` (the cloud's own stamp is what this device has now).
    private func adoptCloudState(_ cloud: LedgerState) async {
        clearUndoHistory()
        state = cloud
        recordSyncedStamp(cloud.lastSavedAt)
        snapToCurrentMonth()
        await persistLocally()
    }

    /// Foreground refresh: picks up edits made on another device while this one was
    /// in the background. Never interrupts a pending local save or an open conflict.
    func refreshFromCloudIfIdle(sync: SyncCoordinator) async {
        guard isHydrated, hydrationTask == nil, sync.isSignedIn,
              sync.mergeConflict == nil, !hasUnsavedChanges else { return }
        guard let cloud = try? await sync.loadCloudState() else { return }
        guard sync.mergeConflict == nil, !hasUnsavedChanges else { return }

        let synced = lastSyncedStamp()
        if cloud.lastSavedAt == state.lastSavedAt || (synced != nil && cloud.lastSavedAt == synced) {
            return // nothing new in the cloud
        }
        if !state.hasLocalData || (synced != nil && state.lastSavedAt == synced) || state.isRoughlyEquivalent(to: cloud) {
            await adoptCloudState(cloud)
        } else {
            sync.mergeConflict = SyncCoordinator.MergeConflict(local: state, cloud: cloud)
        }
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
    /// the cloud for the next sign-in). Mirrors `handleSignOut` on the web.
    func resetAfterSignOut() {
        clearSyncedStamp()
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

    /// Pushes the current state to Supabase if the user is signed in.
    func syncToCloud(sync: SyncCoordinator) async {
        guard sync.isSignedIn, let userId = sync.currentUser?.id, sync.mergeConflict == nil else { return }
        sync.isSyncing = true
        defer { sync.isSyncing = false }
        do {
            let pushed = state
            try await sync.saveCloudState(pushed, userId: userId)
            recordSyncedStamp(pushed.lastSavedAt)
            saveStatus = .loaded
        } catch {
            sync.lastSyncError = error.localizedDescription
            saveStatus = .offline
        }
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

    // MARK: - Synced-stamp bookkeeping

    func recordSyncedStamp(_ stamp: String) {
        UserDefaults(suiteName: kAppGroupID)?.set(stamp, forKey: kSyncedStampKey)
    }

    private func lastSyncedStamp() -> String? {
        UserDefaults(suiteName: kAppGroupID)?.string(forKey: kSyncedStampKey)
    }

    private func clearSyncedStamp() {
        UserDefaults(suiteName: kAppGroupID)?.removeObject(forKey: kSyncedStampKey)
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
