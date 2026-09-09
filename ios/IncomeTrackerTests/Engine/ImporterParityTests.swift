// ImporterParityTests.swift
//
// Cross-client parity for the pieces that must behave identically on the web and
// on iOS: duplicate hashes, merchant normalisation, quick-add parsing, CSV parsing
// (Windows line endings included), the import commit, lenient decoding of legacy
// JSON, and the recurring-payment detector. The expected values were generated
// from the TypeScript sources (src/importer.ts, src/quickAdd.ts) with tsx.

import XCTest
@testable import IncomeTracker

final class ImporterParityTests: XCTestCase {

    private var monthKey = ""
    private var state = LedgerState.initial
    private var memory = MerchantMemory.empty

    override func setUp() {
        super.setUp()
        monthKey = getMonthKey()
        state = LedgerState.initial
        state.months[monthKey] = MonthBudget(
            incomes: [IncomeEntry(id: "i1", source: "Salary", amount: 2400, color: "#2f7fdd", recurring: true, date: "\(monthKey)-01")],
            expenses: [
                ExpenseEntry(id: "e1", name: "Netflix", category: "Subscriptions", amount: 15.99, color: "#7a6cd6", recurring: true, date: "\(monthKey)-05"),
                ExpenseEntry(id: "e2", name: "Tesco", category: "Food", amount: 42.61, color: "#1baf7a", recurring: false, date: "\(monthKey)-06"),
            ],
            note: ""
        )
        memory = MerchantMemory(state: state)
    }

    // MARK: Hashes and merchant text

    func testTransactionHashMatchesWeb() {
        let vectors: [(String, String, Double, String)] = [
            ("2026-09-01", "TESCO STORES 3412", -23.4, "6pe5g"),
            ("2026-09-02", "Netflix.com", -15.99, "gxx4br"),
            ("2026-09-03", "SALARY ACME LTD", 2400, "lzq0as"),
            ("2026-09-04", "Card payment to AMEX", -250, "9adl49"),
            ("2026-09-05", "Costa Coffee", -0.125, "x2eutj"),
            ("2026-09-06", "Zero", 0, "4utk5x"),
            ("2026-09-07", "Neg zero", -0.0, "fon9fq"),
            ("2026-09-08", "Ünïcode Café ☕", -4.5, "hhqxso"),
        ]
        for (date, description, amount, expected) in vectors {
            XCTAssertEqual(createTransactionHash(date: date, description: description, amount: amount), expected, description)
        }
    }

    func testMerchantNormalisationMatchesWeb() {
        XCTAssertEqual(normalizeMerchant("Card payment to AMEX"), "to amex")
        XCTAssertEqual(canonicalizeMerchant("Netflix.com"), "netflix")
        XCTAssertEqual(buildRulePattern(from: "TESCO STORES 3412"), "tesco stores")
        XCTAssertEqual(buildRulePattern(from: "Ünïcode Café ☕"), "code caf")
    }

    func testJsToFixedSemantics() {
        XCTAssertEqual(jsToFixed2(-0.125), "-0.13")
        XCTAssertEqual(jsToFixed2(0.125), "0.13")
        XCTAssertEqual(jsToFixed2(-0.0), "0.00")
        XCTAssertEqual(jsToFixed2(-0.001), "-0.00")
        XCTAssertEqual(jsToFixed2(1234.5), "1234.50")
    }

    // MARK: Quick add

