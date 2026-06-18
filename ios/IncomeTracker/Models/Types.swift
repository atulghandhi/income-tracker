// Types.swift
// Mirror of src/types.ts — Codable JSON must stay wire-compatible with the web app.
// camelCase keys and identical enum raw string values are required for Supabase sync.

import Foundation

// MARK: - Currency

public enum CurrencyCode: String, Codable, Hashable, CaseIterable {
    case gbp = "GBP"
    case usd = "USD"
    case eur = "EUR"
    case cad = "CAD"
    case aud = "AUD"
    case inr = "INR"
    case jpy = "JPY"
}

// MARK: - Transaction / entry primitives

public struct ImportedTransactionMeta: Codable, Hashable {
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
}

public struct IncomeEntry: Codable, Identifiable, Hashable {
    public var id: String
    public var source: String
    public var amount: Double
    public var color: String
    public var recurring: Bool
    public var date: String?
    public var imported: ImportedTransactionMeta?

    public init(
        id: String,
        source: String,
        amount: Double,
        color: String,
        recurring: Bool,
        date: String? = nil,
        imported: ImportedTransactionMeta? = nil
    ) {
        self.id = id
        self.source = source
        self.amount = amount
        self.color = color
        self.recurring = recurring
        self.date = date
        self.imported = imported
    }
}

public struct ExpenseEntry: Codable, Identifiable, Hashable {
    public var id: String
    public var name: String
    public var category: String
    public var amount: Double
    public var color: String
    public var recurring: Bool
    public var date: String?
    public var imported: ImportedTransactionMeta?

    public init(
        id: String,
        name: String,
        category: String,
        amount: Double,
        color: String,
        recurring: Bool,
        date: String? = nil,
        imported: ImportedTransactionMeta? = nil
    ) {
        self.id = id
        self.name = name
        self.category = category
        self.amount = amount
        self.color = color
        self.recurring = recurring
        self.date = date
        self.imported = imported
    }
}

// MARK: - Goals

public enum GoalFundingMode: String, Codable, Hashable {
    case fixed = "fixed"
    case fill = "fill"
    case auto = "auto"
}

public struct SavingsGoal: Codable, Identifiable, Hashable {
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
}

// MARK: - Budget month

public struct MonthBudget: Codable, Hashable {
    public var incomes: [IncomeEntry]
    public var expenses: [ExpenseEntry]
    public var note: String

    public init(incomes: [IncomeEntry] = [], expenses: [ExpenseEntry] = [], note: String = "") {
        self.incomes = incomes
        self.expenses = expenses
        self.note = note
    }

    public static let empty = MonthBudget(incomes: [], expenses: [], note: "")
}

// MARK: - Import

public struct ImportedTransactionRef: Codable, Hashable {
    public var monthKey: String
    public var entryId: String
    public var kind: TransactionKind

    public init(monthKey: String, entryId: String, kind: TransactionKind) {
        self.monthKey = monthKey
        self.entryId = entryId
        self.kind = kind
    }
}

public struct ImportBatch: Codable, Identifiable, Hashable {
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
}

// MARK: - Transaction kind

public enum TransactionKind: String, Codable, Hashable {
    case income = "income"
    case expense = "expense"
    case debtPayment = "debt-payment"
    case transfer = "transfer"
}

// MARK: - Category rules

public struct CategoryRule: Codable, Identifiable, Hashable {
    public var id: String
    public var pattern: String
    public var category: String
    public var kind: TransactionKind
    public var createdAt: String
    public var updatedAt: String

