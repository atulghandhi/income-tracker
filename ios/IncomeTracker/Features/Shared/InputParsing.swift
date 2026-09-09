// InputParsing.swift
// Locale-aware parsing of typed money and number fields.
//
// `Double("12,50")` is nil, so a user whose keyboard shows "," on the decimal pad
// (most of Europe) would silently save 0. Accept either separator, strip currency
// symbols, grouping and whitespace, and give the edit forms one place to format
// an amount back into the field.

import Foundation

/// Parses "12.50", "12,50", "£1,250.00", "1 250,00" and friends. nil when there is no number.
public func parseAmountInput(_ text: String) -> Double? {
    var cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleaned.isEmpty else { return nil }
    cleaned = cleaned.replacingOccurrences(of: "[£$€¥₹\\s]", with: "", options: .regularExpression)
    let negative = cleaned.hasPrefix("-") || cleaned.hasPrefix("−") || (cleaned.hasPrefix("(") && cleaned.hasSuffix(")"))
    cleaned = cleaned.replacingOccurrences(of: "[-−()+]", with: "", options: .regularExpression)

    let lastComma = cleaned.lastIndex(of: ",")
    let lastDot = cleaned.lastIndex(of: ".")
    switch (lastComma, lastDot) {
    case let (comma?, dot?):
        // Both present: the later one is the decimal separator.
        if comma > dot {
            cleaned = cleaned.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
        } else {
            cleaned = cleaned.replacingOccurrences(of: ",", with: "")
        }
    case (let comma?, nil):
        // "1,250" is grouping, "12,50" is decimal — three trailing digits means grouping.
        let fraction = cleaned[cleaned.index(after: comma)...]
        if fraction.count == 3, cleaned.filter({ $0 == "," }).count == 1 {
            cleaned = cleaned.replacingOccurrences(of: ",", with: "")
        } else {
            cleaned = cleaned.replacingOccurrences(of: ",", with: ".")
        }
    default:
        break
    }

    guard let value = Double(cleaned), value.isFinite else { return nil }
    return negative ? -value : value
}

/// The amount as it should appear in an editable field: two decimals, no grouping,
/// using the user's decimal separator so the decimal pad can edit it.
public func formatAmountInput(_ amount: Double, fractionDigits: Int = 2) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.usesGroupingSeparator = false
    formatter.minimumFractionDigits = fractionDigits
    formatter.maximumFractionDigits = fractionDigits
    return formatter.string(from: NSNumber(value: amount)) ?? String(format: "%.\(fractionDigits)f", amount)
}

/// Whole-number fields (days, months): tolerant of stray spaces and decimals.
public func parseIntegerInput(_ text: String) -> Int? {
    guard let value = parseAmountInput(text) else { return nil }
    return Int(value.rounded())
}
