// Types.swift
// Mirror of src/types.ts — Codable JSON must stay wire-compatible with the web app.
// camelCase keys and identical enum raw string values are required for Supabase sync.
//
// Decoding is deliberately tolerant (see LenientDecoding.swift): the same JSON blob
// is written by the web app, by earlier iOS builds and by hand-edited backups, so a
// missing or malformed field falls back to the web's `normalizeState()` default
// instead of failing the whole load. Encoding stays synthesized and strict.

import Foundation

// MARK: - Currency

public enum CurrencyCode: String, Codable, Hashable, CaseIterable, Sendable {
    case gbp = "GBP"
    case usd = "USD"
    case eur = "EUR"
    case cad = "CAD"
    case aud = "AUD"
    case inr = "INR"
    case jpy = "JPY"

    /// Unknown currency codes fall back to GBP, like the web's currencyOptions guard.
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = CurrencyCode(rawValue: raw.uppercased()) ?? .gbp
    }
}

// MARK: - Transaction / entry primitives

public struct ImportedTransactionMeta: Codable, Hashable, Sendable {
    public var batchId: String
    public var fileName: String
    public var rowNumber: Int
    public var hash: String
    public var originalDescription: String
    public var importedAt: String

    public init(
        batchId: String,
        fileName: String,
        rowNumber: Int,
        hash: String,
        originalDescription: String,
        importedAt: String
    ) {
        self.batchId = batchId
        self.fileName = fileName
        self.rowNumber = rowNumber
        self.hash = hash
        self.originalDescription = originalDescription
        self.importedAt = importedAt
    }

    enum CodingKeys: String, CodingKey {
        case batchId, fileName, rowNumber, hash, originalDescription, importedAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        batchId = c.lenientString(.batchId, default: "")
        fileName = c.lenientString(.fileName, default: "Imported CSV")
        rowNumber = c.lenientInt(.rowNumber, default: 0)
        hash = c.lenientString(.hash, default: "")
        originalDescription = c.lenientString(.originalDescription, default: "")
        importedAt = c.lenientNonEmptyString(.importedAt) ?? isoTimestampNow()
    }
}

/// Set on entries auto-copied into a new month because their source entry was
/// recurring (mirrors SeededFromRef in src/types.ts). Must round-trip through
/// Codable so cloud sync never strips web-created provenance.
public struct SeededFromRef: Codable, Hashable, Sendable {
    public var monthKey: String
    public var entryId: String

    public init(monthKey: String, entryId: String) {
        self.monthKey = monthKey
        self.entryId = entryId
    }

    enum CodingKeys: String, CodingKey {
        case monthKey, entryId
    }

    /// A reference missing either half is meaningless — fail so the parent drops it.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let monthKey = c.lenientNonEmptyString(.monthKey),
              let entryId = c.lenientNonEmptyString(.entryId) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath,
                                                   debugDescription: "Incomplete seededFrom reference"))
        }
        self.monthKey = monthKey
        self.entryId = entryId
    }
}

public struct IncomeEntry: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var source: String
    public var amount: Double
    public var color: String
    public var recurring: Bool
    public var date: String?
    public var imported: ImportedTransactionMeta?
    public var seededFrom: SeededFromRef?
    /// Which layer decided the category ("user" is never overridden by automation).
    /// Mirrors CategorySource in src/types.ts; kept as a raw string for forward compatibility.
    public var categorySource: String?

    public init(
        id: String,
        source: String,
        amount: Double,
        color: String,
        recurring: Bool,
        date: String? = nil,
        imported: ImportedTransactionMeta? = nil,
        seededFrom: SeededFromRef? = nil,
        categorySource: String? = nil
    ) {
        self.id = id
        self.source = source
        self.amount = amount
        self.color = color
        self.recurring = recurring
        self.date = date
        self.imported = imported
        self.seededFrom = seededFrom
        self.categorySource = categorySource
    }

    enum CodingKeys: String, CodingKey {
        case id, source, amount, color, recurring, date, imported, seededFrom, categorySource
    }

    /// Mirrors `normalizeMonths` in App.tsx. An empty colour is filled in by the
    /// owning MonthBudget (the palette index depends on the entry's position).
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.lenientNonEmptyString(.id) ?? createId(prefix: "income")
        source = c.lenientString(.source) ?? "Imported income"
        amount = c.lenientDouble(.amount, default: 0)
        color = c.lenientString(.color) ?? ""
        date = c.lenientNonEmptyString(.date)
        imported = c.lenientValue(ImportedTransactionMeta.self, .imported)
        seededFrom = c.lenientValue(SeededFromRef.self, .seededFrom)
        categorySource = c.lenientNonEmptyString(.categorySource)
        // Migration: untagged manual entries become recurring, imported rows become one-off.
        recurring = c.lenientOptionalBool(.recurring) ?? (imported == nil)
    }
}

