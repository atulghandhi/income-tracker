import { expect, test } from "@playwright/test";
import { bestDebtPaymentMatch, matchDebtPaymentRows, skipScheduledPayment, syncScheduledDebtPayments } from "../src/debtSync";
import { buildNetWorthOutlook, calculateProjection, createInitialState, recurringDebtPaymentsByAccount, rollForwardDebtBalances } from "../src/finance";
import type { CsvImportRow } from "../src/importer";
import { buildDebtRemindersIcs, nextDueDate } from "../src/retention";
import type { Account, ExpenseEntry, LedgerState, MonthBudget } from "../src/types";

const NOW = "2026-10";

function debt(overrides: Partial<Account>): Account {
  return {
    id: "loan-1",
    name: "Car loan",
    accountClass: "debt",
    type: "loan",
    balance: 8000,
    rate: 0,
    promoRate: 0,
    promoMonths: 0,
    promoAsOf: NOW,
    monthlyContribution: 0,
    creditLimit: 0,
    minimumPayment: 500,
    dueDay: 5,
    balanceAsOf: NOW,
    includeInNetWorth: true,
    color: "#2f7fdd",
    note: "",
    ...overrides,
  };
}

function state(accounts: Account[], months: Record<string, MonthBudget> = { [NOW]: { incomes: [], expenses: [], note: "" } }): LedgerState {
  return { ...createInitialState(), selectedMonth: NOW, accounts, months };
}

function expense(overrides: Partial<ExpenseEntry>): ExpenseEntry {
  return { id: "e1", name: "Payment", category: "Debt payments", amount: 500, color: "#000", recurring: false, ...overrides };
}

function importRow(overrides: Partial<CsvImportRow>): CsvImportRow {
  return {
    id: "row-1",
    rowNumber: 1,
    date: "2026-10-05",
    monthKey: NOW,
    description: "BLACK HORSE FINANCE",
    name: "Black Horse Finance",
    amount: -500,
    rawAmount: "-500",
    kind: "expense",
    suggestedKind: "expense",
    category: "Unsorted",
    suggestedCategory: "Unsorted",
    color: "#000",
    include: true,
    duplicate: false,
    confidence: 0.3,
    note: "",
    hash: "h1",
    categorySource: "heuristic",
    ...overrides,
  };
}

