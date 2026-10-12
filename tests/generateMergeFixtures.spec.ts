import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { mergeLedgerStates } from "../src/sync/merge";
import type { LedgerState } from "../src/types";

// Writes ios/IncomeTrackerTests/Fixtures/data/merge-fixtures.json: inputs and the
// TypeScript merge's output, which the Swift (and later Kotlin) merges must reproduce.
// Run with GENERATE_MERGE_FIXTURES=1 after changing src/sync/merge.ts.
test.skip(!process.env.GENERATE_MERGE_FIXTURES, "fixture generator; set GENERATE_MERGE_FIXTURES=1");

const NOW = "2026-10-12T10:00:00.000Z";
const OUTPUT = "ios/IncomeTrackerTests/Fixtures/data/merge-fixtures.json";

type Json = Record<string, any>;

function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value ^ (value >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return value / 0x100000000;
  };
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function baseLedger(random: () => number): Json {
  const months: Json = {};
  for (const month of ["2026-09", "2026-10"]) {
    months[month] = {
      note: random() < 0.3 ? `note ${month}` : "",
      incomes: Array.from({ length: 2 }, (_, i) => ({ id: `inc-${month}-${i}`, source: `Salary ${i}`, amount: 1000 + i, color: "#1baf7a", recurring: true, date: `${month}-0${i + 1}` })),
      expenses: Array.from({ length: 4 }, (_, i) => ({
        id: `exp-${month}-${i}`,
        name: `Shop ${i}`,
        category: i % 2 ? "Food" : "Bills",
        amount: 10 * (i + 1),
        color: "#2f7fdd",
        recurring: i === 0,
        date: `${month}-1${i}`,
        ...(i === 3 ? { imported: { batchId: "b0", fileName: "bank.csv", rowNumber: i, hash: `h${month}${i}`, originalDescription: "SHOP", importedAt: NOW } } : {}),
      })),
    };
  }
  return {
    schemaVersion: 8,
    currency: "GBP",
    selectedMonth: "2026-10",
    months,
    goals: [
      { id: "g1", name: "Trip", target: 1000, saved: 100, color: "#000", priority: 1, fundingMode: "fixed", monthlyAmount: 50, deadlineMonths: 0, interestRate: 0, note: "", createdAt: NOW },
      { id: "g2", name: "House", target: 9000, saved: 0, color: "#111", priority: 2, fundingMode: "auto", monthlyAmount: 0, deadlineMonths: 24, interestRate: 2, note: "", createdAt: NOW },
    ],
    goalPlannerSurplus: null,
    goalsHorizonMonths: 60,
    ledgerGoalId: null,
    savingsTarget: 20,
    accounts: [
      { id: "a1", name: "Monzo", accountClass: "cash", type: "current", balance: 500, rate: 0, promoRate: 0, promoMonths: 0, promoAsOf: "2026-10", monthlyContribution: 0, creditLimit: 0, minimumPayment: 0, dueDay: 1, balanceAsOf: "2026-10", balanceSetOn: "2026-10-01", ledgerOffset: 0, includeInNetWorth: true, color: "#2f7fdd", note: "" },
      { id: "a2", name: "Amex", accountClass: "debt", type: "credit-card", balance: 1200, rate: 24.9, promoRate: 0, promoMonths: 6, promoAsOf: "2026-10", monthlyContribution: 0, creditLimit: 5000, minimumPayment: 50, dueDay: 15, balanceAsOf: "2026-10", balanceSetOn: "2026-10-01", ledgerOffset: 0, includeInNetWorth: true, color: "#e05656", note: "", skippedPaymentMonths: ["2026-08"] },
    ],
    defaultAccountId: "a1",
    assumedInvestmentReturn: 6,
    categoryRules: [{ id: "r1", pattern: "shop", category: "Food", kind: "expense", createdAt: NOW, updatedAt: NOW }],
    nameRules: [],
    importBatches: [{ id: "b0", fileName: "bank.csv", importedAt: NOW, totalRows: 2, importedRows: 2, skippedRows: 0, transactionRefs: [{ monthKey: "2026-09", entryId: "exp-2026-09-3", kind: "expense" }, { monthKey: "2026-10", entryId: "exp-2026-10-3", kind: "expense" }] }],
    privacyMode: false,
    aiCategorizationEnabled: false,
    lastSavedAt: NOW,
  };
}

