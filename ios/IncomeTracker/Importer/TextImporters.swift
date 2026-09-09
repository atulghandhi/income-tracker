// TextImporters.swift
// Ported from src/importer.ts — Swift 6, Foundation only.
//
// Every text-shaped capture path (file share, clipboard paste, OCR) lands in
// `parseBankText`, which sniffs the format from the content first and the
// file extension second, so a pasted OFX block or a renamed export still parses.
// Formats: CSV (with automatic credit-card sign flipping), OFX 1.x/2.x, QIF and
// loose pasted lines from a PDF statement or a banking app.

import Foundation

// MARK: - Multi-format entry point

public func parseBankText(
    text: String,
    fileName: String,
    state: LedgerState,
    fallbackMonthKey: String? = nil,
    flipSigns: Bool? = nil
) -> CsvImportResult {
    let trimmed = text.drop(while: { $0.isWhitespace })
    let lowerName = fileName.lowercased()
    let head = String(trimmed.prefix(4000))

    if head.range(of: "^OFXHEADER", options: [.regularExpression, .caseInsensitive]) != nil
        || head.range(of: "<OFX>", options: .caseInsensitive) != nil
        || lowerName.hasSuffix(".ofx") {
        return withTransferPairs(parseOfx(text: text, fileName: fileName, state: state, fallbackMonthKey: fallbackMonthKey))
    }
    if head.range(of: "^!Type:", options: [.regularExpression, .caseInsensitive]) != nil || lowerName.hasSuffix(".qif") {
        return withTransferPairs(parseQif(text: text, fileName: fileName, state: state, fallbackMonthKey: fallbackMonthKey))
    }

    var csvResult = parseBankCsv(text: text, fileName: fileName, state: state,
                                 fallbackMonthKey: fallbackMonthKey, flipSigns: flipSigns ?? false)
    // Auto-flip credit-card statements unless the caller chose explicitly.
    if flipSigns == nil, detectLikelySignInversion(csvResult) {
        csvResult = parseBankCsv(text: text, fileName: fileName, state: state,
                                 fallbackMonthKey: fallbackMonthKey, flipSigns: true)
    }
    if !csvResult.rows.isEmpty { return withTransferPairs(csvResult) }

    // No recognisable header row — pasted blocks from bank apps and spreadsheets
    // usually aren't CSV. Fall back to per-line parsing before giving up.
    let loose = parseLooseLines(text: text, fileName: fileName, state: state, fallbackMonthKey: fallbackMonthKey)
    return loose.rows.isEmpty ? csvResult : withTransferPairs(loose)
}

private func withTransferPairs(_ result: CsvImportResult) -> CsvImportResult {
    var copy = result
    copy.rows = markTransferPairs(result.rows)
    return copy
}

// MARK: - Credit-card sign inversion

/// Credit-card statements invert the sign convention: charges are positive,
/// refunds/payments negative. The tell: "positive" rows whose descriptions match
/// spending merchants. Only single-amount files qualify; debit/credit files are explicit.
private let spendingCategories: Set<String> = ["Home", "Bills", "Food", "Travel", "Subscriptions", "Health"]

public func detectLikelySignInversion(_ result: CsvImportResult) -> Bool {
    guard result.detectedColumns.amount != nil,
          result.detectedColumns.debit == nil,
          result.detectedColumns.credit == nil else { return false }
    let rows = result.rows.filter { $0.amount != 0 }
    guard rows.count >= 3 else { return false }
    let positive = rows.filter { $0.amount > 0 }
    guard Double(positive.count) / Double(rows.count) >= 0.6 else { return false }
    let spendingShapedIncome = positive.filter { $0.kind == .income && spendingCategories.contains($0.category) }.count
    return spendingShapedIncome >= 2
}

// MARK: - Transfer pairing

/// Two rows with opposite equal amounts a couple of days apart are almost always
/// the two legs of a transfer between the user's own accounts. Both legs get
/// re-classified as transfers (still visible in review, one tap to override).
/// Same-merchant pairs are skipped: a charge followed by an equal credit from
/// the same merchant is a refund. Mirrors `markTransferPairs`.
public func markTransferPairs(_ rows: [CsvImportRow]) -> [CsvImportRow] {
    var byAmount: [String: [Int]] = [:]
    for (index, row) in rows.enumerated() {
        byAmount[String(format: "%.2f", abs(row.amount)), default: []].append(index)
    }

    var paired = Set<Int>()
    for indexes in byAmount.values where indexes.count >= 2 {
        for outIndex in indexes {
            if paired.contains(outIndex) || rows[outIndex].amount >= 0 { continue }
            for inIndex in indexes {
                if inIndex == outIndex || paired.contains(inIndex) { continue }
                let candidate = rows[inIndex]
                if candidate.amount <= 0 { continue }
                guard let gap = dayGap(rows[outIndex].date, candidate.date), gap <= 2 else { continue }
                if canonicalizeMerchant(rows[outIndex].description) == canonicalizeMerchant(candidate.description) { continue }
                paired.insert(outIndex)
                paired.insert(inIndex)
                break
            }
        }
    }

    guard !paired.isEmpty else { return rows }
    return rows.enumerated().map { index, row in
        guard paired.contains(index), row.categorySource != "user", row.kind != .transfer else { return row }
        var updated = row
        updated.kind = .transfer
        updated.category = "Transfers"
        updated.include = false
        updated.confidence = max(row.confidence, 0.8)
        updated.note = "Opposite amounts days apart — looks like a transfer between your accounts"
        return updated
    }
}

