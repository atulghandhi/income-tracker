// QuickAdd.swift
// Ported from src/quickAdd.ts — Swift 6, Foundation only.
//
// One-line entry: "costa 4.35", "salary 2400 recurring", "tesco 42.61 yesterday",
// "rent 950 on 1st", "+refund 20". Deterministic and local — worst case a row lands
// as an Unsorted expense, one tap from correct, and the correction becomes a rule.

import Foundation

public struct QuickAddDraft: Sendable, Equatable {
    /// `.income` or `.expense`.
    public var kind: TransactionKind
    public var description: String
    public var amount: Double
    /// ISO yyyy-MM-dd; nil when the user gave no date hint.
    public var date: String?
    public var recurring: Bool
    public var category: String
    public var color: String?
    public var categorySource: String
    public var note: String
}

public enum QuickAddResult: Sendable, Equatable {
    case ok(QuickAddDraft)
    case error(String)

    public var draft: QuickAddDraft? {
        if case .ok(let draft) = self { return draft }
        return nil
    }
}

private let recurringWords: Set<String> = ["recurring", "monthly", "repeat", "repeats"]
private let weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
private let quickAmountPattern = #"^[-+]?[£$€]?\d[\d,]*(?:\.\d{1,2})?$"#

public func parseQuickAdd(
    _ input: String,
    state: LedgerState,
    memory: MerchantMemory,
    monthKey: String,
    today: Date = Date()
) -> QuickAddResult {
    let rawTokens = input.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    guard !rawTokens.isEmpty else { return .error("Type a description and an amount") }

    var amount: Double?
    var forcedIncome = false
    var recurringHint: Bool?
    var date: String?
    var descriptionTokens: [String] = []

    for (index, token) in rawTokens.enumerated() {
        let lower = token.lowercased()

        if amount == nil, token.range(of: quickAmountPattern, options: .regularExpression) != nil {
            let numeric = Double(token.replacingOccurrences(of: "[£$€,+]", with: "", options: .regularExpression))
            if let numeric, numeric.isFinite, abs(numeric) > 0 {
                amount = abs(numeric)
                if token.hasPrefix("+") { forcedIncome = true }
                continue
            }
        }

        if recurringWords.contains(lower) {
            recurringHint = true
            continue
        }
        if lower == "once" || lower == "one-off" || lower == "oneoff" {
            recurringHint = false
            continue
        }
        if lower == "on", index + 1 < rawTokens.count { continue } // "on 1st" — the day token handles itself

        if date == nil, let parsedDate = parseQuickDateHint(lower, monthKey: monthKey, today: today) {
            date = parsedDate
            continue
        }

        descriptionTokens.append(token)
    }

    guard let amount else { return .error("Add an amount, e.g. “costa 4.35”") }
    let description = descriptionTokens.joined(separator: " ").trimmingCharacters(in: .whitespaces)
    guard !description.isEmpty else { return .error("Add a description, e.g. “costa 4.35”") }

    // Memory first (the user's own history), then the shared rule pipeline.
    let memoryHit = memory.find(.expense, text: description) ?? memory.find(.income, text: description)
    let suggestion = suggestEntryCategory(description: description, amount: forcedIncome ? amount : -amount, rules: state.categoryRules)
    let kind: TransactionKind
    if forcedIncome {
        kind = .income
    } else if let memoryHit {
        kind = memoryHit.kind
    } else {
        kind = suggestion.kind == .income ? .income : .expense
    }

    var category: String
    if kind == .income {
        category = ""
    } else if let memoryHit, memoryHit.kind == .expense, !memoryHit.category.isEmpty {
        category = memoryHit.category
    } else if suggestion.kind == .expense || suggestion.kind == .debtPayment {
        category = suggestion.category
    } else {
        category = "Unsorted"
    }
    if category == "Unsorted", let memoryHit, !memoryHit.category.isEmpty {
        category = memoryHit.category
    }

    let note: String
    if let memoryHit, memoryHit.count > 1 {
        note = "Seen \(memoryHit.count)× before"
    } else {
        note = suggestion.note
    }

    return .ok(QuickAddDraft(
        kind: kind,
        description: memoryHit?.label ?? description,
        amount: amount,
        date: date,
        recurring: recurringHint ?? memoryHit?.recurring ?? false,
        category: category,
        color: memoryHit?.color,
        categorySource: (memoryHit?.category.isEmpty == false) ? "rule" : suggestion.source,
        note: note
    ))
}

private func parseQuickDateHint(_ lower: String, monthKey: String, today: Date) -> String? {
    let cal = Calendar.current
    if lower == "today" { return isoDateString(today) }
    if lower == "yesterday" {
        return cal.date(byAdding: .day, value: -1, to: today).map(isoDateString)
    }

    if let weekdayIndex = weekdays.firstIndex(where: { $0 == lower || $0.prefix(3) == lower }) {
        // Most recent occurrence of that weekday (today counts). Calendar weekday is 1-based, Sunday = 1.
        let todayIndex = cal.component(.weekday, from: today) - 1
        let diff = (todayIndex - weekdayIndex + 7) % 7
        return cal.date(byAdding: .day, value: -diff, to: today).map(isoDateString)
    }

    if let groups = lower.firstMatchGroups(of: #"^(\d{1,2})(?:st|nd|rd|th)$"#), let day = Int(groups[1]), (1...31).contains(day) {
        let parts = monthKey.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        let clamped = min(day, daysInMonth(year: parts[0], month: parts[1]))
        return String(format: "%@-%02d", monthKey, clamped)
    }

    if let groups = lower.firstMatchGroups(of: #"^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$"#) {
        let day = Int(groups[1]) ?? 0
        let month = Int(groups[2]) ?? 0
        var year = Int(groups[3]) ?? (Int(monthKey.prefix(4)) ?? cal.component(.year, from: today))
        if year < 100 { year += 2000 }
        guard (1...31).contains(day), (1...12).contains(month) else { return nil }
        return String(format: "%04d-%02d-%02d", year, month, day)
    }

    return nil
}

func daysInMonth(year: Int, month: Int) -> Int {
    var comps = DateComponents()
    comps.year = year; comps.month = month; comps.day = 1
    let cal = Calendar(identifier: .gregorian)
    guard let date = cal.date(from: comps), let range = cal.range(of: .day, in: .month, for: date) else { return 31 }
    return range.count
}

public func isoDateString(_ date: Date) -> String {
    let cal = Calendar.current
    let comps = cal.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", comps.year ?? 0, comps.month ?? 0, comps.day ?? 0)
}
