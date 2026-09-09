import Foundation

// swiftlint:disable file_length

/// Pure calculation engine — exact port of finance.ts.
/// All functions are static; no side effects, no global state.
/// Swift 6 strict concurrency: all inputs are Sendable value types; funcs are nonisolated.
enum FinanceEngine {

    // MARK: - Rate helpers

    /// Geometric monthly rate from an annual percentage.
    /// Matches TS: `Math.pow(1 + pct/100, 1/12) - 1`
    nonisolated static func monthlyRate(fromAnnual pct: Double) -> Double {
        let r = max(-99.9, pct) / 100.0
        return pow(1.0 + r, 1.0 / 12.0) - 1.0
    }

    /// The rate in effect at a given simulated month:
    /// promo rate during the intro window (monthIndex <= promoMonths), then standard.
    /// TS uses `monthIndex <= promoMonths` (inclusive on the boundary).
    nonisolated static func effectiveAnnualRate(_ account: Account, monthIndex: Int) -> Double {
        let promoMonths = max(0, account.promoMonths)
        return monthIndex <= promoMonths ? account.promoRate : account.rate
    }

    // MARK: - Account classification

    nonisolated static func isDebtClass(_ account: Account) -> Bool {
        account.accountClass == .debt
    }

    // MARK: - Account filters

    nonisolated static func getDebtAccounts(_ accounts: [Account]) -> [Account] {
        accounts.filter { $0.accountClass == .debt }
    }

    nonisolated static func getAssetAccounts(_ accounts: [Account]) -> [Account] {
        accounts.filter { $0.accountClass != .debt }
    }

    // MARK: - Projection

    nonisolated static func projection(for month: MonthBudget) -> Projection {
        let monthlyIncome = sumAmounts(month.incomes.map(\.amount))
        let monthlyExpenses = sumAmounts(month.expenses.map(\.amount))

        let recurringMonthlyIncome = sumAmounts(month.incomes.filter(\.recurring).map(\.amount))
        let recurringMonthlyExpenses = sumAmounts(month.expenses.filter(\.recurring).map(\.amount))
        let recurringMonthlySurplus = recurringMonthlyIncome - recurringMonthlyExpenses

        let oneOffIncome = monthlyIncome - recurringMonthlyIncome
        let oneOffExpenses = monthlyExpenses - recurringMonthlyExpenses
        let oneOffCount =
            month.incomes.filter { !$0.recurring }.count +
            month.expenses.filter { !$0.recurring }.count

        // "paid" = expense has a non-empty category (mirrors TS: expense.category.trim())
        let paidTotal = month.expenses
            .filter { !$0.category.trimmingCharacters(in: .whitespaces).isEmpty }
            .reduce(0.0) { $0 + $1.amount }
        let unpaidTotal = monthlyExpenses - paidTotal

        let monthlySurplus = monthlyIncome - monthlyExpenses
        let annualIncome = recurringMonthlyIncome * 12.0 + oneOffIncome
        let annualExpenses = recurringMonthlyExpenses * 12.0 + oneOffExpenses
        let annualSurplus = annualIncome - annualExpenses
        let savingsRate = monthlyIncome > 0 ? (monthlySurplus / monthlyIncome) * 100.0 : 0.0

        return Projection(
            monthlyIncome: monthlyIncome,
            monthlyExpenses: monthlyExpenses,
            monthlySurplus: monthlySurplus,
            recurringMonthlyIncome: recurringMonthlyIncome,
            recurringMonthlyExpenses: recurringMonthlyExpenses,
            recurringMonthlySurplus: recurringMonthlySurplus,
            annualIncome: annualIncome,
            annualExpenses: annualExpenses,
            annualSurplus: annualSurplus,
            savingsRate: savingsRate,
            paidTotal: paidTotal,
            unpaidTotal: unpaidTotal,
            oneOffCount: oneOffCount
        )
    }

    // MARK: - Debt summary

    nonisolated static func debtSummary(_ accounts: [Account]) -> DebtSummary {
        let debts = accounts.filter { $0.accountClass == .debt }
        let activeDebts = debts.filter { $0.balance > 0 }

        let totalDebt = activeDebts.reduce(0.0) { $0 + max(0.0, $1.balance) }
        let totalCreditLimit = debts.reduce(0.0) { $0 + max(0.0, $1.creditLimit) }
        let availableCredit = max(0.0, totalCreditLimit - totalDebt)
        let utilization = totalCreditLimit > 0 ? (totalDebt / totalCreditLimit) * 100.0 : 0.0
        let monthlyMinimums = activeDebts.reduce(0.0) { $0 + max(0.0, $1.minimumPayment) }
        let weightedApr: Double
        if totalDebt > 0 {
            weightedApr = activeDebts.reduce(0.0) { $0 + max(0.0, $1.rate) * $1.balance } / totalDebt
        } else {
            weightedApr = 0.0
        }

        // First non-zero dueDay sorted ascending; nil if none.
        let nextDueDay: Int? = activeDebts
            .map { clampDueDay($0.dueDay) }
            .filter { $0 > 0 }
            .sorted()
            .first

        return DebtSummary(
            totalDebt: totalDebt,
            totalCreditLimit: totalCreditLimit,
            availableCredit: availableCredit,
            utilization: utilization,
            monthlyMinimums: monthlyMinimums,
            weightedApr: weightedApr,
            nextDueDay: nextDueDay
        )
    }

    // MARK: - Asset summary

    nonisolated static func assetSummary(_ accounts: [Account]) -> AssetSummary {
        let assets = accounts.filter { $0.accountClass != .debt }

        func byClass(_ cls: AccountClass) -> Double {
            assets.filter { $0.accountClass == cls }
                  .reduce(0.0) { $0 + max(0.0, $1.balance) }
        }

        let totalCash = byClass(.cash)
        let totalSavings = byClass(.savings)
        let totalInvestments = byClass(.investment)
        let totalAssets = totalCash + totalSavings + totalInvestments
        let monthlyContributions = assets.reduce(0.0) { $0 + max(0.0, $1.monthlyContribution) }
        let weightedAssetRate: Double
        if totalAssets > 0 {
            weightedAssetRate = assets.reduce(0.0) { $0 + max(0.0, $1.rate) * max(0.0, $1.balance) } / totalAssets
        } else {
            weightedAssetRate = 0.0
        }

        return AssetSummary(
            totalAssets: totalAssets,
            totalCash: totalCash,
            totalSavings: totalSavings,
            totalInvestments: totalInvestments,
            monthlyContributions: monthlyContributions,
            weightedAssetRate: weightedAssetRate
        )
    }

