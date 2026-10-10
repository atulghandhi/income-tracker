import { expect, test } from "@playwright/test";
import { goalPlanInputs, linkSavingsTransfers, syncLinkedGoals } from "../src/accountLinks";
import { buildNetWorthOutlook, calculateProjection, createInitialState, recurringAccountTransfersByAccount, runGoalSequence } from "../src/finance";
import type { Account, ExpenseEntry, IncomeEntry, LedgerState, MonthBudget, SavingsGoal } from "../src/types";

const NOW = "2026-10";

function isa(overrides: Partial<Account> = {}): Account {
  return {
    id: "isa",
    name: "Vanguard ISA",
    accountClass: "savings",
    type: "isa",
    balance: 4000,
    rate: 4.5,
    promoRate: 0,
    promoMonths: 0,
    promoAsOf: NOW,
    monthlyContribution: 300,
    creditLimit: 0,
    minimumPayment: 0,
    dueDay: 1,
    balanceAsOf: NOW,
    includeInNetWorth: true,
    color: "#1baf7a",
    note: "",
    ...overrides,
  };
}

function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: "house",
    name: "House deposit",
    target: 10000,
    saved: 0,
    color: "#2f7fdd",
    priority: 1,
    fundingMode: "fixed",
    monthlyAmount: 0,
    deadlineMonths: 0,
    interestRate: 0,
    note: "",
    createdAt: "",
    ...overrides,
  };
}

function expense(overrides: Partial<ExpenseEntry>): ExpenseEntry {
  return { id: "e1", name: "Transfer to Vanguard ISA", category: "Transfers", amount: 300, color: "#000", recurring: true, ...overrides };
}

const salary: IncomeEntry = { id: "i", source: "Salary", amount: 2000, color: "#000", recurring: true };

function state(overrides: Partial<LedgerState>): LedgerState {
  return { ...createInitialState(), selectedMonth: NOW, months: { [NOW]: { incomes: [], expenses: [], note: "" } }, ...overrides };
}

test.describe("goals linked to accounts", () => {
  test("saved amount and interest follow the account", () => {
    const synced = syncLinkedGoals(state({ accounts: [isa()], goals: [goal({ accountId: "isa", saved: 50 })] }));
    expect(synced.goals[0]).toMatchObject({ saved: 4000, interestRate: 4.5 });
    // Nothing to change the second time round.
    expect(syncLinkedGoals(synced)).toBe(synced);
  });

  test("uses the intro rate while one is running", () => {
    const synced = syncLinkedGoals(state({ accounts: [isa({ promoRate: 5.2, promoMonths: 6 })], goals: [goal({ accountId: "isa" })] }));
    expect(synced.goals[0].interestRate).toBe(5.2);
  });

  test("drops the link, keeping the last figures, when the account is deleted", () => {
    const linked = syncLinkedGoals(state({ accounts: [isa()], goals: [goal({ accountId: "isa" })] }));
    const unlinked = syncLinkedGoals({ ...linked, accounts: [] });
    expect(unlinked.goals[0].accountId).toBeUndefined();
    expect(unlinked.goals[0].saved).toBe(4000);
  });
});

