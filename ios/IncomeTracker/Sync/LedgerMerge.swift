// LedgerMerge.swift
// Three-way merge of whole ledgers, ported line for line from src/sync/merge.ts so
// web, iOS and Android resolve the same conflict the same way. Read that file for
// the rules; the shared fixtures in IncomeTrackerTests/Fixtures/data/merge-fixtures.json
// hold the two implementations together.
//
// Works on JSON trees so keys this build does not know merge like any other field.
// Foundation only.

import Foundation

public enum LedgerMerge {

    private typealias Rec = [String: JSONValue]
    private typealias Special = (JSONValue?, JSONValue?, JSONValue?) -> JSONValue?

    static let importBatchCap = 25
    private static let collectionKeys: Set<String> = ["months", "goals", "accounts", "categoryRules", "nameRules", "importBatches"]
    private static let monthField = "__month"
    private static let kindField = "__kind"

    private static let transactionGroups = [["date", monthField], ["amount", "scheduledPayment"]]
    private static let accountGroups = [
        ["balance", "balanceAsOf", "balanceSetOn", "ledgerOffset"],
        ["rate", "promoRate", "promoMonths", "promoAsOf"],
        ["accountClass", "type"],
    ]
    private static let goalGroups = [["fundingMode", "monthlyAmount"]]

    public static func merge(base: JSONValue?, local: JSONValue, remote: JSONValue, now: String = isoTimestampNow()) -> JSONValue {
        let baseRoot = base?.objectValue
        let localRoot = local.objectValue ?? [:]
        let remoteRoot = remote.objectValue ?? [:]

        let baseTx = flattenTransactions(baseRoot)
        let localTx = flattenTransactions(localRoot)
        let remoteTx = flattenTransactions(remoteRoot)

        // ── Transactions ──
        var mergedTx: [String: Rec] = [:]
        for id in unionIds(baseTx.order, localTx.order, remoteTx.order) {
            if let merged = mergeEntity(baseTx.byId[id], localTx.byId[id], remoteTx.byId[id], { b, l, r in
                mergeFields(b, l, r, groups: transactionGroups)
            }) {
                mergedTx[id] = merged
            }
        }

        let pairing = pairIndependentDuplicates(
            mergedTx, baseTx: baseTx.byId, localTx: localTx.byId, remoteTx: remoteTx.byId,
            localOrder: localTx.order, remoteOrder: remoteTx.order
        )
        for id in pairing.dropped { mergedTx.removeValue(forKey: id) }

        let months = buildMonths(baseRoot, localRoot, remoteRoot, mergedTx, localTx.groupOrder, remoteTx.groupOrder)

        // ── Other collections ──
        var goals = mergeCollection(baseRoot?["goals"], localRoot["goals"], remoteRoot["goals"]) { b, l, r in
            mergeFields(b, l, r, groups: goalGroups)
        }
        goals = stableSorted(goals) { (number($0["priority"]) ?? .nan) < (number($1["priority"]) ?? .nan) }

        let accounts = mergeCollection(baseRoot?["accounts"], localRoot["accounts"], remoteRoot["accounts"]) { b, l, r in
            mergeFields(b, l, r, groups: accountGroups, special: ["skippedPaymentMonths": mergeSet])
        }
        let categoryRules = mergeCollection(baseRoot?["categoryRules"], localRoot["categoryRules"], remoteRoot["categoryRules"]) { b, l, r in
            mergeFields(b, l, r)
        }
        let nameRules = mergeCollection(
            baseRoot?["nameRules"] ?? .array([]), localRoot["nameRules"] ?? .array([]), remoteRoot["nameRules"] ?? .array([])
        ) { b, l, r in
            mergeFields(b, l, r)
        }
        var importBatches = mergeCollection(baseRoot?["importBatches"], localRoot["importBatches"], remoteRoot["importBatches"]) { b, l, r in
            mergeFields(b, l, r, special: ["transactionRefs": mergeSet])
        }
        .map { remapBatchRefs($0, survivorOf: pairing.survivorOf, mergedTx: mergedTx) }
        importBatches = stableSorted(importBatches) { ($0["importedAt"]?.stringValue ?? "") > ($1["importedAt"]?.stringValue ?? "") }
        if importBatches.count > importBatchCap { importBatches = Array(importBatches.prefix(importBatchCap)) }

        // ── Root fields ──
        var root = mergeFields(rootFields(baseRoot), rootFields(localRoot) ?? [:], rootFields(remoteRoot) ?? [:], special: [
            // The month on screen is this device's business.
            "selectedMonth": { _, l, _ in l },
            "schemaVersion": { _, l, r in .number(max(number(l) ?? 0, number(r) ?? 0)) },
            "lastSavedAt": { _, _, _ in .string(now) },
        ])
        root["months"] = .object(months)
        root["goals"] = .array(goals.map(JSONValue.object))
        root["accounts"] = .array(accounts.map(JSONValue.object))
        root["categoryRules"] = .array(categoryRules.map(JSONValue.object))
        root["nameRules"] = .array(nameRules.map(JSONValue.object))
        root["importBatches"] = .array(importBatches.map(JSONValue.object))
        return .object(root)
    }