    // MARK: - Net worth summary

    nonisolated static func netWorthSummary(_ accounts: [Account]) -> NetWorthSummary {
        let totalAssets = accounts
            .filter { $0.accountClass != .debt && $0.includeInNetWorth }
            .reduce(0.0) { $0 + max(0.0, $1.balance) }
        let totalDebt = accounts
            .filter { $0.accountClass == .debt && $0.includeInNetWorth }
            .reduce(0.0) { $0 + max(0.0, $1.balance) }
        return NetWorthSummary(
            netWorth: totalAssets - totalDebt,
            totalAssets: totalAssets,
            totalDebt: totalDebt
        )
    }

    // MARK: - Debt balance roll-forward

    /// Port of `isValidMonthKey` in finance.ts — "yyyy-MM".
    nonisolated static func isValidMonthKey(_ value: String?) -> Bool {
        guard let value, value.count == 7 else { return false }
        let parts = value.split(separator: "-")
        return parts.count == 2 && parts[0].count == 4 && parts[1].count == 2
            && Int(parts[0]) != nil && Int(parts[1]) != nil
    }

    /// Whole calendar months from one "yyyy-MM" key to another. Port of `monthsBetween`.
    nonisolated static func monthsBetween(_ fromMonthKey: String, _ toMonthKey: String) -> Int {
        let from = fromMonthKey.split(separator: "-").compactMap { Int($0) }
        let to = toMonthKey.split(separator: "-").compactMap { Int($0) }
        guard from.count == 2, to.count == 2 else { return 0 }
        return (to[0] - from[0]) * 12 + (to[1] - from[1])
    }

    /// Ledger payments linked to debt accounts, summed per account per month key.
    /// Port of `collectLinkedDebtPayments`.
    nonisolated static func collectLinkedDebtPayments(
        _ months: [String: MonthBudget]
    ) -> [String: [String: Double]] {
        var byAccount: [String: [String: Double]] = [:]
        for (monthKey, month) in months {
            for expense in month.expenses {
                guard let accountId = expense.debtAccountId else { continue }
                let amount = abs(expense.amount)
                guard amount > 0 else { continue }
                byAccount[accountId, default: [:]][monthKey, default: 0] += amount
            }
        }
        return byAccount
    }

    /// Port of `rollForwardDebtBalances` in finance.ts.
    ///
    /// Debt balances are stored as a snapshot anchored to the month they were entered
    /// (`balanceAsOf`). This derives the live balance by rolling the snapshot forward one month
    /// at a time to `currentMonthKey`: each month charges interest (promo-aware) and pays either
    /// that month's linked ledger payments or, when none exist, the scheduled `minimumPayment`.
    /// Linked payments REPLACE the schedule for their month, so importing the regular payment
    /// never double-counts. Accounts with no scheduled payment and no linked payments stay
    /// untouched. Non-debt accounts pass through unchanged.
    nonisolated static func rollForwardDebtBalances(
        accounts: [Account],
        months: [String: MonthBudget],
        currentMonthKey: String = getMonthKey()
    ) -> [Account] {
        let linkedPayments = collectLinkedDebtPayments(months)

        return accounts.map { account in
            guard account.accountClass == .debt else { return account }

            let anchor = isValidMonthKey(account.balanceAsOf) ? account.balanceAsOf! : currentMonthKey
            // Cap the horizon so a corrupt anchor far in the past cannot lock up the app.
            let steps = min(600, monthsBetween(anchor, currentMonthKey))
            guard steps > 0 else { return account }

            let paymentsByMonth = linkedPayments[account.id]
            let scheduledPayment = max(0.0, account.minimumPayment)
            // A promo window still active now also covered the elapsed months being rolled.
            let annualRate = account.promoMonths > 0 ? account.promoRate : account.rate
            let monthly = monthlyRateFromAnnual(annualRate)

            var balance = max(0.0, account.balance)
            var changed = false

            for step in 1...steps {
                guard balance > 0 else { break }
                let monthKey = shiftMonth(anchor, by: step)
                let linkedTotal = paymentsByMonth?[monthKey] ?? 0
                let payment = linkedTotal > 0 ? linkedTotal : scheduledPayment
                guard payment > 0 else { continue }

                let owed = balance + balance * monthly
                balance = max(0.0, owed - payment)
                changed = true
            }

            guard changed else { return account }
            var rolled = account
            rolled.balance = roundTo(balance, digits: 2)
            return rolled
        }
    }

    // MARK: - Net worth outlook

