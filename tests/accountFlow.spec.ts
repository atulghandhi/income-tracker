import { expect, test } from "@playwright/test";
import {
  ACCOUNT_COLORS,
  accountFlowTotals,
  assignMissingAccounts,
  defaultAccountId,
  defaultPayingAccountId,
  distinctAccountColors,
  nextAccountColor,
  pickAccountColor,
} from "../src/accountFlow";
import { createInitialState, deriveLiveAccounts } from "../src/finance";
import type { Account, ExpenseEntry, IncomeEntry, LedgerState, MonthBudget } from "../src/types";

const TODAY = "2026-10-10";
const NOW = "2026-10";

function account(overrides: Partial<Account>): Account {
  return {
    id: "current",
    name: "Monzo",
    accountClass: "cash",
    type: "current",
    balance: 1000,
    rate: 0,
    promoRate: 0,
    promoMonths: 0,
    promoAsOf: NOW,
    monthlyContribution: 0,
    creditLimit: 0,
    minimumPayment: 0,
    dueDay: 1,
    balanceAsOf: NOW,
    balanceSetOn: "2026-10-01",
    ledgerOffset: 0,
    includeInNetWorth: true,
    color: "#2f7fdd",
    note: "",
    ...overrides,
  };
}

const income = (overrides: Partial<IncomeEntry>): IncomeEntry => ({ id: "i", source: "Salary", amount: 2000, color: "#000", recurring: true, ...overrides });
const expense = (overrides: Partial<ExpenseEntry>): ExpenseEntry => ({ id: "e", name: "Tesco", category: "Food", amount: 40, color: "#000", recurring: false, ...overrides });
const month = (incomes: IncomeEntry[], expenses: ExpenseEntry[]): MonthBudget => ({ incomes, expenses, note: "" });

function live(accounts: Account[], months: Record<string, MonthBudget>) {
  return deriveLiveAccounts({ accounts, months, currentMonthKey: NOW, todayIso: TODAY });
}

test.describe("transactions move their account's balance", () => {
  test("income adds and spending subtracts on a current account", () => {
    const months = { [NOW]: month([income({ accountId: "current", date: "2026-10-05" })], [expense({ accountId: "current", date: "2026-10-06" })]) };
    expect(live([account({})], months)[0].balance).toBe(1000 + 2000 - 40);
  });

  test("spending on a card adds to what is owed; a refund takes it off", () => {
    const card = account({ id: "amex", name: "Amex", accountClass: "debt", type: "credit-card", balance: 500 });
    const months = { [NOW]: month([income({ source: "Refund", amount: 20, accountId: "amex", date: "2026-10-04" })], [expense({ accountId: "amex", date: "2026-10-03" })]) };
    expect(live([card], months)[0].balance).toBe(500 + 40 - 20);
  });

  test("moving a transaction to another account moves its money", () => {
    const savings = account({ id: "isa", name: "ISA", accountClass: "savings", type: "isa", balance: 5000 });
    const months = { [NOW]: month([], [expense({ accountId: "isa", date: "2026-10-06" })]) };
    const [current, isa] = live([account({}), savings], months);
    expect(current.balance).toBe(1000);
    expect(isa.balance).toBe(4960);
  });

  test("a loan payment leaves the current account once; the loan side is the roll-forward's", () => {
    const loan = account({ id: "loan", name: "Car loan", accountClass: "debt", type: "loan", balance: 8000, minimumPayment: 500, balanceAsOf: "2026-09" });
    const months = { [NOW]: month([], [expense({ name: "Car loan payment", amount: 500, accountId: "current", debtAccountId: "loan", date: "2026-10-05" })]) };
    const [current, rolled] = live([account({}), loan], months);
    expect(current.balance).toBe(500);
    expect(rolled.balance).toBe(7500);
  });

  test("paying a debt 'from' the debt itself only counts the payment", () => {
    const loan = account({ id: "loan", accountClass: "debt", type: "loan", balance: 8000, minimumPayment: 500, balanceAsOf: "2026-09" });
    const months = { [NOW]: month([], [expense({ amount: 500, accountId: "loan", debtAccountId: "loan", date: "2026-10-05" })]) };
    expect(live([loan], months)[0].balance).toBe(7500);
  });

  test("a transfer into savings leaves one account and arrives in the other", () => {
    const isa = account({ id: "isa", name: "ISA", accountClass: "savings", type: "isa", balance: 5000 });
    const months = { [NOW]: month([], [expense({ name: "To ISA", amount: 300, accountId: "current", toAccountId: "isa", date: "2026-10-02" })]) };
    const [current, saved] = live([account({}), isa], months);
    expect(current.balance).toBe(700);
    expect(saved.balance).toBe(5300);
  });

  test("ignores what happened before the balance was typed, and what has not happened yet", () => {
    const months = {
      "2026-09": month([income({ id: "old", accountId: "current", date: "2026-09-25" })], []),
      [NOW]: month([income({ id: "later", accountId: "current", date: "2026-10-25" })], [expense({ accountId: "current" /* undated: from the 1st */ })]),
    };
    expect(accountFlowTotals([account({})], months, TODAY).get("current")).toBe(-40);
  });
});

