// WidgetDataProvider.swift
// Shared data bridge between the main app and the widget extension.
// Uses an App Group UserDefaults container so the widget can read a fresh
// snapshot without launching the main app process.

import Foundation
import WidgetKit

// MARK: - WidgetSnapshot

/// Lightweight snapshot written by the main app and read by the widget extension.
/// Stored in the shared App Group container under `snapshotKey`.
///
/// All fields are plain value types so the struct is trivially `Sendable`
/// and can be encoded/decoded in any isolation context.
public struct WidgetSnapshot: Codable, Sendable {
    /// Raw `CurrencyCode` value, e.g. "GBP".
    public let currency: String
    public let monthlySurplus: Double
    public let monthlyIncome: Double
    public let monthlyExpenses: Double
    /// Savings rate as a percentage in the range 0–100.
    public let savingsRate: Double
    public let netWorth: Double
    /// Name of the soonest upcoming bill (debt account with a dueDay set), if any.
    public let nextBillName: String?
    /// Minimum payment amount for the next bill.
    public let nextBillAmount: Double?
    /// Calendar day-of-month the next bill falls on.
    public let nextBillDueDay: Int?
    public let privacyMode: Bool
    public let updatedAt: Date
    /// 12-point net-worth sparkline sourced from the first 12 months of
    /// `FinanceEngine.netWorthOutlook`. Simplified for widget rendering.
    public let netWorthSparkline: [Double]
}

// MARK: - WidgetDataProvider

/// Namespace for reading and writing the shared widget snapshot.
public enum WidgetDataProvider {
    public static let userDefaultsSuite = "group.com.incometracker"
    public static let snapshotKey = "widgetSnapshot"

    /// Encodes `snapshot` and stores it in the shared App Group UserDefaults,
    /// then asks WidgetKit to reload all widget timelines immediately.
    ///
    /// Must be called from `@MainActor` context (e.g. inside `LedgerStore.scheduleSave`).
    @MainActor
    public static func write(_ snapshot: WidgetSnapshot) {
        guard let defaults = UserDefaults(suiteName: userDefaultsSuite) else { return }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(snapshot) {
            defaults.set(data, forKey: snapshotKey)
        }
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Reads and decodes the most recently written `WidgetSnapshot` from the
    /// shared App Group UserDefaults. Returns `nil` if no snapshot has been
    /// written yet or if decoding fails.
    public static func read() -> WidgetSnapshot? {
        guard
            let defaults = UserDefaults(suiteName: userDefaultsSuite),
            let data = defaults.data(forKey: snapshotKey)
        else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(WidgetSnapshot.self, from: data)
    }
}

// The snapshot builder lives in the main app (Widgets/WidgetDataProvider.swift):
// it needs LedgerState and FinanceEngine, which are not compiled into this target.