    /// Projects net worth forward month by month.
    /// Port of buildNetWorthOutlook — exact same algorithm.
    ///
    /// The guiding rule: moving money between a person's own accounts does not change net worth.
    /// Only three things move it — fresh surplus in, asset growth, and debt interest.
    /// Contributions and debt payments are modelled as transfers out of an "unallocated cash" bucket,
    /// never as extra inflows/outflows. Leftover surplus collects in that bucket (may go negative).
    nonisolated static func netWorthOutlook(
        accounts: [Account],
        recurringMonthlySurplus: Double,
        horizonMonths: Int,
        assumedInvestmentReturn: Double
    ) -> [NetWorthPoint] {
        // Working copy — plain struct so mutations are clean value-type operations.
        struct WorkingAccount {
            var accountClass: AccountClass
            var balance: Double
            var rate: Double
            var promoRate: Double
            var promoMonths: Int
            var contribution: Double   // monthly contribution (assets only)
            var payment: Double        // minimum payment (debt only)
            var includeInNetWorth: Bool
        }

        var working = accounts.map { a in
            WorkingAccount(
                accountClass: a.accountClass,
                balance: max(0.0, a.balance),
                rate: a.rate,
                promoRate: a.promoRate,
                promoMonths: max(0, a.promoMonths),
                contribution: max(0.0, a.monthlyContribution),
                payment: max(0.0, a.minimumPayment),
                includeInNetWorth: a.includeInNetWorth
            )
        }

        // Surplus not explicitly routed to a named account. Allowed to go negative.
        var unallocatedCash = 0.0

        // Build a start date anchored to the 1st of the current month for labels.
        let calendar = Calendar(identifier: .gregorian)
        let now = Date()
        var startComps = calendar.dateComponents([.year, .month], from: now)
        startComps.day = 1
        let startDate = calendar.date(from: startComps) ?? now

        // A negative horizon would crash the closed range; treat it as "today only".
        let horizon = max(0, horizonMonths)
        return (0...horizon).map { monthIndex in
            var interestCharged = 0.0
            var growthEarned = 0.0

            if monthIndex > 0 {
                // 1. Fresh recurring surplus arrives.
                unallocatedCash += recurringMonthlySurplus

                // 2. Route contributions into asset accounts (transfer from unallocated cash).
                for i in working.indices {
                    guard working[i].accountClass != .debt, working[i].contribution > 0 else { continue }
                    working[i].balance += working[i].contribution
                    unallocatedCash -= working[i].contribution
                }

                // 3. Pay debts and apply debt interest.
                for i in working.indices {
                    guard working[i].accountClass == .debt, working[i].balance > 0 else { continue }
                    let annualRate = monthIndex <= working[i].promoMonths
                        ? working[i].promoRate
                        : working[i].rate
                    let monthlyInterest = working[i].balance * monthlyRateFromAnnual(annualRate)
                    interestCharged += monthlyInterest
                    let owed = working[i].balance + monthlyInterest
                    let actualPayment = min(working[i].payment, owed)
                    working[i].balance = max(0.0, owed - actualPayment)
                    unallocatedCash -= actualPayment
                }

                // 4. Grow asset balances at their effective compounding rate.
                for i in working.indices {
                    guard working[i].accountClass != .debt else { continue }
                    let annualRate = monthIndex <= working[i].promoMonths
                        ? working[i].promoRate
                        : working[i].rate
                    let growth = working[i].balance * monthlyRateFromAnnual(annualRate)
                    growthEarned += growth
                    working[i].balance += growth
                }
            }

            // Tally balances per class (unallocated cash is always counted in net worth).
            var cashBalance = unallocatedCash
            var savingsBalance = 0.0
            var investmentBalance = 0.0
            var debtBalance = 0.0

            for a in working {
                guard a.includeInNetWorth else { continue }
                switch a.accountClass {
                case .debt:
                    debtBalance += a.balance
                case .savings:
                    savingsBalance += a.balance
                case .investment:
                    investmentBalance += a.balance
                default: // .cash and any future classes
                    cashBalance += a.balance
                }
            }

            let assetBalance = cashBalance + savingsBalance + investmentBalance

            // Build label: "Jan" each month, "Jan 24" at year boundaries (monthIndex % 12 == 0).
            var labelComps = DateComponents()
            labelComps.year = calendar.component(.year, from: startDate)
            labelComps.month = calendar.component(.month, from: startDate) + monthIndex
            labelComps.day = 1
            let labelDate = calendar.date(from: labelComps) ?? startDate
            let label = monthLabel(for: labelDate, monthIndex: monthIndex)

            return NetWorthPoint(
                monthIndex: monthIndex,
                label: label,
                netWorth: assetBalance - debtBalance,
                assetBalance: assetBalance,
                cashBalance: cashBalance,
                savingsBalance: savingsBalance,
                investmentBalance: investmentBalance,
                debtBalance: debtBalance,
                interestCharged: interestCharged,
                growthEarned: growthEarned
            )
        }
    }

    // MARK: - Monthly flow points

    /// Returns one flow point per month in the year of `state.selectedMonth`.
    /// Port of buildMonthlyFlowPoints.
    nonisolated static func monthlyFlowPoints(_ state: LedgerState) -> [MonthlyFlowPoint] {
        guard let year = Int(state.selectedMonth.prefix(4)) else { return [] }
        let calendar = Calendar(identifier: .gregorian)

        return (1...12).map { monthNumber in
            let monthKey = String(format: "%04d-%02d", year, monthNumber)
            let month = state.months[monthKey]
            let proj = projection(for: month ?? MonthBudget.empty)

            var comps = DateComponents()
            comps.year = year
            comps.month = monthNumber
            comps.day = 1
            let date = calendar.date(from: comps) ?? Date()
            let fmt = DateFormatter()
            fmt.dateFormat = "MMM"
            fmt.locale = Locale(identifier: "en")
            let label = fmt.string(from: date)

            let hasData = month.map { m in
                !m.incomes.isEmpty || !m.expenses.isEmpty || !m.note.isEmpty
            } ?? false

            return MonthlyFlowPoint(
                monthKey: monthKey,
                label: label,
                income: proj.monthlyIncome,
                expenses: proj.monthlyExpenses,
                surplus: proj.monthlySurplus,
                hasData: hasData
            )
        }
    }

    // MARK: - Health score

