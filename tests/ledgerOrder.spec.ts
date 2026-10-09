import { expect, test } from "@playwright/test";
import { moveEntry, orderIncomes } from "../src/ledgerOrder";
import type { IncomeEntry } from "../src/types";

const income = (id: string, source: string, amount: number): IncomeEntry => ({ id, source, amount, color: "#12b886", recurring: false });

const incomes = [
  income("a", "Amazon refund", 12),
  income("b", "Salary", 2400),
  income("c", "eBay sale", 40),
  income("d", "amazon Refund", 30),
  income("e", "", 5),
  income("f", "", 8),
];
const ids = (list: IncomeEntry[]) => list.map((entry) => entry.id);

test.describe("Income ordering", () => {
  test("custom order is the stored order", () => {
    expect(orderIncomes(incomes, "custom")).toBe(incomes);
  });

  test("largest first sorts by amount and keeps ties in stored order", () => {
    expect(ids(orderIncomes(incomes, "amount"))).toEqual(["b", "c", "d", "a", "f", "e"]);
    expect(ids(orderIncomes([income("x", "A", 10), income("y", "B", 10)], "amount"))).toEqual(["x", "y"]);
  });

  test("same names together groups case-insensitively, biggest block first", () => {
    // Salary 2400, Amazon refunds 42, eBay 40, then each unnamed row on its own.
    expect(ids(orderIncomes(incomes, "name"))).toEqual(["b", "d", "a", "c", "f", "e"]);
  });

  test("moveEntry drops a row before or after its target", () => {
    expect(ids(moveEntry(incomes, "e", "b", "before"))).toEqual(["a", "e", "b", "c", "d", "f"]);
    expect(ids(moveEntry(incomes, "a", "c", "after"))).toEqual(["b", "c", "a", "d", "e", "f"]);
    expect(moveEntry(incomes, "a", "a", "after")).toBe(incomes);
    expect(moveEntry(incomes, "a", "missing", "after")).toBe(incomes);
  });
});