test.describe("scheduled debt payments in the ledger", () => {
  test("adds one planned row per debt with a monthly payment", () => {
    const synced = syncScheduledDebtPayments(state([debt({})]), NOW);
    const rows = synced.months[NOW].expenses;

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Car loan payment", amount: 500, debtAccountId: "loan-1", scheduledPayment: true, recurring: true, date: "2026-10-05" });
    // Running it again changes nothing, and returns the same object.
    expect(syncScheduledDebtPayments(synced, NOW)).toBe(synced);
  });

  test("an imported actual replaces the planned row instead of sitting beside it", () => {
    const synced = syncScheduledDebtPayments(state([debt({})]), NOW);
    const withImport: LedgerState = {
      ...synced,
      months: {
        [NOW]: {
          ...synced.months[NOW],
          expenses: [...synced.months[NOW].expenses, expense({ id: "imp", name: "Black Horse Finance", amount: 500, debtAccountId: "loan-1", imported: { batchId: "b", fileName: "f", rowNumber: 1, hash: "h", originalDescription: "BLACK HORSE FINANCE", importedAt: "" } })],
        },
      },
    };

    const rows = syncScheduledDebtPayments(withImport, NOW).months[NOW].expenses;

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("imp");
    // The actual takes over the planned row's place in the monthly run rate.
    expect(rows[0].recurring).toBe(true);
  });

  test("a card payment that differs from the planned amount still replaces it", () => {
    const card = debt({ id: "card-1", name: "HSBC credit card", type: "credit-card", minimumPayment: 100, dueDay: 12 });
    const synced = syncScheduledDebtPayments(state([card]), NOW);
    const months = { [NOW]: { ...synced.months[NOW], expenses: [...synced.months[NOW].expenses, expense({ id: "imp", amount: 101.34, debtAccountId: "card-1" })] } };

    const rows = syncScheduledDebtPayments({ ...synced, months }, NOW).months[NOW].expenses;

    expect(rows.map((row) => row.amount)).toEqual([101.34]);
  });

  test("links an existing hand-made payment row instead of adding a second one", () => {
    const card = debt({ id: "card-1", name: "HSBC credit card", type: "credit-card", minimumPayment: 100 });
    const months = { [NOW]: { incomes: [], expenses: [expense({ id: "mine", name: "HSBC CC payment", amount: 100, recurring: true })], note: "" } };

    const rows = syncScheduledDebtPayments(state([card], months), NOW).months[NOW].expenses;

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "mine", debtAccountId: "card-1" });
    expect(rows[0].scheduledPayment).toBeFalsy();
  });

  test("adopts a debt-payment row that names the lender even when the amount differs a lot", () => {
    const card = debt({ id: "card-1", name: "Barclaycard", type: "credit-card", minimumPayment: 25 });
    const months = { [NOW]: { incomes: [], expenses: [expense({ id: "mine", name: "Barclaycard payment", amount: 300 }), expense({ id: "shop", name: "Tesco", category: "Food", amount: 25 })], note: "" } };

    const rows = syncScheduledDebtPayments(state([card], months), NOW).months[NOW].expenses;

    expect(rows.map((row) => [row.id, row.debtAccountId])).toEqual([["mine", "card-1"], ["shop", undefined]]);
  });

  test("a carried-forward copy becomes this month's planned row at the account's amount", () => {
    const next = "2026-11";
    const account = debt({ minimumPayment: 520 });
    const months = {
      [NOW]: { incomes: [], expenses: [], note: "" },
      [next]: { incomes: [], expenses: [expense({ id: "seeded", name: "Car loan payment", amount: 500, recurring: true, debtAccountId: "loan-1", seededFrom: { monthKey: NOW, entryId: "x" } })], note: "" },
    };

    const rows = syncScheduledDebtPayments(state([account], months), NOW).months[next].expenses;

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "seeded", amount: 520, scheduledPayment: true });
    expect(rows[0].seededFrom).toBeUndefined();
  });

  test("past months are history: no planned rows are invented there", () => {
    const months = { "2026-08": { incomes: [], expenses: [], note: "" }, [NOW]: { incomes: [], expenses: [], note: "" } };
    const synced = syncScheduledDebtPayments(state([debt({})], months), NOW);
    expect(synced.months["2026-08"].expenses).toHaveLength(0);
  });

  test("removes planned rows when the account is deleted, paid off, or set to no payment", () => {
    const synced = syncScheduledDebtPayments(state([debt({})]), NOW);

    expect(syncScheduledDebtPayments({ ...synced, accounts: [] }, NOW).months[NOW].expenses).toHaveLength(0);
    expect(syncScheduledDebtPayments({ ...synced, accounts: [debt({ minimumPayment: 0 })] }, NOW).months[NOW].expenses).toHaveLength(0);
    expect(syncScheduledDebtPayments({ ...synced, accounts: [debt({ balance: 0 })] }, NOW).months[NOW].expenses).toHaveLength(0);
  });

  test("a skipped month is not re-added and charges no payment in the roll-forward", () => {
    const synced = syncScheduledDebtPayments(state([debt({ balanceAsOf: "2026-09" })]), NOW);
    const skipped = skipScheduledPayment({ ...synced, months: { [NOW]: { ...synced.months[NOW], expenses: [] } } }, "loan-1", NOW);

    const resynced = syncScheduledDebtPayments(skipped, NOW);
    expect(resynced.months[NOW].expenses).toHaveLength(0);

    const [rolled] = rollForwardDebtBalances({ accounts: resynced.accounts, months: resynced.months, currentMonthKey: NOW });
    expect(rolled.balance).toBe(8000);
  });
});

