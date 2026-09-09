// Recurrence.swift
// Ported from src/recurrence.ts — Swift 6, Foundation only.
//
// Local recurring-transaction detection — no server, works in privacy mode.
// Groups ledger entries by canonical merchant and looks for a steady cadence
// with a steady amount. Powers the subscriptions panel, "mark as recurring"
// suggestions, missed-payment signals, and the seeded↔imported reconciliation.

import Foundation

public enum RecurrenceCadence: String, Sendable, Codable, Hashable {
    case weekly
    case fourWeekly = "4-weekly"
    case monthly
    case quarterly
    case annual

    var days: Int {
        switch self {
        case .weekly: return 7
        case .fourWeekly: return 28
        case .monthly: return 30
        case .quarterly: return 91
        case .annual: return 365
        }
    }

    var monthlyFactor: Double {
        switch self {
        case .weekly: return 52.0 / 12.0
        case .fourWeekly: return 13.0 / 12.0
        case .monthly: return 1
        case .quarterly: return 1.0 / 3.0
        case .annual: return 1.0 / 12.0
        }
    }

    public var label: String {
        switch self {
        case .weekly: return "Weekly"
        case .fourWeekly: return "Every 4 weeks"
        case .monthly: return "Monthly"
        case .quarterly: return "Quarterly"
        case .annual: return "Yearly"
        }
    }
}

public struct RecurrenceEntryRef: Sendable, Hashable {
    public let monthKey: String
    public let entryId: String
    public let kind: TransactionKind
}

public struct RecurrenceCandidate: Sendable, Hashable, Identifiable {
    public var id: String { "\(kind.rawValue):\(key)" }
    public let key: String
    public let label: String
    public let kind: TransactionKind
    public let category: String
    public let color: String
    public let cadence: RecurrenceCadence
    public let typicalAmount: Double
    public let monthlyEquivalent: Double
    public let occurrences: Int
    /// ISO date or monthKey.
    public let lastSeen: String
    /// ISO date; nil when occurrences carry no dates.
    public let nextExpected: String?
    public let confidence: Double
    public let alreadyRecurring: Bool
    public let entryRefs: [RecurrenceEntryRef]
}

private struct Occurrence {
    let monthKey: String
    let entryId: String
    let kind: TransactionKind
    let amount: Double
    let date: String?
    let recurring: Bool
    let category: String
    let color: String
    let label: String

    var sortKey: String { date ?? monthKey }
}

public enum Recurrence {

    public static func detectCandidates(_ state: LedgerState) -> [RecurrenceCandidate] {
        var groups: [String: [Occurrence]] = [:]
        var order: [String] = []

        for monthKey in state.months.keys.sorted() {
            guard let month = state.months[monthKey] else { continue }
            for income in month.incomes {
                push(&groups, &order, Occurrence(monthKey: monthKey, entryId: income.id, kind: .income, amount: income.amount,
                                                  date: income.date, recurring: income.recurring, category: "",
                                                  color: income.color, label: income.source))
            }
            for expense in month.expenses {
                push(&groups, &order, Occurrence(monthKey: monthKey, entryId: expense.id, kind: .expense, amount: expense.amount,
                                                  date: expense.date, recurring: expense.recurring, category: expense.category,
                                                  color: expense.color, label: expense.name))
            }
        }

        return order.compactMap { groups[$0] }.compactMap(classify)
            .sorted { $0.monthlyEquivalent > $1.monthlyEquivalent }
    }

    /// Detected-but-unflagged candidates: the "mark as recurring?" suggestion list.
    public static func suggestRecurringFlags(_ state: LedgerState) -> [RecurrenceCandidate] {
        detectCandidates(state).filter { !$0.alreadyRecurring && $0.confidence >= 0.6 }
    }

    /// Expense candidates on a repeating cadence — the subscriptions/bills panel.
    public static func detectSubscriptions(_ state: LedgerState) -> [RecurrenceCandidate] {
        detectCandidates(state).filter { $0.kind == .expense && $0.confidence >= 0.6 }
    }

    /// Candidates whose next expected date has passed with no matching entry — the
    /// "council tax usually lands by the 3rd" signal. Grace of 4 days before flagging.
    public static func findMissed(_ state: LedgerState, todayIso: String) -> [RecurrenceCandidate] {
        let currentMonthKey = String(todayIso.prefix(7))
        return detectCandidates(state).filter { candidate in
            guard let nextExpected = candidate.nextExpected, candidate.confidence >= 0.7 else { return false }
            if candidate.cadence == .weekly { return false }
            let graceCutoff = shiftIsoDate(nextExpected, days: 4)
            if todayIso <= graceCutoff { return false }
            let expectedMonth = String(nextExpected.prefix(7))
            if expectedMonth < currentMonthKey { return false }
            return !candidate.entryRefs.contains { $0.monthKey == expectedMonth }
        }
    }