    nonisolated static func healthScore(
        month: MonthBudget,
        accounts: [Account],
        savingsTarget: Double
    ) -> HealthScoreBreakdown {
        let proj = projection(for: month)
        let debt = debtSummary(accounts)
        let debts = accounts.filter { $0.accountClass == .debt }

        let hasAnyData =
            proj.monthlyIncome > 0 ||
            proj.monthlyExpenses > 0 ||
            debt.totalDebt > 0 ||
            debt.monthlyMinimums > 0

        let noDataDetail = "Add income or expenses for the current month to generate a financial health score. The score requires at least some data to be meaningful."

        guard hasAnyData else {
            return HealthScoreBreakdown(
                score: 0,
                estimatedCreditScore: 0,
                cashFlowScore: 0,
                debtLoadScore: 0,
                utilizationScore: 0,
                paymentPressureScore: 0,
                savingsScore: 0,
                summary: "N/A",
                detail: noDataDetail,
                noData: true
            )
        }

        let income = proj.monthlyIncome
        let expenseRatio: Double
        if income > 0 {
            expenseRatio = proj.monthlyExpenses / income
        } else {
            expenseRatio = proj.monthlyExpenses > 0 ? 2.0 : 0.0
        }

        let paymentPressure: Double
        if income > 0 {
            paymentPressure = debt.monthlyMinimums / income
        } else {
            paymentPressure = debt.monthlyMinimums > 0 ? 1.0 : 0.0
        }

        let cardStats = creditCardStats(debts)
        let activeHighAprDebt = debts.contains { $0.balance > 0 && $0.rate >= 20 && $0.promoMonths <= 0 }
        let paymentNotReducingDebt = debts.contains { d in
            guard d.balance > 0, d.rate > 0, d.promoMonths <= 0 else { return false }
            return d.minimumPayment <= d.balance * (d.rate / 100.0 / 12.0)
        }

        let cashFlowScore: Double
        if income <= 0 {
            cashFlowScore = clampPercent(
                (proj.monthlyExpenses > 0 || debt.monthlyMinimums > 0) ? 20.0 : 70.0
            )
        } else {
            cashFlowScore = clampPercent(
                100.0
                - max(0.0, expenseRatio - 0.65) * 115.0
                + max(0.0, proj.savingsRate) * 0.25
            )
        }

        let debtLoadScore = clampPercent(
            100.0 - min(60.0, max(0.0, debt.totalDebt / max(income * 12.0, 1.0)) * 45.0)
        )
        let utilizationScore = clampPercent(
            100.0
            - cardStats.totalUtilization * 0.95
            - max(0.0, cardStats.maxUtilization - 70.0) * 0.55
        )
        let paymentPressureScore = clampPercent(100.0 - paymentPressure * 190.0)
        let savingsScore = clampPercent(
            60.0
            + proj.savingsRate * 1.7
            - max(0.0, savingsTarget - proj.savingsRate) * 1.1
        )

        var score = cashFlowScore * 0.32
            + debtLoadScore * 0.16
            + utilizationScore * 0.22
            + paymentPressureScore * 0.18
            + savingsScore * 0.12
        if proj.monthlySurplus < 0 { score -= 10.0 }
        if cardStats.maxUtilization >= 90 { score -= 8.0 }
        if cardStats.totalUtilization >= 80 { score -= 9.0 }
        if paymentPressure >= 0.35 { score -= 7.0 }
        if activeHighAprDebt { score -= 4.0 }
        if paymentNotReducingDebt { score -= 9.0 }
        score = clampPercent(score)

        let creditEstimate = estimateCreditScore(
            projection: proj,
            debtSummary: debt,
            totalUtilization: cardStats.totalUtilization,
            maxUtilization: cardStats.maxUtilization,
            paymentPressure: paymentPressure,
            activeHighAprDebt: activeHighAprDebt
        )

        let summary: String
        if score >= 78 { summary = "Strong" }
        else if score >= 58 { summary = "Stable" }
        else if score >= 38 { summary = "Tight" }
        else { summary = "At risk" }

        return HealthScoreBreakdown(
            score: roundTo(score / 10.0, digits: 1),
            estimatedCreditScore: Double(creditEstimate),
            cashFlowScore: roundTo(cashFlowScore, digits: 0),
            debtLoadScore: roundTo(debtLoadScore, digits: 0),
            utilizationScore: roundTo(utilizationScore, digits: 0),
            paymentPressureScore: roundTo(paymentPressureScore, digits: 0),
            savingsScore: roundTo(savingsScore, digits: 0),
            summary: summary,
            detail: "Calculated from income cover, outflow, savings rate, debt balance, monthly payment pressure, card utilisation, active APR exposure, and whether payments appear to reduce balances. The credit score is a rough local estimate, not a bureau score.",
            noData: false
        )
    }

    // MARK: - Financial signals