private func dayGap(_ a: String, _ b: String) -> Int? {
    guard let da = isoDay(a), let db = isoDay(b) else { return nil }
    return abs(Int(db.timeIntervalSince(da) / 86_400))
}

private func isoDay(_ iso: String) -> Date? {
    let parts = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    var comps = DateComponents()
    comps.year = parts[0]; comps.month = parts[1]; comps.day = parts[2]
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(secondsFromGMT: 0)!
    return cal.date(from: comps)
}

// MARK: - OFX (Open Financial Exchange 1.x SGML and 2.x XML)

public func parseOfx(text: String, fileName: String, state: LedgerState, fallbackMonthKey: String? = nil) -> CsvImportResult {
    let existingHashes = collectExistingTransactionHashes(state)
    let fallbackMonth = fallbackMonthKey ?? state.selectedMonth
    let blocks = splitCaseInsensitive(text, token: "<STMTTRN>").dropFirst()
    var rows: [CsvImportRow] = []

    for (index, block) in blocks.enumerated() {
        let body = splitCaseInsensitive(String(block), token: "</STMTTRN>").first.map(String.init) ?? String(block)
        let amountText = readOfxTag(body, "TRNAMT")
        let name = readOfxTag(body, "NAME").isEmpty ? readOfxTag(body, "MEMO") : readOfxTag(body, "NAME")
        let memo = readOfxTag(body, "MEMO")
        let posted = readOfxTag(body, "DTPOSTED")
        let fitId = readOfxTag(body, "FITID")

        let cleanedAmount = amountText.replacingOccurrences(of: "[^0-9.-]", with: "", options: .regularExpression)
        guard let amount = Double(cleanedAmount), amount.isFinite else { continue }
        let description = (!name.isEmpty && !memo.isEmpty && memo != name ? "\(name) \(memo)" : (name.isEmpty ? memo : name))
            .trimmingCharacters(in: .whitespaces)
        guard !description.isEmpty else { continue }

        let isoDate = parseOfxDate(posted) ?? monthStartDate(fallbackMonth)
        rows.append(buildImportRow(
            rowNumber: index + 1,
            date: isoDate,
            description: description,
            amount: roundToPence(amount),
            bankCategory: "",
            state: state,
            existingHashes: existingHashes,
            externalId: fitId.isEmpty ? nil : fitId
        ))
    }

    return CsvImportResult(
        rows: sortImportRows(rows),
        errors: rows.isEmpty ? ["No transactions were found in this OFX file."] : [],
        detectedColumns: .init(),
        totalRows: blocks.count
    )
}

/// OFX 1.x is SGML: values often run to end-of-line with no closing tag.
private func readOfxTag(_ block: String, _ tag: String) -> String {
    guard let groups = block.firstMatchGroups(of: "<\(tag)>([^<\\r\\n]*)", options: .caseInsensitive) else { return "" }
    return groups[1].trimmingCharacters(in: .whitespaces)
}

private func parseOfxDate(_ value: String) -> String? {
    guard let groups = value.firstMatchGroups(of: #"^(\d{4})(\d{2})(\d{2})"#) else { return nil }
    return formatDateParts(year: Int(groups[1]) ?? 0, month: Int(groups[2]) ?? 0, day: Int(groups[3]) ?? 0)
}

private func splitCaseInsensitive(_ text: String, token: String) -> [Substring] {
    guard let regex = try? NSRegularExpression(pattern: NSRegularExpression.escapedPattern(for: token), options: .caseInsensitive) else {
        return [Substring(text)]
    }
    var pieces: [Substring] = []
    var cursor = text.startIndex
    for match in regex.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
        guard let range = Range(match.range, in: text) else { continue }
        pieces.append(text[cursor..<range.lowerBound])
        cursor = range.upperBound
    }
    pieces.append(text[cursor...])
    return pieces
}

// MARK: - QIF (Quicken Interchange Format)

