// SyncEngine.swift
// Sync v2 client (docs/ANDROID_APP_SPEC.md §4.3), the Swift twin of src/sync/engine.ts.
//
// The engine keeps `base`, the last ledger JSON it knows the server holds, and that
// row's revision. Pushes are compare-and-swap against the revision; when another
// device got there first it three-way merges (base, this device, server) with
// LedgerMerge and tries again, so nobody's edits are overwritten. Remote changes
// arrive via the realtime poke, on returning to the foreground, or on reconnect.
//
// Foundation only: the transport (SyncCoordinator), the bookkeeping store and the
// host (LedgerStore) are protocols so the whole engine runs in Linux tests.

import Foundation

public struct LedgerRow: Sendable {
    public var state: JSONValue
    public var revision: Int
    public var updatedBy: String?

    public init(state: JSONValue, revision: Int, updatedBy: String?) {
        self.state = state
        self.revision = revision
        self.updatedBy = updatedBy
    }
}

public enum PushStatus: String, Sendable {
    case ok
    case conflict
    case schemaTooOld = "schema_too_old"
    case missing
}

public struct PushOutcome: Sendable {
    public var status: PushStatus
    public var revision: Int
    public var state: JSONValue?
    public var updatedBy: String?

    public init(status: PushStatus, revision: Int, state: JSONValue?, updatedBy: String?) {
        self.status = status
        self.revision = revision
        self.state = state
        self.updatedBy = updatedBy
    }
}

@MainActor
public protocol LedgerSyncTransport: AnyObject {
    func pushLedger(_ state: JSONValue, baseRevision: Int, deviceId: String) async throws -> PushOutcome
    func fetchLedgerRow() async throws -> LedgerRow?
    func fetchLedgerRevision() async throws -> Int?
}

public struct SyncMeta: Codable, Sendable {
    public var userId: String
    public var baseRevision: Int
    public var base: JSONValue?

    public init(userId: String, baseRevision: Int, base: JSONValue?) {
        self.userId = userId
        self.baseRevision = baseRevision
        self.base = base
    }
}

@MainActor
public protocol SyncMetaStore: AnyObject {
    func loadMeta(userId: String) -> SyncMeta?
    func saveMeta(_ meta: SyncMeta)
    func clearMeta()
}

@MainActor
public protocol LedgerSyncHost: AnyObject {
    /// The ledger on screen.
    var syncLocalState: LedgerState { get }
    /// Replace the ledger on screen with merged or adopted data (not an undoable edit).
    func syncReplaceLocal(_ next: LedgerState)
    /// What this client does to every ledger it loads (month snapping, linked goals).
    func syncNormalize(_ state: LedgerState) -> LedgerState
    func syncStatusChanged(_ status: SyncEngine.Status)
    /// First sync on a device with its own data: ask the user, then call resolveFirstSync.
    func syncNeedsChoice(local: LedgerState, cloud: LedgerState)
    func syncRemoteApplied()
}

@MainActor
public final class SyncEngine {

    public enum Status: Sendable, Equatable {
        case loading, saving, saved, offline, updateRequired
    }

    public enum StartOutcome: Sendable, Equatable {
        case ready, updateRequired, offline, choose
    }

    public enum FirstSyncChoice: Sendable {
        case combine, cloud, local
    }

    public let deviceId: String
    private let transport: LedgerSyncTransport
    private let store: SyncMetaStore
    private weak var host: LedgerSyncHost?

    private var userId: String?
    private var base: JSONValue?
    private var baseKey: String?
    // `base` as this client normalises it. "Unsaved changes" means the ledger differs
    // from both: other clients serialise the same ledger a little differently, and
    // comparing raw would make devices re-push each other's formatting forever.
    private var baseNormalizedKey: String?
    public private(set) var baseRevision = 0
    private var ready = false
    public private(set) var isReadOnly = false
    private var pendingChoiceRow: LedgerRow?
    private var pushRequested = false
    private var tail: Task<Void, Never>?
    private var retryTask: Task<Void, Never>?
    private var retryIndex = 0
    private var generation = 0

    private static let maxPushAttempts = 5
    private static let retryDelays: [UInt64] = [2, 4, 8, 16, 30, 60]

    public init(transport: LedgerSyncTransport, store: SyncMetaStore, host: LedgerSyncHost, deviceId: String) {
        self.transport = transport
        self.store = store
        self.host = host
        self.deviceId = deviceId
    }

    // MARK: - Lifecycle