public struct ExpenseEntry: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var category: String
    public var amount: Double
    public var color: String
    public var recurring: Bool
    public var date: String?
    public var imported: ImportedTransactionMeta?
    /// Links this payment to a debt account. For any month that has linked payments, their sum
    /// replaces that account's scheduled monthly payment in the balance roll-forward.
    public var debtAccountId: String?
    public var seededFrom: SeededFromRef?
    /// See IncomeEntry.categorySource.
    public var categorySource: String?

    public init(
        id: String,
        name: String,
        category: String,
        amount: Double,
        color: String,
        recurring: Bool,
        date: String? = nil,
        imported: ImportedTransactionMeta? = nil,
        debtAccountId: String? = nil,
        seededFrom: SeededFromRef? = nil,
        categorySource: String? = nil
    ) {
        self.id = id
        self.name = name
        self.category = category
        self.amount = amount
        self.color = color
        self.recurring = recurring
        self.date = date
        self.imported = imported
        self.debtAccountId = debtAccountId
        self.seededFrom = seededFrom
        self.categorySource = categorySource
    }

    enum CodingKeys: String, CodingKey {
        case id, name, category, amount, color, recurring, date, imported, debtAccountId, seededFrom, categorySource
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.lenientNonEmptyString(.id) ?? createId(prefix: "expense")
        name = c.lenientString(.name) ?? "Imported expense"
        category = c.lenientString(.category) ?? ""
        amount = c.lenientDouble(.amount, default: 0)
        color = c.lenientString(.color) ?? ""
        date = c.lenientNonEmptyString(.date)
        imported = c.lenientValue(ImportedTransactionMeta.self, .imported)
        debtAccountId = c.lenientNonEmptyString(.debtAccountId)
        seededFrom = c.lenientValue(SeededFromRef.self, .seededFrom)
        categorySource = c.lenientNonEmptyString(.categorySource)
        recurring = c.lenientOptionalBool(.recurring) ?? (imported == nil)
    }
}

// MARK: - Goals

public enum GoalFundingMode: String, Codable, Hashable, Sendable {
    case fixed = "fixed"
    case fill = "fill"
    case auto = "auto"

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = GoalFundingMode(rawValue: raw) ?? .fixed
    }
}

public struct SavingsGoal: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var target: Double
    public var saved: Double
    public var color: String
    public var priority: Int
    public var fundingMode: GoalFundingMode
    public var monthlyAmount: Double
    public var deadlineMonths: Int
    public var interestRate: Double
    public var note: String
    public var createdAt: String

    public init(
        id: String,
        name: String,
        target: Double,
        saved: Double,
        color: String,
        priority: Int,
        fundingMode: GoalFundingMode,
        monthlyAmount: Double,
        deadlineMonths: Int,
        interestRate: Double,
        note: String,
        createdAt: String
    ) {
        self.id = id
        self.name = name
        self.target = target
        self.saved = saved
        self.color = color
        self.priority = priority
        self.fundingMode = fundingMode
        self.monthlyAmount = monthlyAmount
        self.deadlineMonths = deadlineMonths
        self.interestRate = interestRate
        self.note = note
        self.createdAt = createdAt
    }

    enum CodingKeys: String, CodingKey {
        case id, name, target, saved, color, priority, fundingMode, monthlyAmount,
             deadlineMonths, interestRate, note, createdAt
    }

    /// Mirrors `normalizeGoals`. Colour "" and priority 0 mean "not stored" and are
    /// filled by position in LedgerState's decoder.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.lenientNonEmptyString(.id) ?? createId(prefix: "goal")
        name = c.lenientString(.name) ?? "Goal"
        target = c.lenientDouble(.target, default: 0)
        saved = c.lenientDouble(.saved, default: 0)
        color = c.lenientString(.color) ?? ""
        priority = c.lenientOptionalInt(.priority) ?? 0
        fundingMode = c.lenientValue(GoalFundingMode.self, .fundingMode) ?? .fixed
        monthlyAmount = c.lenientDouble(.monthlyAmount, default: 0)
        deadlineMonths = c.lenientInt(.deadlineMonths, default: 0)
        interestRate = c.lenientDouble(.interestRate, default: 0)
        note = c.lenientString(.note) ?? ""
        createdAt = c.lenientNonEmptyString(.createdAt) ?? isoTimestampNow()
    }
}

// MARK: - Budget month

public struct MonthBudget: Codable, Hashable, Sendable {
    public var incomes: [IncomeEntry]
    public var expenses: [ExpenseEntry]
    public var note: String

    public init(incomes: [IncomeEntry] = [], expenses: [ExpenseEntry] = [], note: String = "") {
        self.incomes = incomes
        self.expenses = expenses
        self.note = note
    }

    public static let empty = MonthBudget(incomes: [], expenses: [], note: "")

    enum CodingKeys: String, CodingKey {
        case incomes, expenses, note
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        var incomes = c.lenientArray(IncomeEntry.self, .incomes)
        var expenses = c.lenientArray(ExpenseEntry.self, .expenses)
        // Same palette fallback as the web: incomes start at index 0, expenses at 2.
        for index in incomes.indices where incomes[index].color.isEmpty {
            incomes[index].color = paletteColor(at: index)
        }
        for index in expenses.indices where expenses[index].color.isEmpty {
            expenses[index].color = paletteColor(at: index + 2)
        }
        self.incomes = incomes
        self.expenses = expenses
        note = c.lenientString(.note) ?? ""
    }
}

// MARK: - Import

public struct ImportedTransactionRef: Codable, Hashable, Sendable {
    public var monthKey: String
    public var entryId: String
    public var kind: TransactionKind

    public init(monthKey: String, entryId: String, kind: TransactionKind) {
        self.monthKey = monthKey
        self.entryId = entryId
        self.kind = kind
    }