public func parseQif(text: String, fileName: String, state: LedgerState, fallbackMonthKey: String? = nil) -> CsvImportResult {
    let existingHashes = collectExistingTransactionHashes(state)
    let fallbackMonth = fallbackMonthKey ?? state.selectedMonth
    var rows: [CsvImportRow] = []

    struct Record {
        var date: String?
        var amount: Double?
        var payee: String?
        var memo: String?
        var category: String?
        var isEmpty: Bool { date == nil && amount == nil && payee == nil }
    }
    var record = Record()
    var recordCount = 0

    func flush() {
        recordCount += 1
        let description = (record.payee?.isEmpty == false ? record.payee : record.memo)?.trimmingCharacters(in: .whitespaces) ?? ""
        if !description.isEmpty, let amount = record.amount, amount.isFinite {
            rows.append(buildImportRow(
                rowNumber: recordCount,
                date: record.date ?? monthStartDate(fallbackMonth),
                description: description,
                amount: roundToPence(amount),
                bankCategory: record.category ?? "",
                state: state,
                existingHashes: existingHashes
            ))
        }
        record = Record()
    }

    for rawLine in text.components(separatedBy: .newlines) {
        let line = rawLine.trimmingCharacters(in: .whitespaces)
        guard !line.isEmpty, !line.hasPrefix("!") else { continue }
        let code = line.first!
        let value = String(line.dropFirst()).trimmingCharacters(in: .whitespaces)
        switch code {
        case "^": flush()
        case "D": record.date = parseDateValue(value, fallbackMonth: fallbackMonth) ?? record.date
        case "T", "U": record.amount = parseAmount(value) ?? record.amount
        case "P": record.payee = value
        case "M": record.memo = value
        case "L": record.category = value.replacingOccurrences(of: "[\\[\\]]", with: "", options: .regularExpression)
        default: break
        }
    }
    if !record.isEmpty { flush() }

    return CsvImportResult(
        rows: sortImportRows(rows),
        errors: rows.isEmpty ? ["No transactions were found in this QIF file."] : [],
        detectedColumns: .init(),
        totalRows: recordCount
    )
}

// MARK: - Loose lines (clipboard paste from bank apps, PDFs and spreadsheets)

/// No header row to detect, so each line is parsed independently: a date anywhere,
/// a trailing signed amount, everything else is the description. Unsigned amounts
/// default to spending — the common case when copying a transaction list — and the
/// rule/category pipeline can still flip a row to income (salary wording etc.).
public func parseLooseLines(text: String, fileName: String, state: LedgerState, fallbackMonthKey: String? = nil) -> CsvImportResult {
    let existingHashes = collectExistingTransactionHashes(state)
    let fallbackMonth = fallbackMonthKey ?? state.selectedMonth
    let lines = text.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    var rows: [CsvImportRow] = []

    for (index, line) in lines.enumerated() {
        guard let parsed = parseLooseLine(line, fallbackMonth: fallbackMonth) else { continue }
        rows.append(buildImportRow(
            rowNumber: index + 1,
            date: parsed.date,
            description: parsed.description,
            amount: parsed.amount,
            bankCategory: "",
            state: state,
            existingHashes: existingHashes,
            noteOverride: parsed.signed ? nil : "Assumed spending — flip to income if wrong"
        ))
    }

    return CsvImportResult(
        rows: sortImportRows(rows),
        errors: rows.isEmpty ? ["Couldn’t find lines that look like transactions. Each line needs a description and an amount."] : [],
        detectedColumns: .init(),
        totalRows: lines.count
    )
}

struct LooseLine {
    let date: String
    let description: String
    let amount: Double
    let signed: Bool
}

private let amountTokenPattern = #"^[-+(]?[£$€]?\d[\d,]*(?:\.\d{1,2})?\)?$"#
private let moneyTokenPattern  = #"^[-+(]?[£$€]?\d[\d,]*\.\d{2}\)?$"#

