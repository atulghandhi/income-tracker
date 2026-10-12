// UnknownFields.swift
// The typed model (Types.swift) only knows the keys in its CodingKeys. When a newer
// web or Android build adds a field, decoding drops it, and pushing the re-encoded
// ledger would erase it for every device. Before each push, keys the typed model does
// not know are copied back from the last server copy, matching entities by id.
// Foundation only.

import Foundation

public enum UnknownFields {

    private enum Kind {
        case root, month, income, expense, goal, account, categoryRule, nameRule, importBatch, imported, seededFrom
    }

    /// Keys each Swift type encodes (its CodingKeys). Anything else is foreign.
    private static let known: [Kind: Set<String>] = [
        .root: ["schemaVersion", "currency", "selectedMonth", "months", "goals", "goalPlannerSurplus",
                "goalsHorizonMonths", "ledgerGoalId", "savingsTarget", "accounts", "defaultAccountId",
                "assumedInvestmentReturn", "categoryRules", "nameRules", "importBatches", "privacyMode",
                "aiCategorizationEnabled", "lastSavedAt"],
        .month: ["incomes", "expenses", "note"],
        .income: ["id", "source", "amount", "color", "recurring", "date", "imported", "accountId", "seededFrom", "categorySource"],
        .expense: ["id", "name", "category", "amount", "color", "recurring", "date", "imported", "accountId",
                   "debtAccountId", "scheduledPayment", "toAccountId", "seededFrom", "categorySource"],
        .goal: ["id", "name", "target", "saved", "color", "priority", "fundingMode", "monthlyAmount",
                "deadlineMonths", "interestRate", "accountId", "note", "createdAt"],
        .account: ["id", "name", "accountClass", "type", "balance", "rate", "promoRate", "promoMonths",
                   "monthlyContribution", "creditLimit", "minimumPayment", "dueDay", "balanceAsOf", "promoAsOf",
                   "skippedPaymentMonths", "balanceSetOn", "ledgerOffset", "includeInNetWorth", "color", "note"],
        .categoryRule: ["id", "pattern", "category", "kind", "debtAccountId", "createdAt", "updatedAt"],
        .nameRule: ["id", "kind", "from", "to", "createdAt", "updatedAt"],
        .importBatch: ["id", "fileName", "importedAt", "totalRows", "importedRows", "skippedRows", "transactionRefs"],
        .imported: ["batchId", "fileName", "rowNumber", "hash", "originalDescription", "importedAt"],
        .seededFrom: ["monthKey", "entryId"],
    ]

    /// Keys older schemas used that decoding migrates away; never carried forward.
    private static let legacy: [Kind: Set<String>] = [
        .root: ["goal", "debts"],
        .account: ["apr", "interestFreeMonths"],
    ]

    /// `typed` (this client's encoding) plus every key from `raw` (the server copy)
    /// that the typed model does not know, at every level.
    public static func carry(from raw: JSONValue?, into typed: JSONValue) -> JSONValue {
        guard let raw else { return typed }
        return overlay(raw, typed, .root)
    }

    private static func overlay(_ raw: JSONValue, _ typed: JSONValue, _ kind: Kind) -> JSONValue {
        guard let rawFields = raw.objectValue, var fields = typed.objectValue else { return typed }
        let knownKeys = known[kind] ?? []
        let legacyKeys = legacy[kind] ?? []

        for (key, value) in rawFields where !knownKeys.contains(key) && !legacyKeys.contains(key) && fields[key] == nil {
            fields[key] = value
        }

        for (key, value) in fields {
            guard let rawValue = rawFields[key] else { continue }
            switch (kind, key) {
            case (.root, "months"):
                fields[key] = overlayMap(rawValue, value, .month)
            case (.root, "goals"):
                fields[key] = overlayList(rawValue, value, .goal)
            case (.root, "accounts"):
                fields[key] = overlayList(rawValue, value, .account)
            case (.root, "categoryRules"):
                fields[key] = overlayList(rawValue, value, .categoryRule)
            case (.root, "nameRules"):
                fields[key] = overlayList(rawValue, value, .nameRule)
            case (.root, "importBatches"):
                fields[key] = overlayList(rawValue, value, .importBatch)
            case (.month, "incomes"):
                fields[key] = overlayList(rawValue, value, .income)
            case (.month, "expenses"):
                fields[key] = overlayList(rawValue, value, .expense)
            case (.income, "imported"), (.expense, "imported"):
                fields[key] = overlay(rawValue, value, .imported)
            case (.income, "seededFrom"), (.expense, "seededFrom"):
                fields[key] = overlay(rawValue, value, .seededFrom)
            default:
                break
            }
        }
        return .object(fields)
    }

    /// Objects keyed by name (months by "yyyy-MM").
    private static func overlayMap(_ raw: JSONValue, _ typed: JSONValue, _ kind: Kind) -> JSONValue {
        guard let rawMap = raw.objectValue, var map = typed.objectValue else { return typed }
        for (key, value) in map {
            if let rawValue = rawMap[key] { map[key] = overlay(rawValue, value, kind) }
        }
        return .object(map)
    }

    /// Arrays of entities matched by "id".
    private static func overlayList(_ raw: JSONValue, _ typed: JSONValue, _ kind: Kind) -> JSONValue {
        guard let rawItems = raw.arrayValue, let items = typed.arrayValue else { return typed }
        var rawById: [String: JSONValue] = [:]
        for item in rawItems {
            if let id = item["id"]?.stringValue { rawById[id] = item }
        }
        return .array(items.map { item in
            guard let id = item["id"]?.stringValue, let rawItem = rawById[id] else { return item }
            return overlay(rawItem, item, kind)
        })
    }
}