    enum CodingKeys: String, CodingKey {
        case monthKey, entryId, kind
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let monthKey = c.lenientNonEmptyString(.monthKey),
              let entryId = c.lenientNonEmptyString(.entryId) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath,
                                                   debugDescription: "Incomplete transaction reference"))
        }
        self.monthKey = monthKey
        self.entryId = entryId
        kind = c.lenientValue(TransactionKind.self, .kind) ?? .expense
    }
}

public struct ImportBatch: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var fileName: String
    public var importedAt: String
    public var totalRows: Int
    public var importedRows: Int
    public var skippedRows: Int
    public var transactionRefs: [ImportedTransactionRef]

    public init(
        id: String,
        fileName: String,
        importedAt: String,
        totalRows: Int,
        importedRows: Int,
        skippedRows: Int,
        transactionRefs: [ImportedTransactionRef]
    ) {
        self.id = id
        self.fileName = fileName
        self.importedAt = importedAt
        self.totalRows = totalRows
        self.importedRows = importedRows
        self.skippedRows = skippedRows
        self.transactionRefs = transactionRefs
    }

    enum CodingKeys: String, CodingKey {
        case id, fileName, importedAt, totalRows, importedRows, skippedRows, transactionRefs
    }

    /// Mirrors `normalizeImportBatches`.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.lenientNonEmptyString(.id) ?? createId(prefix: "batch")
        fileName = c.lenientNonEmptyString(.fileName) ?? "Imported CSV"
        importedAt = c.lenientNonEmptyString(.importedAt) ?? isoTimestampNow()
        totalRows = c.lenientInt(.totalRows, default: 0)
        importedRows = c.lenientInt(.importedRows, default: 0)
        skippedRows = c.lenientInt(.skippedRows, default: 0)
        transactionRefs = c.lenientArray(ImportedTransactionRef.self, .transactionRefs)
    }
}

// MARK: - Transaction kind

public enum TransactionKind: String, Codable, Hashable, Sendable {
    case income = "income"
    case expense = "expense"
    case debtPayment = "debt-payment"
    case transfer = "transfer"

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = TransactionKind(rawValue: raw) ?? .expense
    }
}

// MARK: - Category rules

public struct CategoryRule: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var pattern: String
    public var category: String
    public var kind: TransactionKind
    /// For debt-payment rules: future imports matching this pattern auto-link to this account.
    public var debtAccountId: String?
    public var createdAt: String
    public var updatedAt: String

    public init(
        id: String,
        pattern: String,
        category: String,
        kind: TransactionKind,
        debtAccountId: String? = nil,
        createdAt: String,
        updatedAt: String
    ) {
        self.id = id
        self.pattern = pattern
        self.category = category
        self.kind = kind
        self.debtAccountId = debtAccountId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case id, pattern, category, kind, debtAccountId, createdAt, updatedAt
    }

    /// Mirrors `normalizeCategoryRules`: rules without a pattern or category are dropped
    /// (the decode fails, and the owning array skips the element).
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let pattern = (c.lenientString(.pattern) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let category = (c.lenientString(.category) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !pattern.isEmpty, !category.isEmpty else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath,
                                                   debugDescription: "Category rule without pattern or category"))
        }
        id = c.lenientNonEmptyString(.id) ?? createId(prefix: "rule")
        self.pattern = pattern
        self.category = category
        kind = c.lenientValue(TransactionKind.self, .kind) ?? .expense
        debtAccountId = c.lenientNonEmptyString(.debtAccountId)
        let now = isoTimestampNow()
        createdAt = c.lenientNonEmptyString(.createdAt) ?? now
        updatedAt = c.lenientNonEmptyString(.updatedAt) ?? now
    }
}

// MARK: - Account types

/// High-level class: determines how the balance affects net worth and which fields are relevant.
public enum AccountClass: String, Codable, Hashable, Sendable {
    case cash = "cash"
    case savings = "savings"
    case investment = "investment"
    case debt = "debt"

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = AccountClass(rawValue: raw) ?? .debt
    }
}

/// Union of DebtAccountType | AssetAccountType — raw values must match TypeScript strings.
public enum AccountType: String, Codable, Hashable, Sendable {
    // Debt sub-types
    case creditCard = "credit-card"
    case loan = "loan"
    case overdraft = "overdraft"
    case other = "other"
    // Asset sub-types
    case current = "current"
    case savingsAccount = "savings"
    case isa = "isa"
    case investment = "investment"
    case pension = "pension"
    case otherAsset = "other-asset"

    /// Unknown sub-types decode as `.other`; `Account` then re-resolves against the class.
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = AccountType(rawValue: raw) ?? .other
    }
}