    // MARK: - Entity and field merging

    private static func mergeEntity(_ base: Rec?, _ local: Rec?, _ remote: Rec?, _ merge: (Rec?, Rec, Rec) -> Rec) -> Rec? {
        guard let base else {
            if let local, let remote { return merge(nil, local, remote) }
            return local ?? remote
        }
        switch (local, remote) {
        case (nil, nil):
            return nil
        case (nil, let remote?):
            return equal(.object(remote), .object(base)) ? nil : remote
        case (let local?, nil):
            return equal(.object(local), .object(base)) ? nil : local
        case (let local?, let remote?):
            return merge(base, local, remote)
        }
    }

    private static func mergeFields(
        _ base: Rec?, _ local: Rec, _ remote: Rec,
        groups: [[String]] = [], special: [String: Special] = [:]
    ) -> Rec {
        var groupOf: [String: [String]] = [:]
        for group in groups { for key in group { groupOf[key] = group } }

        var keys: [String] = []
        var seenKeys = Set<String>()
        for source in [base ?? [:], local, remote] {
            for key in source.keys.sorted() where !seenKeys.contains(key) {
                seenKeys.insert(key)
                keys.append(key)
            }
        }

        var out: Rec = [:]
        var done = Set<String>()
        for key in keys where !done.contains(key) {
            if let resolve = special[key] {
                done.insert(key)
                if let value = resolve(base?[key], local[key], remote[key]) { out[key] = value }
                continue
            }

            let group = groupOf[key] ?? [key]
            // A missing field and a null compare equal, as on the web.
            func pick(_ source: Rec?) -> JSONValue { .array(group.map { source?[$0] ?? .null }) }
            let baseValues = pick(base)
            let localValues = pick(local)
            let remoteValues = pick(remote)

            let from: Rec
            if equal(localValues, baseValues) { from = remote }
            else if equal(remoteValues, baseValues) { from = local }
            else { from = local }

            for member in group {
                done.insert(member)
                if let value = from[member] { out[member] = value }
            }
        }
        return out
    }

    /// Set-valued fields: union of both sides minus anything either side removed.
    private static func mergeSet(_ base: JSONValue?, _ local: JSONValue?, _ remote: JSONValue?) -> JSONValue? {
        if local == nil && remote == nil { return nil }
        let list = { (value: JSONValue?) in value?.arrayValue ?? [] }
        let baseKeys = Set(list(base).map(\.canonical))
        let localKeys = Set(list(local).map(\.canonical))
        let remoteKeys = Set(list(remote).map(\.canonical))
        let removed = baseKeys.filter { !localKeys.contains($0) || !remoteKeys.contains($0) }

        var seen = Set<String>()
        var result: [JSONValue] = []
        for item in list(local) + list(remote) {
            let key = item.canonical
            if removed.contains(key) || seen.contains(key) { continue }
            seen.insert(key)
            result.append(item)
        }
        return .array(result)
    }

    private static func mergeCollection(_ base: JSONValue?, _ local: JSONValue?, _ remote: JSONValue?, _ merge: (Rec?, Rec, Rec) -> Rec) -> [Rec] {
        func index(_ value: JSONValue?) -> (byId: [String: Rec], order: [String]) {
            var byId: [String: Rec] = [:]
            var order: [String] = []
            for item in value?.arrayValue ?? [] {
                guard let record = item.objectValue, let id = idString(record["id"]), !id.isEmpty, byId[id] == nil else { continue }
                byId[id] = record
                order.append(id)
            }
            return (byId, order)
        }
        let b = index(base)
        let l = index(local)
        let r = index(remote)

        var merged: [String: Rec] = [:]
        for id in unionIds(b.order, l.order, r.order) {
            if let result = mergeEntity(b.byId[id], l.byId[id], r.byId[id], merge) { merged[id] = result }
        }
        return mergeOrder(l.order, r.order, keep: Set(merged.keys)).map { merged[$0]! }
    }

