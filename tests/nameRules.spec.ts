import { expect, test } from "@playwright/test";
import { createInitialState } from "../src/finance";
import { parseBankCsv } from "../src/importer";
import { applyNameRules, countSameName, findRuleTargeting, normalizeNameRules, renameEverywhere } from "../src/nameRules";
import type { ExpenseEntry, LedgerState } from "../src/types";

function expense(id: string, name: string): ExpenseEntry {
  return { id, name, category: "", amount: 5, color: "#12b886", recurring: false };
}

function ledgerWith(months: Record<string, string[]>, incomes: Record<string, string[]> = {}): LedgerState {
  const state = createInitialState();
  state.months = {};
  for (const monthKey of new Set([...Object.keys(months), ...Object.keys(incomes)])) {
    state.months[monthKey] = {
      incomes: (incomes[monthKey] ?? []).map((source, index) => ({ id: `${monthKey}-i${index}`, source, amount: 5, color: "#12b886", recurring: false })),
      expenses: (months[monthKey] ?? []).map((name, index) => expense(`${monthKey}-e${index}`, name)),
      note: "",
    };
  }
  return state;
}

function names(state: LedgerState) {
  return Object.fromEntries(Object.entries(state.months).map(([key, month]) => [key, month.expenses.map((entry) => entry.name)]));
}

test.describe("rename all", () => {
  test("counts other transactions with the same name across months, ignoring case and spacing", () => {
    const state = ledgerWith({ "2026-08": ["Tesco", "tesco  "], "2026-09": ["Tesco", "Pret"], "2026-10": ["Pret"] }, { "2026-09": ["Tesco"] });
    expect(countSameName(state, "expense", "Tesco", "2026-08-e0")).toEqual({ count: 2, months: 2 });
    expect(countSameName(state, "income", "Tesco")).toEqual({ count: 1, months: 1 });
    expect(countSameName(state, "expense", "Costa")).toEqual({ count: 0, months: 0 });
  });

  test("renames matching entries of the same kind in every month and saves a rule", () => {
    const state = ledgerWith({ "2026-08": ["Tesco", "Pret"], "2026-09": ["TESCO"] }, { "2026-09": ["Tesco"] });
    const result = renameEverywhere(state, "expense", "Tesco", "Groceries ");

    expect(result.renamed).toBe(2);
    expect(names(result.state)).toEqual({ "2026-08": ["Groceries", "Pret"], "2026-09": ["Groceries"] });
    // Income with the same name is a different column and is left alone.
    expect(result.state.months["2026-09"].incomes[0].source).toBe("Tesco");
    expect(result.state.nameRules).toEqual([expect.objectContaining({ kind: "expense", from: "Tesco", to: "Groceries" })]);
  });

  test("renaming again overwrites the earlier rule so new imports get the latest name", () => {
    const state = ledgerWith({ "2026-09": ["Tesco", "Tesco"] });
    const first = renameEverywhere(state, "expense", "Tesco", "Groceries").state;
    const second = renameEverywhere(first, "expense", "Groceries", "Food shop").state;

    expect(names(second)).toEqual({ "2026-09": ["Food shop", "Food shop"] });
    expect(applyNameRules(second.nameRules, "expense", "Tesco")).toBe("Food shop");
    expect(applyNameRules(second.nameRules, "expense", "Groceries")).toBe("Food shop");
    expect(findRuleTargeting(second.nameRules, "expense", "Food shop")?.from).toBe("Tesco");

    // Renaming the same original again replaces its rule rather than adding one.
    const third = renameEverywhere(second, "expense", "Food shop", "Supermarket").state;
    expect(third.nameRules.filter((rule) => rule.from === "Tesco")).toHaveLength(1);
    expect(applyNameRules(third.nameRules, "expense", "Tesco")).toBe("Supermarket");
  });

  test("renaming back to an old name drops the rule that renamed it away", () => {
    const state = ledgerWith({ "2026-09": ["Tesco", "Tesco"] });
    const there = renameEverywhere(state, "expense", "Tesco", "Groceries").state;
    const back = renameEverywhere(there, "expense", "Groceries", "Tesco").state;

    expect(names(back)).toEqual({ "2026-09": ["Tesco", "Tesco"] });
    expect(applyNameRules(back.nameRules, "expense", "Tesco")).toBeUndefined();
    expect(applyNameRules(back.nameRules, "expense", "Groceries")).toBe("Tesco");
  });

  test("new imports pick up the renamed name, and the raw text stays the description", () => {
    const state = renameEverywhere(ledgerWith({ "2026-09": ["Tesco Stores", "Tesco Stores"] }), "expense", "Tesco Stores", "Weekly shop").state;
    const result = parseBankCsv({
      fileName: "bank.csv",
      state,
      text: ["Date,Description,Amount", "21/10/2026,TESCO STORES 2041,-23.50", "22/10/2026,PRET A MANGER,-4.10"].join("\n"),
    });

    const nameFor = (description: string) => result.rows.find((row) => row.description === description)?.name;
    expect(nameFor("TESCO STORES 2041")).toBe("Weekly shop");
    expect(nameFor("PRET A MANGER")).toBe("Pret A Manger");
  });

  test("drops malformed rules on load", () => {
    const rules = normalizeNameRules([
      { id: "a", kind: "expense", from: " Tesco ", to: "Groceries", createdAt: "x", updatedAt: "x" },
      { from: "Same", to: "Same" },
      { from: "", to: "Nothing" },
      null,
      { from: "Payroll", to: "Salary", kind: "income" },
    ]);
    expect(rules.map((rule) => [rule.kind, rule.from, rule.to])).toEqual([
      ["expense", "Tesco", "Groceries"],
      ["income", "Payroll", "Salary"],
    ]);
  });
});
