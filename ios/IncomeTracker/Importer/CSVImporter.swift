// CSVImporter.swift
// Ported from src/importer.ts — Swift 6, Foundation only.
//
// All domain types are defined in Types.swift / Constants.swift.
// This file holds CSV parsing, column detection, amount/date parsing, category
// suggestion, merchant canonicalisation, duplicate hashing and the import
// commit. OFX, QIF and pasted-text parsing live in TextImporters.swift and
// share the helpers here.

import Foundation

// MARK: - Public result type

public struct CsvImportRow: Codable, Sendable, Identifiable {
    public var id: String
    public var rowNumber: Int
    public var date: String          // ISO-8601 "YYYY-MM-DD"
    public var monthKey: String      // "YYYY-MM"
    public var description: String
    public var amount: Double
    public var rawAmount: String
    public var kind: TransactionKind
    public var suggestedKind: TransactionKind
    public var category: String
    public var suggestedCategory: String
    public var color: String
    public var include: Bool
    public var duplicate: Bool
    /// Label of the existing ledger entry this row appears to duplicate
    /// (same day + same amount, typically a manually added transaction).
    public var duplicateOf: String?
    public var confidence: Double
    public var note: String
    public var hash: String
    /// For debt-payment rows: which debt account this payment reduces. Optional — unlinked
    /// debt payments still import as expenses, they just don't feed the balance roll-forward.
    public var debtAccountId: String?
    /// Which layer decided the category: "rule", "system", "bank", "heuristic" or "user"
    /// once the reviewer edits the row. Mirrors CategorySource in src/types.ts.
    public var categorySource: String? = nil
}

public struct CsvImportResult: Codable, Sendable {
    public var rows: [CsvImportRow]
    public var errors: [String]
    public var detectedColumns: DetectedColumns
    public var totalRows: Int

    public struct DetectedColumns: Codable, Sendable {
        public var date: String?
        public var description: String?
        public var amount: String?
        public var debit: String?
        public var credit: String?
        public var category: String?

        public init(date: String? = nil, description: String? = nil, amount: String? = nil,
                    debit: String? = nil, credit: String? = nil, category: String? = nil) {
            self.date = date; self.description = description; self.amount = amount
            self.debit = debit; self.credit = credit; self.category = category
        }
    }

    public init(rows: [CsvImportRow], errors: [String], detectedColumns: DetectedColumns, totalRows: Int) {
        self.rows = rows
        self.errors = errors
        self.detectedColumns = detectedColumns
        self.totalRows = totalRows
    }
}

// MARK: - Column header constants (mirrors importer.ts)

private let dateHeaders        = ["date", "transaction date", "posted date", "booking date", "completed date", "value date"]
private let descriptionHeaders = ["description", "details", "narrative", "merchant", "name", "transaction", "reference", "payee", "memo"]
private let amountHeaders      = ["amount", "value", "transaction amount", "net amount", "money in/out", "in/out", "paid in/out"]
private let debitHeaders       = ["debit", "withdrawal", "withdrawals", "paid out", "money out", "out", "debits"]
private let creditHeaders      = ["credit", "deposit", "deposits", "paid in", "money in", "in", "credits"]
private let categoryHeaders    = ["category", "type", "classification"]

// MARK: - System rules (mirrors SYSTEM_RULES in importer.ts)

private struct SystemRule: Sendable {
    let pattern: NSRegularExpression
    let category: String
    let kind: TransactionKind?
    let confidence: Double
    let note: String
}