    /// Port of buildFinancialSignals.
    /// `allMonths` is accepted for API symmetry with the task spec but the TS source does not use
    /// historical months in its signal rules — every rule reads from the current `month`, `accounts`,
    /// and derived summaries.
    nonisolated static func financialSignals(
        month: MonthBudget,
        accounts: [Account],
        allMonths: [MonthBudget],
        savingsTarget: Double
    ) -> [FinancialSignal] {
        var signals: [FinancialSignal] = []
        let debts = accounts.filter { $0.accountClass == .debt }
        let assets = assetSummary(accounts)
        let debt = debtSummary(accounts)
        let proj = projection(for: month)
        let income = proj.monthlyIncome

        let expenseRatio: Double = income > 0
            ? (proj.monthlyExpenses / income) * 100.0
            : (proj.monthlyExpenses > 0 ? 100.0 : 0.0)

        let paymentPressure: Double = income > 0
            ? (debt.monthlyMinimums / income) * 100.0
            : (debt.monthlyMinimums > 0 ? 100.0 : 0.0)

        let cardStats = creditCardStats(debts)

        // Missing income
        if income <= 0 && (proj.monthlyExpenses > 0 || debt.monthlyMinimums > 0) {
            signals.append(FinancialSignal(
                id: "missing-income",
                title: "Income missing",
                summary: "Outflows or debt payments exist but no income is entered for this month.",
                detail: "Without income, cash-flow and debt pressure are likely overstated. Add regular pay or other inflows before trusting the forecast.",
                tone: .warning
            ))
        }

        // Outflow pressure
        if income > 0 && proj.monthlyExpenses > income {
            signals.append(FinancialSignal(
                id: "outflow-pressure",
                title: "Outflow is higher than income",
                summary: "Outflow is \(formatRatio(expenseRatio)) of income for the selected month.",
                detail: "Spending more than income usually means savings fall or debt rises unless this is a planned one-off month.",
                tone: .danger
            ))
        }

        // Cards over 90% utilisation (up to 3)
        let over90Cards = cardStats.cards.filter { $0.utilization >= 90 }
        for card in over90Cards.prefix(3) {
            signals.append(FinancialSignal(
                id: "card-utilization-\(card.id)",
                title: "Card utilisation over 90%",
                summary: "\(card.name) is at \(formatRatio(card.utilization)) of its credit limit.",
                detail: "Very high utilisation can drag down a credit-score estimate and leaves little room for interest, fees, or unexpected spending.",
                tone: .danger
            ))
        }

        // Total utilisation >= 80%
        if cardStats.totalLimit > 0 && cardStats.totalUtilization >= 80 {
            signals.append(FinancialSignal(
                id: "total-credit-utilization",
                title: "Overall credit utilisation over 80%",
                summary: "Cards use \(formatRatio(cardStats.totalUtilization)) of available credit.",
                detail: "High total utilisation is a classic pressure signal. Paying balances below 50%, then below 30%, usually gives the forecast more breathing room.",
                tone: cardStats.totalUtilization >= 90 ? .danger : .warning
            ))
        }

        // Payment pressure
        if paymentPressure >= 35 {
            signals.append(FinancialSignal(
                id: "debt-payment-pressure-high",
                title: "Debt payments are heavy",
                summary: "Tracked monthly payments are \(formatRatio(paymentPressure)) of income.",
                detail: "When debt payments take more than about a third of income, missed payments and new borrowing become easier to trigger.",
                tone: .danger
            ))
        } else if paymentPressure >= 20 {
            signals.append(FinancialSignal(
                id: "debt-payment-pressure",
                title: "Debt payments need watching",
                summary: "Tracked monthly payments are \(formatRatio(paymentPressure)) of income.",
                detail: "This payment load can limit saving and absorb cash-flow shocks, especially if income varies month to month.",
                tone: .warning
            ))
        }

        // High APR debts (up to 2)
        for d in debts.filter({ $0.balance > 0 && $0.rate >= 20 && $0.promoMonths <= 0 }).prefix(2) {
            signals.append(FinancialSignal(
                id: "high-apr-\(d.id)",
                title: "High interest is active",
                summary: "\(d.name) has \(formatRatio(d.rate)) APR applying now.",
                detail: "High APR compounds the balance quickly, so paying above the monthly minimum has an outsized effect on future net worth.",
                tone: .warning
            ))
        }

        // Promo period ending soon — <= 3 months remaining (up to 2)
        for d in debts.filter({ $0.balance > 0 && $0.rate > 0 && $0.promoMonths > 0 && $0.promoMonths <= 3 }).prefix(2) {
            let monthWord = d.promoMonths == 1 ? "month" : "months"
            signals.append(FinancialSignal(
                id: "promo-ending-\(d.id)",
                title: "Interest-free period ending soon",
                summary: "\(d.name) has \(d.promoMonths) 0% \(monthWord) left.",
                detail: "The net-worth forecast starts applying APR after the 0% period. Plan payments before that date if the balance is still material.",
                tone: .warning
            ))
        }

        // Payment not reducing balance (up to 2)
        for d in debts.filter({ d in
            guard d.balance > 0, d.rate > 0, d.promoMonths <= 0 else { return false }
            return d.minimumPayment <= d.balance * (d.rate / 100.0 / 12.0)
        }).prefix(2) {
            signals.append(FinancialSignal(
                id: "interest-only-\(d.id)",
                title: "Payment may not reduce balance",
                summary: "\(d.name)'s monthly payment is at or below estimated monthly interest.",
                detail: "If the payment only covers interest, the balance may stall or grow. Increase payment or reduce APR to improve the outlook.",
                tone: .danger
            ))
        }

        // Savings rate signals
        if income > 0 && proj.savingsRate < 0 {
            signals.append(FinancialSignal(
                id: "negative-savings-rate",
                title: "Negative savings rate",
                summary: "Savings rate is \(formatRatio(proj.savingsRate)).",
                detail: "A negative savings rate means the month is funded from existing cash, credit, or overdraft unless there is a planned one-off reason.",
                tone: .danger
            ))
        } else if income > 0 && proj.savingsRate < savingsTarget {
            signals.append(FinancialSignal(
                id: "savings-target-gap",
                title: "Savings target gap",
                summary: "Savings rate is \(formatRatio(proj.savingsRate)) against a \(formatRatio(savingsTarget)) target.",
                detail: "Missing the savings target is not always urgent, but repeated misses weaken the net-worth forecast.",
                tone: .info
            ))
        }

        // Emergency fund: liquid cash + savings vs monthly outflow
        let liquidReserve = assets.totalCash + assets.totalSavings
        let monthlyOutflow = proj.monthlyExpenses + debt.monthlyMinimums
        if monthlyOutflow > 0 && (assets.totalCash > 0 || assets.totalSavings > 0) {
            let monthsCovered = liquidReserve / monthlyOutflow
            if monthsCovered < 3 {
                let roundedMonths = roundTo(monthsCovered, digits: 1)
                let monthWord = monthsCovered == 1.0 ? "month" : "months"
                signals.append(FinancialSignal(
                    id: "emergency-fund-low",
                    title: "Emergency fund under 3 months",
                    summary: "Liquid savings cover about \(roundedMonths) \(monthWord) of outflow.",
                    detail: "A common guideline is 3–6 months of essential outflow in easy-access cash or savings before locking money into investments.",
                    tone: monthsCovered < 1 ? .warning : .info
                ))
            }
        }

        // Over-allocation: routing more into accounts than the surplus can fund
        if assets.monthlyContributions > 0 && proj.monthlySurplus >= 0 && assets.monthlyContributions > proj.monthlySurplus + 1 {
            signals.append(FinancialSignal(
                id: "contribution-over-allocation",
                title: "Contributions exceed surplus",
                summary: "Monthly contributions are more than this month's surplus.",
                detail: "Routing more into savings and investments than your surplus covers will draw down cash over time. The forecast lets cash go negative to show this — adjust contributions or income to stay sustainable.",
                tone: .warning
            ))
        }

        // Cash drag: large idle cash pile
        if assets.totalCash > 0 && monthlyOutflow > 0 {
            let cashMonths = assets.totalCash / monthlyOutflow
            if cashMonths >= 9 && assets.totalCash >= 5000 {
                signals.append(FinancialSignal(
                    id: "cash-drag",
                    title: "Large cash balance is idle",
                    summary: "Cash covers about \(Int(cashMonths.rounded())) months of outflow.",
                    detail: "Beyond a healthy emergency fund, cash held at 0% loses value to inflation. Some of this could move to interest-bearing savings or longer-term investments, depending on your plans.",
                    tone: .info
                ))
            }
        }

        // Uncategorised spend
        let uncategorizedShare = proj.monthlyExpenses > 0
            ? (proj.unpaidTotal / proj.monthlyExpenses) * 100.0
            : 0.0
        if uncategorizedShare > 30 && !month.expenses.isEmpty {
            signals.append(FinancialSignal(
                id: "categorization-gap",
                title: "Uncategorised spend is high",
                summary: "\(formatRatio(uncategorizedShare)) of outflow is not categorised.",
                detail: "This weakens category insights and can hide which spending area is causing pressure. Full categorisation is healthy, not an anomaly.",
                tone: .info
            ))
        }

        // Fallback: no urgent signals
        if signals.isEmpty {
            signals.append(FinancialSignal(
                id: "no-urgent-signals",
                title: "No urgent financial signals",
                summary: "Income covers outflow and tracked credit pressure is under the main warning thresholds.",
                detail: "This does not guarantee everything is perfect, but nothing in the current local data crosses a high-risk threshold.",
                tone: .good
            ))
        }

        return Array(signals.prefix(6))
    }

    // MARK: - Goal sequence

