// LinuxStubs.swift
// Linux-only stand-ins for the Apple-framework types LedgerStore touches, so the
// store and the Sync v2 engine compile and test with the Linux toolchain
// (ios/LinuxTests/run.sh). Never part of the app target.

import Foundation

public struct WidgetSnapshot {}
public enum WidgetDataProvider { public static func write(_ snapshot: WidgetSnapshot) {} }
public func buildWidgetSnapshot(from state: LedgerState) -> WidgetSnapshot { WidgetSnapshot() }
public struct ReminderSettings { static func load() -> ReminderSettings { ReminderSettings() } }
enum NotificationScheduler {
    static func fingerprint(accounts: [Account], settings: ReminderSettings, currency: CurrencyCode) -> String { "" }
    static func reschedule(accounts: [Account], settings: ReminderSettings, currency: CurrencyCode) async {}
}
@MainActor
final class SyncCoordinator: LedgerSyncTransport {
    struct SupabaseUser { let id: String; let email: String? }
    struct MergeConflict: Identifiable { let id = UUID(); let local: LedgerState; let cloud: LedgerState }
    var isSignedIn = false
    var currentUser: SupabaseUser?
    var mergeConflict: MergeConflict?
    var lastSyncedAt: Date?
    var isSyncing = false
    var lastSyncError: String?
    func pushLedger(_ state: JSONValue, baseRevision: Int, deviceId: String) async throws -> PushOutcome { throw URLError(.badURL) }
    func fetchLedgerRow() async throws -> LedgerRow? { nil }
    func fetchLedgerRevision() async throws -> Int? { nil }
}