    /// Signed in (or launched signed in): reconcile this device with the cloud.
    @discardableResult
    public func start(userId: String) async -> StartOutcome {
        stop()
        let generation = self.generation
        self.userId = userId
        host?.syncStatusChanged(.loading)

        var outcome: StartOutcome = .offline
        await enqueue { [self] in
            if let meta = store.loadMeta(userId: userId), meta.userId == userId {
                setBase(meta.base, revision: meta.baseRevision)
            }

            let row: LedgerRow?
            do {
                row = try await transport.fetchLedgerRow()
            } catch {
                guard generation == self.generation else { return }
                // Work offline against what we knew; pushes retry when the network returns.
                ready = baseRevision > 0
                host?.syncStatusChanged(.offline)
                scheduleRetry()
                outcome = .offline
                return
            }
            guard generation == self.generation, let host else { return }
            let local = host.syncLocalState

            guard let row else {
                // Nothing in the cloud yet: this device's data becomes the account's.
                setBase(nil, revision: 0)
                ready = true
                await pushLoop()
                outcome = .ready
                return
            }

            if isTooNew(row.state) {
                enterReadOnly()
                outcome = .updateRequired
                return
            }

            if baseRevision > 0 {
                // A device that has synced before: merge whatever happened on either side.
                if row.revision != baseRevision { integrate(row) }
                ready = true
                requestPush()
                outcome = .ready
                return
            }

            guard let cloud = decode(row.state).map(host.syncNormalize) else {
                host.syncStatusChanged(.offline)
                outcome = .offline
                return
            }
            if !local.hasLocalData || contentKey(localJSON(local)) == contentKey(localJSON(cloud)) || Self.sameEntities(local, cloud) {
                setBase(row.state, revision: row.revision)
                saveMeta()
                host.syncReplaceLocal(cloud)
                ready = true
                host.syncStatusChanged(.saved)
                outcome = .ready
                return
            }

            // Both sides hold different real data and there is no common history: ask.
            pendingChoiceRow = row
            host.syncStatusChanged(.saved)
            host.syncNeedsChoice(local: local, cloud: cloud)
            outcome = .choose
        }.value
        return outcome
    }

    public func resolveFirstSync(_ choice: FirstSyncChoice) async {
        guard let row = pendingChoiceRow else { return }
        pendingChoiceRow = nil
        await enqueue { [self] in
            guard let host else { return }
            let local = host.syncLocalState
            switch choice {
            case .cloud:
                if let cloud = decode(row.state).map(host.syncNormalize) { host.syncReplaceLocal(cloud) }
            case .combine:
                let merged = LedgerMerge.merge(base: nil, local: localJSON(local, carryingFrom: nil), remote: row.state)
                if let combined = decode(merged).map(host.syncNormalize) { host.syncReplaceLocal(combined) }
            case .local:
                break // keep the ledger as is; the push below overwrites the cloud
            }
            setBase(row.state, revision: row.revision)
            saveMeta()
            ready = true
        }.value
        requestPush()
    }

    public func stop() {
        generation += 1
        ready = false
        isReadOnly = false
        userId = nil
        setBase(nil, revision: 0)
        pendingChoiceRow = nil
        pushRequested = false
        retryTask?.cancel()
        retryTask = nil
    }

    /// Sign-out: forget everything this device knew about the account.
    public func reset() {
        stop()
        store.clearMeta()
    }

    // MARK: - Triggers

    /// The ledger changed on this device (already debounced by the store).
    public func requestPush() {
        guard ready, !isReadOnly, !pushRequested else { return }
        pushRequested = true
        enqueue { [self] in
            pushRequested = false
            await pushLoop()
        }
    }

    /// Something may have changed on the server (foreground, reconnect, realtime join).
    public func requestPull() {
        guard ready, !isReadOnly else { return }
        enqueue { [self] in await pull() }
    }

    /// Realtime poke from the database trigger.
    public func onPoke(revision: Int?, schemaVersion: Int?) {
        guard let revision, revision > baseRevision else { return }
        if let schemaVersion, schemaVersion > CURRENT_SCHEMA_VERSION {
            enterReadOnly()
            return
        }
        requestPull()
    }

    /// Cheap check used while realtime is unavailable.
    public func checkRevision() async {
        guard ready, !isReadOnly else { return }
        if let revision = try? await transport.fetchLedgerRevision(), revision != baseRevision {
            requestPull()
        }
    }

    // MARK: - Internals

    private func pull() async {
        let generation = self.generation
        let row: LedgerRow?
        do {
            row = try await transport.fetchLedgerRow()
        } catch {
            host?.syncStatusChanged(.offline)
            scheduleRetry()
            return
        }
        guard generation == self.generation, let row, row.revision != baseRevision else { return }
        if isTooNew(row.state) {
            enterReadOnly()
            return
        }
        integrate(row)
        host?.syncRemoteApplied()
        requestPush()
    }

    /// Fold a server row into the ledger on screen and make it the new base. Runs
    /// without suspending, so no edit can land between reading and replacing.
    private func integrate(_ row: LedgerRow) {
        guard let host else { return }
        let local = host.syncLocalState
        let next: LedgerState?
        if hasPendingChanges(local) {
            let merged = LedgerMerge.merge(base: base, local: localJSON(local), remote: row.state)
            next = decode(merged).map(host.syncNormalize)
        } else {
            next = decode(row.state).map(host.syncNormalize)
        }
        setBase(row.state, revision: row.revision)
        saveMeta()
        if let next { host.syncReplaceLocal(next) }
    }

