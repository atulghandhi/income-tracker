// MerchantMemory.swift
// Ported from src/merchantMemory.ts — Swift 6, Foundation only.
//
// Everything the app remembers about a merchant the user has logged before —
// enough to turn a repeat entry into "confirm amount → save". Built lazily from
// the ledger itself; no external data.

import Foundation

public struct MerchantSuggestion: Sendable, Hashable, Identifiable {
    public var id: String { "\(kind.rawValue):\(key)" }
    public let key: String
    public let label: String
    /// `.income` or `.expense`.
    public let kind: TransactionKind
    public let category: String
    public let color: String
    public let recurring: Bool
    public let count: Int
    /// monthKey or ISO date, used only for recency ranking.
    public let lastDate: String
    /// Recent distinct amounts, newest first.
    public let recentAmounts: [Double]
    /// Set when the last few occurrences agree (Netflix), so a form can prefill it outright.
    public let stableAmount: Double?
}

public struct MerchantMemory: Sendable {
    private let incomes: [MerchantSuggestion]
    private let expenses: [MerchantSuggestion]

    public static let empty = MerchantMemory(incomes: [], expenses: [])

    private init(incomes: [MerchantSuggestion], expenses: [MerchantSuggestion]) {
        self.incomes = incomes
        self.expenses = expenses
    }

    public init(state: LedgerState) {
        var groups: [String: Accumulator] = [:]
        var order: [String] = []

        for monthKey in state.months.keys.sorted() {
            guard let month = state.months[monthKey] else { continue }
            for income in month.incomes {
                Self.accumulate(&groups, &order, kind: .income, label: income.source, amount: income.amount,
                                category: "", color: income.color, recurring: income.recurring,
                                date: income.date ?? monthKey)
            }
            for expense in month.expenses {
                Self.accumulate(&groups, &order, kind: .expense, label: expense.name, amount: expense.amount,
                                category: expense.category, color: expense.color, recurring: expense.recurring,
                                date: expense.date ?? monthKey)
            }
        }

        let suggestions = order.compactMap { groups[$0] }
            .map(Self.toSuggestion)
            .sorted { a, b in
                if a.count != b.count { return a.count > b.count }
                return a.lastDate > b.lastDate
            }
        incomes = suggestions.filter { $0.kind == .income }
        expenses = suggestions.filter { $0.kind == .expense }
    }

    public func all(_ kind: TransactionKind) -> [MerchantSuggestion] {
        kind == .income ? incomes : expenses
    }

    /// Prefix/substring search over remembered merchants, most-used first.
    public func suggest(_ kind: TransactionKind, text: String, limit: Int = 6) -> [MerchantSuggestion] {
        let needle = text.trimmingCharacters(in: .whitespaces).lowercased()
        let pool = all(kind)
        if needle.isEmpty { return Array(pool.prefix(limit)) }
        return Array(pool.filter { $0.label.lowercased().contains(needle) || $0.key.contains(needle) }.prefix(limit))
    }

    /// Exact match by label or canonical key.
    public func find(_ kind: TransactionKind, text: String) -> MerchantSuggestion? {
        let needle = text.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return nil }
        let pool = all(kind)
        if let exact = pool.first(where: { $0.label.lowercased() == needle }) { return exact }
        let canonical = canonicalizeMerchant(needle)
        guard !canonical.isEmpty else { return nil }
        return pool.first { $0.key == canonical }
    }

    // MARK: - Accumulation

    fileprivate struct Accumulator {
        var key: String
        var label: String
        var kind: TransactionKind
        var categoryCounts: [String: Int]
        var color: String
        var recurring: Bool
        var count: Int
        var lastDate: String
        var amounts: [Double]
    }

    private static func accumulate(
        _ groups: inout [String: Accumulator],
        _ order: inout [String],
        kind: TransactionKind,
        label: String,
        amount: Double,
        category: String,
        color: String,
        recurring: Bool,
        date: String
    ) {
        let trimmed = label.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        let canonical = canonicalizeMerchant(trimmed)
        let key = canonical.isEmpty ? trimmed.lowercased() : canonical
        let groupKey = "\(kind.rawValue):\(key)"

        if var existing = groups[groupKey] {
            existing.count += 1
            existing.recurring = existing.recurring || recurring
            if !category.isEmpty { existing.categoryCounts[category, default: 0] += 1 }
            if date >= existing.lastDate {
                // Months iterate oldest → newest, so the last write wins recency: keep the
                // newest casing and colour the user actually saw.
                existing.lastDate = date
                existing.label = trimmed
                existing.color = color
            }
            existing.amounts.append(amount)
            groups[groupKey] = existing
        } else {
            groups[groupKey] = Accumulator(
                key: key, label: trimmed, kind: kind,
                categoryCounts: category.isEmpty ? [:] : [category: 1],
                color: color, recurring: recurring, count: 1, lastDate: date, amounts: [amount]
            )
            order.append(groupKey)
        }
    }

    private static func toSuggestion(_ group: Accumulator) -> MerchantSuggestion {
        let recent = Array(group.amounts.reversed().prefix(3))
        let stable = recent.count >= 2 && recent.allSatisfy { $0 == recent[0] }
        let dominantCategory = group.categoryCounts
            .sorted { a, b in a.value != b.value ? a.value > b.value : a.key < b.key }
            .first?.key ?? ""
        var distinct: [Double] = []
        for amount in recent where !distinct.contains(amount) { distinct.append(amount) }
        return MerchantSuggestion(
            key: group.key,
            label: group.label,
            kind: group.kind,
            category: dominantCategory,
            color: group.color,
            recurring: group.recurring,
            count: group.count,
            lastDate: group.lastDate,
            recentAmounts: distinct,
            stableAmount: stable ? recent[0] : (group.count == 1 ? group.amounts.first : nil)
        )
    }
}