    /// Waterfall simulation over a list of SavingsGoals.
    /// Port of runGoalSequence — same priority ordering, interest compounding, and gap analysis.
    nonisolated static func runGoalSequence(
        goals: [SavingsGoal],
        monthlySurplus: Double,
        horizonMonths: Int
    ) -> GoalSequenceResult {
        guard !goals.isEmpty, monthlySurplus > 0 else {
            return GoalSequenceResult(
                timeline: [],
                goals: goals.map { g in
                    GoalOutcome(
                        goalId: g.id,
                        name: g.name,
                        color: g.color,
                        target: g.target,
                        completionMonth: nil,
                        completionDate: nil,
                        shortfall: max(0.0, g.target - g.saved),
                        extraMonthlyNeeded: 0,
                        extraMonthsNeeded: 0,
                        status: .noDeadline
                    )
                },
                horizonMonths: horizonMonths,
                avgUnallocatedSurplus: max(0.0, monthlySurplus)
            )
        }

        // Sort: fill goals last; within group, sort by priority ascending.
        let sorted = goals.sorted { a, b in
            if a.fundingMode == .fill && b.fundingMode != .fill { return false }
            if b.fundingMode == .fill && a.fundingMode != .fill { return true }
            return a.priority < b.priority
        }

        let calendar = Calendar(identifier: .gregorian)
        let now = Date()
        var startComps = calendar.dateComponents([.year, .month], from: now)
        startComps.day = 1
        let startDate = calendar.date(from: startComps) ?? now

        let (working, timeline) = simulate(
            goals: sorted,
            surplus: monthlySurplus,
            horizon: horizonMonths,
            startDate: startDate,
            calendar: calendar
        )

        // Build outcomes + gap analysis.
        let outcomeGoals: [GoalOutcome] = sorted.map { g in
            guard let w = working.first(where: { $0.goalId == g.id }) else {
                return GoalOutcome(
                    goalId: g.id, name: g.name, color: g.color, target: g.target,
                    completionMonth: nil, completionDate: nil,
                    shortfall: max(0.0, g.target - g.saved),
                    extraMonthlyNeeded: 0, extraMonthsNeeded: 0, status: .noDeadline
                )
            }

            let completionMonth = w.completionMonth
            let completionDate: String?
            if let cm = completionMonth, cm > 0 {
                var comp = DateComponents()
                comp.year = calendar.component(.year, from: startDate)
                comp.month = calendar.component(.month, from: startDate) + cm
                comp.day = 1
                let date = calendar.date(from: comp) ?? startDate
                let fmt = DateFormatter()
                fmt.dateFormat = "MMM yyyy"
                fmt.locale = Locale(identifier: "en")
                completionDate = fmt.string(from: date)
            } else if completionMonth == 0 {
                completionDate = "Already complete"
            } else {
                completionDate = nil
            }

            let shortfall = max(0.0, g.target - w.accumulated)
            var extraMonthlyNeeded = 0.0
            var extraMonthsNeeded = 0
            let status: GoalStatus

            if g.saved >= g.target {
                status = .complete
            } else if g.deadlineMonths > 0 {
                let withinDeadline = completionMonth != nil && completionMonth! <= g.deadlineMonths
                if withinDeadline {
                    let monthsToSpare = g.deadlineMonths - (completionMonth ?? g.deadlineMonths)
                    status = monthsToSpare <= 2 ? .tight : .onTrack
                } else {
                    status = .atRisk
                    extraMonthlyNeeded = solveExtraMonthly(
                        target: g, allGoals: sorted, baseSurplus: monthlySurplus,
                        deadlineMonths: g.deadlineMonths, startDate: startDate, calendar: calendar
                    )
                    extraMonthsNeeded = solveExtraMonths(
                        target: g, allGoals: sorted, surplus: monthlySurplus,
                        baseHorizon: horizonMonths, startDate: startDate, calendar: calendar
                    )
                }
            } else {
                status = .noDeadline
            }

            return GoalOutcome(
                goalId: g.id,
                name: g.name,
                color: g.color,
                target: g.target,
                completionMonth: completionMonth,
                completionDate: completionDate,
                shortfall: shortfall,
                extraMonthlyNeeded: extraMonthlyNeeded,
                extraMonthsNeeded: Double(extraMonthsNeeded),
                status: status
            )
        }

        let avgUnallocated = horizonMonths > 0
            ? timeline.reduce(0.0) { $0 + $1.unallocated } / Double(horizonMonths)
            : 0.0

        return GoalSequenceResult(
            timeline: timeline,
            goals: outcomeGoals,
            horizonMonths: horizonMonths,
            avgUnallocatedSurplus: roundTo(avgUnallocated, digits: 2)
        )
    }

    // MARK: - Seed month

    /// Port of seedMonthFromPrevious (src/finance.ts). Recurring entries carry
    /// forward into the new month with fresh ids, clamped dates, and seededFrom
    /// provenance; one-offs stay behind. Seeding only happens moving forward in
    /// time — opening an older empty month stays empty. Without keys the result
    /// is empty apart from the carried note (legacy behavior).
    nonisolated static func seedMonth(
        from previous: MonthBudget?,
        fromKey: String? = nil,
        toKey: String? = nil
    ) -> MonthBudget {
        guard let prev = previous else {
            return MonthBudget(incomes: [], expenses: [], note: "")
        }
        guard let fromKey, let toKey, toKey > fromKey else {
            return MonthBudget(incomes: [], expenses: [], note: prev.note)
        }

        let incomes: [IncomeEntry] = prev.incomes.filter { $0.recurring }.map { income in
            var seeded = income
            seeded.id = createId(prefix: "income")
            seeded.date = seedEntryDate(income.date, toKey: toKey)
            seeded.imported = nil
            seeded.seededFrom = SeededFromRef(monthKey: fromKey, entryId: income.id)
            return seeded
        }
        let expenses: [ExpenseEntry] = prev.expenses.filter { $0.recurring }.map { expense in
            var seeded = expense
            seeded.id = createId(prefix: "expense")
            seeded.date = seedEntryDate(expense.date, toKey: toKey)
            seeded.imported = nil
            seeded.seededFrom = SeededFromRef(monthKey: fromKey, entryId: expense.id)
            return seeded
        }
        return MonthBudget(incomes: incomes, expenses: expenses, note: prev.note)
    }

    /// Same day-of-month in the target month, clamped to its length (31st -> 30th in June).
    /// Reads characters 8..<10 of the ISO date like the web's `slice(8, 10)`, so a
    /// date that carries a time suffix still yields the right day.
    nonisolated static func seedEntryDate(_ sourceDate: String?, toKey: String) -> String? {
        guard let sourceDate, sourceDate.count >= 10 else { return nil }
        let dayStart = sourceDate.index(sourceDate.startIndex, offsetBy: 8)
        let dayEnd = sourceDate.index(dayStart, offsetBy: 2)
        guard let day = Int(sourceDate[dayStart..<dayEnd]), day >= 1 else { return nil }
        let clamped = min(day, daysInMonth(monthKey: toKey))
        return String(format: "%@-%02d", toKey, clamped)
    }

    // MARK: - CSV export