public struct Account: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var accountClass: AccountClass
    public var type: AccountType
    public var balance: Double
    public var rate: Double
    public var promoRate: Double
    public var promoMonths: Int
    /// Assets only: monthly surplus routed into this account.
    public var monthlyContribution: Double
    /// Debt only.
    public var creditLimit: Double
    public var minimumPayment: Double
    public var dueDay: Int
    /// Month key ("yyyy-MM") the stored balance was last set in. Debt balances are rolled
    /// forward from this anchor to the current month by `FinanceEngine.rollForwardDebtBalances`.
    /// nil is treated as "anchored to the current month" (no roll-forward).
    public var balanceAsOf: String?
    public var includeInNetWorth: Bool
    public var color: String
    public var note: String

    public init(
        id: String,
        name: String,
        accountClass: AccountClass,
        type: AccountType,
        balance: Double,
        rate: Double,
        promoRate: Double,
        promoMonths: Int,
        monthlyContribution: Double,
        creditLimit: Double,
        minimumPayment: Double,
        dueDay: Int,
        balanceAsOf: String? = nil,
        includeInNetWorth: Bool,
        color: String,
        note: String
    ) {
        self.id = id
        self.name = name
        self.accountClass = accountClass
        self.type = type
        self.balance = balance
        self.rate = rate
        self.promoRate = promoRate
        self.promoMonths = promoMonths
        self.monthlyContribution = monthlyContribution
        self.creditLimit = creditLimit
        self.minimumPayment = minimumPayment
        self.dueDay = dueDay
        self.balanceAsOf = balanceAsOf
        self.includeInNetWorth = includeInNetWorth
        self.color = color
        self.note = note
    }

    enum CodingKeys: String, CodingKey {
        case id, name, accountClass, type, balance, rate, promoRate, promoMonths,
             monthlyContribution, creditLimit, minimumPayment, dueDay, balanceAsOf,
             includeInNetWorth, color, note
    }

    /// Keys written by schema < 5 (`debts[]` entries) that still need to load.
    private enum LegacyCodingKeys: String, CodingKey {
        case apr, interestFreeMonths
    }

    /// Mirrors `normalizeAccounts`, including the legacy `apr` → `rate` and
    /// `interestFreeMonths` → `promoMonths` migration. Colour "" is filled by position
    /// in LedgerState's decoder.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let legacy = try decoder.container(keyedBy: LegacyCodingKeys.self)
        let accountClass = c.lenientValue(AccountClass.self, .accountClass) ?? .debt
        let isDebt = accountClass == .debt

        id = c.lenientNonEmptyString(.id) ?? createId(prefix: "account")
        name = c.lenientNonEmptyString(.name) ?? (isDebt ? "Debt account" : "Account")
        self.accountClass = accountClass
        type = resolveAccountType(c.lenientValue(AccountType.self, .type), for: accountClass)
        balance = c.lenientDouble(.balance, default: 0)
        rate = c.lenientOptionalDouble(.rate) ?? legacy.lenientDouble(.apr, default: 0)
        promoRate = max(0, c.lenientDouble(.promoRate, default: 0))
        let rawPromoMonths = c.lenientOptionalDouble(.promoMonths)
            ?? legacy.lenientDouble(.interestFreeMonths, default: 0)
        promoMonths = clampWholeNumber(rawPromoMonths, max: 120)
        monthlyContribution = isDebt ? 0 : max(0, c.lenientDouble(.monthlyContribution, default: 0))
        creditLimit = isDebt ? c.lenientDouble(.creditLimit, default: 0) : 0
        minimumPayment = isDebt ? c.lenientDouble(.minimumPayment, default: 0) : 0
        dueDay = isDebt ? clampDueDay(c.lenientDouble(.dueDay, default: 1)) : 1
        // v7 → v8: pre-existing balances anchor to the month this version first loads.
        let storedAsOf = c.lenientString(.balanceAsOf)
        balanceAsOf = isValidMonthKey(storedAsOf) ? storedAsOf : getMonthKey()
        includeInNetWorth = c.lenientOptionalBool(.includeInNetWorth) ?? true
        color = c.lenientString(.color) ?? ""
        note = c.lenientString(.note) ?? ""
    }
}

// Back-compat alias matching the TypeScript `type DebtAccount = Account`.
public typealias DebtAccount = Account

// MARK: - Ledger state

public struct LedgerState: Codable, Hashable, Sendable {
    public var schemaVersion: Int
    public var currency: CurrencyCode
    public var selectedMonth: String
    /// Keyed by "yyyy-MM".
    public var months: [String: MonthBudget]
    public var goals: [SavingsGoal]
    /// null = derive from live ledger recurring surplus.
    public var goalPlannerSurplus: Double?
    public var goalsHorizonMonths: Int
    /// null = show goals[0].
    public var ledgerGoalId: String?
    public var savingsTarget: Double
    public var accounts: [Account]
    public var assumedInvestmentReturn: Double
    public var categoryRules: [CategoryRule]
    public var importBatches: [ImportBatch]
    public var privacyMode: Bool
    /// Stage C opt-in (web-controlled today); optional so Codable round-trips it.
    public var aiCategorizationEnabled: Bool?
    public var lastSavedAt: String

    public init(
        schemaVersion: Int,
        currency: CurrencyCode,
        selectedMonth: String,
        months: [String: MonthBudget],
        goals: [SavingsGoal],
        goalPlannerSurplus: Double?,
        goalsHorizonMonths: Int,
        ledgerGoalId: String?,
        savingsTarget: Double,
        accounts: [Account],
        assumedInvestmentReturn: Double,
        categoryRules: [CategoryRule],
        importBatches: [ImportBatch],
        privacyMode: Bool,
        aiCategorizationEnabled: Bool? = nil,
        lastSavedAt: String
    ) {
        self.schemaVersion = schemaVersion
        self.currency = currency
        self.selectedMonth = selectedMonth
        self.months = months
        self.goals = goals
        self.goalPlannerSurplus = goalPlannerSurplus
        self.goalsHorizonMonths = goalsHorizonMonths
        self.ledgerGoalId = ledgerGoalId
        self.savingsTarget = savingsTarget
        self.accounts = accounts
        self.assumedInvestmentReturn = assumedInvestmentReturn
        self.categoryRules = categoryRules
        self.importBatches = importBatches
        self.privacyMode = privacyMode
        self.aiCategorizationEnabled = aiCategorizationEnabled
        self.lastSavedAt = lastSavedAt
    }

