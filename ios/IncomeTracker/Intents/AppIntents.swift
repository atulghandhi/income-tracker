// AppIntents.swift
// App Intents for Siri Shortcuts integration.
//
// Three intents are exposed:
//   • AddExpenseIntent  — add an expense to the current month via Siri / Shortcuts.
//   • GetSurplusIntent  — read back this month's surplus via Siri.
//   • GetNetWorthIntent — read back current net worth via Siri.
//
// The intents extension cannot import the main app target, so lightweight
// Codable shims are used to read/write the ledger state from the shared
// App Group UserDefaults. These shims must stay wire-compatible with the
// real Types defined in the main target.

import AppIntents
import Foundation

// MARK: - Add Expense Intent

struct AddExpenseIntent: AppIntent {
    static let title: LocalizedStringResource = "Add Expense"
    static let description = IntentDescription(
        "Add an expense to Income Tracker.",
        categoryName: "Ledger"
    )

    /// Setting this to `false` means the intent can run without opening the app.
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Name", description: "What the expense is for.")
    var name: String

    @Parameter(title: "Amount", description: "How much the expense costs.")
    var amount: Double

    @Parameter(
        title: "Category",
        description: "Expense category, e.g. Food, Transport.",
        default: "General"
    )
    var category: String

    @MainActor
    func perform() async throws -> some ReturnsValue<String> {
        guard
            let defaults = UserDefaults(suiteName: AppGroupConstants.suiteName),
            let data = defaults.data(forKey: AppGroupConstants.ledgerStateKey),
            var ledger = try? JSONDecoder.shim.decode(LedgerStateShim.self, from: data)
        else {
            throw IntentError.noData
        }

        let key = ledger.selectedMonth
        var budget = ledger.months[key] ?? .empty
        let entry = ExpenseEntryShim(
            id: "exp_\(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(8).lowercased())",
            name: name,
            category: category,
            amount: amount,
            color: "#ff6b6b",
            recurring: false,
            date: nil,
            imported: nil
        )
        budget.expenses.append(entry)
        ledger.months[key] = budget

        if let encoded = try? JSONEncoder.shim.encode(ledger) {
            defaults.set(encoded, forKey: AppGroupConstants.ledgerStateKey)
        }

        return .result(value: "Added \(name) (\(formattedAmount(amount))) to \(category).")
    }

    // MARK: - Helpers

    /// Formats using the widget snapshot's currency if available, falls back to raw number.
    private func formattedAmount(_ amount: Double) -> String {
        guard let snapshot = WidgetDataProviderShim.read() else {
            return String(format: "%.2f", amount)
        }
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.currencyCode = snapshot.currency
        fmt.maximumFractionDigits = snapshot.currency == "JPY" ? 0 : 2
        return fmt.string(from: NSNumber(value: amount)) ?? String(format: "%.2f", amount)
    }

    // MARK: - Errors

    enum IntentError: Error, LocalizedError {
        case noData

        var errorDescription: String? {
            "Could not load Income Tracker data. Open the app and try again."
        }
    }
}

// MARK: - Get Monthly Surplus Intent

struct GetSurplusIntent: AppIntent {
    static let title: LocalizedStringResource = "Get Monthly Surplus"
    static let description = IntentDescription(
        "Find out your surplus for this month.",
        categoryName: "Insights"
    )

    @MainActor
    func perform() async throws -> some ReturnsValue<Double> & ProvidesDialog {
        guard let snapshot = WidgetDataProviderShim.read() else {
            return .result(
                value: 0,
                dialog: "No data available in Income Tracker. Open the app to get started."
            )
        }
        let formatted = currencyString(snapshot.monthlySurplus, currency: snapshot.currency)
        let dialog: String
        if snapshot.monthlySurplus >= 0 {
            dialog = "Your surplus this month is \(formatted)."
        } else {
            dialog = "You're \(currencyString(abs(snapshot.monthlySurplus), currency: snapshot.currency)) over budget this month."
        }
        return .result(value: snapshot.monthlySurplus, dialog: IntentDialog(stringLiteral: dialog))
    }
}

// MARK: - Get Net Worth Intent

struct GetNetWorthIntent: AppIntent {
    static let title: LocalizedStringResource = "Get Net Worth"
    static let description = IntentDescription(
        "See your current net worth.",
        categoryName: "Insights"
    )

