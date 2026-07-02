// LedgerStore.swift
// Central @Observable store wrapping LedgerState.
// No UIKit / SwiftUI dependency — Foundation only.

import Foundation
import Observation

// MARK: - LedgerStore

@MainActor
@Observable
public final class LedgerStore {

    // MARK: - Published state

    public var state: LedgerState

    // MARK: - Save status

    public enum SaveStatus: Hashable {
        case loading
        case saving
        case loaded
        case offline
    }

    public internal(set) var saveStatus: SaveStatus = .loaded

    // MARK: - Cloud push hook

    /// Set at app startup. Pushes the freshly saved state to the cloud after
    /// every debounced local save. Returns false when the push failed (offline
    /// or server error) so the save status can reflect it. Implementations
    /// should return true when the user is signed out (nothing to push).
    public var cloudPusher: (@MainActor (LedgerState) async -> Bool)?

    // MARK: - Undo

    private var undoStack: [LedgerState] = []

    public var canUndo: Bool { !undoStack.isEmpty }

    // MARK: - Init

    public init(state: LedgerState = LedgerState.initial) {
        self.state = state
    }

    // MARK: - Core mutation

    /// Apply a mutation and schedule a debounced autosave.
    public func update(_ mutation: (inout LedgerState) -> Void) {
        scheduleSave()          // snapshot current state onto undo stack before applying
        mutation(&state)
        // Stamp the modification time so cross-device conflict resolution
        // (which compares lastSavedAt) sees local edits as fresh.
        state.lastSavedAt = ISO8601DateFormatter().string(from: .now)
    }

    // MARK: - Undo