    /// Local order of the survivors, with each remote-only item placed right after its
    /// nearest preceding survivor in remote order (or first).
    private static func mergeOrder(_ localIds: [String], _ remoteIds: [String], keep: Set<String>) -> [String] {
        var result: [String] = []
        var placed = Set<String>()
        for id in localIds where keep.contains(id) && !placed.contains(id) {
            result.append(id)
            placed.insert(id)
        }

        var anchor: String?
        for id in remoteIds where keep.contains(id) {
            if !placed.contains(id) {
                let at = anchor.flatMap { result.firstIndex(of: $0) }.map { $0 + 1 } ?? 0
                result.insert(id, at: at)
                placed.insert(id)
            }
            anchor = id
        }

        for id in keep.sorted() where !placed.contains(id) {
            result.append(id)
        }
        return result
    }

    private static func unionIds(_ orders: [String]...) -> [String] {
        var seen = Set<String>()
        var ids: [String] = []
        for order in orders {
            for id in order where !seen.contains(id) {
                seen.insert(id)
                ids.append(id)
            }
        }
        return ids
    }

    // MARK: - Transactions

    private struct FlatTransactions {
        var byId: [String: Rec] = [:]
        var order: [String] = []
        var groupOrder: [String: [String]] = [:]
    }

    private static func groupKey(_ monthKey: String, _ kind: String) -> String {
        "\(monthKey)\u{0}\(kind)"
    }

    private static func flattenTransactions(_ root: Rec?) -> FlatTransactions {
        var flat = FlatTransactions()
        guard let months = root?["months"]?.objectValue else { return flat }

        for monthKey in months.keys.sorted() {
            let month = months[monthKey]?.objectValue
            for (kind, listKey) in [("income", "incomes"), ("expense", "expenses")] {
                let key = groupKey(monthKey, kind)
                var ids: [String] = []
                for item in month?[listKey]?.arrayValue ?? [] {
                    guard var entry = item.objectValue, let id = idString(entry["id"]), !id.isEmpty, flat.byId[id] == nil else { continue }
                    entry[monthField] = .string(monthKey)
                    entry[kindField] = .string(kind)
                    flat.byId[id] = entry
                    flat.order.append(id)
                    ids.append(id)
                }
                flat.groupOrder[key] = ids
            }
        }
        return flat
    }

    private static func buildMonths(
        _ base: Rec?, _ local: Rec, _ remote: Rec,
        _ mergedTx: [String: Rec],
        _ localGroupOrder: [String: [String]], _ remoteGroupOrder: [String: [String]]
    ) -> [String: JSONValue] {
        let baseMonths = base?["months"]?.objectValue
        let localMonths = local["months"]?.objectValue ?? [:]
        let remoteMonths = remote["months"]?.objectValue ?? [:]

        var idsByGroup: [String: Set<String>] = [:]
        var monthKeys = Set(localMonths.keys).union(remoteMonths.keys)
        for (id, entry) in mergedTx {
            let monthKey = entry[monthField]?.stringValue ?? ""
            monthKeys.insert(monthKey)
            idsByGroup[groupKey(monthKey, entry[kindField]?.stringValue ?? ""), default: []].insert(id)
        }

        func stripArrays(_ month: JSONValue?) -> Rec? {
            guard var record = month?.objectValue else { return nil }
            record.removeValue(forKey: "incomes")
            record.removeValue(forKey: "expenses")
            return record
        }

        var months: [String: JSONValue] = [:]
        for monthKey in monthKeys.sorted() {
            let baseMonth = stripArrays(baseMonths?[monthKey])
            // A side without the month has not touched it: stand in the base so the other side wins.
            let localMonth = stripArrays(localMonths[monthKey]) ?? baseMonth ?? [:]
            let remoteMonth = stripArrays(remoteMonths[monthKey]) ?? baseMonth ?? [:]
            var fields = mergeFields(baseMonth, localMonth, remoteMonth)

            func entries(_ kind: String) -> JSONValue {
                let key = groupKey(monthKey, kind)
                let ids = mergeOrder(localGroupOrder[key] ?? [], remoteGroupOrder[key] ?? [], keep: idsByGroup[key] ?? [])
                return .array(ids.map { id in
                    var entry = mergedTx[id]!
                    entry.removeValue(forKey: monthField)
                    entry.removeValue(forKey: kindField)
                    return .object(entry)
                })
            }

            if fields["note"]?.stringValue == nil { fields["note"] = .string("") }
            fields["incomes"] = entries("income")
            fields["expenses"] = entries("expense")
            months[monthKey] = .object(fields)
        }
        return months
    }