    @MainActor
    func perform() async throws -> some ReturnsValue<Double> & ProvidesDialog {
        guard let snapshot = WidgetDataProviderShim.read() else {
            return .result(
                value: 0,
                dialog: "No data available in Income Tracker. Open the app to get started."
            )
        }
        let formatted = currencyString(snapshot.netWorth, currency: snapshot.currency)
        let dialog: String
        if snapshot.netWorth >= 0 {
            dialog = "Your net worth is \(formatted)."
        } else {
            dialog = "Your net position is \(formatted) — you currently owe more than you own."
        }
        return .result(value: snapshot.netWorth, dialog: IntentDialog(stringLiteral: dialog))
    }
}

// MARK: - Shared currency formatter

private func currencyString(_ amount: Double, currency: String) -> String {
    let fmt = NumberFormatter()
    fmt.numberStyle = .currency
    fmt.currencyCode = currency
    fmt.maximumFractionDigits = currency == "JPY" ? 0 : 2
    fmt.minimumFractionDigits = currency == "JPY" ? 0 : 2
    return fmt.string(from: NSNumber(value: amount)) ?? String(format: "%.2f", amount)
}

// MARK: - App Shortcuts Provider

/// Registers the three intents as App Shortcuts so they appear in Spotlight
/// and are discoverable by Siri without any user setup.
struct IncomeTrackerShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddExpenseIntent(),
            phrases: [
                "Add expense in \(.applicationName)",
                "Log expense to \(.applicationName)",
                "Record a purchase in \(.applicationName)",
            ],
            shortTitle: "Add Expense",
            systemImageName: "plus.circle"
        )

        AppShortcut(
            intent: GetSurplusIntent(),
            phrases: [
                "What's my surplus in \(.applicationName)",
                "Check my balance in \(.applicationName)",
                "Am I over budget in \(.applicationName)",
            ],
            shortTitle: "Monthly Surplus",
            systemImageName: "chart.line.uptrend.xyaxis"
        )

        AppShortcut(
            intent: GetNetWorthIntent(),
            phrases: [
                "What's my net worth in \(.applicationName)",
                "Show net worth in \(.applicationName)",
                "How much am I worth in \(.applicationName)",
            ],
            shortTitle: "Net Worth",
            systemImageName: "banknote"
        )
    }
}

// MARK: - App Group Constants

private enum AppGroupConstants {
    static let suiteName = "group.com.incometracker"
    /// Must match `kStateKey` in LedgerStore+Persistence.swift.
    static let ledgerStateKey = "ledgerState_v7"
    static let snapshotKey = "widgetSnapshot"
}

// MARK: - Lightweight Shims
//
// The intents extension cannot import the main app target, so we define
// minimal Codable types that mirror the relevant parts of the real model.
// Wire-format (camelCase JSON keys, same enum raw values) must stay in sync
// with Types.swift and LedgerStore+Persistence.swift.

private struct LedgerStateShim: Codable {
    var selectedMonth: String
    var months: [String: MonthBudgetShim]
    var currency: String

    struct MonthBudgetShim: Codable {
        var incomes: [IncomeEntryShim]
        var expenses: [ExpenseEntryShim]
        var note: String

        static var empty: MonthBudgetShim {
            MonthBudgetShim(incomes: [], expenses: [], note: "")
        }
    }
}

private struct IncomeEntryShim: Codable {
    var id: String
    var source: String
    var amount: Double
    var color: String
    var recurring: Bool
    var date: String?
    var imported: String?
}

private struct ExpenseEntryShim: Codable {
    var id: String
    var name: String
    var category: String
    var amount: Double
    var color: String
    var recurring: Bool
    var date: String?
    var imported: String?
}

// MARK: - Widget Snapshot Shim

/// Subset of `WidgetSnapshot` sufficient for the intents (currency + key figures).
private struct WidgetSnapshotShim: Codable {
    var currency: String
    var monthlySurplus: Double
    var netWorth: Double
    var privacyMode: Bool
}

private enum WidgetDataProviderShim {
    static func read() -> WidgetSnapshotShim? {
        guard
            let defaults = UserDefaults(suiteName: AppGroupConstants.suiteName),
            let data = defaults.data(forKey: AppGroupConstants.snapshotKey)
        else { return nil }
        return try? JSONDecoder.shim.decode(WidgetSnapshotShim.self, from: data)
    }
}

// MARK: - JSON Coder Preset

private extension JSONEncoder {
    static let shim: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .useDefaultKeys
        e.dateEncodingStrategy = .iso8601
        return e
    }()
}

private extension JSONDecoder {
    static let shim: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .useDefaultKeys
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