    /// A CSV/feed import can bring in the real salary or rent line for a month that
    /// auto-seeding already populated. Rather than doubling, the seeded copy folds
    /// into the imported actual: the import wins (real amount + metadata) and takes
    /// over the recurring role. Returns how many rows merged so the caller can toast.
    public static func reconcileSeededEntries(_ month: MonthBudget) -> (month: MonthBudget, merged: Int) {
        var merged = 0

        let importedIncomeKeys = Set(month.incomes.filter { $0.seededFrom == nil && $0.imported != nil }.map { canonicalizeMerchant($0.source) })
        let importedExpenseKeys = Set(month.expenses.filter { $0.seededFrom == nil && $0.imported != nil }.map { canonicalizeMerchant($0.name) })

        var seededIncomeByKey: [String: IncomeEntry] = [:]
        for income in month.incomes where income.seededFrom != nil {
            seededIncomeByKey[canonicalizeMerchant(income.source)] = income
        }
        var seededExpenseByKey: [String: ExpenseEntry] = [:]
        for expense in month.expenses where expense.seededFrom != nil {
            seededExpenseByKey[canonicalizeMerchant(expense.name)] = expense
        }

        let incomes: [IncomeEntry] = month.incomes.compactMap { income in
            if income.seededFrom != nil, importedIncomeKeys.contains(canonicalizeMerchant(income.source)) {
                merged += 1
                return nil
            }
            guard income.seededFrom == nil, income.imported != nil,
                  seededIncomeByKey[canonicalizeMerchant(income.source)] != nil else { return income }
            var updated = income
            updated.recurring = true
            return updated
        }

        let expenses: [ExpenseEntry] = month.expenses.compactMap { expense in
            if expense.seededFrom != nil, importedExpenseKeys.contains(canonicalizeMerchant(expense.name)) {
                merged += 1
                return nil
            }
            guard expense.seededFrom == nil, expense.imported != nil,
                  let seeded = seededExpenseByKey[canonicalizeMerchant(expense.name)] else { return expense }
            var updated = expense
            updated.recurring = true
            // The seeded copy knew the category (it came from the recurring template);
            // an Unsorted import inherits it instead of demanding a re-sort.
            if expense.category == "Unsorted", !seeded.category.isEmpty {
                updated.category = seeded.category
                updated.color = seeded.color
            }
            return updated
        }

        guard merged > 0 else { return (month, 0) }
        var result = month
        result.incomes = incomes
        result.expenses = expenses
        return (result, merged)
    }

    /// Back-fill the recurring flag on every entry that belongs to a candidate.
    public static func applyRecurringFlag(_ state: LedgerState, candidate: RecurrenceCandidate) -> LedgerState {
        let refKeys = Set(candidate.entryRefs.map { "\($0.monthKey):\($0.entryId)" })
        var next = state
        for (monthKey, month) in state.months {
            var updated = month
            updated.incomes = month.incomes.map { income in
                guard refKeys.contains("\(monthKey):\(income.id)") else { return income }
                var copy = income
                copy.recurring = true
                return copy
            }
            updated.expenses = month.expenses.map { expense in
                guard refKeys.contains("\(monthKey):\(expense.id)") else { return expense }
                var copy = expense
                copy.recurring = true
                return copy
            }
            next.months[monthKey] = updated
        }
        return next
    }

    // MARK: - Private

    private static func push(_ groups: inout [String: [Occurrence]], _ order: inout [String], _ occurrence: Occurrence) {
        let key = canonicalizeMerchant(occurrence.label)
        guard !key.isEmpty, occurrence.amount > 0 else { return }
        let groupKey = "\(occurrence.kind.rawValue):\(key)"
        if groups[groupKey] == nil { order.append(groupKey) }
        groups[groupKey, default: []].append(occurrence)
    }