    private func pushLoop() async {
        let generation = self.generation
        for _ in 0..<Self.maxPushAttempts {
            guard generation == self.generation, !isReadOnly, let host else { return }
            let local = host.syncLocalState
            if baseRevision > 0 && !hasPendingChanges(local) {
                retryIndex = 0
                host.syncStatusChanged(.saved)
                return
            }

            host.syncStatusChanged(.saving)
            let payload = localJSON(local)
            let outcome: PushOutcome
            do {
                outcome = try await transport.pushLedger(payload, baseRevision: baseRevision, deviceId: deviceId)
            } catch {
                guard generation == self.generation else { return }
                host.syncStatusChanged(.offline)
                scheduleRetry()
                return
            }
            guard generation == self.generation else { return }

            switch outcome.status {
            case .ok:
                setBase(payload, revision: outcome.revision)
                saveMeta()
                retryIndex = 0
                retryTask?.cancel()
                retryTask = nil
                // Loop: the user may have edited while the request was in flight.
                continue
            case .missing:
                setBase(nil, revision: 0)
                continue
            case .schemaTooOld:
                enterReadOnly()
                return
            case .conflict:
                guard let state = outcome.state, !isTooNew(state) else {
                    enterReadOnly()
                    return
                }
                integrate(LedgerRow(state: state, revision: outcome.revision, updatedBy: outcome.updatedBy))
                host.syncRemoteApplied()
                continue
            }
        }
        // Five lost races in a row: back off rather than hammer the server.
        scheduleRetry()
    }

    // MARK: - Base bookkeeping

    private func setBase(_ state: JSONValue?, revision: Int) {
        base = state
        baseRevision = revision
        guard let state else {
            baseKey = nil
            baseNormalizedKey = nil
            return
        }
        baseKey = contentKey(state)
        if let host, let typed = decode(state) {
            baseNormalizedKey = contentKey(localJSON(host.syncNormalize(typed)))
        } else {
            baseNormalizedKey = nil
        }
    }

    private func hasPendingChanges(_ local: LedgerState) -> Bool {
        guard let baseKey else { return true }
        let key = contentKey(localJSON(local))
        return key != baseKey && key != baseNormalizedKey
    }

    private func saveMeta() {
        guard let userId else { return }
        store.saveMeta(SyncMeta(userId: userId, baseRevision: baseRevision, base: base))
    }

    /// This device's ledger as JSON, with keys this build does not know carried over
    /// from the server copy so a push never erases them.
    private func localJSON(_ state: LedgerState) -> JSONValue {
        localJSON(state, carryingFrom: base)
    }

    private func localJSON(_ state: LedgerState, carryingFrom raw: JSONValue?) -> JSONValue {
        guard let typed = try? JSONValue.encoding(state) else { return .object([:]) }
        return UnknownFields.carry(from: raw, into: typed)
    }

    private func decode(_ json: JSONValue) -> LedgerState? {
        try? json.decoded(as: LedgerState.self)
    }

    /// Canonical content, ignoring the save stamp and the month on screen.
    private func contentKey(_ json: JSONValue) -> String {
        guard var root = json.objectValue else { return json.canonical }
        root.removeValue(forKey: "lastSavedAt")
        root.removeValue(forKey: "selectedMonth")
        return JSONValue.object(root).canonical
    }

    private func isTooNew(_ json: JSONValue) -> Bool {
        (json["schemaVersion"]?.numberValue ?? 0) > Double(CURRENT_SCHEMA_VERSION)
    }

    private func enterReadOnly() {
        isReadOnly = true
        retryTask?.cancel()
        retryTask = nil
        host?.syncStatusChanged(.updateRequired)
    }

    private func scheduleRetry() {
        guard retryTask == nil else { return }
        let delay = Self.retryDelays[min(retryIndex, Self.retryDelays.count - 1)]
        retryIndex += 1
        retryTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: delay * 1_000_000_000)
            guard !Task.isCancelled, let self else { return }
            self.retryTask = nil
            guard let userId = self.userId else { return }
            if !self.ready {
                await self.start(userId: userId)
                return
            }
            self.enqueue { [self] in
                await self.pull()
                await self.pushLoop()
            }
        }
    }

    /// One sync operation at a time, so base and revision never race.
    @discardableResult
    private func enqueue(_ operation: @escaping @MainActor () async -> Void) -> Task<Void, Never> {
        let previous = tail
        let task = Task { @MainActor in
            await previous?.value
            await operation()
        }
        tail = task
        return task
    }

    /// Same transactions and accounts by id, whatever their values. A device that pushed
    /// this ledger before has the same ids; two devices that started separately never do.
    static func sameEntities(_ a: LedgerState, _ b: LedgerState) -> Bool {
        func transactionIds(_ state: LedgerState) -> [String] {
            state.months.values.flatMap { $0.incomes.map(\.id) + $0.expenses.map(\.id) }.sorted()
        }
        return transactionIds(a) == transactionIds(b) && a.accounts.map(\.id).sorted() == b.accounts.map(\.id).sorted()
    }
}