private let systemRules: [SystemRule] = {
    func rule(_ pat: String, _ cat: String, _ kind: TransactionKind? = nil,
              _ conf: Double, _ note: String) -> SystemRule {
        // All patterns are known-good literals — force-try is safe here.
        // swiftlint:disable:next force_try
        return SystemRule(pattern: try! NSRegularExpression(pattern: pat, options: .caseInsensitive),
                          category: cat, kind: kind, confidence: conf, note: note)
    }
    return [
        rule(#"\b(salary|payroll|wages?|employer|pay\s?slip)\b"#,            "Income",        .income,      0.92, "Matched income wording"),
        rule(#"\b(rent|mortgage|letting|landlord)\b"#,                        "Home",          nil,          0.88, "Matched housing wording"),
        rule(#"\b(council tax|electric|electricity|gas|water|broadband|internet|mobile|phone|utility)\b"#, "Bills", nil, 0.86, "Matched bill wording"),
        rule(#"\b(tesco|sainsbury|asda|aldi|lidl|waitrose|morrisons|coop|co-op|grocery|supermarket)\b"#,  "Food",  nil, 0.88, "Matched grocery merchant"),
        rule(#"\b(restaurant|cafe|coffee|deliveroo|ubereats|just eat|pret|starbucks|costa)\b"#,           "Food",  nil, 0.82, "Matched food merchant"),
        rule(#"\b(tfl|uber|bolt|train|rail|petrol|fuel|parking|bus|tube|transport)\b"#,                   "Travel",nil, 0.85, "Matched travel wording"),
        rule(#"\b(netflix|spotify|prime|apple\.com|google|microsoft|disney|subscription)\b"#,             "Subscriptions", nil, 0.86, "Matched subscription merchant"),
        rule(#"\b(pharmacy|chemist|dentist|doctor|hospital|optician|health)\b"#,                          "Health",nil, 0.82, "Matched health wording"),
        rule(#"\b(hmrc|tax|national insurance)\b"#,                           "Tax",           nil,          0.84, "Matched tax wording"),
        rule(#"\b(amex|barclaycard|capital one|credit card|mastercard|visa payment|card payment)\b"#,     "Debt payments", .debtPayment, 0.86, "Matched debt payment wording"),
        rule(#"\b(transfer|internal|savings?|standing order to self)\b"#,     "Transfers",     .transfer,    0.78, "Matched transfer wording"),
    ]
}()

// MARK: - Column map (internal)

private struct ColumnMap {
    var date: Int         // -1 = not found
    var description: Int  // -1 = not found
    var amount: Int?
    var debit: Int?
    var credit: Int?
    var category: Int?
}

// MARK: - Public API

/// Parse a raw CSV string from a bank export, detect columns, apply category rules, and
/// flag duplicates against the existing ledger.  Mirrors `parseBankCsv` in importer.ts.
/// `flipSigns` inverts every amount — used for credit-card statements that list
/// purchases as positive numbers (see `detectLikelySignInversion`).
public func parseBankCsv(
    text: String,
    fileName: String,
    state: LedgerState,
    fallbackMonthKey: String? = nil,
    flipSigns: Bool = false
) -> CsvImportResult {
    let table = parseCsvTable(text)
    let nonEmptyRows = table.filter { row in
        row.contains { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    }
    let fallbackMonth = fallbackMonthKey ?? state.selectedMonth

    guard nonEmptyRows.count >= 2 else {
        return CsvImportResult(
            rows: [],
            errors: ["The CSV needs a header row and at least one transaction row."],
            detectedColumns: .init(),
            totalRows: 0
        )
    }

    let headerRow = nonEmptyRows[0]
    let normalizedHeaders = headerRow.map(normalizeHeader)
    let columns = detectColumns(normalizedHeaders)
    let validationErrors = validateColumns(columns)
    let existingHashes = collectExistingTransactionHashes(state)
    let existingByDateAmount = collectManualEntriesByDateAmount(state)

    if !validationErrors.isEmpty {
        return CsvImportResult(
            rows: [],
            errors: validationErrors,
            detectedColumns: buildDetectedColumns(headers: headerRow, columns: columns),
            totalRows: max(0, nonEmptyRows.count - 1)
        )
    }

    var rows: [CsvImportRow] = []

    for (index, cells) in nonEmptyRows.dropFirst().enumerated() {
        let rowNumber = index + 2
        let desc = getCell(cells, columns.description).trimmingCharacters(in: .whitespaces)
        guard let rawAmount = readAmount(cells: cells, columns: columns), !desc.isEmpty else {
            continue
        }
        let parsedAmount = flipSigns ? -rawAmount : rawAmount
        let isoDate = parseDateValue(getCell(cells, columns.date), fallbackMonth: fallbackMonth) ?? monthStartDate(fallbackMonth)
        let bankCategory = columns.category == nil
            ? ""
            : getCell(cells, columns.category).trimmingCharacters(in: .whitespaces)

        var row = buildImportRow(
            rowNumber: rowNumber,
            date: isoDate,
            description: desc,
            amount: parsedAmount,
            bankCategory: bankCategory,
            state: state,
            existingHashes: existingHashes
        )

        // Fuzzy check: an existing entry (typically added by hand) with the
        // same amount on the same day is very likely the same transaction,
        // even when the typed name doesn't match the bank's description.
        if !row.duplicate,
           let sameDayMatch = existingByDateAmount[dateAmountKey(date: isoDate, amount: parsedAmount)] {
            row.duplicate = true
            row.duplicateOf = sameDayMatch
            row.include = false
            row.note = "Same amount on the same day as “\(sameDayMatch)”"
        }
        rows.append(row)
    }

    let sorted = sortImportRows(rows)
    return CsvImportResult(
        rows: sorted,
        errors: sorted.isEmpty ? ["No importable transactions were found in this CSV."] : [],
        detectedColumns: buildDetectedColumns(headers: headerRow, columns: columns),
        totalRows: max(0, nonEmptyRows.count - 1)
    )
}

/// Single point every capture path funnels through — CSV rows, pasted lines, OFX/QIF
/// records and staged bank-feed transactions all become the same reviewable row.
/// Mirrors `buildImportRow` in importer.ts. `externalId` (an OFX FITID or a feed
/// transaction id) becomes the dedupe key when present.
public func buildImportRow(
    rowNumber: Int,
    date: String,
    description: String,
    amount: Double,
    bankCategory: String,
    state: LedgerState,
    existingHashes: Set<String>,
    externalId: String? = nil,
    noteOverride: String? = nil
) -> CsvImportRow {
    let suggestion = suggestCategory(description: description, amount: amount,
                                     rules: state.categoryRules, bankCategory: bankCategory)
    let fallbackHash = createTransactionHash(date: date, description: description, amount: amount)
    let hash: String
    if let externalId {
        let cleaned = externalId.replacingOccurrences(of: "[^a-zA-Z0-9_-]", with: "", options: .regularExpression)
        hash = "ext-\(cleaned)"
    } else {
        hash = fallbackHash
    }
    let duplicate = existingHashes.contains(hash) || existingHashes.contains(fallbackHash)
    let kind = suggestion.kind

    return CsvImportRow(
        id: "draft-\(rowNumber)-\(hash)",
        rowNumber: rowNumber,
        date: date,
        monthKey: String(date.prefix(7)),
        description: description,
        amount: amount,
        rawAmount: String(format: "%.2f", amount),
        kind: kind,
        suggestedKind: kind,
        category: suggestion.category,
        suggestedCategory: suggestion.category,
        color: csvCategoryColor(suggestion.category),
        include: !duplicate && kind != .transfer,
        duplicate: duplicate,
        duplicateOf: nil,
        confidence: suggestion.confidence,
        note: duplicate ? "Possible duplicate" : (noteOverride ?? suggestion.note),
        hash: hash,
        debtAccountId: suggestion.debtAccountId,
        categorySource: suggestion.source
    )
}

/// Clean/normalize a payee string to a reusable pattern.
/// Mirrors `buildRulePattern` in importer.ts.
public func buildRulePattern(from description: String) -> String {
    normalizeMerchant(description)
        .split(separator: " ")
        .map(String.init)
        .filter { $0.count > 2 && !$0.allSatisfy(\.isNumber) }
        .prefix(3)
        .joined(separator: " ")
}

/// Returns true if the description matches any saved transfer rule.
/// Mirrors `isTransferDescription` in importer.ts.
public func isTransferDescription(_ description: String, rules: [CategoryRule]) -> Bool {
    let normalized = normalizeMerchant(description)
    guard !normalized.isEmpty else { return false }
    return rules.contains { rule in
        rule.kind == .transfer && descriptionMatchesPattern(normalized, pattern: rule.pattern)
    }
}

/// Sort import rows: newest date first, then kind, category, abs(amount) desc, rowNumber asc.
/// Mirrors `sortImportRows` in importer.ts.
public func sortImportRows(_ rows: [CsvImportRow]) -> [CsvImportRow] {
    rows.sorted { a, b in
        if a.date != b.date { return a.date > b.date }
        if a.kind.rawValue != b.kind.rawValue { return a.kind.rawValue < b.kind.rawValue }
        if a.category != b.category { return a.category < b.category }
        let absA = abs(a.amount), absB = abs(b.amount)
        if absA != absB { return absA > absB }
        return a.rowNumber < b.rowNumber
    }
}

/// Outcome of committing a reviewed import — what the confirmation toast reports.
public struct ImportCommitResult: Sendable, Hashable {
    /// nil when nothing was imported (only transfer patterns were learned, or no rows).
    public var batch: ImportBatch?
    public var importedRows: Int
    /// Rows marked as transfers: not imported, but their payee patterns were saved.
    public var learnedTransferPatterns: Int
    /// Existing ledger entries removed because they now match a transfer rule.
    public var sweptEntries: Int
    /// Auto-seeded recurring entries folded into imported actuals for the same merchant.
    public var mergedSeededEntries: Int

    public var didChangeLedger: Bool {
        importedRows > 0 || learnedTransferPatterns > 0 || sweptEntries > 0 || mergedSeededEntries > 0
    }
}

/// Adds the included rows to their month buckets with fresh ids, folds auto-seeded
/// recurring copies into the imported actuals, learns category rules from every reviewed
/// row (transfer rows included), sweeps existing entries that match the now-known transfer
/// payees, and records the batch (newest first, capped at 25).
/// Mirrors `confirmCsvImport` in App.tsx.
@discardableResult
public func commitImport(
    rows: [CsvImportRow],
    into state: inout LedgerState,
    fileName: String,
    totalRows: Int? = nil
) -> ImportCommitResult {
    let rowsToImport = rows.filter { $0.include && $0.kind != .transfer }
    // Transfers between the user's own accounts are never imported, but their payee
    // patterns are saved so future imports auto-skip them and existing matches are swept.
    let transferRows = rows.filter { $0.kind == .transfer }
    guard !rowsToImport.isEmpty || !transferRows.isEmpty else {
        return ImportCommitResult(batch: nil, importedRows: 0, learnedTransferPatterns: 0,
                                  sweptEntries: 0, mergedSeededEntries: 0)
    }

    let batchId = createId(prefix: "batch")
    let importedAt = isoTimestampNow()
    var refs: [ImportedTransactionRef] = []

    for (index, row) in rowsToImport.enumerated() {
        var month = state.months[row.monthKey] ?? .empty
        let meta = ImportedTransactionMeta(
            batchId: batchId,
            fileName: fileName,
            rowNumber: row.rowNumber,
            hash: row.hash,
            originalDescription: row.description,
            importedAt: importedAt
        )

        if row.kind == .income {
            let entry = IncomeEntry(
                id: createId(prefix: "income"),
                source: row.description,
                amount: abs(row.amount),
                color: row.color.isEmpty ? paletteColor(at: index) : row.color,
                // Imported bank rows are historical actuals — one-off by default, not run-rate.
                recurring: false,
                date: row.date,
                imported: meta,
                categorySource: row.categorySource
            )
            month.incomes.append(entry)
            refs.append(ImportedTransactionRef(monthKey: row.monthKey, entryId: entry.id, kind: .income))
        } else {
            let trimmedCategory = row.category.trimmingCharacters(in: .whitespaces)
            let entry = ExpenseEntry(
                id: createId(prefix: "expense"),
                name: row.description,
                category: trimmedCategory.isEmpty
                    ? (row.kind == .debtPayment ? "Debt payments" : "Unsorted")
                    : trimmedCategory,
                amount: abs(row.amount),
                color: row.color.isEmpty ? paletteColor(at: index + 2) : row.color,
                recurring: false,
                date: row.date,
                imported: meta,
                debtAccountId: row.kind == .debtPayment ? row.debtAccountId : nil,
                categorySource: row.categorySource
            )
            month.expenses.append(entry)
            refs.append(ImportedTransactionRef(monthKey: row.monthKey, entryId: entry.id, kind: .expense))
        }
        state.months[row.monthKey] = month
    }

    // Auto-seeded recurring rows fold into the imported actuals for the same merchant
    // instead of doubling — the import wins and inherits the recurring role.
    var mergedSeeded = 0
    for monthKey in Set(rowsToImport.map(\.monthKey)) {
        guard let month = state.months[monthKey] else { continue }
        let reconciled = Recurrence.reconcileSeededEntries(month)
        state.months[monthKey] = reconciled.month
        mergedSeeded += reconciled.merged
    }

    state.categoryRules = mergeCategoryRules(state.categoryRules, rows: rowsToImport + transferRows, timestamp: importedAt)
    let swept = sweepTransferEntries(months: state.months, rules: state.categoryRules)
    state.months = swept.months

    var batch: ImportBatch?
    if !refs.isEmpty {
        let total = totalRows ?? rows.count
        let record = ImportBatch(
            id: batchId,
            fileName: fileName,
            importedAt: importedAt,
            totalRows: total,
            importedRows: refs.count,
            skippedRows: max(0, total - refs.count),
            transactionRefs: refs
        )
        state.importBatches.insert(record, at: 0)
        if state.importBatches.count > 25 {
            state.importBatches = Array(state.importBatches.prefix(25))
        }
        batch = record
    }

    return ImportCommitResult(
        batch: batch,
        importedRows: refs.count,
        learnedTransferPatterns: transferRows.count,
        sweptEntries: swept.removed,
        mergedSeededEntries: mergedSeeded
    )
}

/// Upserts one rule per reviewed row, keyed by payee pattern — an existing rule keeps
/// its id, creation time and position; the newest 120 survive.
/// Mirrors `mergeCategoryRules` in App.tsx (rows with no category, or "Unsorted", teach nothing).
public func mergeCategoryRules(_ existing: [CategoryRule], rows: [CsvImportRow], timestamp: String) -> [CategoryRule] {
    var order: [String] = []
    var byPattern: [String: CategoryRule] = [:]
    for rule in existing {
        if byPattern[rule.pattern] == nil { order.append(rule.pattern) }
        byPattern[rule.pattern] = rule
    }

    for row in rows {
        let pattern = buildRulePattern(from: row.description)
        let category = row.category.trimmingCharacters(in: .whitespaces)
        guard !pattern.isEmpty, !category.isEmpty, category != "Unsorted" else { continue }
        let previous = byPattern[pattern]
        if previous == nil { order.append(pattern) }
        byPattern[pattern] = CategoryRule(
            id: previous?.id ?? createId(prefix: "rule"),
            pattern: pattern,
            category: category,
            kind: row.kind,
            // Remember which debt account this payee pays so future imports auto-link.
            debtAccountId: row.kind == .debtPayment ? (row.debtAccountId ?? previous?.debtAccountId) : nil,
            createdAt: previous?.createdAt ?? timestamp,
            updatedAt: timestamp
        )
    }

    return Array(order.compactMap { byPattern[$0] }.suffix(120))
}

/// Adds or refreshes a "transfer between my accounts" rule for a payee pattern.
/// Mirrors `upsertTransferRule` in App.tsx.
public func upsertTransferRule(_ rules: [CategoryRule], pattern: String, timestamp: String) -> [CategoryRule] {
    var next = rules
    if let index = next.firstIndex(where: { $0.pattern == pattern }) {
        next[index].category = "Transfers"
        next[index].kind = .transfer
        next[index].updatedAt = timestamp
    } else {
        next.append(CategoryRule(
            id: createId(prefix: "rule"),
            pattern: pattern,
            category: "Transfers",
            kind: .transfer,
            createdAt: timestamp,
            updatedAt: timestamp
        ))
    }
    return next
}

/// Removes every ledger entry whose description matches a saved transfer rule and
/// reports how many went, so callers can say so. Mirrors `sweepTransferEntries`.
public func sweepTransferEntries(months: [String: MonthBudget], rules: [CategoryRule]) -> (months: [String: MonthBudget], removed: Int) {
    let transferRules = rules.filter { $0.kind == .transfer }
    guard !transferRules.isEmpty else { return (months, 0) }

    var removed = 0
    var next = months
    for (monthKey, month) in months {
        let incomes = month.incomes.filter { income in
            let hit = isTransferDescription(income.source, rules: transferRules)
            if hit { removed += 1 }
            return !hit
        }
        let expenses = month.expenses.filter { expense in
            let hit = isTransferDescription(expense.name, rules: transferRules)
            if hit { removed += 1 }
            return !hit
        }
        if incomes.count != month.incomes.count || expenses.count != month.expenses.count {
            next[monthKey] = MonthBudget(incomes: incomes, expenses: expenses, note: month.note)
        }
    }
    return (next, removed)
}

/// A category correction on an imported entry becomes a saved rule, and the rule is
/// swept backwards over entries no human has sorted yet (Unsorted, or an automated
/// guess) — never over a category the user set by hand. Returns how many entries were
/// re-categorised. Mirrors `learnCategoryRule` in App.tsx.
@discardableResult
public func learnCategoryRule(
    in state: inout LedgerState,
    description: String,
    category: String,
    kind: TransactionKind,
    excludeEntryId: String? = nil
) -> Int {
    let pattern = buildRulePattern(from: description)
    let category = category.trimmingCharacters(in: .whitespaces)
    guard !pattern.isEmpty, !category.isEmpty else { return 0 }

    let timestamp = isoTimestampNow()
    var rules = state.categoryRules
    if let index = rules.firstIndex(where: { $0.pattern == pattern }) {
        rules[index].category = category
        rules[index].kind = kind
        rules[index].updatedAt = timestamp
    } else {
        rules.append(CategoryRule(
            id: createId(prefix: "rule"),
            pattern: pattern,
            category: category,
            kind: kind,
            createdAt: timestamp,
            updatedAt: timestamp
        ))
    }
    state.categoryRules = Array(rules.suffix(120))

    let anchorColor = state.months.keys.sorted()
        .flatMap { state.months[$0]?.expenses ?? [] }
        .first { $0.category == category }?.color
        ?? paletteColor(at: category.count)

    var applied = 0
    for monthKey in state.months.keys.sorted() {
        guard var month = state.months[monthKey] else { continue }
        var changed = false
        for index in month.expenses.indices {
            let expense = month.expenses[index]
            if expense.id == excludeEntryId { continue }
            if expense.categorySource == "user" || expense.category == category { continue }
            let humanSorted = expense.imported == nil
                && !expense.category.isEmpty
                && expense.category != "Unsorted"
                && expense.categorySource == nil
            if humanSorted { continue }
            let original = expense.imported?.originalDescription ?? ""
            let matchText = original.isEmpty ? expense.name : original
            guard descriptionMatchesPattern(canonicalizeMerchant(matchText), pattern: pattern) else { continue }
            month.expenses[index].category = category
            month.expenses[index].color = anchorColor
            month.expenses[index].categorySource = "rule"
            applied += 1
            changed = true
        }
        if changed { state.months[monthKey] = month }
    }
    return applied
}

/// Removes a batch and every entry it imported. Mirrors `removeImportBatchFromState`.
public func removeImportBatch(from state: inout LedgerState, batchId: String) {
    guard let batch = state.importBatches.first(where: { $0.id == batchId }) else { return }
    let refKeys = Set(batch.transactionRefs.map { "\($0.monthKey):\($0.entryId):\($0.kind.rawValue)" })
    for (monthKey, month) in state.months {
        var next = month
        next.incomes.removeAll { income in
            income.imported?.batchId == batchId || refKeys.contains("\(monthKey):\(income.id):income")
        }
        next.expenses.removeAll { expense in
            expense.imported?.batchId == batchId || refKeys.contains("\(monthKey):\(expense.id):expense")
        }
        if next != month { state.months[monthKey] = next }
    }
    state.importBatches.removeAll { $0.id == batchId }
}

// MARK: - Hash

/// `Number.prototype.toFixed(2)` semantics: sign from the original value (so
/// -0.001 prints "-0.00" but -0 prints "0.00"), halves rounded away from zero.
/// printf's %.2f rounds half-to-even, which would put 0.125 on the wrong side and
/// give the two clients different duplicate hashes for the same transaction.
func jsToFixed2(_ value: Double) -> String {
    guard value.isFinite else { return String(format: "%.2f", value) }
    let scaled = (value * 100).rounded(.toNearestOrAwayFromZero)
    guard abs(scaled) < 1e15 else { return String(format: "%.2f", value) }
    let pence = Int(abs(scaled))
    let sign = value < 0 ? "-" : ""
    return "\(sign)\(pence / 100).\(String(format: "%02d", pence % 100))"
}

/// Deterministic, JS-compatible 32-bit integer hash.
/// Mirrors `createTransactionHash` in importer.ts: Math.imul(31, hash) + charCode,
/// truncated to Int32 each step, then `Math.abs(hash).toString(36)`.
public func createTransactionHash(date: String, description: String, amount: Double) -> String {
    let key = "\(date)|\(normalizeMerchant(description))|\(jsToFixed2(amount))"
    var hash: Int32 = 0
    for unit in key.utf16 {
        hash = 31 &* hash &+ Int32(unit)
    }
    return String(hash.magnitude, radix: 36)
}

// MARK: - Pattern matching

/// Mirrors `descriptionMatchesPattern` in importer.ts.
public func descriptionMatchesPattern(_ normalizedDescription: String, pattern: String) -> Bool {
    let normalizedPattern = pattern.trimmingCharacters(in: .whitespaces).lowercased()
    guard !normalizedPattern.isEmpty else { return false }
    let descTokens    = normalizedDescription.split(separator: " ").map(String.init).filter { !$0.isEmpty }
    let patternTokens = normalizedPattern.split(separator: " ").map(String.init).filter { !$0.isEmpty }
    guard !patternTokens.isEmpty else { return false }
    return patternTokens.allSatisfy { pt in descTokens.contains { dt in dt.contains(pt) } }
}

// MARK: - Merchant normalisation

/// Mirrors `normalizeMerchant` in importer.ts. Used for the dedupe hash, so it
/// must never change without a matching change on the web.
public func normalizeMerchant(_ description: String) -> String {
    var result = description.lowercased()
    result = result.replacingOccurrences(of: "[^a-z0-9\\s]", with: " ", options: .regularExpression)
    result = result.replacingOccurrences(
        of: #"\b(card|payment|purchase|direct debit|dd|pos|online|faster payments?)\b"#,
        with: " ", options: .regularExpression
    )
    result = result.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    return result.trimmingCharacters(in: .whitespaces)
}

/// UK bank descriptors abbreviate merchants in predictable ways. Expanding the common
/// variants before rule matching lets one saved rule cover them all. Applied only to
/// matching and grouping (never to the dedupe hash). Mirrors `canonicalizeMerchant`.
private let merchantAliases: [(pattern: String, replacement: String)] = [
    (#"\bamzn(?:\s+mktp)?\b"#, "amazon"),
    (#"\bamz\b"#, "amazon"),
    (#"\bsbux\b"#, "starbucks"),
    (#"\bmcd(?:onalds)?\b"#, "mcdonalds"),
    (#"\btfl(?:\s+travel(?:\s+ch(?:arge)?)?)?\b"#, "tfl"),
    (#"\bsainsburys?\s*s\/?mkts?\b"#, "sainsburys"),
    (#"\bm\s*&\s*s\b"#, "marks and spencer"),
    (#"\bwm\s+morrisons?\b"#, "morrisons"),
    (#"\bb\s*&\s*q\b"#, "b and q"),
    (#"\bpaypal\s*\*"#, "paypal "),
    (#"\bsumup\s*\*"#, "sumup "),
    (#"\bzettle\b[_ ]*"#, "zettle "),
    (#"\bsq\s*\*"#, "square "),
    (#"\bcrv\b"#, ""),
    (#"\bgoogle\s*\*"#, "google "),
    (#"\bapple\.com\/bill\b"#, "apple"),
    (#"\bamznprime\b"#, "amazon prime"),
]

public func canonicalizeMerchant(_ description: String) -> String {
    var canonical = normalizeMerchant(description)
    for alias in merchantAliases {
        canonical = canonical.replacingOccurrences(of: alias.pattern, with: alias.replacement, options: .regularExpression)
    }
    // Domain suffixes survive normalization as bare tokens ("NETFLIX.COM" → "netflix com");
    // stripping them lets web and card descriptors of the same merchant group together.
    canonical = canonical.replacingOccurrences(of: #"\b(?:www|com|net|org|co uk|couk)\b"#, with: " ", options: .regularExpression)
    canonical = canonical.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    return canonical.trimmingCharacters(in: .whitespaces)
}

/// Jaccard similarity over token sets, with substring token credit so "sainsbury"
/// still counts against "sainsburys". Mirrors `tokenSetSimilarity`.
private func tokenSetSimilarity(_ description: String, _ pattern: String) -> Double {
    let descTokens = Set(description.split(separator: " ").map(String.init).filter { $0.count > 1 })
    let patternTokens = Set(pattern.lowercased().split(separator: " ").map(String.init).filter { $0.count > 1 })
    guard !descTokens.isEmpty, !patternTokens.isEmpty else { return 0 }
    var overlap = 0
    for patternToken in patternTokens {
        if descTokens.contains(where: { $0 == patternToken || $0.contains(patternToken) || patternToken.contains($0) }) {
            overlap += 1
        }
    }
    let unionSize = descTokens.count + patternTokens.count - overlap
    return unionSize > 0 ? Double(overlap) / Double(unionSize) : 0
}

private func toTitleCase(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespaces)
        .lowercased()
        .split(separator: " ")
        .map { part -> String in
            guard let first = part.first else { return String(part) }
            return first.uppercased() + part.dropFirst()
        }
        .joined(separator: " ")
}

/// Maps a category name to a color from the shared palette.
/// Mirrors `categoryColor` in importer.ts (fallback index = name length).
private func csvCategoryColor(_ category: String) -> String {
    let normalized = category.trimmingCharacters(in: .whitespaces).lowercased()
    let knownCategories = [
        "home", "food", "bills", "travel", "health",
        "personal", "work", "subscriptions", "income",
        "debt payments", "transfers", "unsorted"
    ]
    let idx = knownCategories.firstIndex(of: normalized) ?? normalized.count
    return CATEGORY_COLORS[idx % CATEGORY_COLORS.count]
}

// MARK: - CSV parsing

private func detectDelimiter(_ text: String) -> Character {
    let sample = text.split(separator: "\n", maxSplits: 5, omittingEmptySubsequences: true)
        .prefix(5).map(String.init).joined(separator: "\n")
    let candidates: [Character] = [",", ";", "\t"]
    return candidates
        .map { delim -> (Character, Int) in
            let count = parseCsvTableWithDelimiter(sample, delimiter: delim).first?.count ?? 0
            return (delim, count)
        }
        .max(by: { $0.1 < $1.1 })?.0 ?? ","
}

/// Swift treats "\r\n" as a single grapheme, so a character-level scanner
/// looking for "\n" never sees a line break in a Windows-formatted export and the
/// whole file collapses into one row. Normalise before tokenising.
private func normalizeLineEndings(_ text: String) -> String {
    text.replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n")
}

private func parseCsvTable(_ text: String) -> [[String]] {
    let normalized = normalizeLineEndings(text)
    return parseCsvTableWithDelimiter(normalized, delimiter: detectDelimiter(normalized))
}

private func parseCsvTableWithDelimiter(_ text: String, delimiter: Character) -> [[String]] {
    var rows: [[String]] = []
    var row: [String] = []
    var field = ""
    var quoted = false
    var idx = text.startIndex

    while idx < text.endIndex {
        let char = text[idx]
        let nextIdx = text.index(after: idx)
        let next: Character? = nextIdx < text.endIndex ? text[nextIdx] : nil

        if quoted {
            if char == "\"" && next == "\"" {
                field.append("\"")
                idx = text.index(after: nextIdx)
                continue
            } else if char == "\"" {
                quoted = false
            } else {
                field.append(char)
            }
        } else if char == "\"" {
            quoted = true
        } else if char == delimiter {
            row.append(field)
            field = ""
        } else if char == "\n" {
            row.append(field)
            rows.append(row)
            row = []
            field = ""
        } else if char != "\r" {
            field.append(char)
        }

        idx = text.index(after: idx)
    }

    row.append(field)
    rows.append(row)
    return rows
}

// MARK: - Column detection

private func normalizeHeader(_ header: String) -> String {
    header.trimmingCharacters(in: .whitespacesAndNewlines)
        .replacingOccurrences(of: "\u{FEFF}", with: "")
        .lowercased()
        .replacingOccurrences(of: "_", with: " ")
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
}

/// Whole-word containment, so "in" does not match "booking date" and "out" does
/// not match "checkout". "/" and "_" count as separators.
private func headerWords(_ value: String) -> [String] {
    value.lowercased()
        .split(whereSeparator: { ch in !(ch.isLetter || ch.isNumber || ch == "%" || ch == "£" || ch == "$") })
        .map(String.init)
}

private func containsAliasWords(_ header: String, _ alias: String) -> Bool {
    let words = headerWords(header)
    let needle = headerWords(alias)
    guard !needle.isEmpty, words.count >= needle.count else { return false }
    for start in 0...(words.count - needle.count) {
        var matched = true
        for offset in 0..<needle.count where words[start + offset] != needle[offset] {
            matched = false
            break
        }
        if matched { return true }
    }
    return false
}

private func findColumn(_ headers: [String], aliases: [String]) -> Int {
    if let idx = headers.firstIndex(where: { aliases.contains($0) }) { return idx }
    if let idx = headers.firstIndex(where: { h in aliases.contains { containsAliasWords(h, $0) } }) { return idx }
    return -1
}

private func optionalColumn(_ headers: [String], aliases: [String]) -> Int? {
    let idx = findColumn(headers, aliases: aliases)
    return idx >= 0 ? idx : nil
}

private func detectColumns(_ headers: [String]) -> ColumnMap {
    var amount = optionalColumn(headers, aliases: amountHeaders)
    var debit  = optionalColumn(headers, aliases: debitHeaders)
    var credit = optionalColumn(headers, aliases: creditHeaders)
    // One column matched both "money in" and "money out": it is a signed amount.
    if let d = debit, d == credit {
        amount = amount ?? d
        debit = nil
        credit = nil
    }
    // "Debit Amount" + "Credit Amount": keep the pair, not one of them as the amount.
    if let d = debit, let c = credit, amount == d || amount == c {
        amount = nil
    }
    return ColumnMap(
        date:        findColumn(headers, aliases: dateHeaders),
        description: findColumn(headers, aliases: descriptionHeaders),
        amount:      amount,
        debit:       debit,
        credit:      credit,
        category:    optionalColumn(headers, aliases: categoryHeaders)
    )
}

private func validateColumns(_ columns: ColumnMap) -> [String] {
    var errors: [String] = []
    if columns.date < 0        { errors.append("Could not find a transaction date column.") }
    if columns.description < 0 { errors.append("Could not find a description, merchant, or payee column.") }
    if columns.amount == nil && columns.debit == nil && columns.credit == nil {
        errors.append("Could not find either an amount column or debit/credit columns.")
    }
    return errors
}

private func getCell(_ cells: [String], _ index: Int?) -> String {
    guard let index, index >= 0, index < cells.count else { return "" }
    return cells[index]
}

// MARK: - Amount parsing

private func readAmount(cells: [String], columns: ColumnMap) -> Double? {
    if let amtIdx = columns.amount {
        return parseAmount(getCell(cells, amtIdx))
    }
    let debit  = abs(parseAmount(getCell(cells, columns.debit))  ?? 0.0)
    let credit = abs(parseAmount(getCell(cells, columns.credit)) ?? 0.0)
    if debit == 0.0 && credit == 0.0 { return nil }
    return roundToPence(credit - debit)
}

func roundToPence(_ value: Double) -> Double {
    (value * 100).rounded() / 100
}

/// Mirrors `parseAmount` in importer.ts: parentheses negatives, currency symbols,
/// thousands separators and comma decimals.
func parseAmount(_ value: String) -> Double? {
    let trimmed = value.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return nil }

    let negativeByParentheses = trimmed.hasPrefix("(") && trimmed.hasSuffix(")")
    var normalized = trimmed
        .replacingOccurrences(of: "(", with: "")
        .replacingOccurrences(of: ")", with: "")
        .replacingOccurrences(of: "[^0-9.,-]", with: "", options: .regularExpression)

    guard !normalized.isEmpty else { return nil }

    if normalized.contains(".") && normalized.contains(",") {
        normalized = normalized.replacingOccurrences(of: ",", with: "")
    } else if normalized.contains(","), normalized.range(of: ",\\d{1,2}$", options: .regularExpression) != nil {
        normalized = normalized.replacingOccurrences(of: ",", with: ".")
    } else {
        normalized = normalized.replacingOccurrences(of: ",", with: "")
    }

    guard let parsed = Double(normalized), parsed.isFinite else { return nil }
    let result = negativeByParentheses ? -abs(parsed) : parsed
    return roundToPence(result)
}

// MARK: - Date parsing

private let monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

func monthFromName(_ name: String) -> Int? {
    let key = String(name.lowercased().prefix(3))
    guard let idx = monthNames.firstIndex(of: key) else { return nil }
    return idx + 1
}

/// "13 Jun" / "Jun 13" with no year. Returns day and month so the caller can supply the year.
func parseDayMonth(_ first: String, _ second: String) -> (day: Int, month: Int)? {
    let a = first.trimmingCharacters(in: CharacterSet(charactersIn: ".,"))
    let b = second.trimmingCharacters(in: CharacterSet(charactersIn: ".,"))
    if let day = Int(a), a.count <= 2, b.range(of: "^[A-Za-z]{3,9}$", options: .regularExpression) != nil,
       let month = monthFromName(b) {
        return (day, month)
    }
    if let day = Int(b), b.count <= 2, a.range(of: "^[A-Za-z]{3,9}$", options: .regularExpression) != nil,
       let month = monthFromName(a) {
        return (day, month)
    }
    return nil
}

/// Pick the year for a day-month date: the month being imported into, unless that
/// would put the transaction more than a month into the future (a December statement
/// pasted in January), in which case the previous year.
func yearForDayMonth(month: Int, fallbackMonth: String) -> Int {
    let year = Int(fallbackMonth.prefix(4)) ?? Calendar.current.component(.year, from: Date())
    let fallbackMonthNumber = Int(fallbackMonth.dropFirst(5).prefix(2)) ?? month
    return month > fallbackMonthNumber + 1 ? year - 1 : year
}

/// Parses the date formats UK banks actually emit. Mirrors `parseDateValue` in importer.ts.
func parseDateValue(_ value: String, fallbackMonth: String? = nil) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return nil }

    // Day-month with no year ("13 Jun", "Jun 13"): the year comes from the month being imported into.
    let dayMonthTokens = trimmed.split(whereSeparator: { $0 == " " || $0 == "-" || $0 == "/" }).map(String.init)
    if dayMonthTokens.count == 2, let dayMonth = parseDayMonth(dayMonthTokens[0], dayMonthTokens[1]) {
        let year = fallbackMonth.map { yearForDayMonth(month: dayMonth.month, fallbackMonth: $0) }
            ?? Calendar.current.component(.year, from: Date())
        return formatDateParts(year: year, month: dayMonth.month, day: dayMonth.day)
    }

    // ISO: YYYY-MM-DD or YYYY/MM/DD (optionally followed by a time)
    if let match = trimmed.firstMatchGroups(of: #"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})"#) {
        return formatDateParts(year: Int(match[1]) ?? 0, month: Int(match[2]) ?? 0, day: Int(match[3]) ?? 0)
    }

    // Slash / dash ambiguous: DD/MM/YY(YY) or MM/DD/YY(YY), optionally followed by a time
    if let match = trimmed.firstMatchGroups(of: #"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T].*)?$"#) {
        let first   = Int(match[1]) ?? 0
        let second  = Int(match[2]) ?? 0
        let year    = normalizeYear(Int(match[3]) ?? 0)
        let day     = first > 12 ? first  : (second > 12 ? second : first)
        let month   = first > 12 ? second : (second > 12 ? first  : second)
        return formatDateParts(year: year, month: month, day: day)
    }

    // Month-name dates: "12-Sep-26", "12 Sep 2026", "12/Sep/2026"
    if let match = trimmed.firstMatchGroups(of: #"^(\d{1,2})[ \-/]([A-Za-z]{3,9})\.?[ \-/,]+(\d{2,4})$"#),
       let month = monthFromName(match[2]) {
        return formatDateParts(year: normalizeYear(Int(match[3]) ?? 0), month: month, day: Int(match[1]) ?? 0)
    }

    // "Sep 12 2026" / "September 12, 2026"
    if let match = trimmed.firstMatchGroups(of: #"^([A-Za-z]{3,9})\.?[ ]+(\d{1,2}),?[ ]+(\d{2,4})$"#),
       let month = monthFromName(match[1]) {
        return formatDateParts(year: normalizeYear(Int(match[3]) ?? 0), month: month, day: Int(match[2]) ?? 0)
    }

    // Fallback — ISO-8601 full-date parser
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withFullDate]
    if let date = formatter.date(from: trimmed) {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 0)!
        let comps = cal.dateComponents([.year, .month, .day], from: date)
        return formatDateParts(year: comps.year ?? 0, month: comps.month ?? 0, day: comps.day ?? 0)
    }

    return nil
}

private func normalizeYear(_ year: Int) -> Int {
    year < 100 ? 2000 + year : year
}

func formatDateParts(year: Int, month: Int, day: Int) -> String? {
    guard month >= 1, month <= 12, day >= 1, day <= 31 else { return nil }
    var comps = DateComponents()
    comps.year = year; comps.month = month; comps.day = day
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(secondsFromGMT: 0)!
    guard let date = cal.date(from: comps) else { return nil }
    let back = cal.dateComponents([.year, .month, .day], from: date)
    guard back.year == year, back.month == month, back.day == day else { return nil }
    return String(format: "%04d-%02d-%02d", year, month, day)
}

func monthStartDate(_ monthKey: String) -> String {
    "\(monthKey)-01"
}

extension String {
    /// First regex match as an array of capture-group strings (index 0 = whole match).
    func firstMatchGroups(of pattern: String, options: NSRegularExpression.Options = []) -> [String]? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: options) else { return nil }
        let range = NSRange(startIndex..., in: self)
        guard let match = regex.firstMatch(in: self, range: range) else { return nil }
        return (0..<match.numberOfRanges).map { group in
            guard let r = Range(match.range(at: group), in: self) else { return "" }
            return String(self[r])
        }
    }
}

// MARK: - Category suggestion

public struct CategorySuggestion: Sendable {
    public let kind: TransactionKind
    public let category: String
    public let confidence: Double
    public let note: String
    public var debtAccountId: String?
    /// "rule" | "system" | "bank" | "heuristic" — mirrors CategorySource on the web.
    public var source: String

    public init(kind: TransactionKind, category: String, confidence: Double, note: String,
                debtAccountId: String? = nil, source: String = "system") {
        self.kind = kind
        self.category = category
        self.confidence = confidence
        self.note = note
        self.debtAccountId = debtAccountId
        self.source = source
    }
}

/// Suggests a category/kind for a manually typed entry name using the same
/// learned + system rules as the CSV importer. `amount` follows the CSV sign
/// convention (negative = money out).
public func suggestEntryCategory(
    description: String,
    amount: Double,
    rules: [CategoryRule]
) -> CategorySuggestion {
    suggestCategory(description: description, amount: amount, rules: rules, bankCategory: "")
}

/// Stable palette color for a category name (shared with the CSV importer).
public func categoryColor(for category: String) -> String {
    csvCategoryColor(category)
}

/// Mirrors `suggestCategory` in importer.ts: saved rules, then near-miss rule
/// matches, then system rules, then the bank's own category, then sign heuristics.
func suggestCategory(description: String, amount: Double,
                     rules: [CategoryRule], bankCategory: String) -> CategorySuggestion {
    let normalized = normalizeMerchant(description)
    let canonical = canonicalizeMerchant(description)

    // Saved (learned) rule — highest priority. Matched against the raw
    // normalisation and the alias-expanded form.
    if let learned = rules.first(where: {
        descriptionMatchesPattern(normalized, pattern: $0.pattern) || descriptionMatchesPattern(canonical, pattern: $0.pattern)
    }) {
        return CategorySuggestion(kind: learned.kind, category: learned.category,
                                  confidence: 0.96, note: "Matched your saved rule",
                                  debtAccountId: learned.kind == .debtPayment ? learned.debtAccountId : nil,
                                  source: "rule")
    }

    // Near-miss recovery: "AMZN MKTP GB" should still hit an "amazon" rule.
    let fuzzy = rules
        .filter { $0.kind != .transfer }
        .map { rule in (rule: rule, score: tokenSetSimilarity(canonical, rule.pattern)) }
        .filter { $0.score >= 0.6 }
        .max(by: { $0.score < $1.score })
    if let fuzzy {
        return CategorySuggestion(kind: fuzzy.rule.kind, category: fuzzy.rule.category,
                                  confidence: 0.85, note: "Close match to your rule “\(fuzzy.rule.pattern)”",
                                  debtAccountId: fuzzy.rule.kind == .debtPayment ? fuzzy.rule.debtAccountId : nil,
                                  source: "rule")
    }

    // System rules (tested against the raw description and the canonical form)
    let fullRange = NSRange(description.startIndex..., in: description)
    let canonicalRange = NSRange(canonical.startIndex..., in: canonical)
    for sr in systemRules {
        if sr.pattern.firstMatch(in: description, range: fullRange) != nil
            || sr.pattern.firstMatch(in: canonical, range: canonicalRange) != nil {
            let kind: TransactionKind = sr.kind ?? (amount >= 0 ? .income : .expense)
            return CategorySuggestion(kind: kind, category: sr.category,
                                      confidence: sr.confidence, note: sr.note, source: "system")
        }
    }

    // Bank-supplied category
    let trimmedBank = bankCategory.trimmingCharacters(in: .whitespaces)
    if !trimmedBank.isEmpty {
        return CategorySuggestion(
            kind: amount >= 0 ? .income : .expense,
            category: toTitleCase(trimmedBank),
            confidence: 0.72,
            note: "Used category from bank export",
            source: "bank"
        )
    }

    if amount >= 0 {
        return CategorySuggestion(kind: .income, category: "Income",
                                  confidence: 0.48, note: "Positive amount treated as income", source: "heuristic")
    }

    return CategorySuggestion(kind: .expense, category: "Unsorted",
                              confidence: 0.32, note: "Needs review", source: "heuristic")
}

// MARK: - Duplicate detection

/// Key for the same-day/same-amount duplicate index. Amounts follow the CSV
/// sign convention (negative = money out) rounded to 2 dp.
func dateAmountKey(date: String, amount: Double) -> String {
    "\(date)|\(String(format: "%.2f", amount))"
}

/// Indexes manually added entries (no import metadata) by date + signed amount
/// so CSV rows that mirror a hand-typed transaction can be flagged for review.
private func collectManualEntriesByDateAmount(_ state: LedgerState) -> [String: String] {
    var index: [String: String] = [:]
    for (_, month) in state.months {
        for income in month.incomes where income.imported == nil {
            guard let d = income.date else { continue }
            index[dateAmountKey(date: d, amount: abs(income.amount))] = income.source
        }
        for expense in month.expenses where expense.imported == nil {
            guard let d = expense.date else { continue }
            index[dateAmountKey(date: d, amount: -abs(expense.amount))] = expense.name
        }
    }
    return index
}

/// Every hash already in the ledger: stored import hashes plus recomputed hashes
/// for dated entries. Mirrors `collectExistingTransactionHashes`.
public func collectExistingTransactionHashes(_ state: LedgerState) -> Set<String> {
    var hashes = Set<String>()
    for (_, month) in state.months {
        for income in month.incomes {
            if let h = income.imported?.hash { hashes.insert(h) }
            if let d = income.date {
                hashes.insert(createTransactionHash(date: d, description: income.source, amount: income.amount))
            }
        }
        for expense in month.expenses {
            if let h = expense.imported?.hash { hashes.insert(h) }
            if let d = expense.date {
                hashes.insert(createTransactionHash(date: d, description: expense.name, amount: -abs(expense.amount)))
            }
        }
    }
    return hashes
}

// MARK: - Detected-columns builder

private func buildDetectedColumns(headers: [String], columns: ColumnMap) -> CsvImportResult.DetectedColumns {
    func header(at index: Int?) -> String? {
        guard let index, index >= 0, index < headers.count else { return nil }
        return headers[index]
    }
    return CsvImportResult.DetectedColumns(
        date:        header(at: columns.date >= 0       ? columns.date        : nil),
        description: header(at: columns.description >= 0 ? columns.description : nil),
        amount:      header(at: columns.amount),
        debit:       header(at: columns.debit),
        credit:      header(at: columns.credit),
        category:    header(at: columns.category)
    )
}