    func testQuickAddMatchesWeb() throws {
        let today = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-15T12:00:00Z"))

        guard case .ok(let costa) = parseQuickAdd("costa 4.35", state: state, memory: memory, monthKey: monthKey, today: today) else { return XCTFail("costa") }
        XCTAssertEqual(costa.kind, .expense)
        XCTAssertEqual(costa.description, "costa")
        XCTAssertEqual(costa.amount, 4.35, accuracy: 1e-9)
        XCTAssertEqual(costa.category, "Food")
        XCTAssertEqual(costa.categorySource, "system")
        XCTAssertNil(costa.date)

        guard case .ok(let salary) = parseQuickAdd("salary 2400 recurring", state: state, memory: memory, monthKey: monthKey, today: today) else { return XCTFail("salary") }
        XCTAssertEqual(salary.kind, .income)
        XCTAssertEqual(salary.description, "Salary")
        XCTAssertTrue(salary.recurring)

        guard case .ok(let tesco) = parseQuickAdd("tesco 42.61 yesterday", state: state, memory: memory, monthKey: monthKey, today: today) else { return XCTFail("tesco") }
        XCTAssertEqual(tesco.description, "Tesco")
        XCTAssertEqual(tesco.date, "2026-09-14")
        XCTAssertEqual(tesco.categorySource, "rule")

        guard case .ok(let rent) = parseQuickAdd("rent 950 on 1st", state: state, memory: memory, monthKey: monthKey, today: today) else { return XCTFail("rent") }
        XCTAssertEqual(rent.date, "2026-09-01")
        XCTAssertEqual(rent.category, "Home")

        guard case .ok(let uber) = parseQuickAdd("Uber £18.20 monthly", state: state, memory: memory, monthKey: monthKey, today: today) else { return XCTFail("uber") }
        XCTAssertEqual(uber.amount, 18.2, accuracy: 1e-9)
        XCTAssertTrue(uber.recurring)
        XCTAssertEqual(uber.category, "Travel")

        for input in ["netflix", "just words", "12.50"] {
            guard case .error = parseQuickAdd(input, state: state, memory: memory, monthKey: monthKey, today: today) else {
                return XCTFail("\(input) should not parse")
            }
        }
    }

    // MARK: CSV

    private let crlfCsv = "Date,Description,Amount\r\n01/09/2026,TESCO STORES 3412,-23.40\r\n02/09/2026,SALARY ACME LTD,2400.00\r\n03/09/2026,Transfer to savings,-100.00\r\n"

    func testWindowsLineEndingsParseAsRows() {
        let parsed = parseBankText(text: crlfCsv, fileName: "statement.csv", state: state)
        XCTAssertTrue(parsed.errors.isEmpty, "\(parsed.errors)")
        XCTAssertEqual(parsed.rows.count, 3)
        XCTAssertEqual(parsed.rows.map(\.hash), ["wq8vjr", "cczsor", "6pe5g"])
        XCTAssertEqual(parsed.rows.map(\.kind), [.transfer, .income, .expense])
        XCTAssertEqual(parsed.rows.map(\.include), [false, true, true])
        XCTAssertEqual(parsed.rows.map(\.category), ["Transfers", "Income", "Food"])
    }

    func testTextDecodingFallsBackToWindows1252() {
        XCTAssertEqual(decodeImportedText(Data([0x44, 0x61, 0x74, 0x65, 0x2C, 0xA3, 0x0A])), "Date,£\n")
        XCTAssertEqual(decodeImportedText(Data([0xEF, 0xBB, 0xBF]) + Data("Date,Amount\n".utf8)), "Date,Amount\n")
    }

    // MARK: Commit

    func testCommitMirrorsWebSemantics() throws {
        let parsed = parseBankText(text: crlfCsv, fileName: "statement.csv", state: state)
        var committed = state
        let previousMonth = shiftMonth(monthKey, by: -1)
        committed.months[previousMonth] = MonthBudget(expenses: [
            ExpenseEntry(id: "old", name: "Transfer to savings", category: "Unsorted", amount: 100, color: "#e05656", recurring: false, date: "\(previousMonth)-10"),
        ])
        var rows = parsed.rows
        if let idx = rows.firstIndex(where: { $0.kind == .expense }) { rows[idx].category = "" }

        let result = commitImport(rows: rows, into: &committed, fileName: "statement.csv", totalRows: parsed.totalRows)
        XCTAssertEqual(result.importedRows, 2)
        XCTAssertEqual(result.learnedTransferPatterns, 1)
        XCTAssertEqual(result.sweptEntries, 1)
        XCTAssertEqual(committed.months[previousMonth]?.expenses.count, 0)

        let month = try XCTUnwrap(committed.months[monthKey])
        let importedExpense = try XCTUnwrap(month.expenses.first { $0.imported != nil })
        XCTAssertTrue(importedExpense.id.hasPrefix("expense-"))
        XCTAssertEqual(importedExpense.category, "Unsorted")
        XCTAssertEqual(importedExpense.amount, 23.4)
        XCTAssertFalse(importedExpense.recurring)
        XCTAssertTrue(try XCTUnwrap(month.incomes.first { $0.imported != nil }).id.hasPrefix("income-"))

        XCTAssertEqual(committed.importBatches.first?.id, result.batch?.id)
        XCTAssertEqual(committed.importBatches.first?.totalRows, 3)
        XCTAssertEqual(committed.importBatches.first?.skippedRows, 1)
        XCTAssertTrue(committed.categoryRules.contains { $0.kind == .transfer })
        XCTAssertTrue(committed.categoryRules.contains { $0.pattern == "salary acme ltd" && $0.kind == .income })
        XCTAssertFalse(committed.categoryRules.contains { $0.category == "Unsorted" })

        var undone = committed
        removeImportBatch(from: &undone, batchId: try XCTUnwrap(result.batch?.id))
        XCTAssertEqual(undone.months[monthKey]?.expenses.count, month.expenses.count - 1)
        XCTAssertFalse(undone.importBatches.contains { $0.id == result.batch?.id })
    }