    /// Port of buildCsvExport.
    /// Columns: month, currency, type, date, name, category, amount, note
    /// Rows are sorted by month key ascending (matching the Object.entries iteration order
    /// after sorting, which aligns with the TS source iterating Object.entries unsorted —
    /// we sort for deterministic output).
    nonisolated static func csvExport(_ state: LedgerState) -> String {
        var rows: [[String]] = [["month", "currency", "type", "date", "name", "category", "amount", "note"]]

        let sortedMonthKeys = state.months.keys.sorted()
        for monthKey in sortedMonthKeys {
            guard let month = state.months[monthKey] else { continue }

            for income in month.incomes {
                rows.append([
                    monthKey,
                    state.currency.rawValue,
                    "income",
                    income.date ?? "",
                    income.source,
                    "",
                    String(income.amount),
                    ""
                ])
            }
            for expense in month.expenses {
                rows.append([
                    monthKey,
                    state.currency.rawValue,
                    "expense",
                    expense.date ?? "",
                    expense.name,
                    expense.category,
                    String(expense.amount),
                    ""
                ])
            }
            if !month.note.isEmpty {
                rows.append([monthKey, state.currency.rawValue, "note", "", "month note", "", "", month.note])
            }
        }

        return rows.map { row in
            row.map { cell in
                let needsQuoting = cell.contains(",") || cell.contains("\"") || cell.contains("\n")
                if needsQuoting {
                    return "\"" + cell.replacingOccurrences(of: "\"", with: "\"\"") + "\""
                }
                return cell
            }.joined(separator: ",")
        }.joined(separator: "\n")
    }

    // MARK: - Currency formatting

    nonisolated static func currencyFormatter(for currency: CurrencyCode) -> NumberFormatter {
        let locale = currencyLocale(for: currency)
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.locale = Locale(identifier: locale)
        fmt.currencyCode = currency.rawValue
        // JPY has no fractional subunit; all others use 2 decimal places.
        let digits = currency == .jpy ? 0 : 2
        fmt.minimumFractionDigits = digits
        fmt.maximumFractionDigits = digits
        return fmt
    }

    nonisolated static func currencySymbol(for currency: CurrencyCode) -> String {
        let fmt = currencyFormatter(for: currency)
        return fmt.currencySymbol ?? currency.rawValue
    }
}

// MARK: - Private helpers

private extension FinanceEngine {

    static func sumAmounts(_ amounts: [Double]) -> Double {
        amounts.reduce(0.0, +)
    }

    static func clampPercent(_ value: Double) -> Double {
        max(0.0, min(100.0, value))
    }

    static func clampDueDay(_ value: Int) -> Int {
        max(1, min(31, value))
    }

    static func roundTo(_ value: Double, digits: Int) -> Double {
        let factor = pow(10.0, Double(digits))
        return (value * factor).rounded() / factor
    }

    /// Formats a ratio like "23.4%". Mirrors TS `formatRatio`.
    static func formatRatio(_ value: Double) -> String {
        let rounded = roundTo(value, digits: 1)
        // Remove trailing ".0" when not needed, matching toLocaleString behaviour.
        if rounded.truncatingRemainder(dividingBy: 1) == 0 {
            return "\(Int(rounded))%"
        }
        return "\(rounded)%"
    }

    /// Geometric monthly rate helper — same formula as the public `monthlyRate(fromAnnual:)`.
    static func monthlyRateFromAnnual(_ annualPercent: Double) -> Double {
        let r = max(-99.9, annualPercent) / 100.0
        return pow(1.0 + r, 1.0 / 12.0) - 1.0
    }

    // MARK: Credit-card stats (port of calculateCreditCardStats)

    struct CardStat {
        let id: String
        let name: String
        let balance: Double
        let limit: Double
        let utilization: Double
    }

    struct CreditCardStats {
        let cards: [CardStat]
        let totalBalance: Double
        let totalLimit: Double
        let totalUtilization: Double
        let maxUtilization: Double
    }

    static func creditCardStats(_ debts: [Account]) -> CreditCardStats {
        let cards: [CardStat] = debts
            .filter { $0.type == .creditCard && $0.creditLimit > 0 }
            .map { d in
                let bal = max(0.0, d.balance)
                let lim = max(0.0, d.creditLimit)
                let util = (bal / max(1.0, lim)) * 100.0
                return CardStat(id: d.id, name: d.name, balance: bal, limit: lim, utilization: util)
            }
        let totalBalance = cards.reduce(0.0) { $0 + $1.balance }
        let totalLimit = cards.reduce(0.0) { $0 + $1.limit }
        let totalUtilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100.0 : 0.0
        let maxUtilization = cards.reduce(0.0) { max($0, $1.utilization) }
        return CreditCardStats(
            cards: cards,
            totalBalance: totalBalance,
            totalLimit: totalLimit,
            totalUtilization: totalUtilization,
            maxUtilization: maxUtilization
        )
    }

    // MARK: Credit score estimate (port of estimateCreditScore)

    static func estimateCreditScore(
        projection proj: Projection,
        debtSummary: DebtSummary,
        totalUtilization: Double,
        maxUtilization: Double,
        paymentPressure: Double,
        activeHighAprDebt: Bool
    ) -> Int {
        var estimate = 700.0

        if totalUtilization >= 90 { estimate -= 120 }
        else if totalUtilization >= 80 { estimate -= 95 }
        else if totalUtilization >= 50 { estimate -= 50 }
        else if totalUtilization >= 30 { estimate -= 20 }
        else if totalUtilization > 0 && totalUtilization <= 10 { estimate += 30 }

        if maxUtilization >= 90 { estimate -= 40 }
        else if maxUtilization >= 80 { estimate -= 24 }

        if paymentPressure >= 0.35 { estimate -= 45 }
        else if paymentPressure >= 0.2 { estimate -= 22 }

        if proj.monthlyIncome <= 0 && debtSummary.totalDebt > 0 { estimate -= 70 }
        else if proj.monthlySurplus < 0 { estimate -= 55 }
        else if proj.savingsRate >= 20 { estimate += 20 }

        if activeHighAprDebt { estimate -= 15 }
        if debtSummary.totalDebt == 0 && proj.monthlyIncome > 0 { estimate += 20 }

        return max(300, min(850, Int(estimate.rounded())))
    }

    // MARK: Month label for net worth outlook chart

    /// TS: `{ month: "short", year: monthIndex % 12 === 0 ? "2-digit" : undefined }`
    static func monthLabel(for date: Date, monthIndex: Int) -> String {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en")
        fmt.dateFormat = monthIndex % 12 == 0 ? "MMM yy" : "MMM"
        return fmt.string(from: date)
    }

    // MARK: Currency locale mapping (mirrors currencyOptions in finance.ts)

    static func currencyLocale(for currency: CurrencyCode) -> String {
        switch currency {
        case .gbp: return "en_GB"
        case .usd: return "en_US"
        case .eur: return "en_IE"
        case .cad: return "en_CA"
        case .aud: return "en_AU"
        case .inr: return "en_IN"
        case .jpy: return "ja_JP"
        }
    }