    public static var initial: LedgerState {
        let month = getMonthKey()
        return LedgerState(
            schemaVersion: CURRENT_SCHEMA_VERSION,
            currency: .gbp,
            selectedMonth: month,
            months: [month: .empty],
            goals: [],
            goalPlannerSurplus: nil,
            goalsHorizonMonths: 60,
            ledgerGoalId: nil,
            savingsTarget: 20,
            accounts: [],
            assumedInvestmentReturn: DEFAULT_INVESTMENT_RETURN,
            categoryRules: [],
            importBatches: [],
            privacyMode: false,
            aiCategorizationEnabled: false,
            lastSavedAt: isoTimestampNow()
        )
    }

    /// True once the user has put transactions or accounts into the ledger (mirrors
    /// `hasLocalData` in App.tsx). Used at hydration to decide whether cloud data can
    /// simply replace an untouched local state.
    public var hasLocalData: Bool {
        months.values.contains { !$0.incomes.isEmpty || !$0.expenses.isEmpty } || !accounts.isEmpty
    }

    /// Exact structural equality that ignores bookkeeping fields (`lastSavedAt`,
    /// `selectedMonth`, `schemaVersion`). Used to tell "the user opened another month"
    /// apart from "ledger data changed".
    public func isEquivalent(to other: LedgerState) -> Bool {
        var a = self
        var b = other
        a.lastSavedAt = ""; b.lastSavedAt = ""
        a.selectedMonth = ""; b.selectedMonth = ""
        a.schemaVersion = 0; b.schemaVersion = 0
        return a == b
    }

    /// The web's `statesAreEquivalent`: same month keys, same entry counts and the same
    /// amount totals per month. Coarse on purpose — it exists to avoid a spurious
    /// conflict prompt when the same ledger is opened again after a sync.
    public func isRoughlyEquivalent(to other: LedgerState) -> Bool {
        let keysA = months.keys.sorted()
        let keysB = other.months.keys.sorted()
        guard keysA == keysB else { return false }
        for key in keysA {
            guard let a = months[key], let b = other.months[key] else { return false }
            if a.incomes.count != b.incomes.count || a.expenses.count != b.expenses.count { return false }
            let sumA = a.incomes.reduce(0) { $0 + $1.amount } + a.expenses.reduce(0) { $0 + $1.amount }
            let sumB = b.incomes.reduce(0) { $0 + $1.amount } + b.expenses.reduce(0) { $0 + $1.amount }
            if abs(sumA - sumB) >= 0.01 { return false }
        }
        return true
    }

    enum CodingKeys: String, CodingKey {
        case schemaVersion, currency, selectedMonth, months, goals, goalPlannerSurplus,
             goalsHorizonMonths, ledgerGoalId, savingsTarget, accounts, assumedInvestmentReturn,
             categoryRules, importBatches, privacyMode, aiCategorizationEnabled, lastSavedAt
    }

    /// Keys written by schema < 7 (`goal`) and < 5 (`debts`).
    private enum LegacyCodingKeys: String, CodingKey {
        case goal, debts
    }

    /// The v6 single-goal shape, migrated into `goals[]` on load.
    private struct LegacyGoal: Decodable {
        var id: String?
        var name: String
        var target: Double
        var saved: Double

