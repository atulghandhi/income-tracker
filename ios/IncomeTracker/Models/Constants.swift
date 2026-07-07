// Constants.swift
// Port of finance.ts constants.

import Foundation

// MARK: - Schema / defaults

public let CURRENT_SCHEMA_VERSION = 8
public let DEFAULT_INVESTMENT_RETURN = 6.0

/// Asset account classes (excludes "debt").
public let ASSET_CLASSES: [AccountClass] = [.cash, .savings, .investment]

// MARK: - Color palette (matches finance.ts `colors` array)

public let CATEGORY_COLORS: [String] = [
    "#12b886",
    "#6c5ce7",
    "#ff6b6b",
    "#f59f00",
    "#15aabf",
    "#845ef7",
    "#51cf66",
    "#ff922b",
]

// MARK: - Currency options (mirrors finance.ts `currencyOptions`)

public struct CurrencyOption: Hashable {
    public let code: CurrencyCode
    public let label: String
    public let locale: String

    public init(code: CurrencyCode, label: String, locale: String) {
        self.code = code
        self.label = label
        self.locale = locale
    }
}

public let CURRENCY_OPTIONS: [CurrencyOption] = [
    CurrencyOption(code: .gbp, label: "GBP (£)", locale: "en-GB"),
    CurrencyOption(code: .usd, label: "USD ($)", locale: "en-US"),
    CurrencyOption(code: .eur, label: "EUR (€)", locale: "en-IE"),
    CurrencyOption(code: .cad, label: "CAD ($)", locale: "en-CA"),
    CurrencyOption(code: .aud, label: "AUD ($)", locale: "en-AU"),
    CurrencyOption(code: .inr, label: "INR (₹)", locale: "en-IN"),
    CurrencyOption(code: .jpy, label: "JPY (¥)", locale: "ja-JP"),
]
