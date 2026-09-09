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

    /// False until `hydrate` has settled which copy of the ledger is current.
    /// Cloud pushes are suppressed before that so an empty starter state can
    /// never overwrite a real ledger during launch.
    public internal(set) var isHydrated = false

    /// Serialises hydration: a sign-in that lands while the launch hydrate is still
    /// running waits for it instead of racing it.
    var hydrationTask: Task<Void, Never>?

    /// Fingerprint of the inputs that drive local notifications, so rescheduling only
    /// happens when a due day, minimum payment or reminder setting actually changes.
    var lastReminderFingerprint: String?

    /// Set when an App Intent loaded the on-disk ledger without a full hydration (the
    /// app was launched in the background just to run the intent).
    var didLoadLocalWithoutHydration = false

    // MARK: - Undo

    private var undoStack: [LedgerState] = []

    public var canUndo: Bool { !undoStack.isEmpty }

    // MARK: - Init

    public init(state: LedgerState = LedgerState.initial) {
        self.state = state
    }

    // MARK: - Core mutation

    /// Apply a user edit: snapshots for undo, stamps `lastSavedAt` (so cross-device
    /// conflict resolution sees this device's edit as fresh) and schedules a
    /// debounced local save followed by a cloud push.
    public func update(_ mutation: (inout LedgerState) -> Void) {
        pushUndoSnapshot()
        mutation(&state)
        state.lastSavedAt = isoTimestampNow()
        scheduleSave(pushToCloud: true)
    }

    /// Apply a change that is not a user edit — month navigation, launch-time
    /// normalisation. Never creates an undo entry. Bumps `lastSavedAt` and pushes to
    /// the cloud only when ledger data actually changed (a seeded month, say); merely
    /// switching the month on screen persists locally without making this device look
    /// like the newest writer.
    public func applyQuietly(_ mutation: (inout LedgerState) -> Void) {
        let before = state
        mutation(&state)
        guard state != before else { return }
        if state.isEquivalent(to: before) {
            scheduleSave(pushToCloud: false)
        } else {
            state.lastSavedAt = isoTimestampNow()
            scheduleSave(pushToCloud: true)
        }
    }

    /// Forget the undo history — called whenever the whole state is replaced from
    /// outside (hydration, conflict resolution, sign-out) so "Undo" can never restore
    /// a ledger that belongs to a different account or an older sync generation.
    public func clearUndoHistory() {
        undoStack.removeAll()
    }

    // MARK: - Undo

    public func undo() {
        guard let previous = undoStack.popLast() else { return }
        state = previous
        // The reverted state is a fresh edit from this device's point of view.
        state.lastSavedAt = isoTimestampNow()
        scheduleSave(pushToCloud: true)
    }

    private func pushUndoSnapshot() {
        undoStack.append(state)
        if undoStack.count > 20 {
            undoStack.removeFirst()
        }
    }

    // MARK: - Debounced autosave

    var saveTask: Task<Void, Never>?
    private var pendingCloudPush = false
    private var isSaving = false
    private var saveRequestedWhileSaving = false

    private func scheduleSave(pushToCloud: Bool) {
        pendingCloudPush = pendingCloudPush || pushToCloud
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000) // 0.3 s
            guard !Task.isCancelled else { return }
            await performSave()
        }
    }

    /// Writes any pending change immediately. Call when the app is about to be
    /// suspended so a quick "log and swipe away" is never lost to the debounce.
    public func flushPendingSave() async {
        guard saveTask != nil else { return }
        saveTask?.cancel()
        saveTask = nil
        await performSave()
    }

    /// True while an edit is waiting for the debounce or a save is in flight.
    public var hasUnsavedChanges: Bool {
        saveTask != nil || isSaving
    }

    /// Persists locally, then pushes to the cloud (when a pusher is installed and
    /// hydration has finished). Saves never overlap: a request that arrives while one
    /// is in flight runs once more afterwards.
    private func performSave() async {
        saveTask = nil
        if isSaving {
            saveRequestedWhileSaving = true
            return
        }
        isSaving = true
        defer { isSaving = false }

        repeat {
            saveRequestedWhileSaving = false
            let shouldPush = pendingCloudPush
            pendingCloudPush = false

            saveStatus = .saving
            await persistLocally()
            if shouldPush, isHydrated, let cloudPusher {
                let pushed = state
                if await cloudPusher(pushed) {
                    recordSyncedStamp(pushed.lastSavedAt)
                    saveStatus = .loaded
                } else {
                    saveStatus = .offline
                }
            } else {
                saveStatus = .loaded
            }
        } while saveRequestedWhileSaving
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

    /// Opens a month. A month that does not exist yet is seeded from the month on
    /// screen when moving forward in time (recurring entries carry over, web parity);
    /// moving back to an untouched past month opens it empty.
    public func selectMonth(_ key: String) {
        guard isValidMonthKey(key) else { return }
        applyQuietly { s in
            if s.months[key] == nil {
                s.months[key] = FinanceEngine.seedMonth(
                    from: s.months[s.selectedMonth],
                    fromKey: s.selectedMonth,
                    toKey: key
                )
            }
            s.selectedMonth = key
        }
    }

    /// Opens the ledger on the real current month. The persisted selectedMonth is
    /// whatever month was on screen when state was last saved — often last month by
    /// the time the app is next opened. Seeds today's month from the last-worked month
    /// when it doesn't exist yet, same as navigating forward.
    public func snapToCurrentMonth() {
        let today = getMonthKey()
        guard state.selectedMonth != today else { return }
        selectMonth(today)
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
            // Deleting an auto-seeded copy means "this doesn't repeat": flip the
            // origin entry to one-off so future months stop seeding it (web parity).
            if let seededFrom = s.months[s.selectedMonth]?.incomes.first(where: { $0.id == id })?.seededFrom,
               let originIndex = s.months[seededFrom.monthKey]?.incomes.firstIndex(where: { $0.id == seededFrom.entryId }) {
                s.months[seededFrom.monthKey]?.incomes[originIndex].recurring = false
            }
            s.months[s.selectedMonth]?.incomes.removeAll { $0.id == id }
        }
    }

    // MARK: - Expense mutations

    public func addExpense(_ entry: ExpenseEntry) {
        update { s in
            s.months[s.selectedMonth, default: .empty].expenses.append(entry)
        }
    }

    /// Saves an edited expense. Correcting the category of an imported (or
    /// automatically categorised) entry also teaches a rule and re-sorts earlier
    /// automated guesses for the same payee — the return value says how many.
    @discardableResult
    public func updateExpense(_ entry: ExpenseEntry) -> Int {
        var retroactivelyApplied = 0
        update { s in
            guard let idx = s.months[s.selectedMonth]?.expenses.firstIndex(where: { $0.id == entry.id }),
                  let previous = s.months[s.selectedMonth]?.expenses[idx] else { return }
            var next = entry
            let category = next.category.trimmingCharacters(in: .whitespaces)
            let categoryChanged = previous.category != next.category
            let wasAutomated = previous.imported != nil || previous.categorySource != nil
            if categoryChanged && wasAutomated {
                // A human decision; automation must never override it again.
                next.categorySource = "user"
                if !category.isEmpty && category != "Unsorted" {
                    let original = previous.imported?.originalDescription ?? ""
                    retroactivelyApplied = learnCategoryRule(
                        in: &s,
                        description: original.isEmpty ? previous.name : original,
                        category: category,
                        kind: next.debtAccountId != nil ? .debtPayment : .expense,
                        excludeEntryId: next.id
                    )
                }
            }
            s.months[s.selectedMonth]?.expenses[idx] = next
        }
        return retroactivelyApplied
    }

    public func removeExpense(id: String) {
        update { s in
            // See removeIncome — deleting a seeded copy stops the repeat at the origin.
            if let seededFrom = s.months[s.selectedMonth]?.expenses.first(where: { $0.id == id })?.seededFrom,
               let originIndex = s.months[seededFrom.monthKey]?.expenses.firstIndex(where: { $0.id == seededFrom.entryId }) {
                s.months[seededFrom.monthKey]?.expenses[originIndex].recurring = false
            }
            s.months[s.selectedMonth]?.expenses.removeAll { $0.id == id }
        }
    }

    /// Flips the recurring flag on an entry in the open month.
    public func setRecurring(_ recurring: Bool, entryId: String) {
        update { s in
            if let idx = s.months[s.selectedMonth]?.incomes.firstIndex(where: { $0.id == entryId }) {
                s.months[s.selectedMonth]?.incomes[idx].recurring = recurring
            }
            if let idx = s.months[s.selectedMonth]?.expenses.firstIndex(where: { $0.id == entryId }) {
                s.months[s.selectedMonth]?.expenses[idx].recurring = recurring
            }
        }
    }

    /// Accepts a detected recurring pattern: marks the newest occurrence recurring
    /// so it seeds into future months (web parity with `applyRecurringFlag`).
    public func markRecurring(_ candidate: RecurrenceCandidate) {
        update { s in
            s = Recurrence.applyRecurringFlag(s, candidate: candidate)
        }
    }

    /// Free-text note for the open month.
    public func setMonthNote(_ note: String) {
        guard currentMonthBudget.note != note else { return }
        update { s in
            s.months[s.selectedMonth, default: .empty].note = note
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
            if s.ledgerGoalId == id { s.ledgerGoalId = nil }
        }
    }

    public func reorderGoals(from source: IndexSet, to destination: Int) {
        update { s in
            // Manual move so this file stays Foundation-only: SwiftUI's
            // move(fromOffsets:toOffset:) is not visible without importing it.
            let moving = source.sorted().compactMap { s.goals.indices.contains($0) ? s.goals[$0] : nil }
            guard !moving.isEmpty else { return }
            var remaining = s.goals.enumerated().filter { !source.contains($0.offset) }.map(\.element)
            let removedBefore = source.filter { $0 < destination }.count
            let insertAt = max(0, min(remaining.count, destination - removedBefore))
            remaining.insert(contentsOf: moving, at: insertAt)
            s.goals = remaining
            // Re-assign priority to reflect new order (1 = highest).
            for idx in s.goals.indices {
                s.goals[idx].priority = idx + 1
            }
        }
    }

    /// Reorders goals to match `ids` (unknown ids are ignored, missing goals keep
    /// their relative order at the end) and renumbers priorities 1…n.
    public func setGoalOrder(ids: [String]) {
        let byId = Dictionary(uniqueKeysWithValues: state.goals.map { ($0.id, $0) })
        var ordered = ids.compactMap { byId[$0] }
        let placed = Set(ordered.map(\.id))
        ordered += state.goals.sorted { $0.priority < $1.priority }.filter { !placed.contains($0.id) }
        guard ordered.map(\.id) != state.goals.map(\.id) || ordered.enumerated().contains(where: { $0.element.priority != $0.offset + 1 }) else { return }
        update { s in
            s.goals = ordered
            for idx in s.goals.indices {
                s.goals[idx].priority = idx + 1
            }
        }
    }

    /// Moves a goal one step up or down the priority order.
    public func moveGoal(id: String, by offset: Int) {
        let ordered = state.goals.sorted { $0.priority < $1.priority }
        guard let index = ordered.firstIndex(where: { $0.id == id }) else { return }
        let target = index + offset
        guard ordered.indices.contains(target) else { return }
        var reordered = ordered
        reordered.swapAt(index, target)
        update { s in
            s.goals = reordered
            for idx in s.goals.indices {
                s.goals[idx].priority = idx + 1
            }
        }
    }

    // MARK: - Derived accounts

    /// Accounts with debt balances rolled forward from their `balanceAsOf` snapshot to today —
    /// every screen and summary should read these instead of `state.accounts` so a card set up
    /// months ago shows what's left after the scheduled (or linked) payments.
    public var effectiveAccounts: [Account] {
        FinanceEngine.rollForwardDebtBalances(accounts: state.accounts, months: state.months)
    }

    // MARK: - Account mutations

    public func addAccount(_ account: Account) {
        update { s in
            var next = account
            if next.balanceAsOf == nil {
                next.balanceAsOf = getMonthKey()
            }
            s.accounts.append(next)
        }
    }

    public func updateAccount(_ account: Account) {
        update { s in
            guard let idx = s.accounts.firstIndex(where: { $0.id == account.id }) else { return }
            let existing = s.accounts[idx]
            var next = account
            if next.accountClass == .debt {
                // The editor is populated from the rolled-forward balance. A different number
                // means the user manually trued it up — re-anchor the snapshot to this month.
                // An unchanged number keeps the stored snapshot + anchor so the derivation
                // stays live (future linked payments can still refine the elapsed months).
                let derived = FinanceEngine.rollForwardDebtBalances(
                    accounts: [existing], months: s.months
                ).first?.balance ?? existing.balance
                if abs(next.balance - derived) > 0.005 || existing.accountClass != .debt {
                    next.balanceAsOf = getMonthKey()
                } else {
                    next.balance = existing.balance
                    next.balanceAsOf = existing.balanceAsOf ?? getMonthKey()
                }
            } else if next.balanceAsOf == nil {
                next.balanceAsOf = existing.balanceAsOf
            }
            s.accounts[idx] = next
        }
    }

    public func removeAccount(id: String) {
        update { s in
            s.accounts.removeAll { $0.id == id }
        }
    }

    public func duplicateAccount(id: String) {
        update { s in
            guard let index = s.accounts.firstIndex(where: { $0.id == id }) else { return }
            var copy = s.accounts[index]
            copy.id = createId(prefix: "account")
            copy.name = "\(copy.name) copy"
            copy.balanceAsOf = getMonthKey()
            s.accounts.insert(copy, at: index + 1)
        }
    }

    public func moveAccounts(from source: IndexSet, to destination: Int) {
        update { s in
            let moving = source.sorted().compactMap { s.accounts.indices.contains($0) ? s.accounts[$0] : nil }
            guard !moving.isEmpty else { return }
            var remaining = s.accounts.enumerated().filter { !source.contains($0.offset) }.map(\.element)
            let removedBefore = source.filter { $0 < destination }.count
            let insertAt = max(0, min(remaining.count, destination - removedBefore))
            remaining.insert(contentsOf: moving, at: insertAt)
            s.accounts = remaining
        }
    }

    // MARK: - CategoryRule mutations

    public func addCategoryRule(_ rule: CategoryRule) {
        update { s in
            s.categoryRules.append(rule)
            if s.categoryRules.count > 120 {
                s.categoryRules = Array(s.categoryRules.suffix(120))
            }
        }
    }

    public func removeCategoryRule(id: String) {
        update { s in
            s.categoryRules.removeAll { $0.id == id }
        }
    }

    /// Saves a "transfer between my accounts" payee pattern and removes every existing
    /// entry that matches it. Returns how many entries were swept.
    @discardableResult
    public func addTransferRule(pattern: String) -> Int {
        let cleaned = pattern.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !cleaned.isEmpty else { return 0 }
        var removed = 0
        update { s in
            s.categoryRules = upsertTransferRule(s.categoryRules, pattern: cleaned, timestamp: isoTimestampNow())
            let swept = sweepTransferEntries(months: s.months, rules: s.categoryRules)
            s.months = swept.months
            removed = swept.removed
        }
        return removed
    }

    // MARK: - Import batch mutations

    /// Roll back all entries belonging to a previously imported batch.
    public func undoImportBatch(id: String) {
        guard state.importBatches.contains(where: { $0.id == id }) else { return }
        update { s in
            removeImportBatch(from: &s, batchId: id)
        }
    }

    /// Commits reviewed rows (CSV, OFX, QIF, pasted text or a screenshot) in a single
    /// undoable update. The work runs against a copy first so the store only changes
    /// when the import actually did something.
    @discardableResult
    public func commitCSVImport(rows: [CsvImportRow], fileName: String, totalRows: Int? = nil) -> ImportCommitResult {
        var staged = state
        let result = commitImport(rows: rows, into: &staged, fileName: fileName, totalRows: totalRows)
        guard result.didChangeLedger else { return result }
        update { s in
            s = staged
        }
        return result
    }

    // MARK: - Settings mutations

    public func setCurrency(_ code: CurrencyCode) {
        update { s in s.currency = code }
    }

    public func setPrivacyMode(_ on: Bool) {
        update { s in s.privacyMode = on }
    }

    public func setSavingsTarget(_ target: Double) {
        update { s in s.savingsTarget = max(0, min(100, target)) }
    }

    public func setGoalPlannerSurplus(_ value: Double?) {
        update { s in s.goalPlannerSurplus = value }
    }

    public func setAssumedInvestmentReturn(_ rate: Double) {
        update { s in s.assumedInvestmentReturn = max(-50, min(50, rate)) }
    }

    public func setGoalsHorizonMonths(_ months: Int) {
        guard months > 0 else { return }
        update { s in s.goalsHorizonMonths = months }
    }

    public func setLedgerGoalId(_ id: String?) {
        update { s in s.ledgerGoalId = id }
    }

    // MARK: - Whole-state replacement

    /// Replaces the ledger outright (conflict resolution, sign-out). Not undoable.
    public func replaceState(_ newState: LedgerState, pushToCloud: Bool) {
        clearUndoHistory()
        state = newState
        if pushToCloud {
            state.lastSavedAt = isoTimestampNow()
        }
        snapToCurrentMonth()
        scheduleSave(pushToCloud: pushToCloud)
    }
}