    func testLearnCategoryRuleLeavesHumanSortedEntriesAlone() {
        var learned = state
        learned.months[monthKey]?.expenses.append(ExpenseEntry(
            id: "auto", name: "TESCO STORES 3412", category: "Unsorted", amount: 9, color: "#000000", recurring: false,
            imported: ImportedTransactionMeta(batchId: "b", fileName: "f", rowNumber: 1, hash: "h", originalDescription: "TESCO STORES 3412", importedAt: isoTimestampNow())
        ))
        learned.months[monthKey]?.expenses.append(ExpenseEntry(id: "manual", name: "Tesco Stores", category: "Groceries", amount: 5, color: "#000000", recurring: false))
        let applied = learnCategoryRule(in: &learned, description: "TESCO STORES 3412", category: "Food", kind: .expense)
        XCTAssertEqual(applied, 1)
        XCTAssertEqual(learned.months[monthKey]?.expenses.first { $0.id == "auto" }?.category, "Food")
        XCTAssertEqual(learned.months[monthKey]?.expenses.first { $0.id == "manual" }?.category, "Groceries")
    }

    // MARK: Lenient decoding

    func testLegacyJsonDecodesWithWebDefaults() throws {
        let json = """
        {
          "schemaVersion": 6,
          "currency": "XXX",
          "selectedMonth": "not-a-month",
          "months": {"2025-12": {"incomes": [{"id": "", "source": "Pay", "amount": "1200"}], "expenses": [{"name": "Rent", "amount": 900}, 7, null]}, "bad": "nope"},
          "goal": {"name": "Holiday", "target": 500, "saved": 120},
          "debts": [{"name": "Card", "balance": 1200, "apr": 21.9, "interestFreeMonths": 500, "type": "current", "dueDay": 45}],
          "goalsHorizonMonths": 0,
          "assumedInvestmentReturn": 99,
          "categoryRules": [{"pattern": "", "category": "Food"}, {"pattern": " TESCO ", "category": "Food", "kind": "bogus"}],
          "privacyMode": 1
        }
        """
        let decoded = try JSONDecoder().decode(LedgerState.self, from: Data(json.utf8))
        XCTAssertEqual(decoded.currency, .gbp)
        XCTAssertTrue(isValidMonthKey(decoded.selectedMonth))
        XCTAssertEqual(decoded.months.keys.sorted(), ["2025-12"])
        let month = try XCTUnwrap(decoded.months["2025-12"])
        XCTAssertEqual(month.incomes.first?.amount, 1200)
        XCTAssertTrue(month.incomes.first?.recurring ?? false)
        XCTAssertEqual(month.incomes.first?.color, paletteColor(at: 0))
        XCTAssertEqual(month.expenses.count, 1)
        XCTAssertEqual(month.expenses.first?.color, paletteColor(at: 2))
        XCTAssertEqual(decoded.goals.first?.name, "Holiday")
        XCTAssertEqual(decoded.goals.first?.priority, 1)
        let account = try XCTUnwrap(decoded.accounts.first)
        XCTAssertEqual(account.accountClass, .debt)
        XCTAssertEqual(account.rate, 21.9)
        XCTAssertEqual(account.promoMonths, 120)
        XCTAssertEqual(account.type, .creditCard)
        XCTAssertEqual(account.dueDay, 31)
        XCTAssertEqual(decoded.goalsHorizonMonths, 60)
        XCTAssertEqual(decoded.assumedInvestmentReturn, 50)
        XCTAssertEqual(decoded.categoryRules.map(\.pattern), ["tesco"])
        XCTAssertEqual(decoded.categoryRules.first?.kind, .expense)
        XCTAssertTrue(decoded.privacyMode)
        XCTAssertFalse(decoded.lastSavedAt.isEmpty)
    }

    func testRoundTripIsLossless() throws {
        let data = try JSONEncoder().encode(state)
        let back = try JSONDecoder().decode(LedgerState.self, from: data)
        XCTAssertEqual(back, state)
        XCTAssertNil(try? JSONDecoder().decode(LedgerState.self, from: Data("[]".utf8)))
    }

