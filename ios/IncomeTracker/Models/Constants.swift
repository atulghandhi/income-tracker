// Constants.swift
// Port of finance.ts constants.

import Foundation

// MARK: - Schema / defaults

public let CURRENT_SCHEMA_VERSION = 8
public let DEFAULT_INVESTMENT_RETURN = 6.0

/// Asset account classes (excludes "debt").
public let ASSET_CLASSES: [AccountClass] = [.cash, .savings, .investment]

// MARK: - Color palette (matches finance.ts `colors` array, same order)

/// Shared entry/category palette. Index parity with the web matters: both
/// clients fall back to `colors[index % colors.count]` for entries without a
/// stored colour, so a ledger must render identically after a sync.
public let CATEGORY_COLORS: [String] = [
    "#2f7fdd",
    "#1baf7a",
    "#c98500",
    "#008300",
    "#7a6cd6",
    "#e05656",
    "#d55181",
    "#e26030",
]

/// Palette colour for an index, wrapping like the web's `colors[index % colors.length]`.
public func paletteColor(at index: Int) -> String {
    CATEGORY_COLORS[((index % CATEGORY_COLORS.count) + CATEGORY_COLORS.count) % CATEGORY_COLORS.count]
}

// MARK: - Account type tables (mirrors ACCOUNT_TYPE_OPTIONS / DEFAULT_TYPE_BY_CLASS in App.tsx)

public struct AccountTypeOption: Hashable, Sendable {
    public let value: AccountType
    public let label: String
}

public let ACCOUNT_TYPE_OPTIONS: [AccountClass: [AccountTypeOption]] = [
    .debt: [
        AccountTypeOption(value: .creditCard, label: "Credit card"),
        AccountTypeOption(value: .loan, label: "Loan"),
        AccountTypeOption(value: .overdraft, label: "Overdraft"),
        AccountTypeOption(value: .other, label: "Other"),
    ],
    .cash: [
        AccountTypeOption(value: .current, label: "Current"),
        AccountTypeOption(value: .otherAsset, label: "Other cash"),
    ],
    .savings: [
        AccountTypeOption(value: .savingsAccount, label: "Savings"),
        AccountTypeOption(value: .isa, label: "Cash ISA"),
        AccountTypeOption(value: .otherAsset, label: "Other"),
    ],
    .investment: [
        AccountTypeOption(value: .investment, label: "Investment / stocks"),
        AccountTypeOption(value: .isa, label: "Stocks & shares ISA"),
        AccountTypeOption(value: .pension, label: "Pension"),
        AccountTypeOption(value: .otherAsset, label: "Other"),
    ],
]

public let DEFAULT_TYPE_BY_CLASS: [AccountClass: AccountType] = [
    .debt: .creditCard,
    .cash: .current,
    .savings: .savingsAccount,
    .investment: .investment,
]

/// The sub-type to store for an account class when the stored one is missing or
/// belongs to a different class (the web does the same in `normalizeAccounts`).
public func resolveAccountType(_ candidate: AccountType?, for accountClass: AccountClass) -> AccountType {
    let valid = ACCOUNT_TYPE_OPTIONS[accountClass] ?? []
    if let candidate, valid.contains(where: { $0.value == candidate }) { return candidate }
    return DEFAULT_TYPE_BY_CLASS[accountClass] ?? .other
}

// MARK: - Currency options (mirrors finance.ts `currencyOptions`)

public struct CurrencyOption: Hashable, Sendable {
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