    /// See pairIndependentDuplicates in src/sync/merge.ts: entries both devices created
    /// on their own (seeded recurring copies, scheduled debt payments, the same statement
    /// imported twice) pair one-to-one between this device's and the other's additions,
    /// and the remote copy is kept.
    private static func pairIndependentDuplicates(
        _ merged: [String: Rec],
        baseTx: [String: Rec], localTx: [String: Rec], remoteTx: [String: Rec],
        localOrder: [String], remoteOrder: [String]
    ) -> (dropped: Set<String>, survivorOf: [String: String]) {
        var dropped = Set<String>()
        var survivorOf: [String: String] = [:]

        let localAdded = localOrder.filter { merged[$0] != nil && baseTx[$0] == nil && remoteTx[$0] == nil }
        let remoteAdded = remoteOrder.filter { merged[$0] != nil && baseTx[$0] == nil && localTx[$0] == nil }
        if localAdded.isEmpty || remoteAdded.isEmpty { return (dropped, survivorOf) }

        let signatures: [(Rec) -> String?] = [
            { entry in
                guard let seeded = entry["seededFrom"]?.objectValue,
                      let month = seeded["monthKey"]?.stringValue, !month.isEmpty,
                      let id = seeded["entryId"]?.stringValue, !id.isEmpty else { return nil }
                return "seeded:\(month):\(id)"
            },
            { entry in
                guard truthy(entry["scheduledPayment"]), let debt = entry["debtAccountId"]?.stringValue else { return nil }
                return "scheduled:\(debt)"
            },
            { entry in
                guard let hash = entry["imported"]?["hash"]?.stringValue, !hash.isEmpty else { return nil }
                return "imported:\(hash)"
            },
        ]

        for signature in signatures {
            var remoteBuckets: [String: [String]] = [:]
            for id in remoteAdded where !dropped.contains(id) {
                let entry = merged[id]!
                guard let sig = signature(entry) else { continue }
                remoteBuckets[bucketKey(entry, sig), default: []].append(id)
            }
            for id in localAdded where !dropped.contains(id) {
                let entry = merged[id]!
                guard let sig = signature(entry) else { continue }
                let key = bucketKey(entry, sig)
                guard var bucket = remoteBuckets[key], !bucket.isEmpty else { continue }
                let partner = bucket.removeFirst()
                remoteBuckets[key] = bucket
                dropped.insert(id)
                survivorOf[id] = partner
            }
        }
        return (dropped, survivorOf)
    }

    private static func bucketKey(_ entry: Rec, _ signature: String) -> String {
        "\(entry[monthField]?.stringValue ?? "")|\(entry[kindField]?.stringValue ?? "")|\(signature)"
    }

    private static func remapBatchRefs(_ batch: Rec, survivorOf: [String: String], mergedTx: [String: Rec]) -> Rec {
        guard let refs = batch["transactionRefs"]?.arrayValue, !survivorOf.isEmpty else { return batch }
        var seen = Set<String>()
        var out: [JSONValue] = []
        for ref in refs {
            var next = ref
            if var record = ref.objectValue,
               let entryId = idString(record["entryId"]),
               let survivor = survivorOf[entryId],
               let entry = mergedTx[survivor] {
                record["entryId"] = .string(survivor)
                record["monthKey"] = entry[monthField]
                record["kind"] = entry[kindField]
                next = .object(record)
            }
            let key = next.canonical
            if seen.contains(key) { continue }
            seen.insert(key)
            out.append(next)
        }
        var updated = batch
        updated["transactionRefs"] = .array(out)
        return updated
    }

    private static func rootFields(_ root: Rec?) -> Rec? {
        root?.filter { !collectionKeys.contains($0.key) }
    }

    // MARK: - Helpers

    private static func equal(_ a: JSONValue, _ b: JSONValue) -> Bool {
        a == b || a.canonical == b.canonical
    }

    private static func idString(_ value: JSONValue?) -> String? {
        switch value {
        case .string(let text): return text
        case .number(let number): return JSONValue.number(number).canonical
        default: return nil
        }
    }

    private static func number(_ value: JSONValue?) -> Double? {
        switch value {
        case .number(let number): return number
        case .string(let text): return Double(text)
        default: return nil
        }
    }

    private static func truthy(_ value: JSONValue?) -> Bool {
        switch value {
        case .bool(let flag): return flag
        case .number(let number): return number != 0
        case .string(let text): return !text.isEmpty
        case .array, .object: return true
        case .null, .none: return false
        }
    }

    private static func stableSorted(_ items: [Rec], by areInIncreasingOrder: (Rec, Rec) -> Bool) -> [Rec] {
        items.enumerated()
            .sorted { lhs, rhs in
                if areInIncreasingOrder(lhs.element, rhs.element) { return true }
                if areInIncreasingOrder(rhs.element, lhs.element) { return false }
                return lhs.offset < rhs.offset
            }
            .map(\.element)
    }
}