    // MARK: Helpers

    func testMonthHelpers() {
        XCTAssertEqual(shiftMonth("2026-01", by: -1), "2025-12")
        XCTAssertEqual(shiftMonth("2026-12", by: 1), "2027-01")
        XCTAssertEqual(shiftMonth("2026-06", by: -18), "2024-12")
        XCTAssertEqual(daysInMonth(monthKey: "2024-02"), 29)
        XCTAssertEqual(FinanceEngine.seedEntryDate("2026-01-31", toKey: "2026-02"), "2026-02-28")
        XCTAssertEqual(FinanceEngine.seedEntryDate("2026-01-15T00:00:00Z", toKey: "2026-03"), "2026-03-15")
        XCTAssertEqual(clampDueDay(45), 31)
        XCTAssertEqual(clampWholeNumber(500, max: 120), 120)
        XCTAssertTrue(createId(prefix: "expense").hasPrefix("expense-"))
        XCTAssertNotNil(parseIsoTimestamp("2026-09-09T10:11:12Z"))
        XCTAssertNotNil(parseIsoTimestamp("2026-09-09T10:11:12.345Z"))
        XCTAssertEqual(FinanceEngine.netWorthOutlook(accounts: [], recurringMonthlySurplus: 0, horizonMonths: -5, assumedInvestmentReturn: 6).count, 1)
    }

    func testAmountInputParsing() {
        XCTAssertEqual(parseAmountInput("12,50"), 12.5)
        XCTAssertEqual(parseAmountInput("£1,250.00"), 1250)
        XCTAssertEqual(parseAmountInput("1 250,00"), 1250)
        XCTAssertEqual(parseAmountInput("(30)"), -30)
        XCTAssertNil(parseAmountInput("abc"))
    }

    // MARK: Recurrence and memory

    func testRecurrenceDetectionAndReconciliation() throws {
        var recurring = LedgerState.initial
        for offset in (0..<4).reversed() {
            let key = shiftMonth(monthKey, by: -offset)
            recurring.months[key] = MonthBudget(expenses: [
                ExpenseEntry(id: "n\(offset)", name: "Netflix", category: "Subscriptions", amount: 15.99, color: "#7a6cd6", recurring: false, date: "\(key)-05"),
                ExpenseEntry(id: "r\(offset)", name: "Random \(offset)", category: "Food", amount: Double(10 + offset * 7), color: "#1baf7a", recurring: false, date: "\(key)-1\(offset)"),
            ])
        }
        XCTAssertEqual(MerchantMemory(state: recurring).find(.expense, text: "Netflix")?.stableAmount, 15.99)
        let candidates = Recurrence.detectCandidates(recurring)
        XCTAssertTrue(candidates.contains { $0.label.lowercased().contains("netflix") && $0.cadence == .monthly })
        XCTAssertFalse(candidates.contains { $0.label.lowercased().contains("random") })
        let suggestion = try XCTUnwrap(Recurrence.suggestRecurringFlags(recurring).first { $0.label.lowercased().contains("netflix") })
        let flagged = Recurrence.applyRecurringFlag(recurring, candidate: suggestion)
        XCTAssertTrue(flagged.months[monthKey]?.expenses.first { $0.name == "Netflix" }?.recurring ?? false)

        let previousMonth = shiftMonth(monthKey, by: -1)
        let seeded = MonthBudget(expenses: [
            ExpenseEntry(id: "seed", name: "Netflix", category: "Subscriptions", amount: 15.99, color: "#7a6cd6", recurring: true, date: "\(monthKey)-05", seededFrom: SeededFromRef(monthKey: previousMonth, entryId: "n1")),
            ExpenseEntry(id: "act", name: "NETFLIX.COM", category: "Unsorted", amount: 15.99, color: "#e05656", recurring: false, date: "\(monthKey)-06", imported: ImportedTransactionMeta(batchId: "b", fileName: "f", rowNumber: 1, hash: "h", originalDescription: "NETFLIX.COM", importedAt: isoTimestampNow())),
        ])
        let reconciled = Recurrence.reconcileSeededEntries(seeded)
        XCTAssertEqual(reconciled.merged, 1)
        XCTAssertEqual(reconciled.month.expenses.count, 1)
        XCTAssertTrue(reconciled.month.expenses.first?.recurring ?? false)
        XCTAssertNotNil(reconciled.month.expenses.first?.imported)
    }
}
