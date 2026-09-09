// ScreenshotImporter.swift
// Stage D2 of docs/AUTOMATION_PLAN.md — import transactions from a screenshot
// of a banking app's transaction list (or a photographed receipt) using
// on-device Vision OCR. Nothing leaves the device.
//
// Pipeline: VNRecognizeTextRequest → text boxes → cluster into visual lines by
// y-position → order fragments by x → parse each line (date anywhere, trailing
// amount, remainder = description) → the same suggestion/dedupe machinery as
// the CSV importer → rows reviewed in the shared ImportReviewSheet.
//
// Accuracy expectations are triage-shaped by design: every parsed row goes
// through review, so an OCR miss is a skipped row, never silent bad data.

import Foundation
import Vision
import UIKit

public enum ScreenshotImportError: Error {
    case unreadableImage
    case noTextFound
    case noTransactionsFound
}

public struct ScreenshotImporter {

    public init() {}

    /// Recognizes text in the screenshot and returns reviewable import rows.
    public func importRows(
        from image: UIImage,
        state: LedgerState,
        fallbackMonthKey: String? = nil
    ) async throws -> [CsvImportRow] {
        guard let cgImage = image.cgImage else { throw ScreenshotImportError.unreadableImage }

        let lines = try await recognizeLines(in: cgImage)
        guard !lines.isEmpty else { throw ScreenshotImportError.noTextFound }

        let fallbackMonth = fallbackMonthKey ?? state.selectedMonth
        let existingHashes = collectHashes(state: state)

        var rows: [CsvImportRow] = []
        for (index, line) in lines.enumerated() {
            guard let parsed = Self.parseTransactionLine(line, fallbackMonth: fallbackMonth) else { continue }

            let suggestion = suggestEntryCategory(description: parsed.description, amount: parsed.amount, rules: state.categoryRules)
            let hash = createTransactionHash(date: parsed.date, description: parsed.description, amount: parsed.amount)
            let duplicate = existingHashes.contains(hash)

            rows.append(CsvImportRow(
                id: "draft-\(index + 1)-\(hash)",
                rowNumber: index + 1,
                date: parsed.date,
                monthKey: String(parsed.date.prefix(7)),
                description: parsed.description,
                amount: parsed.amount,
                rawAmount: String(format: "%.2f", parsed.amount),
                kind: suggestion.kind,
                suggestedKind: suggestion.kind,
                category: suggestion.category,
                suggestedCategory: suggestion.category,
                color: categoryColor(for: suggestion.category),
                include: !duplicate && suggestion.kind != .transfer,
                duplicate: duplicate,
                duplicateOf: nil,
                // OCR rows are inherently less certain — cap below the auto tier
                // so they always land in a review bucket.
                confidence: min(suggestion.confidence, 0.75),
                note: duplicate ? "Possible duplicate" : "From screenshot — check amount",
                hash: hash,
                debtAccountId: suggestion.debtAccountId
            ))
        }

        guard !rows.isEmpty else { throw ScreenshotImportError.noTransactionsFound }
        return rows
    }

    // MARK: - OCR

    /// Runs text recognition and reassembles fragments into visual lines:
    /// observations whose vertical centers sit within half a line-height of
    /// each other belong to the same row of the on-screen table.
    private func recognizeLines(in cgImage: CGImage) async throws -> [String] {
        // VNImageRequestHandler.perform runs the request synchronously and invokes the
        // completion handler before returning, so a continuation is not needed — and
        // resuming one from both the handler and a `catch` would trap. Do the work on a
        // background task and hand back plain values.
        let handlerBox = SendableBox(cgImage)
        return try await Task.detached(priority: .userInitiated) {
            var lines: [String] = []
            var failure: Error?
            let request = VNRecognizeTextRequest { request, error in
                if let error {
                    failure = error
                    return
                }
                let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
                struct Fragment {
                    let text: String
                    let x: CGFloat
                    let yCenter: CGFloat
                    let height: CGFloat
                }
                let fragments: [Fragment] = observations.compactMap { observation in
                    guard let candidate = observation.topCandidates(1).first else { return nil }
                    let box = observation.boundingBox
                    return Fragment(text: candidate.string, x: box.minX, yCenter: box.midY, height: box.height)
                }

                // Cluster by y (Vision's y grows upward; sort top-of-screen first).
                var rows: [[Fragment]] = []
                for fragment in fragments.sorted(by: { $0.yCenter > $1.yCenter }) {
                    if var last = rows.last,
                       let anchor = last.first,
                       abs(anchor.yCenter - fragment.yCenter) < max(anchor.height, fragment.height) * 0.6 {
                        last.append(fragment)
                        rows[rows.count - 1] = last
                    } else {
                        rows.append([fragment])
                    }
                }

                lines = rows.map { row in
                    row.sorted { $0.x < $1.x }.map(\.text).joined(separator: "  ")
                }
            }
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false // merchant names aren't dictionary words

            try VNImageRequestHandler(cgImage: handlerBox.value).perform([request])
            if let failure { throw failure }
            return lines
        }.value
    }

    /// CGImage is thread-safe to read but not marked Sendable; wrap it for the detached task.
    private struct SendableBox: @unchecked Sendable {
        let value: CGImage
        init(_ value: CGImage) { self.value = value }
    }

