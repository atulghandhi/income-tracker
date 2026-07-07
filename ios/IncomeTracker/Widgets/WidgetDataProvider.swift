// WidgetDataProvider.swift (main app)
// Writes the shared App Group snapshot and rebuilds it from LedgerState.

import Foundation
import WidgetKit

// MARK: - WidgetSnapshot

/// Wire format written to App Group UserDefaults and read by the widget extension.
/// JSON field names must stay in sync with the widget extension's copy.
public struct WidgetSnapshot: Codable, Sendable {
    /// Raw `CurrencyCode` value, e.g. "GBP".
    public let currency: String
    public let monthlySurplus: Double
    public let monthlyIncome: Double
    public let monthlyExpenses: Double
    public let savingsRate: Double
    public let netWorth: Double
    public let nextBillName: String?
    public let nextBillAmount: Double?
    public let nextBillDueDay: Int?
    public let privacyMode: Bool
    public let updatedAt: Date
    public let netWorthSparkline: [Double]
}

// MARK: - WidgetDataProvider

public enum WidgetDataProvider {
    public static let userDefaultsSuite = "group.com.incometracker"
    public static let snapshotKey = "widgetSnapshot"

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

// MARK: - Snapshot builder

@MainActor
public func buildWidgetSnapshot(from state: LedgerState) -> WidgetSnapshot {
    let budget = state.months[state.selectedMonth] ?? .empty
    let proj = FinanceEngine.projection(for: budget)
    // Debt balances rolled forward to today so the widget matches the app's derived figures.
    let accounts = FinanceEngine.rollForwardDebtBalances(accounts: state.accounts, months: state.months)
    let nwSummary = FinanceEngine.netWorthSummary(accounts)
    let outlook = FinanceEngine.netWorthOutlook(
        accounts: accounts,
        recurringMonthlySurplus: proj.recurringMonthlySurplus,
        horizonMonths: 12,
        assumedInvestmentReturn: state.assumedInvestmentReturn
    )
    let sparkline = outlook.map { $0.netWorth }

    let today = Calendar.current.component(.day, from: .now)
    let nextBillAccount = accounts
        .filter { $0.accountClass == .debt && $0.dueDay > 0 && $0.minimumPayment > 0 }
        .sorted { lhs, rhs in
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