        enum CodingKeys: String, CodingKey { case id, name, target, saved }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = c.lenientNonEmptyString(.id)
            name = c.lenientString(.name) ?? ""
            target = c.lenientDouble(.target, default: 0)
            saved = c.lenientDouble(.saved, default: 0)
        }
    }

    /// Mirrors `normalizeState` in App.tsx. Never throws for a JSON object: every
    /// field has a default. (Non-object JSON still fails, as it should.)
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let legacy = try decoder.container(keyedBy: LegacyCodingKeys.self)
        let currentMonth = getMonthKey()

        schemaVersion = CURRENT_SCHEMA_VERSION
        currency = c.lenientValue(CurrencyCode.self, .currency) ?? .gbp

        var months = c.lenientDictionary(MonthBudget.self, .months)
        if months.isEmpty { months = [currentMonth: .empty] }
        self.months = months
        // Keep the stored month so the store's launch-time snap can seed today's
        // month from it (the web seeds from the last-worked month the same way).
        let storedMonth = c.lenientString(.selectedMonth)
        selectedMonth = isValidMonthKey(storedMonth) ? storedMonth! : currentMonth

        // v6 → v7: single `goal` → `goals[]`.
        var goals: [SavingsGoal]
        if (try? c.nestedUnkeyedContainer(forKey: .goals)) != nil {
            goals = c.lenientArray(SavingsGoal.self, .goals)
        } else if let old = legacy.lenientValue(LegacyGoal.self, .goal), !old.name.isEmpty || old.target > 0 {
            goals = [SavingsGoal(
                id: old.id ?? createId(prefix: "goal"),
                name: old.name.isEmpty ? "Savings goal" : old.name,
                target: old.target,
                saved: old.saved,
                color: paletteColor(at: 0),
                priority: 1,
                fundingMode: .fixed,
                monthlyAmount: 0,
                deadlineMonths: 0,
                interestRate: 0,
                note: "",
                createdAt: isoTimestampNow()
            )]
        } else {
            goals = []
        }
        for index in goals.indices {
            if goals[index].color.isEmpty { goals[index].color = paletteColor(at: index) }
            if goals[index].priority <= 0 { goals[index].priority = index + 1 }
        }
        self.goals = goals

        goalPlannerSurplus = c.lenientOptionalDouble(.goalPlannerSurplus)
        let horizon = c.lenientOptionalInt(.goalsHorizonMonths) ?? 0
        goalsHorizonMonths = horizon > 0 ? horizon : 60
        ledgerGoalId = c.lenientNonEmptyString(.ledgerGoalId)
        savingsTarget = c.lenientDouble(.savingsTarget, default: 20)

        // Schema < 5 stored debts[]; the Account decoder handles the field renames.
        var accounts: [Account]
        if (try? c.nestedUnkeyedContainer(forKey: .accounts)) != nil {
            accounts = c.lenientArray(Account.self, .accounts)
        } else {
            accounts = legacy.lenientArray(Account.self, .debts)
        }
        for index in accounts.indices where accounts[index].color.isEmpty {
            accounts[index].color = paletteColor(at: index)
        }
        self.accounts = accounts

        assumedInvestmentReturn = c.lenientOptionalDouble(.assumedInvestmentReturn)
            .map { max(-50, min(50, $0)) } ?? DEFAULT_INVESTMENT_RETURN
        categoryRules = c.lenientArray(CategoryRule.self, .categoryRules)
        importBatches = c.lenientArray(ImportBatch.self, .importBatches)
        privacyMode = c.lenientBool(.privacyMode, default: false)
        aiCategorizationEnabled = c.lenientOptionalBool(.aiCategorizationEnabled) ?? false
        lastSavedAt = c.lenientNonEmptyString(.lastSavedAt) ?? isoTimestampNow()
    }
}

// MARK: - Derived / computed types

public struct Projection: Codable, Hashable, Sendable {
    public var monthlyIncome: Double
    public var monthlyExpenses: Double
    public var monthlySurplus: Double
    public var recurringMonthlyIncome: Double
    public var recurringMonthlyExpenses: Double
    public var recurringMonthlySurplus: Double
    public var annualIncome: Double
    public var annualExpenses: Double
    public var annualSurplus: Double
    public var savingsRate: Double
    public var paidTotal: Double
    public var unpaidTotal: Double
    public var oneOffCount: Int

    public init(
        monthlyIncome: Double,
        monthlyExpenses: Double,
        monthlySurplus: Double,
        recurringMonthlyIncome: Double,
        recurringMonthlyExpenses: Double,
        recurringMonthlySurplus: Double,
        annualIncome: Double,
        annualExpenses: Double,
        annualSurplus: Double,
        savingsRate: Double,
        paidTotal: Double,
        unpaidTotal: Double,
        oneOffCount: Int
    ) {
        self.monthlyIncome = monthlyIncome
        self.monthlyExpenses = monthlyExpenses
        self.monthlySurplus = monthlySurplus
        self.recurringMonthlyIncome = recurringMonthlyIncome
        self.recurringMonthlyExpenses = recurringMonthlyExpenses
        self.recurringMonthlySurplus = recurringMonthlySurplus
        self.annualIncome = annualIncome
        self.annualExpenses = annualExpenses
        self.annualSurplus = annualSurplus
        self.savingsRate = savingsRate
        self.paidTotal = paidTotal
        self.unpaidTotal = unpaidTotal
        self.oneOffCount = oneOffCount
    }
}

public struct DebtSummary: Codable, Hashable, Sendable {
    public var totalDebt: Double
    public var totalCreditLimit: Double
    public var availableCredit: Double
    public var utilization: Double
    public var monthlyMinimums: Double
    public var weightedApr: Double
    public var nextDueDay: Int?

    public init(
        totalDebt: Double,
        totalCreditLimit: Double,
        availableCredit: Double,
        utilization: Double,
        monthlyMinimums: Double,
        weightedApr: Double,
        nextDueDay: Int?
    ) {
        self.totalDebt = totalDebt
        self.totalCreditLimit = totalCreditLimit
        self.availableCredit = availableCredit
        self.utilization = utilization
        self.monthlyMinimums = monthlyMinimums
        self.weightedApr = weightedApr
        self.nextDueDay = nextDueDay
    }
}

public struct AssetSummary: Codable, Hashable, Sendable {
    public var totalAssets: Double
    public var totalCash: Double
    public var totalSavings: Double
    public var totalInvestments: Double
    public var monthlyContributions: Double
    public var weightedAssetRate: Double

    public init(
        totalAssets: Double,
        totalCash: Double,
        totalSavings: Double,
        totalInvestments: Double,
        monthlyContributions: Double,
        weightedAssetRate: Double
    ) {
        self.totalAssets = totalAssets
        self.totalCash = totalCash
        self.totalSavings = totalSavings
        self.totalInvestments = totalInvestments
        self.monthlyContributions = monthlyContributions
        self.weightedAssetRate = weightedAssetRate
    }
}

public struct NetWorthSummary: Codable, Hashable, Sendable {
    public var netWorth: Double
    public var totalAssets: Double
    public var totalDebt: Double