func parseLooseLine(_ line: String, fallbackMonth: String) -> LooseLine? {
    // Cells first: tab, 2+ spaces, or comma separated (spreadsheet / bank web page copies).
    // Thousands separators are collapsed before the comma split so "1,234.56" stays whole.
    let collapsed = line.replacingOccurrences(of: #"(\d),(\d{3})"#, with: "$1$2", options: .regularExpression)
    let cells = collapsed
        .components(separatedBy: CharacterSet(charactersIn: "\t,"))
        .flatMap { $0.components(separatedBy: "  ") }
        .map { $0.trimmingCharacters(in: .whitespaces) }
        .filter { !$0.isEmpty }
    var tokens = cells.count >= 2 ? cells : collapsed.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    guard tokens.count >= 2 else { return nil }

    var amount: Double?
    var amountIndex = -1
    var signed = false
    // Prefer the last amount-looking token — descriptions can contain digits.
    for index in stride(from: tokens.count - 1, through: 0, by: -1) {
        let token = tokens[index]
        guard token.range(of: amountTokenPattern, options: .regularExpression) != nil,
              let parsed = parseAmount(token) else { continue }
        amount = parsed
        amountIndex = index
        signed = token.hasPrefix("-") || token.hasPrefix("+") || token.hasPrefix("(") || token.hasSuffix(")")
        break
    }
    guard var finalAmount = amount else { return nil }

    // "… 42.61 1,234.56": a transaction amount followed by a running balance. Only
    // treat it that way when both tokens carry pence, so "REF 12345 42.61" is left alone.
    if amountIndex > 0,
       tokens[amountIndex].range(of: moneyTokenPattern, options: .regularExpression) != nil,
       tokens[amountIndex - 1].range(of: moneyTokenPattern, options: .regularExpression) != nil,
       let previous = parseAmount(tokens[amountIndex - 1]) {
        tokens.remove(at: amountIndex)
        amountIndex -= 1
        finalAmount = previous
        let token = tokens[amountIndex]
        signed = token.hasPrefix("-") || token.hasPrefix("+") || token.hasPrefix("(") || token.hasSuffix(")")
    }

    var date: String?
    var dateIndexes: Set<Int> = []
    var index = 0
    while index < tokens.count {
        defer { index += 1 }
        if index == amountIndex { continue }
        if let candidate = parseDateValue(tokens[index], fallbackMonth: fallbackMonth) {
            date = candidate
            dateIndexes = [index]
            break
        }
        // "13 Jun" / "Jun 13" style two-token dates.
        if index + 1 < tokens.count, index + 1 != amountIndex,
           let dayMonth = parseDayMonth(tokens[index], tokens[index + 1]),
           let candidate = formatDateParts(year: yearForDayMonth(month: dayMonth.month, fallbackMonth: fallbackMonth),
                                           month: dayMonth.month, day: dayMonth.day) {
            date = candidate
            dateIndexes = [index, index + 1]
            break
        }
    }

    let description = tokens.indices
        .filter { $0 != amountIndex && !dateIndexes.contains($0) }
        .map { tokens[$0] }
        .joined(separator: " ")
        .trimmingCharacters(in: .whitespaces)
    guard !description.isEmpty, description.range(of: #"^\d+$"#, options: .regularExpression) == nil else { return nil }

    // Unsigned amounts read as money out; signed tokens keep their sign.
    return LooseLine(
        date: date ?? monthStartDate(fallbackMonth),
        description: description,
        amount: signed ? finalAmount : -abs(finalAmount),
        signed: signed
    )
}

// MARK: - Bytes → text

/// Decodes a bank export's bytes into text. Most exports are UTF-8, but several UK
/// banks still write Windows-1252 (a bare 0xA3 for "£"), which a strict UTF-8 decode
/// rejects outright and the user sees "Could not read the selected file". Tries
/// UTF-8 (BOM tolerated), UTF-16 with a BOM, then Windows-1252, and strips a leading
/// byte-order mark so the first header cell matches.
public func decodeImportedText(_ data: Data) -> String? {
    let bytes = [UInt8](data)
    var decoded: String?
    if bytes.starts(with: [0xEF, 0xBB, 0xBF]) {
        decoded = String(bytes: bytes.dropFirst(3), encoding: .utf8)
    } else if bytes.starts(with: [0xFF, 0xFE]) || bytes.starts(with: [0xFE, 0xFF]) {
        decoded = String(data: data, encoding: .utf16)
    }
    if decoded == nil { decoded = String(bytes: bytes, encoding: .utf8) }
    if decoded == nil { decoded = decodeWindows1252(bytes) }
    guard var text = decoded else { return nil }
    while text.hasPrefix("\u{FEFF}") { text.removeFirst() }
    return text
}

/// Windows-1252 → String without relying on platform encoding tables (Linux lacks
/// several). Bytes 0x80–0x9F map to the CP1252 punctuation block; the rest is Latin-1.
func decodeWindows1252(_ bytes: [UInt8]) -> String {
    let high: [UInt8: UInt32] = [
        0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
        0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D,
        0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
        0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178,
    ]
    var scalars = String.UnicodeScalarView()
    scalars.reserveCapacity(bytes.count)
    for byte in bytes {
        let value = (0x80...0x9F).contains(byte) ? (high[byte] ?? UInt32(byte)) : UInt32(byte)
        if let scalar = Unicode.Scalar(value) {
            scalars.append(scalar)
        }
    }
    return String(scalars)
}

// MARK: - ISO day helper

public enum TextImportDates {
    /// Parses "yyyy-MM-dd" (or any longer ISO-8601 string) to local midnight on that day.
    public static func isoDay(_ iso: String) -> Date? {
        guard iso.count >= 10 else { return nil }
        let parts = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]), (1...31).contains(parts[2]) else { return nil }
        var components = DateComponents()
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        return ledgerCalendar.date(from: components)
    }
}