test.describe("giving existing transactions an account", () => {
  function state(accounts: Account[], months: Record<string, MonthBudget>, defaultId?: string): LedgerState {
    return { ...createInitialState(), accounts, months, defaultAccountId: defaultId ?? null };
  }

  test("labels them without moving any balance", () => {
    const months = { [NOW]: month([income({ date: "2026-10-05" })], [expense({ date: "2026-10-06" })]) };
    const before = state([account({})], months);

    const after = assignMissingAccounts(before, TODAY);

    expect(after.months[NOW].incomes[0].accountId).toBe("current");
    expect(after.months[NOW].expenses[0].accountId).toBe("current");
    expect(live(after.accounts, after.months)[0].balance).toBe(1000);
    expect(assignMissingAccounts(after, TODAY)).toBe(after);
  });

  test("reuses the account the same name went to before", () => {
    const savings = account({ id: "isa", name: "ISA", accountClass: "savings", type: "isa" });
    const months = {
      "2026-09": month([income({ id: "a", source: "Interest", accountId: "isa" })], []),
      [NOW]: month([income({ id: "b", source: "Interest" })], []),
    };
    expect(assignMissingAccounts(state([account({}), savings], months), TODAY).months[NOW].incomes[0].accountId).toBe("isa");
  });

  test("never pays a debt from another debt", () => {
    const card = account({ id: "card", name: "Amex", accountClass: "debt", type: "credit-card" });
    const loan = account({ id: "loan", name: "Car loan", accountClass: "debt", type: "loan" });
    const months = { [NOW]: month([], [expense({ name: "Loan", debtAccountId: "loan" })]) };
    const after = assignMissingAccounts(state([card, loan], months), TODAY);
    expect(after.months[NOW].expenses[0].accountId).toBe("loan");
    expect(defaultPayingAccountId(after)).toBeUndefined();
  });

  test("the default is the user's pick, else the first current account", () => {
    const savings = account({ id: "isa", accountClass: "savings", type: "isa" });
    const current = account({});
    expect(defaultAccountId({ accounts: [savings, current], defaultAccountId: null })).toBe("current");
    expect(defaultAccountId({ accounts: [savings, current], defaultAccountId: "isa" })).toBe("isa");
    expect(defaultAccountId({ accounts: [savings, current], defaultAccountId: "deleted" })).toBe("current");
  });
});

test.describe("account colours", () => {
  test("the first accounts get clearly different hues, then shades", () => {
    const used: string[] = [];
    for (let index = 0; index < ACCOUNT_COLORS.length; index += 1) used.push(pickAccountColor(used));
    expect(used).toEqual(ACCOUNT_COLORS);
    const ninth = pickAccountColor(used);
    expect(used).not.toContain(ninth);
  });

  test("duplicate colours are split up, keeping the first", () => {
    const accounts = [account({ id: "a", color: "#2f7fdd" }), account({ id: "b", color: "#2F7FDD" }), account({ id: "c", color: "" })];
    const colours = distinctAccountColors(accounts).map((item) => item.color.toLowerCase());
    expect(colours[0]).toBe("#2f7fdd");
    expect(new Set(colours).size).toBe(3);
  });

  test("the swatch skips colours other accounts use", () => {
    expect(nextAccountColor("#2f7fdd", ["#e05656"])).toBe("#c98500");
  });
});
