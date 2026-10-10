import { nameMentionsAccount } from "./debtSync";
import { effectiveContribution, getMonthKey, recurringAccountTransfersByAccount } from "./finance";
import type { Account, ExpenseEntry, LedgerState, MonthBudget, SavingsGoal } from "./types";

// Keeps Goals, Accounts and the ledger agreeing about savings.
//
//  • A goal can live in a savings or investment account. Its "already saved" and interest rate
//    then come from the account, so the balance is typed once, on Accounts.
//  • A ledger row moving money into an account ("Transfer to ISA £300") is linked to it, so the
//    forecast and goal planner see one £300, not a £300 expense plus a £300 contribution.
//  • The goal planner only shares out money that is not already routed into an account; a linked
//    account's contribution funds its own goal.

export function isAssetAccount(account: Account): boolean {
  return account.accountClass !== "debt";
}

// The rate a linked goal grows at: the intro rate while one is running, then the standard rate.
function currentRate(account: Account): number {
  return Number(account.promoMonths) > 0 ? Number(account.promoRate) || 0 : Number(account.rate) || 0;
}

export function syncLinkedGoals(state: LedgerState): LedgerState {
  if (!state.goals.some((goal) => goal.accountId)) return state;
  const byId = new Map(state.accounts.filter(isAssetAccount).map((account) => [account.id, account]));
  let changed = false;
  const goals = state.goals.map((goal) => {
    if (!goal.accountId) return goal;
    const account = byId.get(goal.accountId);
    if (!account) {
      // The account was deleted or became a debt: keep the last figures, drop the link.
      changed = true;
      return { ...goal, accountId: undefined };
    }
    const saved = Math.max(0, Number(account.balance) || 0);
    const interestRate = Math.max(0, currentRate(account));
    if (goal.saved === saved && goal.interestRate === interestRate) return goal;
    changed = true;
    return { ...goal, saved, interestRate };
  });
  return changed ? { ...state, goals } : state;
}

const SAVINGS_CATEGORIES = new Set(["transfers", "savings", "investments", "investing"]);

// An unlinked row in this month that is clearly the transfer into `account`: it names the account
// and either matches the contribution or is already filed as a transfer/saving. Must be unique.
function findSavingsTransfer(expenses: ExpenseEntry[], account: Account): ExpenseEntry | undefined {
  const planned = Math.max(0, Number(account.monthlyContribution) || 0);
  const candidates = expenses.filter((expense) => {
    if (expense.debtAccountId || expense.toAccountId) return false;
    if (!nameMentionsAccount(`${expense.name} ${expense.imported?.originalDescription ?? ""}`, account)) return false;
    const closeToPlan = planned > 0 && Math.abs(Number(expense.amount) - planned) <= Math.max(2, planned * 0.15);
    return closeToPlan || SAVINGS_CATEGORIES.has(expense.category.trim().toLowerCase());
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

// Links savings transfers in the current and future months. Past months are history and are left
// as the user recorded them.
export function linkSavingsTransfers(state: LedgerState, currentMonthKey = getMonthKey()): LedgerState {
  const assets = state.accounts.filter((account) => isAssetAccount(account) && Number(account.monthlyContribution) > 0);
  if (!assets.length) return state;
  let changed = false;
  const months: Record<string, MonthBudget> = {};
  for (const [monthKey, month] of Object.entries(state.months)) {
    let expenses = month.expenses;
    if (monthKey >= currentMonthKey) {
      for (const account of assets) {
        if (expenses.some((expense) => expense.toAccountId === account.id)) continue;
        const match = findSavingsTransfer(expenses, account);
        if (!match) continue;
        expenses = expenses.map((expense) => (expense === match ? { ...expense, toAccountId: account.id } : expense));
      }
    }
    if (expenses !== month.expenses) changed = true;
    months[monthKey] = expenses === month.expenses ? month : { ...month, expenses };
  }
  return changed ? { ...state, months } : state;
}

export function syncAccountLinks(state: LedgerState, currentMonthKey = getMonthKey()): LedgerState {
  return syncLinkedGoals(linkSavingsTransfers(state, currentMonthKey));
}

export type GoalPlanInputs = {
  // Shared surplus the planner may split between goals.
  monthlySurplus: number;
  // A linked account's monthly contribution, keyed by goal id, for that goal only.
  dedicatedMonthly: Record<string, number>;
  // Contributions that go into accounts with no goal attached, already spoken for.
  routedElsewhere: number;
  // Contributions that fund linked goals directly.
  routedToGoals: number;
};

// The recurring surplus already has any linked transfer rows taken out. Every account's monthly
// contribution is money that leaves the shared pot, so it is taken out here — except where the
// ledger row already did it. A goal's own account then pays its contribution straight into it.
export function goalPlanInputs({
  goals,
  accounts,
  month,
  recurringSurplus,
  override,
}: {
  goals: SavingsGoal[];
  accounts: Account[];
  month: MonthBudget;
  recurringSurplus: number;
  override: number | null;
}): GoalPlanInputs {
  const linked = recurringAccountTransfersByAccount(month);
  const assets = accounts.filter(isAssetAccount);
  const goalByAccount = new Map(goals.filter((goal) => goal.accountId).map((goal) => [goal.accountId!, goal.id]));

  let addBack = 0;
  let routedElsewhere = 0;
  let routedToGoals = 0;
  const dedicatedMonthly: Record<string, number> = {};
  for (const account of assets) {
    const contribution = effectiveContribution(account, linked);
    if (account.id in linked) addBack += Math.max(0, linked[account.id]);
    const goalId = goalByAccount.get(account.id);
    if (goalId) {
      if (contribution > 0) dedicatedMonthly[goalId] = contribution;
      routedToGoals += contribution;
    } else {
      routedElsewhere += contribution;
    }
  }

  const derived = recurringSurplus + addBack - routedElsewhere - routedToGoals;
  return {
    monthlySurplus: override ?? derived,
    dedicatedMonthly,
    routedElsewhere,
    routedToGoals,
  };
}
