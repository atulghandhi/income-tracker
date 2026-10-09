import { canonicalizeMerchant } from "./importer";
import type { IncomeEntry } from "./types";

// How the income column is ordered. "custom" is the stored array order, which
// drag and drop edits; the other two are live views computed on render.
export type IncomeSortMode = "custom" | "amount" | "name";

export const INCOME_SORT_OPTIONS: { value: IncomeSortMode; label: string }[] = [
  { value: "custom", label: "Your order" },
  { value: "amount", label: "Largest first" },
  { value: "name", label: "Same names together" },
];

export function isIncomeSortMode(value: unknown): value is IncomeSortMode {
  return INCOME_SORT_OPTIONS.some((option) => option.value === value);
}

export function orderIncomes(incomes: IncomeEntry[], mode: IncomeSortMode): IncomeEntry[] {
  if (mode === "custom") return incomes;
  const position = new Map(incomes.map((income, index) => [income.id, index]));
  const byAmount = (a: IncomeEntry, b: IncomeEntry) => b.amount - a.amount || (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0);
  if (mode === "amount") return [...incomes].sort(byAmount);

  // Same names together: "Amazon refund" ×3 sit as one block. Blocks are ordered
  // by their combined total, largest first, and rows inside a block by amount.
  // Unnamed rows never group with each other.
  const groups = new Map<string, { total: number; first: number; items: IncomeEntry[] }>();
  incomes.forEach((income, index) => {
    const key = canonicalizeMerchant(income.source) || income.source.trim().toLowerCase() || `id:${income.id}`;
    const group = groups.get(key);
    if (group) {
      group.total += income.amount;
      group.items.push(income);
    } else {
      groups.set(key, { total: income.amount, first: index, items: [income] });
    }
  });
  return Array.from(groups.values())
    .sort((a, b) => b.total - a.total || a.first - b.first)
    .flatMap((group) => group.items.sort(byAmount));
}

// Moves one entry next to another, keeping everything else in place.
export function moveEntry<T extends { id: string }>(items: T[], sourceId: string, targetId: string, edge: "before" | "after"): T[] {
  if (sourceId === targetId) return items;
  const source = items.find((item) => item.id === sourceId);
  const remaining = items.filter((item) => item.id !== sourceId);
  const targetIndex = remaining.findIndex((item) => item.id === targetId);
  if (!source || targetIndex === -1) return items;
  const insertIndex = edge === "before" ? targetIndex : targetIndex + 1;
  return [...remaining.slice(0, insertIndex), source, ...remaining.slice(insertIndex)];
}
