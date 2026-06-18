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

// MARK: - Main-app snapshot builder

/// Builds a `WidgetSnapshot` from the current `LedgerState` using `FinanceEngine`.
///
/// Call this whenever state changes and pass the result to `WidgetDataProvider.write(_:)`.
/// This function lives in the main-app target (not the widget extension) because it
/// depends on `FinanceEngine`, `LedgerState`, and all their transitive types.
///
/// - Parameter state: The current `LedgerState` from `LedgerStore`.
/// - Returns: A fully-populated `WidgetSnapshot` ready to be written to the App Group.
@MainActor
public func buildWidgetSnapshot(from state: LedgerState) -> WidgetSnapshot {
    // Current month's budget (fall back to empty so the snapshot is always valid).
    let budget = state.months[state.selectedMonth] ?? .empty

    // Core income/expense projection for the selected month.
    let proj = FinanceEngine.projection(for: budget)

    // Net-worth point from all accounts.
    let nwSummary = FinanceEngine.netWorthSummary(state.accounts)

    // 12-month net-worth outlook for the sparkline.
    // We use recurringMonthlySurplus so the sparkline is stable month-to-month.
    let outlook = FinanceEngine.netWorthOutlook(
        accounts: state.accounts,
        recurringMonthlySurplus: proj.recurringMonthlySurplus,
        horizonMonths: 12,
        assumedInvestmentReturn: state.assumedInvestmentReturn
    )
    let sparkline = outlook.map { $0.netWorth }

    // Find the soonest upcoming debt bill with a configured due day.
    // Sort by dueDay ascending, skip accounts with no due day or no minimum.
    let today = Calendar.current.component(.day, from: .now)
    let nextBillAccount = state.accounts
        .filter { $0.accountClass == .debt && $0.dueDay > 0 && $0.minimumPayment > 0 }
        .sorted { lhs, rhs in
            // Bills due later this month come before bills already passed (next month).
            let lDue = lhs.dueDay >= today ? lhs.dueDay : lhs.dueDay + 31
            let rDue = rhs.dueDay >= today ? rhs.dueDay : rhs.dueDay + 31
            return lDue < rDue
        }
        .first

    return WidgetSnapshot(
        currency: state.currency.rawValue,
        monthlySurplus: proj.monthlySurplus,
        monthlyIncome: proj.monthlyIncome,
        monthlyExpenses: proj.monthlyExpenses,
        savingsRate: proj.savingsRate,
        netWorth: nwSummary.netWorth,
        nextBillName: nextBillAccount?.name,
        nextBillAmount: nextBillAccount.map { $0.minimumPayment },
        nextBillDueDay: nextBillAccount.map { $0.dueDay },
        privacyMode: state.privacyMode,
        updatedAt: .now,
        netWorthSparkline: sparkline
    )
}
