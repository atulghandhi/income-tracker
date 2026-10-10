import Foundation

/// Port of the balance rules in `src/accountFlow.ts`: every ledger transaction belongs to the
/// account the money moved through, and that account's balance moves with it — counting only
/// transactions dated from the day the balance was typed (`balanceSetOn`) up to today, plus
/// `ledgerOffset`. Debt payments keep their `debtAccountId` (the roll-forward takes them off the
/// debt); a transfer's `toAccountId` also adds to the account it went into.
enum AccountFlow {

    nonisolated static func entryDate(monthKey: String, date: String?) -> String {
        if let date, date.count >= 10 { return String(date.prefix(10)) }
        return "\(monthKey)-01"
    }

    nonisolated static func flowEffect(_ account: Account, income: Bool, amount: Double) -> Double {
        let sign: Double = income ? 1 : -1
        return account.accountClass == .debt ? -sign * amount : sign * amount
    }

    private struct Effect { let accountId: String; let amount: Double }

    private static func effects(income: IncomeEntry, byId: [String: Account]) -> [Effect] {
        guard let id = income.accountId, let account = byId[id] else { return [] }
        return [Effect(accountId: id, amount: flowEffect(account, income: true, amount: max(0.0, income.amount)))]
    }

    private static func effects(expense: ExpenseEntry, byId: [String: Account]) -> [Effect] {
        var result: [Effect] = []
        let amount = max(0.0, expense.amount)
        let into = expense.toAccountId.flatMap { byId[$0] }
        if let id = expense.accountId, let own = byId[id], id != expense.debtAccountId, id != into?.id {
            result.append(Effect(accountId: id, amount: flowEffect(own, income: false, amount: amount)))
        }
        if let into, into.accountClass != .debt {
            result.append(Effect(accountId: into.id, amount: amount))
        }
        return result
    }

    /// Port of `accountFlowTotals`.
    nonisolated static func flowTotals(accounts: [Account], months: [String: MonthBudget], todayIso: String) -> [String: Double] {
        let byId = Dictionary(accounts.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var totals: [String: Double] = [:]
        func add(_ date: String, _ effect: Effect) {
            guard let account = byId[effect.accountId] else { return }
            guard date >= (account.balanceSetOn ?? "0000-00-00"), date <= todayIso else { return }
            totals[effect.accountId, default: 0] += effect.amount
        }
        for (monthKey, month) in months {
            for income in month.incomes {
                let date = entryDate(monthKey: monthKey, date: income.date)
                effects(income: income, byId: byId).forEach { add(date, $0) }
            }
            for expense in month.expenses {
                let date = entryDate(monthKey: monthKey, date: expense.date)
                effects(expense: expense, byId: byId).forEach { add(date, $0) }
            }
        }
        return totals
    }

    /// Port of `applyAccountFlows`. Debts never go below zero.
    nonisolated static func applyFlows(accounts: [Account], months: [String: MonthBudget], todayIso: String) -> [Account] {
        guard !accounts.isEmpty else { return accounts }
        let totals = flowTotals(accounts: accounts, months: months, todayIso: todayIso)
        return accounts.map { account in
            let moved = (totals[account.id] ?? 0) + (account.ledgerOffset ?? 0)
            guard moved != 0 else { return account }
            var next = account
            let raw = account.balance + moved
            next.balance = ((account.accountClass == .debt ? max(0.0, raw) : raw) * 100).rounded() / 100
            return next
        }
    }
}