test.describe("goal planner surplus", () => {
  const month: MonthBudget = { incomes: [salary], expenses: [], note: "" };

  test("shares only money not already going into accounts", () => {
    const plan = goalPlanInputs({ goals: [goal()], accounts: [isa()], month, recurringSurplus: 2000, override: null });
    expect(plan.monthlySurplus).toBe(1700);
    expect(plan.routedElsewhere).toBe(300);
    expect(plan.dedicatedMonthly).toEqual({});
  });

  test("a linked account's contribution funds its own goal instead", () => {
    const plan = goalPlanInputs({ goals: [goal({ accountId: "isa" })], accounts: [isa()], month, recurringSurplus: 2000, override: null });
    expect(plan.monthlySurplus).toBe(1700);
    expect(plan.routedElsewhere).toBe(0);
    expect(plan.dedicatedMonthly).toEqual({ house: 300 });
  });

  test("does not take a transfer out twice when the ledger already has it", () => {
    const withRow: MonthBudget = { ...month, expenses: [expense({ toAccountId: "isa" })] };
    const projection = calculateProjection(withRow);
    expect(projection.recurringMonthlySurplus).toBe(1700);

    const plan = goalPlanInputs({ goals: [goal()], accounts: [isa()], month: withRow, recurringSurplus: projection.recurringMonthlySurplus, override: null });
    expect(plan.monthlySurplus).toBe(1700);
  });

  test("a typed figure still wins over the derived one", () => {
    const plan = goalPlanInputs({ goals: [goal({ accountId: "isa" })], accounts: [isa()], month, recurringSurplus: 2000, override: 500 });
    expect(plan.monthlySurplus).toBe(500);
    expect(plan.dedicatedMonthly).toEqual({ house: 300 });
  });

  test("dedicated money only reaches its own goal, ahead of the shared surplus", () => {
    const first = goal({ id: "first", name: "Holiday", priority: 1, target: 1000, monthlyAmount: 1000 });
    const linked = goal({ id: "house", priority: 2, target: 10000, saved: 4000 });

    const result = runGoalSequence({ goals: [first, linked], monthlySurplus: 0, horizonMonths: 2, dedicatedMonthly: { house: 300 } });
    const [month1] = result.timeline;

    expect(month1.perGoal.house.contribution).toBe(300);
    expect(month1.perGoal.house.accumulated).toBe(4300);
    // No shared surplus, and the house money is not diverted to the higher-priority holiday.
    expect(month1.perGoal.first.contribution).toBe(0);
    expect(result.goals.find((outcome) => outcome.goalId === "house")?.completionMonth).toBeNull();
  });

  test("without dedicated money the engine behaves exactly as before", () => {
    const goals = [goal({ monthlyAmount: 400, interestRate: 3 })];
    const before = runGoalSequence({ goals, monthlySurplus: 500, horizonMonths: 24, startDate: new Date(2026, 9, 1) });
    const after = runGoalSequence({ goals, monthlySurplus: 500, horizonMonths: 24, startDate: new Date(2026, 9, 1), dedicatedMonthly: {} });
    expect(after).toEqual(before);
  });
});

test.describe("savings transfers in the ledger", () => {
  test("links a transfer row that names the account", () => {
    const months = { [NOW]: { incomes: [], expenses: [expense({})], note: "" } };
    const linked = linkSavingsTransfers(state({ accounts: [isa()], months }), NOW);
    expect(linked.months[NOW].expenses[0].toAccountId).toBe("isa");
    expect(linkSavingsTransfers(linked, NOW)).toBe(linked);
  });

  test("a short account word must stand alone: an ISA never claims a VISA payment", () => {
    const account = isa({ name: "ISA" });
    const months = { [NOW]: { incomes: [], expenses: [expense({ name: "VISA payment", category: "Debt payments" })], note: "" } };
    expect(linkSavingsTransfers(state({ accounts: [account], months }), NOW).months[NOW].expenses[0].toAccountId).toBeUndefined();
  });

  test("leaves past months alone", () => {
    const months = { "2026-08": { incomes: [], expenses: [expense({})], note: "" } };
    expect(linkSavingsTransfers(state({ accounts: [isa()], months }), NOW).months["2026-08"].expenses[0].toAccountId).toBeUndefined();
  });

  test("the forecast moves a linked transfer once, not twice", () => {
    const month: MonthBudget = { incomes: [salary], expenses: [expense({ toAccountId: "isa" })], note: "" };
    const [, first] = buildNetWorthOutlook({
      accounts: [isa({ rate: 0 })],
      projection: calculateProjection(month),
      months: 1,
      linkedTransfers: recurringAccountTransfersByAccount(month),
    });
    // £2,000 in; £300 of it moves into the ISA. Net worth rises by £2,000, the ISA by £300.
    expect(first.netWorth).toBeCloseTo(4000 + 2000, 2);
    expect(first.savingsBalance).toBeCloseTo(4300, 2);
  });
});