test.describe("matching statement rows to debt payments", () => {
  const loan = debt({});
  const card = debt({ id: "card-1", name: "HSBC credit card", type: "credit-card", minimumPayment: 100, dueDay: 12 });

  test("links a card payment by name even when the amount and bank text differ", () => {
    const match = bestDebtPaymentMatch(importRow({ description: "223231 HSBCBANKPLC", name: "223231 Hsbcbankplc", amount: -101.34, date: "2026-10-13" }), [loan, card]);
    expect(match?.accountId).toBe("card-1");
  });

  test("links a fixed loan payment by exact amount and due date with no name match", () => {
    const match = bestDebtPaymentMatch(importRow({ date: "2026-10-06" }), [loan, card]);
    expect(match?.accountId).toBe("loan-1");
  });

  test("does not guess when only the amount lines up", () => {
    expect(bestDebtPaymentMatch(importRow({ description: "TESCO STORES", name: "Tesco", amount: -100, date: "2026-10-25" }), [loan, card])).toBeNull();
  });

  test("ignores income, duplicates and rows a learned rule already linked", () => {
    const rows = matchDebtPaymentRows(
      [
        importRow({ id: "in", amount: 500, kind: "income" }),
        importRow({ id: "dup", duplicate: true }),
        importRow({ id: "ruled", debtAccountId: "card-1", kind: "debt-payment" }),
        importRow({ id: "match", date: "2026-10-05" }),
      ],
      [loan, card],
    );
    expect(rows.map((row) => row.debtAccountId)).toEqual([undefined, undefined, "card-1", "loan-1"]);
    expect(rows[3]).toMatchObject({ kind: "debt-payment", category: "Debt payments" });
  });
});

test.describe("net worth outlook with debt payments in the ledger", () => {
  test("does not take a linked ledger payment out of cash twice", () => {
    const account = debt({ balance: 6000, minimumPayment: 500 });
    const month: MonthBudget = {
      incomes: [{ id: "i", source: "Salary", amount: 2000, color: "#000", recurring: true }],
      expenses: [expense({ amount: 500, recurring: true, debtAccountId: account.id, scheduledPayment: true })],
      note: "",
    };

    const [, firstMonth] = buildNetWorthOutlook({
      accounts: [account],
      projection: calculateProjection(month),
      months: 1,
      linkedDebtPayments: recurringDebtPaymentsByAccount(month),
    });

    // £2,000 in, £500 of it moves to the loan: net worth rises by the full £2,000.
    expect(firstMonth.netWorth).toBeCloseTo(-6000 + 2000, 2);
    expect(firstMonth.debtBalance).toBeCloseTo(5500, 2);
  });
});

test.describe("debt payment reminders", () => {
  test("one repeating event per debt with an alert two days before", () => {
    const ics = buildDebtRemindersIcs({
      reminders: [
        { id: "a", name: "Car loan", dueDay: 5, amountLabel: "£500.00" },
        { id: "b", name: "HSBC card", dueDay: 30, amountLabel: null },
      ],
      today: new Date(2026, 9, 10),
    });

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:debt-a@theincometracker.com");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261105");
    expect(ics).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=5");
    // Due on the 30th: the last of 28–30 that exists, so February is not skipped.
    expect(ics).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1");
    expect(ics).toContain("SUMMARY:Car loan payment due (£500.00)");
    expect(ics).toContain("SUMMARY:HSBC card payment due\r\n");
    expect(ics).toContain("TRIGGER:-P1DT15H");
  });

  test("next due date clamps to short months", () => {
    expect(nextDueDate(31, new Date(2027, 1, 10)).getDate()).toBe(28);
    expect(nextDueDate(12, new Date(2026, 9, 12)).getDate()).toBe(12);
  });
});