    public init(netWorth: Double, totalAssets: Double, totalDebt: Double) {
        self.netWorth = netWorth
        self.totalAssets = totalAssets
        self.totalDebt = totalDebt
    }
}

public struct NetWorthPoint: Codable, Hashable, Identifiable, Sendable {
    public var id: Int { monthIndex }
    public var monthIndex: Int
    public var label: String
    public var netWorth: Double
    public var assetBalance: Double
    public var cashBalance: Double
    public var savingsBalance: Double
    public var investmentBalance: Double
    public var debtBalance: Double
    public var interestCharged: Double
    public var growthEarned: Double

    public init(
        monthIndex: Int,
        label: String,
        netWorth: Double,
        assetBalance: Double,
        cashBalance: Double,
        savingsBalance: Double,
        investmentBalance: Double,
        debtBalance: Double,
        interestCharged: Double,
        growthEarned: Double
    ) {
        self.monthIndex = monthIndex
        self.label = label
        self.netWorth = netWorth
        self.assetBalance = assetBalance
        self.cashBalance = cashBalance
        self.savingsBalance = savingsBalance
        self.investmentBalance = investmentBalance
        self.debtBalance = debtBalance
        self.interestCharged = interestCharged
        self.growthEarned = growthEarned
    }
}

public struct MonthlyFlowPoint: Codable, Hashable, Identifiable, Sendable {
    public var id: String { monthKey }
    public var monthKey: String
    public var label: String
    public var income: Double
    public var expenses: Double
    public var surplus: Double
    public var hasData: Bool

    public init(monthKey: String, label: String, income: Double, expenses: Double, surplus: Double, hasData: Bool) {
        self.monthKey = monthKey
        self.label = label
        self.income = income
        self.expenses = expenses
        self.surplus = surplus
        self.hasData = hasData
    }
}

public enum FinancialSignalTone: String, Codable, Hashable, Sendable {
    case good = "good"
    case info = "info"
    case warning = "warning"
    case danger = "danger"
}

public struct FinancialSignal: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var title: String
    public var summary: String
    public var detail: String
    public var tone: FinancialSignalTone

    public init(id: String, title: String, summary: String, detail: String, tone: FinancialSignalTone) {
        self.id = id
        self.title = title
        self.summary = summary
        self.detail = detail
        self.tone = tone
    }
}

public struct HealthScoreBreakdown: Codable, Hashable, Sendable {
    public var score: Double
    public var estimatedCreditScore: Double
    public var cashFlowScore: Double
    public var debtLoadScore: Double
    public var utilizationScore: Double
    public var paymentPressureScore: Double
    public var savingsScore: Double
    public var summary: String
    public var detail: String
    public var noData: Bool

    public init(
        score: Double,
        estimatedCreditScore: Double,
        cashFlowScore: Double,
        debtLoadScore: Double,
        utilizationScore: Double,
        paymentPressureScore: Double,
        savingsScore: Double,
        summary: String,
        detail: String,
        noData: Bool
    ) {
        self.score = score
        self.estimatedCreditScore = estimatedCreditScore
        self.cashFlowScore = cashFlowScore
        self.debtLoadScore = debtLoadScore
        self.utilizationScore = utilizationScore
        self.paymentPressureScore = paymentPressureScore
        self.savingsScore = savingsScore
        self.summary = summary
        self.detail = detail
        self.noData = noData
    }
}

// MARK: - Goal sequencing

public struct GoalMonthPointPerGoal: Codable, Hashable, Sendable {
    public var accumulated: Double
    public var contribution: Double
    public var complete: Bool

    public init(accumulated: Double, contribution: Double, complete: Bool) {
        self.accumulated = accumulated
        self.contribution = contribution
        self.complete = complete
    }
}

public struct GoalMonthPoint: Codable, Hashable, Sendable {
    /// 1-based index in the simulation.
    public var month: Int
    public var label: String
    /// Keyed by goal ID.
    public var perGoal: [String: GoalMonthPointPerGoal]
    public var unallocated: Double

    public init(month: Int, label: String, perGoal: [String: GoalMonthPointPerGoal], unallocated: Double) {
        self.month = month
        self.label = label
        self.perGoal = perGoal
        self.unallocated = unallocated
    }
}

public enum GoalStatus: String, Codable, Hashable, Sendable {
    case complete = "complete"
    case onTrack = "on-track"
    case tight = "tight"
    case atRisk = "at-risk"
    case noDeadline = "no-deadline"
}

public struct GoalOutcome: Codable, Hashable, Sendable {
    public var goalId: String
    public var name: String
    public var color: String
    public var target: Double
    /// nil = not reached within horizon.
    public var completionMonth: Int?
    public var completionDate: String?
    public var shortfall: Double
    public var extraMonthlyNeeded: Double
    public var extraMonthsNeeded: Double
    public var status: GoalStatus

    public init(
        goalId: String,
        name: String,
        color: String,
        target: Double,
        completionMonth: Int?,
        completionDate: String?,
        shortfall: Double,
        extraMonthlyNeeded: Double,
        extraMonthsNeeded: Double,
        status: GoalStatus
    ) {
        self.goalId = goalId
        self.name = name
        self.color = color
        self.target = target
        self.completionMonth = completionMonth
        self.completionDate = completionDate
        self.shortfall = shortfall
        self.extraMonthlyNeeded = extraMonthlyNeeded
        self.extraMonthsNeeded = extraMonthsNeeded
        self.status = status
    }
}

