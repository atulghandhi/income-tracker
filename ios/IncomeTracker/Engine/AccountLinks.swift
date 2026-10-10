import Foundation

/// Port of the parts of `src/accountLinks.ts` iOS needs: goals that live in a savings account
/// follow its balance and rate, and the goal planner only shares money that is not already
/// routed into an account. (Linking ledger transfer rows to accounts happens on the web.)
enum AccountLinks {

    /// Port of `syncLinkedGoals`.
    nonisolated static func syncLinkedGoals(_ state: inout LedgerState) {
        guard state.goals.contains(where: { $0.accountId != nil }) else { return }
        // Live balances: the account as the ledger has moved it, not the last typed figure.
        let live = FinanceEngine.deriveLiveAccounts(accounts: state.accounts, months: state.months)
        let assets = Dictionary(
            live.filter { $0.accountClass != .debt }.map { ($0.id, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        for index in state.goals.indices {
            guard let accountId = state.goals[index].accountId else { continue }
            guard let account = assets[accountId] else {
                // The account was deleted or became a debt: keep the last figures, drop the link.
                state.goals[index].accountId = nil
                continue
            }
            let saved = max(0.0, account.balance)
            let rate = max(0.0, account.promoMonths > 0 ? account.promoRate : account.rate)
            if state.goals[index].saved != saved { state.goals[index].saved = saved }
            if state.goals[index].interestRate != rate { state.goals[index].interestRate = rate }
        }
    }

    struct GoalPlanInputs: Equatable, Sendable {
        var monthlySurplus: Double
        var dedicatedMonthly: [String: Double]
        var routedElsewhere: Double
        var routedToGoals: Double
    }

    /// Port of `goalPlanInputs`.
    nonisolated static func goalPlanInputs(
        goals: [SavingsGoal],
        accounts: [Account],
        month: MonthBudget,
        recurringSurplus: Double,
        override: Double?
    ) -> GoalPlanInputs {
        let linked = FinanceEngine.recurringAccountTransfersByAccount(month)
        var goalByAccount: [String: String] = [:]
        for goal in goals { if let accountId = goal.accountId { goalByAccount[accountId] = goal.id } }

        var addBack = 0.0
        var routedElsewhere = 0.0
        var routedToGoals = 0.0
        var dedicated: [String: Double] = [:]
        for account in accounts where account.accountClass != .debt {
            let contribution = FinanceEngine.effectiveContribution(account, linkedTransfers: linked)
            if let amount = linked[account.id] { addBack += max(0.0, amount) }
            if let goalId = goalByAccount[account.id] {
                if contribution > 0 { dedicated[goalId] = contribution }
                routedToGoals += contribution
            } else {
                routedElsewhere += contribution
            }
        }
        let derived = recurringSurplus + addBack - routedElsewhere - routedToGoals
        return GoalPlanInputs(
            monthlySurplus: override ?? derived,
            dedicatedMonthly: dedicated,
            routedElsewhere: routedElsewhere,
            routedToGoals: routedToGoals
        )
    }
}