    public init(
        id: String,
        pattern: String,
        category: String,
        kind: TransactionKind,
        createdAt: String,
        updatedAt: String
    ) {
        self.id = id
        self.pattern = pattern
        self.category = category
        self.kind = kind
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - Account types

/// High-level class: determines how the balance affects net worth and which fields are relevant.
public enum AccountClass: String, Codable, Hashable {
    case cash = "cash"
    case savings = "savings"
    case investment = "investment"
    case debt = "debt"
}

/// Union of DebtAccountType | AssetAccountType — raw values must match TypeScript strings.
public enum AccountType: String, Codable, Hashable {
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
}

public struct Account: Codable, Identifiable, Hashable {
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
        self.includeInNetWorth = includeInNetWorth
        self.color = color
        self.note = note
    }
}

// Back-compat alias matching the TypeScript `type DebtAccount = Account`.
public typealias DebtAccount = Account

// MARK: - Ledger state

public struct LedgerState: Codable, Hashable {
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
            lastSavedAt: ISO8601DateFormatter().string(from: .now)
        )
    }
}

// MARK: - Derived / computed types

public struct Projection: Codable, Hashable {
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

public struct DebtSummary: Codable, Hashable {
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

public struct AssetSummary: Codable, Hashable {
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

public struct NetWorthSummary: Codable, Hashable {
    public var netWorth: Double
    public var totalAssets: Double
    public var totalDebt: Double

    public init(netWorth: Double, totalAssets: Double, totalDebt: Double) {
        self.netWorth = netWorth
        self.totalAssets = totalAssets
        self.totalDebt = totalDebt
    }
}

public struct NetWorthPoint: Codable, Hashable {
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

public struct MonthlyFlowPoint: Codable, Hashable {
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

public enum FinancialSignalTone: String, Codable, Hashable {
    case good = "good"
    case info = "info"
    case warning = "warning"
    case danger = "danger"
}

public struct FinancialSignal: Codable, Identifiable, Hashable {
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

public struct HealthScoreBreakdown: Codable, Hashable {
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

public struct GoalMonthPointPerGoal: Codable, Hashable {
    public var accumulated: Double
    public var contribution: Double
    public var complete: Bool

    public init(accumulated: Double, contribution: Double, complete: Bool) {
        self.accumulated = accumulated
        self.contribution = contribution
        self.complete = complete
    }
}

public struct GoalMonthPoint: Codable, Hashable {
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

public enum GoalStatus: String, Codable, Hashable {
    case complete = "complete"
    case onTrack = "on-track"
    case tight = "tight"
    case atRisk = "at-risk"
    case noDeadline = "no-deadline"
}

public struct GoalOutcome: Codable, Hashable {
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

public struct GoalSequenceResult: Codable, Hashable {
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

/// Returns the current month as a "yyyy-MM" string.
public func getMonthKey(date: Date = .now) -> String {
    let cal = Calendar.current
    let year = cal.component(.year, from: date)
    let month = cal.component(.month, from: date)
    return String(format: "%04d-%02d", year, month)
}

/// Shifts a "yyyy-MM" key by `offset` months.
public func shiftMonth(_ key: String, by offset: Int) -> String {
    let parts = key.split(separator: "-")
    guard parts.count == 2,
          let year = Int(parts[0]),
          let month = Int(parts[1]) else { return key }
    // Use DateComponents arithmetic to handle wrap-around correctly.
    var comps = DateComponents()
    comps.year = year
    comps.month = month
    comps.day = 1
    guard let base = Calendar.current.date(from: comps),
          let shifted = Calendar.current.date(byAdding: .month, value: offset, to: base) else { return key }
    return getMonthKey(date: shifted)
}

/// Returns a human-readable string like "June 2025" from a "yyyy-MM" key.
public func formatMonth(_ key: String) -> String {
    let parts = key.split(separator: "-")
    guard parts.count == 2,
          let year = Int(parts[0]),
          let month = Int(parts[1]) else { return key }
    var comps = DateComponents()
    comps.year = year
    comps.month = month
    comps.day = 1
    guard let date = Calendar.current.date(from: comps) else { return key }
    let fmt = DateFormatter()
    fmt.dateFormat = "MMMM yyyy"
    fmt.locale = Locale(identifier: "en")
    return fmt.string(from: date)
}

/// Creates a prefixed ID using a UUID, e.g. `"inc_A1B2C3D4"`.
public func createId(prefix: String) -> String {
    let short = UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(8)
    return "\(prefix)_\(short)"
}
