// AppIntents.swift
// App Intents for Siri and Shortcuts.
//
//   • AddExpenseIntent  — log an expense to the current month from Siri / Shortcuts.
//   • GetSurplusIntent  — read back this month's surplus.
//   • GetNetWorthIntent — read back current net worth.
//
// The intents are compiled into the app target, so they use the real LedgerStore
// (injected through AppDependencyManager at launch) and the same persistence as
// the rest of the app. Nothing here touches UserDefaults directly, which is how an
// earlier version managed to write a stale schema key and drop accounts and goals.

import AppIntents
import Foundation

// MARK: - Add Expense Intent

struct AddExpenseIntent: AppIntent {
    static let title: LocalizedStringResource = "Add Expense"
    static let description = IntentDescription(
        "Add an expense to Income Tracker.",
        categoryName: "Ledger"
    )

    /// Runs in the background — logging a coffee should not open the app.
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Name", description: "What the expense is for.")
    var name: String

    @Parameter(title: "Amount", description: "How much the expense costs.")
    var amount: Double

    @Parameter(title: "Category", description: "Expense category, e.g. Food or Travel. Guessed from the name when left blank.")
    var category: String?

    @Dependency
    private var store: LedgerStore

    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$name) for \(\.$amount)") {
            \.$category
        }
    }

    @MainActor
    func perform() async throws -> some ReturnsValue<String> & ProvidesDialog {
        let cleanedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanedName.isEmpty else { throw IntentError.missingName }
        guard amount.isFinite, amount > 0 else { throw IntentError.badAmount }

        store.ensureLocalStateLoaded()
        store.snapToCurrentMonth()

        let suggestion = suggestEntryCategory(description: cleanedName, amount: -abs(amount), rules: store.state.categoryRules)
        let chosen = (category ?? "").trimmingCharacters(in: .whitespaces)
        let finalCategory = chosen.isEmpty ? suggestion.category : chosen
        let today = isoDateString(Date())

        let entry = ExpenseEntry(
            id: createId(prefix: "expense"),
            name: cleanedName,
            category: finalCategory,
            amount: (amount * 100).rounded() / 100,
            color: categoryColor(for: finalCategory),
            recurring: false,
            date: today,
            categorySource: chosen.isEmpty ? suggestion.source : "user"
        )
        store.addExpense(entry)
        // Siri may suspend the process straight after perform() returns; write now.
        await store.flushPendingSave()

        let money = FinanceEngine.currencyFormatter(for: store.state.currency)
            .string(from: NSNumber(value: entry.amount)) ?? String(format: "%.2f", entry.amount)
        let spoken = "Added \(cleanedName), \(money), to \(finalCategory)."
        return .result(value: spoken, dialog: IntentDialog(stringLiteral: spoken))
    }

    enum IntentError: Error, CustomLocalizedStringResourceConvertible {
        case missingName
        case badAmount

        var localizedStringResource: LocalizedStringResource {
            switch self {
            case .missingName: return "Tell me what the expense was for."
            case .badAmount: return "The amount needs to be a number greater than zero."
            }
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
    static let openAppWhenRun: Bool = false

    @Dependency
    private var store: LedgerStore

    @MainActor
    func perform() async throws -> some ReturnsValue<Double> & ProvidesDialog {
        store.ensureLocalStateLoaded()
        let state = store.state
        let budget = state.months[getMonthKey()] ?? .empty
        let projection = FinanceEngine.projection(for: budget)

        if state.privacyMode {
            return .result(value: projection.monthlySurplus, dialog: "Privacy mode is on. Open Income Tracker to see this month's figures.")
        }
        let money = FinanceEngine.currencyFormatter(for: state.currency)
        let formatted = money.string(from: NSNumber(value: abs(projection.monthlySurplus))) ?? "\(projection.monthlySurplus)"
        let dialog = projection.monthlySurplus >= 0
            ? "Your surplus this month is \(formatted)."
            : "You're \(formatted) over budget this month."
        return .result(value: projection.monthlySurplus, dialog: IntentDialog(stringLiteral: dialog))
    }
}

// MARK: - Get Net Worth Intent

struct GetNetWorthIntent: AppIntent {
    static let title: LocalizedStringResource = "Get Net Worth"
    static let description = IntentDescription(
        "See your current net worth.",
        categoryName: "Insights"
    )
    static let openAppWhenRun: Bool = false

    @Dependency
    private var store: LedgerStore

    @MainActor
    func perform() async throws -> some ReturnsValue<Double> & ProvidesDialog {
        store.ensureLocalStateLoaded()
        let state = store.state
        let netWorth = FinanceEngine.netWorthSummary(store.effectiveAccounts).netWorth

        if state.privacyMode {
            return .result(value: netWorth, dialog: "Privacy mode is on. Open Income Tracker to see your net worth.")
        }
        let money = FinanceEngine.currencyFormatter(for: state.currency)
        let formatted = money.string(from: NSNumber(value: netWorth)) ?? "\(netWorth)"
        let dialog = netWorth >= 0
            ? "Your net worth is \(formatted)."
            : "Your net position is \(formatted). You currently owe more than you own."
        return .result(value: netWorth, dialog: IntentDialog(stringLiteral: dialog))
    }
}

// MARK: - App Shortcuts Provider

/// Registers the intents as App Shortcuts so they appear in Spotlight and are
/// discoverable by Siri without any user setup.
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