public struct GoalSequenceResult: Codable, Hashable, Sendable {
    public var timeline: [GoalMonthPoint]
    public var goals: [GoalOutcome]
    public var horizonMonths: Int
    public var avgUnallocatedSurplus: Double

    public init(timeline: [GoalMonthPoint], goals: [GoalOutcome], horizonMonths: Int, avgUnallocatedSurplus: Double) {
        self.timeline = timeline
        self.goals = goals
        self.horizonMonths = horizonMonths
        self.avgUnallocatedSurplus = avgUnallocatedSurplus
    }
}


// MARK: - Helpers (mirrored from finance.ts)

/// Calendar for every month-key and date computation. Month keys are Gregorian
/// "yyyy-MM" strings shared with the web, whatever calendar the device prefers
/// (a Buddhist or Japanese system calendar must never produce "2569-09").
public let ledgerCalendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    return calendar
}()

/// Returns the current month as a "yyyy-MM" string.
public func getMonthKey(date: Date = .now) -> String {
    let year = ledgerCalendar.component(.year, from: date)
    let month = ledgerCalendar.component(.month, from: date)
    return String(format: "%04d-%02d", year, month)
}

/// Splits a "yyyy-MM" key into its parts; nil when malformed.
public func parseMonthKey(_ key: String) -> (year: Int, month: Int)? {
    let parts = key.split(separator: "-")
    guard parts.count == 2, parts[0].count == 4, parts[1].count == 2,
          let year = Int(parts[0]), let month = Int(parts[1]),
          (1...12).contains(month) else { return nil }
    return (year, month)
}

/// Mirrors `isValidMonthKey` in finance.ts ("yyyy-MM").
public func isValidMonthKey(_ value: String?) -> Bool {
    guard let value else { return false }
    return parseMonthKey(value) != nil
}

/// Shifts a "yyyy-MM" key by `offset` months. Pure arithmetic — no calendar or
/// time zone can shift it by a day and land in the wrong month.
public func shiftMonth(_ key: String, by offset: Int) -> String {
    guard let (year, month) = parseMonthKey(key) else { return key }
    let index = year * 12 + (month - 1) + offset
    let shiftedYear = index >= 0 ? index / 12 : (index - 11) / 12
    let shiftedMonth = index - shiftedYear * 12 + 1
    return String(format: "%04d-%02d", shiftedYear, shiftedMonth)
}

/// Number of days in the month of a "yyyy-MM" key (28 for a malformed key).
public func daysInMonth(monthKey: String) -> Int {
    guard let (year, month) = parseMonthKey(monthKey) else { return 28 }
    var components = DateComponents()
    components.year = year
    components.month = month
    components.day = 1
    guard let date = ledgerCalendar.date(from: components),
          let range = ledgerCalendar.range(of: .day, in: .month, for: date) else { return 28 }
    return range.count
}

/// Whole months from `fromMonthKey` to `toMonthKey` (negative when going back).
public func monthsBetween(_ fromMonthKey: String, _ toMonthKey: String) -> Int {
    guard let from = parseMonthKey(fromMonthKey), let to = parseMonthKey(toMonthKey) else { return 0 }
    return (to.year - from.year) * 12 + (to.month - from.month)
}

/// Returns a human-readable string like "June 2025" from a "yyyy-MM" key.
public func formatMonth(_ key: String) -> String {
    guard let (year, month) = parseMonthKey(key) else { return key }
    var comps = DateComponents()
    comps.year = year
    comps.month = month
    comps.day = 1
    guard let date = ledgerCalendar.date(from: comps) else { return key }
    let fmt = DateFormatter()
    fmt.calendar = ledgerCalendar
    fmt.dateFormat = "MMMM yyyy"
    fmt.locale = Locale(identifier: "en")
    return fmt.string(from: date)
}

/// Mirrors `clampDueDay`: 1...31, rounded; 1 for non-finite input.
public func clampDueDay(_ value: Double) -> Int {
    guard value.isFinite else { return 1 }
    return max(1, min(31, Int(value.rounded())))
}

/// Mirrors `clampWholeNumber`: 0...max, rounded; 0 for non-finite input.
public func clampWholeNumber(_ value: Double, max upper: Int = 600) -> Int {
    guard value.isFinite else { return 0 }
    return max(0, min(upper, Int(value.rounded())))
}

/// Creates a prefixed ID in the web's `createId` format, e.g. `"expense-1b4e28ba-…"`.
/// Both clients write into the same ledger, so the shape must match.
public func createId(prefix: String) -> String {
    "\(prefix)-\(UUID().uuidString.lowercased())"
}

// MARK: - Timestamps

/// ISO-8601 with millisecond precision — the same shape the web's
/// `new Date().toISOString()` writes, so `lastSavedAt` compares like-for-like.
public func isoTimestamp(_ date: Date) -> String {
    let fmt = ISO8601DateFormatter()
    fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fmt.string(from: date)
}

public func isoTimestampNow() -> String {
    isoTimestamp(.now)
}

/// Parses a timestamp written by either client: with fractional seconds (web, current
/// iOS) or without (earlier iOS builds). nil when unparseable.
public func parseIsoTimestamp(_ value: String) -> Date? {
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = withFraction.date(from: value) { return date }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: value)
}