    // MARK: - Line parsing (mirrors the web app's parseLooseLine)

    struct ParsedLine {
        let date: String
        let description: String
        let amount: Double // negative = money out (default for unsigned amounts)
    }

    static func parseTransactionLine(_ line: String, fallbackMonth: String) -> ParsedLine? {
        // Collapse thousands separators so "1,234.56" survives tokenization.
        let collapsed = line.replacingOccurrences(of: #"(\d),(\d{3})"#, with: "$1$2", options: .regularExpression)
        var tokens = collapsed
            .components(separatedBy: .whitespaces)
            .map { $0.trimmingCharacters(in: CharacterSet(charactersIn: ",")) }
            .filter { !$0.isEmpty }
        guard tokens.count >= 2 else { return nil }

        // Trailing amount (search from the right — descriptions contain digits too).
        var amount: Double?
        var amountIndex = -1
        var signed = false
        for index in stride(from: tokens.count - 1, through: 0, by: -1) {
            let token = tokens[index]
            guard token.range(of: #"^[-+(]?[£$€]?\d[\d]*(?:\.\d{1,2})?\)?$"#, options: .regularExpression) != nil else { continue }
            let cleaned = token.replacingOccurrences(of: #"[£$€,()]"#, with: "", options: .regularExpression)
            guard let value = Double(cleaned.replacingOccurrences(of: "+", with: "")), value != 0 else { continue }
            let parenthesised = token.hasPrefix("(") || token.hasSuffix(")")
            amount = parenthesised ? -abs(value) : value
            signed = token.hasPrefix("-") || token.hasPrefix("+") || parenthesised
            amountIndex = index
            break
        }
        guard var finalAmount = amount else { return nil }
        if !signed { finalAmount = -abs(finalAmount) }

        // Date anywhere: dd/mm(/yy), "13 Jun", "Jun 13".
        var dateIso: String?
        var dateIndexes: Set<Int> = []
        for index in tokens.indices where index != amountIndex {
            if let iso = Self.parseDateToken(tokens[index], fallbackMonth: fallbackMonth) {
                dateIso = iso
                dateIndexes = [index]
                break
            }
            if index + 1 < tokens.count, index + 1 != amountIndex,
               let iso = Self.parseDateToken("\(tokens[index]) \(tokens[index + 1])", fallbackMonth: fallbackMonth) {
                dateIso = iso
                dateIndexes = [index, index + 1]
                break
            }
        }

        let description = tokens.indices
            .filter { $0 != amountIndex && !dateIndexes.contains($0) }
            .map { tokens[$0] }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
        guard !description.isEmpty,
              description.range(of: #"^\d+$"#, options: .regularExpression) == nil else { return nil }

        return ParsedLine(
            date: dateIso ?? "\(fallbackMonth)-01",
            description: description,
            amount: (finalAmount * 100).rounded() / 100
        )
    }

    private static let monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

    static func parseDateToken(_ token: String, fallbackMonth: String) -> String? {
        let lower = token.lowercased().trimmingCharacters(in: .whitespaces)
        let fallbackYear = Int(fallbackMonth.prefix(4)) ?? Calendar.current.component(.year, from: Date())

        // dd/mm or dd/mm/yyyy or dd-mm-yyyy
        if let match = lower.range(of: #"^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$"#, options: .regularExpression) {
            let parts = lower[match].components(separatedBy: CharacterSet(charactersIn: "/-")).compactMap { Int($0) }
            guard parts.count >= 2 else { return nil }
            let day = parts[0], month = parts[1]
            var year = parts.count > 2 ? parts[2] : fallbackYear
            if year < 100 { year += 2000 }
            guard (1...31).contains(day), (1...12).contains(month) else { return nil }
            return String(format: "%04d-%02d-%02d", year, month, day)
        }

        // "13 jun" / "jun 13"
        let words = lower.components(separatedBy: " ").filter { !$0.isEmpty }
        if words.count == 2 {
            let dayFirst = Int(words[0])
            let daySecond = Int(words[1])
            let monthFromFirst = monthNames.firstIndex(where: { words[0].hasPrefix($0) })
            let monthFromSecond = monthNames.firstIndex(where: { words[1].hasPrefix($0) })
            if let day = dayFirst, let monthIndex = monthFromSecond, (1...31).contains(day) {
                return String(format: "%04d-%02d-%02d", fallbackYear, monthIndex + 1, day)
            }
            if let day = daySecond, let monthIndex = monthFromFirst, (1...31).contains(day) {
                return String(format: "%04d-%02d-%02d", fallbackYear, monthIndex + 1, day)
            }
        }

        return nil
    }

    // MARK: - Dedupe

    private func collectHashes(state: LedgerState) -> Set<String> {
        var hashes = Set<String>()
        for (_, month) in state.months {
            for income in month.incomes {
                if let imported = income.imported { hashes.insert(imported.hash) }
                if let date = income.date {
                    hashes.insert(createTransactionHash(date: date, description: income.source, amount: income.amount))
                }
            }
            for expense in month.expenses {
                if let imported = expense.imported { hashes.insert(imported.hash) }
                if let date = expense.date {
                    hashes.insert(createTransactionHash(date: date, description: expense.name, amount: -abs(expense.amount)))
                }
            }
        }
        return hashes
    }
}