    public func undo() {
        guard let previous = undoStack.popLast() else { return }
        state = previous
        // Re-schedule save so the reverted state is persisted.
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            await performSave()
        }
    }

    // MARK: - Debounced autosave

    private var saveTask: Task<Void, Never>?

    private func scheduleSave() {
        // 1. Push snapshot onto undo stack (cap at 20).
        undoStack.append(state)
        if undoStack.count > 20 {
            undoStack.removeFirst()
        }

        // 2. Cancel any pending save.
        saveTask?.cancel()

        // 3. Schedule a new delayed save.
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000) // 0.3 s
            guard !Task.isCancelled else { return }
            await performSave()
        }
    }

    /// Persists locally, then pushes to the cloud (when a pusher is installed).
    private func performSave() async {
        saveStatus = .saving
        await persistLocally()
        if let cloudPusher {
            saveStatus = await cloudPusher(state) ? .loaded : .offline
        } else {
            saveStatus = .loaded
        }
    }

    // MARK: - Month navigation

    public var selectedMonth: String {
        state.selectedMonth
    }

    public var currentMonthBudget: MonthBudget {
        state.months[state.selectedMonth] ?? .empty
    }

    public func nextMonth() {
        selectMonth(shiftMonth(state.selectedMonth, by: 1))
    }

    public func previousMonth() {
        selectMonth(shiftMonth(state.selectedMonth, by: -1))
    }

    public func selectMonth(_ key: String) {
        update { s in
            s.selectedMonth = key
            if s.months[key] == nil {
                s.months[key] = .empty
            }
        }
    }

    // MARK: - Income mutations

    public func addIncome(_ entry: IncomeEntry) {
        update { s in
            s.months[s.selectedMonth, default: .empty].incomes.append(entry)
        }
    }

    public func updateIncome(_ entry: IncomeEntry) {
        update { s in
            guard let idx = s.months[s.selectedMonth]?.incomes.firstIndex(where: { $0.id == entry.id }) else { return }
            s.months[s.selectedMonth]?.incomes[idx] = entry
        }
    }

    public func removeIncome(id: String) {
        update { s in
            s.months[s.selectedMonth]?.incomes.removeAll { $0.id == id }
        }
    }

    // MARK: - Expense mutations

    public func addExpense(_ entry: ExpenseEntry) {
        update { s in
            s.months[s.selectedMonth, default: .empty].expenses.append(entry)
        }
    }

    public func updateExpense(_ entry: ExpenseEntry) {
        update { s in
            guard let idx = s.months[s.selectedMonth]?.expenses.firstIndex(where: { $0.id == entry.id }) else { return }
            s.months[s.selectedMonth]?.expenses[idx] = entry
        }
    }

    public func removeExpense(id: String) {
        update { s in
            s.months[s.selectedMonth]?.expenses.removeAll { $0.id == id }
        }
    }

    // MARK: - Goal mutations

    public func addGoal(_ goal: SavingsGoal) {
        update { s in
            s.goals.append(goal)
        }
    }

    public func updateGoal(_ goal: SavingsGoal) {
        update { s in
            guard let idx = s.goals.firstIndex(where: { $0.id == goal.id }) else { return }
            s.goals[idx] = goal
        }
    }

    public func removeGoal(id: String) {
        update { s in
            s.goals.removeAll { $0.id == id }
        }
    }

    public func reorderGoals(from source: IndexSet, to destination: Int) {
        update { s in
            s.goals.move(fromOffsets: source, toOffset: destination)
            // Re-assign priority to reflect new order (1 = highest).
            for (idx, _) in s.goals.enumerated() {
                s.goals[idx].priority = idx + 1
            }
        }
    }

    // MARK: - Account mutations

    public func addAccount(_ account: Account) {
        update { s in
            s.accounts.append(account)
        }
    }

    public func updateAccount(_ account: Account) {
        update { s in
            guard let idx = s.accounts.firstIndex(where: { $0.id == account.id }) else { return }
            s.accounts[idx] = account
        }
    }

    public func removeAccount(id: String) {
        update { s in
            s.accounts.removeAll { $0.id == id }
        }
    }

    // MARK: - CategoryRule mutations

    public func addCategoryRule(_ rule: CategoryRule) {
        update { s in
            s.categoryRules.append(rule)
        }
    }

    public func removeCategoryRule(id: String) {
        update { s in
            s.categoryRules.removeAll { $0.id == id }
        }
    }

    // MARK: - Import batch mutations

    /// Apply an import batch.  `entries` maps each transaction ref to a closure
    /// that transforms the target month's `MonthBudget`.
    public func addImportBatch(
        _ batch: ImportBatch,
        entries: [ImportedTransactionRef: (MonthBudget) -> MonthBudget]
    ) {
        update { s in
            // Apply each per-ref budget transform.
            for (ref, transform) in entries {
                let current = s.months[ref.monthKey] ?? .empty
                s.months[ref.monthKey] = transform(current)
            }
            s.importBatches.append(batch)
        }
    }

    /// Roll back all entries belonging to a previously imported batch.
    public func undoImportBatch(id: String) {
        update { s in
            guard let batch = s.importBatches.first(where: { $0.id == id }) else { return }

            let refsToRemove = Set(batch.transactionRefs)

            // Walk every referenced month and strip entries that carry this batchId.
            let affectedMonths = Set(batch.transactionRefs.map { $0.monthKey })
            for monthKey in affectedMonths {
                s.months[monthKey]?.incomes.removeAll { entry in
                    guard let meta = entry.imported else { return false }
                    return meta.batchId == id
                }
                s.months[monthKey]?.expenses.removeAll { entry in
                    guard let meta = entry.imported else { return false }
                    return meta.batchId == id
                }
            }

            // Remove the batch record itself.
            s.importBatches.removeAll { $0.id == id }

            // Suppress the "unused variable" warning for refsToRemove.
            _ = refsToRemove
        }
    }

    /// Commits reviewed CSV rows in a single atomic update. Runs commitImport
    /// against a snapshot first so the store mutation stays all-or-nothing.
    public func commitCSVImport(rows: [CsvImportRow], fileName: String) {
        let includedRows = rows.filter(\.include)
        guard !includedRows.isEmpty else { return }

        var tempState = state
        let batch = commitImport(rows: rows, into: &tempState, fileName: fileName)

        update { s in
            for ref in batch.transactionRefs {
                s.months[ref.monthKey] = tempState.months[ref.monthKey]
            }
            s.importBatches.append(batch)
            for rule in tempState.categoryRules
                where !s.categoryRules.contains(where: { $0.id == rule.id }) {
                s.categoryRules.append(rule)
            }
        }
    }

    // MARK: - Settings mutations

    public func setCurrency(_ code: CurrencyCode) {
        update { s in s.currency = code }
    }

    public func setPrivacyMode(_ on: Bool) {
        update { s in s.privacyMode = on }
    }

    public func setSavingsTarget(_ target: Double) {
        update { s in s.savingsTarget = target }
    }

    public func setGoalPlannerSurplus(_ value: Double?) {
        update { s in s.goalPlannerSurplus = value }
    }

    public func setAssumedInvestmentReturn(_ rate: Double) {
        update { s in s.assumedInvestmentReturn = rate }
    }
}