    private static func classify(_ occurrences: [Occurrence]) -> RecurrenceCandidate? {
        guard occurrences.count >= 3 else { return nil }

        let sorted = occurrences.sorted { $0.sortKey < $1.sortKey }
        let amounts = sorted.map(\.amount)
        let typicalAmount = median(Array(amounts.suffix(3)))
        let tolerance = max(2, typicalAmount * 0.15)
        let stableCount = amounts.filter { abs($0 - typicalAmount) <= tolerance }.count
        guard stableCount >= sorted.count - 1 else { return nil }

        let dated = sorted.filter { $0.date != nil }
        var cadence: RecurrenceCadence?
        var gapStability = 0.0

        if dated.count >= 3 {
            var gaps: [Double] = []
            for index in 1..<dated.count {
                gaps.append(Double(dayDiff(dated[index - 1].date!, dated[index].date!)))
            }
            let medianGap = median(gaps)
            cadence = cadenceFromGap(medianGap)
            if let resolved = cadence {
                let window = resolved == .weekly ? 2.0 : 4.0
                let inWindow = gaps.filter { abs($0 - medianGap) <= window }.count
                gapStability = Double(inWindow) / Double(gaps.count)
                if gapStability < 0.6 { cadence = nil }
            }
        }

        if cadence == nil {
            // Undated (manual) entries: appearing in 3+ distinct, mostly-consecutive months
            // with a stable amount is a monthly pattern.
            let months = Array(Set(sorted.map(\.monthKey))).sorted()
            guard months.count >= 3 else { return nil }
            let consecutive = countConsecutiveMonthPairs(months)
            guard consecutive >= months.count - 2 else { return nil }
            cadence = .monthly
            gapStability = Double(consecutive) / Double(months.count - 1)
        }

        guard let resolvedCadence = cadence, let last = sorted.last else { return nil }
        let lastSeen = last.date ?? last.monthKey
        let nextExpected = last.date.map { shiftIsoDate($0, days: resolvedCadence.days) }
        let confidence = min(0.95, 0.55 + 0.05 * Double(min(sorted.count, 7)) + 0.2 * gapStability)
        let latestCategorised = sorted.reversed().first { !$0.category.isEmpty }

        return RecurrenceCandidate(
            key: canonicalizeMerchant(last.label),
            label: last.label,
            kind: last.kind,
            category: latestCategorised?.category ?? "",
            color: last.color,
            cadence: resolvedCadence,
            typicalAmount: typicalAmount,
            monthlyEquivalent: roundToPence(typicalAmount * resolvedCadence.monthlyFactor),
            occurrences: sorted.count,
            lastSeen: lastSeen,
            nextExpected: nextExpected,
            confidence: (confidence * 100).rounded() / 100,
            alreadyRecurring: sorted.allSatisfy(\.recurring),
            entryRefs: sorted.map { RecurrenceEntryRef(monthKey: $0.monthKey, entryId: $0.entryId, kind: $0.kind) }
        )
    }

    private static func cadenceFromGap(_ medianGap: Double) -> RecurrenceCadence? {
        if medianGap >= 5 && medianGap <= 9 { return .weekly }
        // 4-weekly only when the gap sits tightly at 27–29; day-of-month billing drifts 28–33.
        if medianGap >= 26 && medianGap < 29.5 { return .fourWeekly }
        if medianGap >= 29.5 && medianGap <= 33 { return .monthly }
        if medianGap >= 85 && medianGap <= 97 { return .quarterly }
        if medianGap >= 350 && medianGap <= 380 { return .annual }
        return nil
    }

    private static func countConsecutiveMonthPairs(_ sortedMonths: [String]) -> Int {
        var pairs = 0
        for index in 1..<sortedMonths.count where monthDiff(sortedMonths[index - 1], sortedMonths[index]) == 1 {
            pairs += 1
        }
        return pairs
    }

    private static func monthDiff(_ a: String, _ b: String) -> Int {
        let pa = a.split(separator: "-").compactMap { Int($0) }
        let pb = b.split(separator: "-").compactMap { Int($0) }
        guard pa.count >= 2, pb.count >= 2 else { return 0 }
        return (pb[0] - pa[0]) * 12 + (pb[1] - pa[1])
    }

    private static func dayDiff(_ a: String, _ b: String) -> Int {
        guard let da = utcDate(a), let db = utcDate(b) else { return 0 }
        return Int((db.timeIntervalSince(da) / 86_400).rounded())
    }

    static func shiftIsoDate(_ iso: String, days: Int) -> String {
        guard let date = utcDate(iso) else { return iso }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 0)!
        guard let shifted = cal.date(byAdding: .day, value: days, to: date) else { return iso }
        let comps = cal.dateComponents([.year, .month, .day], from: shifted)
        return String(format: "%04d-%02d-%02d", comps.year ?? 0, comps.month ?? 0, comps.day ?? 0)
    }

    private static func utcDate(_ iso: String) -> Date? {
        let parts = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var comps = DateComponents()
        comps.year = parts[0]; comps.month = parts[1]; comps.day = parts[2]
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 0)!
        return cal.date(from: comps)
    }

    private static func median(_ values: [Double]) -> Double {
        guard !values.isEmpty else { return 0 }
        let sorted = values.sorted()
        let middle = sorted.count / 2
        return sorted.count % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    }
}
