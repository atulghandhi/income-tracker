import { canonicalizeMerchant } from "./importer";
import type { LedgerState } from "./types";

// Everything the app remembers about a merchant the user has logged before —
// enough to turn a repeat entry into "confirm amount → save". Built lazily from
// the ledger itself; no external data.
export type MerchantSuggestion = {
  key: string;
  label: string;
  kind: "income" | "expense";
  category: string;
  color: string;
  recurring: boolean;
  count: number;
  lastDate: string; // monthKey or ISO date, used only for recency ranking
  // Recent distinct amounts, newest first. stableAmount is set when the last
  // few occurrences agree (Netflix), so the form can prefill it outright.
  recentAmounts: number[];
  stableAmount: number | null;
};

export type MerchantMemory = {
  suggest: (kind: "income" | "expense", text: string, limit?: number) => MerchantSuggestion[];
  find: (kind: "income" | "expense", text: string) => MerchantSuggestion | undefined;
  all: (kind: "income" | "expense") => MerchantSuggestion[];
};

type Accumulator = {
  key: string;
  label: string;
  kind: "income" | "expense";
  categoryCounts: Map<string, number>;
  color: string;
  recurring: boolean;
  count: number;
  lastDate: string;
  amounts: number[];
};

export function buildMerchantMemory(state: LedgerState): MerchantMemory {
  const groups = new Map<string, Accumulator>();

  const monthKeys = Object.keys(state.months).sort();
  for (const monthKey of monthKeys) {
    const month = state.months[monthKey];
    for (const income of month.incomes) {
      accumulate(groups, "income", income.source, income.amount, "", income.color, income.recurring, income.date ?? monthKey);
    }
    for (const expense of month.expenses) {
      accumulate(groups, "expense", expense.name, expense.amount, expense.category, expense.color, expense.recurring, expense.date ?? monthKey);
    }
  }

  const suggestions = Array.from(groups.values())
    .map(toSuggestion)
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate));
  const byKind = {
    income: suggestions.filter((suggestion) => suggestion.kind === "income"),
    expense: suggestions.filter((suggestion) => suggestion.kind === "expense"),
  };

  return {
    all: (kind) => byKind[kind],
    suggest: (kind, text, limit = 6) => {
      const needle = text.trim().toLowerCase();
      if (!needle) return byKind[kind].slice(0, limit);
      return byKind[kind]
        .filter((suggestion) => suggestion.label.toLowerCase().includes(needle) || suggestion.key.includes(needle))
        .slice(0, limit);
    },
    find: (kind, text) => {
      const needle = text.trim().toLowerCase();
      if (!needle) return undefined;
      return (
        byKind[kind].find((suggestion) => suggestion.label.toLowerCase() === needle) ??
        byKind[kind].find((suggestion) => suggestion.key === canonicalizeMerchant(needle))
      );
    },
  };
}

function accumulate(
  groups: Map<string, Accumulator>,
  kind: "income" | "expense",
  label: string,
  amount: number,
  category: string,
  color: string,
  recurring: boolean,
  date: string,
) {
  const trimmed = label.trim();
  if (!trimmed) return;
  const key = canonicalizeMerchant(trimmed) || trimmed.toLowerCase();
  const groupKey = `${kind}:${key}`;
  const existing = groups.get(groupKey);

  if (!existing) {
    groups.set(groupKey, {
      key,
      label: trimmed,
      kind,
      categoryCounts: new Map(category ? [[category, 1]] : []),
      color,
      recurring,
      count: 1,
      lastDate: date,
      amounts: [amount],
    });
    return;
  }

  existing.count += 1;
  existing.recurring = existing.recurring || recurring;
  if (category) existing.categoryCounts.set(category, (existing.categoryCounts.get(category) ?? 0) + 1);
  if (date >= existing.lastDate) {
    // Months iterate oldest → newest, so the last write wins recency: keep the
    // newest casing and color the user actually saw.
    existing.lastDate = date;
    existing.label = trimmed;
    existing.color = color;
  }
  existing.amounts.push(amount);
}

function toSuggestion(group: Accumulator): MerchantSuggestion {
  const recentAmounts = [...group.amounts].reverse().slice(0, 3);
  const stable = recentAmounts.length >= 2 && recentAmounts.every((amount) => amount === recentAmounts[0]);
  const dominantCategory =
    Array.from(group.categoryCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  return {
    key: group.key,
    label: group.label,
    kind: group.kind,
    category: dominantCategory,
    color: group.color,
    recurring: group.recurring,
    count: group.count,
    lastDate: group.lastDate,
    recentAmounts: Array.from(new Set(recentAmounts)),
    stableAmount: stable ? recentAmounts[0] : group.count === 1 ? group.amounts[0] : null,
  };
}