    // MARK: - Goal simulation engine

    struct WorkingGoal {
        let goalId: String
        var accumulated: Double
        var completionMonth: Int?   // nil = not complete; 0 = already complete at start
    }

    static func simulate(
        goals: [SavingsGoal],
        surplus: Double,
        horizon: Int,
        startDate: Date,
        calendar: Calendar
    ) -> (working: [WorkingGoal], timeline: [GoalMonthPoint]) {
        var working: [WorkingGoal] = goals.map { g in
            WorkingGoal(
                goalId: g.id,
                accumulated: min(g.saved, g.target),
                completionMonth: g.saved >= g.target ? 0 : nil
            )
        }

        var timeline: [GoalMonthPoint] = []

        guard horizon > 0 else { return (working, timeline) }

        for month in 1...horizon {
            var comp = DateComponents()
            comp.year = calendar.component(.year, from: startDate)
            comp.month = calendar.component(.month, from: startDate) + month
            comp.day = 1
            let date = calendar.date(from: comp) ?? startDate
            let fmt = DateFormatter()
            fmt.dateFormat = "MMM yy"
            fmt.locale = Locale(identifier: "en")
            let label = fmt.string(from: date)

            var remaining = surplus
            var perGoal: [String: GoalMonthPointPerGoal] = [:]

            // Indices of active (not yet complete) goals in each funding category.
            let activeIndices = working.indices.filter { working[$0].completionMonth == nil }
            let fillIndices = activeIndices.filter { goals[$0].fundingMode == .fill }
            let fixedIndices = activeIndices.filter { goals[$0].fundingMode != .fill }

            // Fund fixed/auto goals first.
            for i in fixedIndices {
                guard remaining > 0 else { break }
                let contribution = min(goals[i].monthlyAmount, remaining)

                // Apply monthly compounding before the contribution.
                if goals[i].interestRate > 0 {
                    let mr = pow(1.0 + goals[i].interestRate / 100.0, 1.0 / 12.0) - 1.0
                    working[i].accumulated *= (1.0 + mr)
                }

                working[i].accumulated = min(working[i].accumulated + contribution, goals[i].target)
                remaining = max(0.0, remaining - contribution)

                var isComplete = false
                if working[i].accumulated >= goals[i].target {
                    working[i].completionMonth = month
                    isComplete = true
                    // Refund unused portion of the monthly allocation.
                    remaining += max(0.0, goals[i].monthlyAmount - contribution)
                }
                perGoal[goals[i].id] = GoalMonthPointPerGoal(
                    accumulated: working[i].accumulated,
                    contribution: contribution,
                    complete: isComplete
                )
            }

            // Fill goals absorb whatever is left.
            for i in fillIndices {
                guard remaining > 0 else { break }
                let contribution = remaining

                if goals[i].interestRate > 0 {
                    let mr = pow(1.0 + goals[i].interestRate / 100.0, 1.0 / 12.0) - 1.0
                    working[i].accumulated *= (1.0 + mr)
                }

                working[i].accumulated = min(working[i].accumulated + contribution, goals[i].target)
                remaining = 0.0

                var isComplete = false
                if working[i].accumulated >= goals[i].target {
                    working[i].completionMonth = month
                    isComplete = true
                }
                perGoal[goals[i].id] = GoalMonthPointPerGoal(
                    accumulated: working[i].accumulated,
                    contribution: contribution,
                    complete: isComplete
                )
            }

            // Already-complete goals: fill in their timeline entry with zero contribution.
            for i in working.indices {
                if perGoal[goals[i].id] == nil {
                    perGoal[goals[i].id] = GoalMonthPointPerGoal(
                        accumulated: working[i].accumulated,
                        contribution: 0,
                        complete: working[i].completionMonth != nil
                    )
                }
            }

            timeline.append(GoalMonthPoint(month: month, label: label, perGoal: perGoal, unallocated: remaining))
        }

        return (working, timeline)
    }

    // MARK: Goal gap solvers (binary search — port of solveExtraMonthly / solveExtraMonths)

    static func solveExtraMonthly(
        target: SavingsGoal,
        allGoals: [SavingsGoal],
        baseSurplus: Double,
        deadlineMonths: Int,
        startDate: Date,
        calendar: Calendar
    ) -> Double {
        var lo = 0.0
        var hi = target.target  // worst-case upper bound
        for _ in 0..<32 {
            let mid = (lo + hi) / 2.0
            let workingResult = runGoalSequenceInternal(
                goals: allGoals, surplus: baseSurplus + mid,
                horizon: deadlineMonths, startDate: startDate, calendar: calendar
            )
            let outcome = workingResult.first { $0.goalId == target.id }
            let hits = outcome?.completionMonth != nil && outcome!.completionMonth! <= deadlineMonths
            if hits { hi = mid } else { lo = mid }
            if hi - lo < 0.5 { break }
        }
        return ceil(hi)
    }

    static func solveExtraMonths(
        target: SavingsGoal,
        allGoals: [SavingsGoal],
        surplus: Double,
        baseHorizon: Int,
        startDate: Date,
        calendar: Calendar
    ) -> Int {
        var lo = baseHorizon
        var hi = baseHorizon + 120
        for _ in 0..<32 {
            let mid = Int(ceil(Double(lo + hi) / 2.0))
            let workingResult = runGoalSequenceInternal(
                goals: allGoals, surplus: surplus,
                horizon: mid, startDate: startDate, calendar: calendar
            )
            let outcome = workingResult.first { $0.goalId == target.id }
            let hits = outcome?.completionMonth != nil
            if hits { hi = mid } else { lo = mid }
            if hi - lo <= 1 { break }
        }
        return max(0, hi - baseHorizon)
    }

    /// Lightweight simulation used only by the binary-search solvers — returns working state only.
    static func runGoalSequenceInternal(
        goals: [SavingsGoal],
        surplus: Double,
        horizon: Int,
        startDate: Date,
        calendar: Calendar
    ) -> [WorkingGoal] {
        guard !goals.isEmpty, surplus > 0 else { return [] }
        let sorted = goals.sorted { a, b in
            if a.fundingMode == .fill && b.fundingMode != .fill { return false }
            if b.fundingMode == .fill && a.fundingMode != .fill { return true }
            return a.priority < b.priority
        }
        let (working, _) = simulate(
            goals: sorted, surplus: surplus, horizon: horizon,
            startDate: startDate, calendar: calendar
        )
        return working
    }
}

// swiftlint:enable file_length
