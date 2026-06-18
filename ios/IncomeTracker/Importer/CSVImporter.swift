// CSVImporter.swift
// Ported from src/importer.ts — Swift 6, Foundation only.
//
// All domain types are defined in Types.swift / Constants.swift.
// This file adds only parsing helpers and the public importer functions.

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
    public var confidence: Double
    public var note: String
    public var hash: String
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
}

// MARK: - Column header constants (mirrors importer.ts)

private let dateHeaders        = ["date", "transaction date", "posted date", "booking date", "completed date", "value date"]
private let descriptionHeaders = ["description", "details", "narrative", "merchant", "name", "transaction", "reference", "payee", "memo"]
private let amountHeaders      = ["amount", "value", "transaction amount", "net amount"]
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
public func parseBankCsv(
    text: String,
    fileName: String,
    state: LedgerState,
    fallbackMonthKey: String? = nil
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
        guard let parsedAmount = readAmount(cells: cells, columns: columns), !desc.isEmpty else {
            continue
        }
        let isoDate = parseDateValue(getCell(cells, columns.date)) ?? monthStartDate(fallbackMonth)
        let bankCategory = columns.category == nil
            ? ""
            : getCell(cells, columns.category).trimmingCharacters(in: .whitespaces)
        let suggestion = suggestCategory(description: desc, amount: parsedAmount,
                                          rules: state.categoryRules, bankCategory: bankCategory)
        let h = createTransactionHash(date: isoDate, description: desc, amount: parsedAmount)
        let isDuplicate = existingHashes.contains(h)
        let kind = suggestion.kind

        rows.append(CsvImportRow(
            id: "draft-\(rowNumber)-\(h)",
            rowNumber: rowNumber,
            date: isoDate,
            monthKey: String(isoDate.prefix(7)),
            description: desc,
            amount: parsedAmount,
            rawAmount: String(format: "%.2f", parsedAmount),
            kind: kind,
            suggestedKind: kind,
            category: suggestion.category,
            suggestedCategory: suggestion.category,
            color: csvCategoryColor(suggestion.category),
            include: !isDuplicate && kind != .transfer,
            duplicate: isDuplicate,
            confidence: suggestion.confidence,
            note: isDuplicate ? "Possible duplicate" : suggestion.note,
            hash: h
        ))
    }

    let sorted = sortImportRows(rows)
    return CsvImportResult(
        rows: sorted,
        errors: sorted.isEmpty ? ["No importable transactions were found in this CSV."] : [],
        detectedColumns: buildDetectedColumns(headers: headerRow, columns: columns),
        totalRows: max(0, nonEmptyRows.count - 1)
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

/// Add included rows to the appropriate month buckets, create CategoryRules for new
/// categories, and return a new ImportBatch.
/// Mirrors `commitImport` in importer.ts.
@discardableResult
public func commitImport(
    rows: [CsvImportRow],
    into state: inout LedgerState,
    fileName: String
) -> ImportBatch {
    let batchId = "batch-\(UUID().uuidString)"
    let importedAt = ISO8601DateFormatter().string(from: Date())
    var refs: [ImportedTransactionRef] = []

    let includedRows = rows.filter(\.include)

    for row in includedRows {
        let monthKey = row.monthKey
        if state.months[monthKey] == nil {
            state.months[monthKey] = MonthBudget()
        }

        let meta = ImportedTransactionMeta(
            batchId: batchId,
            fileName: fileName,
            rowNumber: row.rowNumber,
            hash: row.hash,
            originalDescription: row.description,
            importedAt: importedAt
        )

        switch row.kind {
        case .income:
            let entry = IncomeEntry(
                id: row.id,
                source: row.description,
                amount: row.amount,
                color: row.color,
                recurring: false,
                date: row.date,
                imported: meta
            )
            state.months[monthKey]!.incomes.append(entry)
            refs.append(ImportedTransactionRef(monthKey: monthKey, entryId: row.id, kind: .income))

        case .expense, .debtPayment, .transfer:
            let entry = ExpenseEntry(
                id: row.id,
                name: row.description,
                category: row.category,
                amount: abs(row.amount),
                color: row.color,
                recurring: false,
                date: row.date,
                imported: meta
            )
            state.months[monthKey]!.expenses.append(entry)
            refs.append(ImportedTransactionRef(monthKey: monthKey, entryId: row.id, kind: .expense))
        }

        // Create a CategoryRule for new categories when no existing rule covers the description.
        let patternStr = buildRulePattern(from: row.description)
        if !patternStr.isEmpty {
            let alreadyCovered = state.categoryRules.contains { r in
                descriptionMatchesPattern(normalizeMerchant(row.description), pattern: r.pattern)
            }
            if !alreadyCovered {
                let newRule = CategoryRule(
                    id: "rule-\(UUID().uuidString)",
                    pattern: patternStr,
                    category: row.category,
                    kind: row.kind,
                    createdAt: importedAt,
                    updatedAt: importedAt
                )
                state.categoryRules.append(newRule)
            }
        }
    }

    let batch = ImportBatch(
        id: batchId,
        fileName: fileName,
        importedAt: importedAt,
        totalRows: rows.count,
        importedRows: includedRows.count,
        skippedRows: rows.count - includedRows.count,
        transactionRefs: refs
    )
    state.importBatches.append(batch)
    return batch
}

// MARK: - Hash

/// Deterministic, JS-compatible 32-bit integer hash.
/// Mirrors `createTransactionHash` in importer.ts, including Math.imul and the |0 truncation.
public func createTransactionHash(date: String, description: String, amount: Double) -> String {
    let key = "\(date)|\(normalizeMerchant(description))|\(String(format: "%.2f", amount))"
    var hash: Int32 = 0
    for scalar in key.unicodeScalars {
        // Math.imul(31, hash) + charCodeAt; then truncate to Int32 (|= 0 in JS)
        hash = 31 &* hash &+ Int32(bitPattern: scalar.value)
    }
    return String(UInt32(bitPattern: hash), radix: 36)
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

// MARK: - Private helpers

func normalizeMerchant(_ description: String) -> String {
    var result = description.lowercased()
    result = result.replacingOccurrences(of: "[^a-z0-9\\s]", with: " ", options: .regularExpression)
    result = result.replacingOccurrences(
        of: #"\b(card|payment|purchase|direct debit|dd|pos|online|faster payments?)\b"#,
        with: " ", options: .regularExpression
    )
    result = result.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    return result.trimmingCharacters(in: .whitespaces)
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
/// Mirrors `categoryColor` in importer.ts.
private func csvCategoryColor(_ category: String) -> String {
    let normalized = category.trimmingCharacters(in: .whitespaces).lowercased()
    let knownCategories = [
        "home", "food", "bills", "travel", "health",
        "personal", "work", "subscriptions", "income",
        "debt payments", "transfers", "unsorted"
    ]
    let idx: Int
    if let found = knownCategories.firstIndex(of: normalized) {
        idx = found
    } else {
        // Stable fallback: use character-value sum modulo palette length
        idx = normalized.unicodeScalars.reduce(0) { $0 + Int($1.value) }
    }
    return CATEGORY_COLORS[idx % CATEGORY_COLORS.count]
}

// MARK: - CSV parsing

private func detectDelimiter(_ text: String) -> Character {
    let sample = text.split(separator: "\n", maxSplits: 5).map(String.init).joined(separator: "\n")
    let candidates: [Character] = [",", ";", "\t"]
    return candidates
        .map { delim -> (Character, Int) in
            let count = parseCsvTableWithDelimiter(sample, delimiter: delim).first?.count ?? 0
            return (delim, count)
        }
        .max(by: { $0.1 < $1.1 })?.0 ?? ","
}

private func parseCsvTable(_ text: String) -> [[String]] {
    parseCsvTableWithDelimiter(text, delimiter: detectDelimiter(text))
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
    header.trimmingCharacters(in: .whitespaces)
        .lowercased()
        .replacingOccurrences(of: "_", with: " ")
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
}

private func findColumn(_ headers: [String], aliases: [String]) -> Int {
    if let idx = headers.firstIndex(where: { aliases.contains($0) }) { return idx }
    if let idx = headers.firstIndex(where: { h in aliases.contains { h.contains($0) } }) { return idx }
    return -1
}

private func optionalColumn(_ headers: [String], aliases: [String]) -> Int? {
    let idx = findColumn(headers, aliases: aliases)
    return idx >= 0 ? idx : nil
}

private func detectColumns(_ headers: [String]) -> ColumnMap {
    ColumnMap(
        date:        findColumn(headers, aliases: dateHeaders),
        description: findColumn(headers, aliases: descriptionHeaders),
        amount:      optionalColumn(headers, aliases: amountHeaders),
        debit:       optionalColumn(headers, aliases: debitHeaders),
        credit:      optionalColumn(headers, aliases: creditHeaders),
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
    return Double(String(format: "%.2f", credit - debit))
}

private func parseAmount(_ value: String) -> Double? {
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
    } else if normalized.contains(",") {
        let commaDecimalPattern = try? NSRegularExpression(pattern: ",\\d{1,2}$")
        let range = NSRange(normalized.startIndex..., in: normalized)
        if commaDecimalPattern?.firstMatch(in: normalized, range: range) != nil {
            normalized = normalized.replacingOccurrences(of: ",", with: ".")
        } else {
            normalized = normalized.replacingOccurrences(of: ",", with: "")
        }
    }

    guard let parsed = Double(normalized), parsed.isFinite else { return nil }
    let result = negativeByParentheses ? -abs(parsed) : parsed
    return Double(String(format: "%.2f", result))
}

// MARK: - Date parsing

private func parseDateValue(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return nil }

    // ISO: YYYY-MM-DD or YYYY/MM/DD
    let isoPattern = try? NSRegularExpression(pattern: #"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})"#)
    if let match = isoPattern?.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)) {
        let y = intFrom(trimmed, match: match, group: 1)
        let m = intFrom(trimmed, match: match, group: 2)
        let d = intFrom(trimmed, match: match, group: 3)
        return formatDateParts(year: y, month: m, day: d)
    }

    // Slash / dash ambiguous: DD/MM/YY(YY) or MM/DD/YY(YY)
    let slashPattern = try? NSRegularExpression(pattern: #"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$"#)
    if let match = slashPattern?.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)) {
        let first   = intFrom(trimmed, match: match, group: 1)
        let second  = intFrom(trimmed, match: match, group: 2)
        let rawYear = intFrom(trimmed, match: match, group: 3)
        let year    = normalizeYear(rawYear)
        let day     = first > 12 ? first  : (second > 12 ? second : first)
        let month   = first > 12 ? second : (second > 12 ? first  : second)
        return formatDateParts(year: year, month: month, day: day)
    }

    // Fallback — try ISO-8601 full-date parser
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

private func formatDateParts(year: Int, month: Int, day: Int) -> String? {
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

private func intFrom(_ string: String, match: NSTextCheckingResult, group: Int) -> Int {
    guard let range = Range(match.range(at: group), in: string) else { return 0 }
    return Int(string[range]) ?? 0
}

private func monthStartDate(_ monthKey: String) -> String {
    "\(monthKey)-01"
}

// MARK: - Category suggestion

private struct CategorySuggestion {
    let kind: TransactionKind
    let category: String
    let confidence: Double
    let note: String
}

private func suggestCategory(description: String, amount: Double,
                               rules: [CategoryRule], bankCategory: String) -> CategorySuggestion {
    let normalized = normalizeMerchant(description)

    // Saved (learned) rule — highest priority
    if let learned = rules.first(where: { descriptionMatchesPattern(normalized, pattern: $0.pattern) }) {
        return CategorySuggestion(kind: learned.kind, category: learned.category,
                                   confidence: 0.96, note: "Matched your saved rule")
    }

    // System rules
    let fullRange = NSRange(description.startIndex..., in: description)
    for sr in systemRules {
        if sr.pattern.firstMatch(in: description, range: fullRange) != nil {
            let kind: TransactionKind = sr.kind ?? (amount >= 0 ? .income : .expense)
            return CategorySuggestion(kind: kind, category: sr.category,
                                       confidence: sr.confidence, note: sr.note)
        }
    }

    // Bank-supplied category
    let trimmedBank = bankCategory.trimmingCharacters(in: .whitespaces)
    if !trimmedBank.isEmpty {
        return CategorySuggestion(
            kind: amount >= 0 ? .income : .expense,
            category: toTitleCase(trimmedBank),
            confidence: 0.72,
            note: "Used category from bank export"
        )
    }

    if amount >= 0 {
        return CategorySuggestion(kind: .income, category: "Income",
                                   confidence: 0.48, note: "Positive amount treated as income")
    }

    return CategorySuggestion(kind: .expense, category: "Unsorted",
                               confidence: 0.32, note: "Needs review")
}

// MARK: - Duplicate detection

private func collectExistingTransactionHashes(_ state: LedgerState) -> Set<String> {
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