// Random edits one device might make between syncs.
function mutate(state: Json, random: () => number, side: string): Json {
  const next = clone(state);
  const months = Object.keys(next.months);
  const pickMonth = () => months[Math.floor(random() * months.length)];
  const steps = 1 + Math.floor(random() * 5);
  for (let step = 0; step < steps; step += 1) {
    const roll = random();
    const month = next.months[pickMonth()];
    const list = random() < 0.7 ? month.expenses : month.incomes;
    if (roll < 0.15) {
      list.push({ id: `${side}-new-${step}`, name: `${side} item`, source: `${side} income`, category: "Food", amount: Math.round(random() * 1000) / 10, color: "#2f7fdd", recurring: false });
    } else if (roll < 0.3 && list.length) {
      list[Math.floor(random() * list.length)].amount = Math.round(random() * 1000) / 10;
    } else if (roll < 0.4 && list.length) {
      list.splice(Math.floor(random() * list.length), 1);
    } else if (roll < 0.48 && list.length) {
      // Date edit moving an entry to the other month.
      const [entry] = list.splice(Math.floor(random() * list.length), 1);
      const target = months.find((key) => next.months[key] !== month) ?? months[0];
      entry.date = `${target}-20`;
      (list === month.expenses ? next.months[target].expenses : next.months[target].incomes).push(entry);
    } else if (roll < 0.55 && list.length > 1) {
      list.reverse();
    } else if (roll < 0.62) {
      const account = next.accounts[Math.floor(random() * next.accounts.length)];
      if (random() < 0.5) {
        account.balance = Math.round(random() * 5000);
        account.balanceSetOn = "2026-10-11";
      } else {
        account.name = `${account.name} (${side})`;
      }
    } else if (roll < 0.67) {
      const debt = next.accounts.find((account: Json) => account.accountClass === "debt");
      debt.skippedPaymentMonths = [...(debt.skippedPaymentMonths ?? []), side === "local" ? "2026-09" : "2026-10"];
    } else if (roll < 0.72) {
      const goal = next.goals[Math.floor(random() * next.goals.length)];
      goal.priority = goal.priority === 1 ? 2 : 1;
    } else if (roll < 0.77) {
      next.months["2026-10"].expenses.push({ id: `${side}-seed`, name: "Rent", category: "Bills", amount: 900, color: "#000", recurring: true, seededFrom: { monthKey: "2026-09", entryId: "exp-2026-09-0" } });
    } else if (roll < 0.82) {
      next.months["2026-10"].expenses.push({ id: `${side}-imp`, name: "Costa", category: "Food", amount: 3.5, color: "#000", recurring: false, imported: { batchId: `batch-${side}`, fileName: "x.csv", rowNumber: 1, hash: "costa-hash", originalDescription: "COSTA", importedAt: NOW } });
      next.importBatches.unshift({ id: `batch-${side}`, fileName: "x.csv", importedAt: side === "local" ? "2026-10-11T00:00:00.000Z" : "2026-10-11T01:00:00.000Z", totalRows: 1, importedRows: 1, skippedRows: 0, transactionRefs: [{ monthKey: "2026-10", entryId: `${side}-imp`, kind: "expense" }] });
    } else if (roll < 0.87) {
      next.currency = side === "local" ? "EUR" : "USD";
    } else if (roll < 0.92) {
      next[`future_${side}`] = { added: side };
      if (list.length) list[0].futureField = side;
    } else {
      month.note = `${side} note`;
    }
  }
  next.selectedMonth = side === "local" ? "2026-09" : "2026-10";
  return next;
}

test("generate merge fixtures", () => {
  const cases: Array<{ name: string; base: Json | null; local: Json; remote: Json; now: string; expected: LedgerState }> = [];
  for (let seed = 1; seed <= 60; seed += 1) {
    const random = rng(seed);
    const base = baseLedger(random);
    const local = mutate(base, random, "local");
    const remote = mutate(base, random, "remote");
    const useBase = seed % 10 !== 0; // every tenth case is a first-sign-in combine
    cases.push({
      name: `random-${seed}${useBase ? "" : "-nobase"}`,
      base: useBase ? base : null,
      local,
      remote,
      now: NOW,
      expected: mergeLedgerStates(useBase ? (base as LedgerState) : null, local as LedgerState, remote as LedgerState, NOW),
    });
  }
  writeFileSync(OUTPUT, `${JSON.stringify({ generatedFrom: "src/sync/merge.ts", cases })}\n`);
  expect(cases.length).toBe(60);
});
