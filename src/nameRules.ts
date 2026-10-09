import { createId } from "./finance";
import type { LedgerState, MonthBudget, NameRule } from "./types";

export type NameKind = NameRule["kind"];

// Two names are "the same" when they differ only by case or spacing.
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function entryName(month: MonthBudget, kind: NameKind) {
  return kind === "income"
    ? month.incomes.map((income) => ({ id: income.id, name: income.source }))
    : month.expenses.map((expense) => ({ id: expense.id, name: expense.name }));
}

// How many other transactions, across every month, share a name. Drives the
// "rename all?" prompt.
export function countSameName(
  state: LedgerState,
  kind: NameKind,
  name: string,
  excludeEntryId?: string,
): { count: number; months: number } {
  const key = nameKey(name);
  if (!key) return { count: 0, months: 0 };
  let count = 0;
  let months = 0;
  for (const month of Object.values(state.months)) {
    const matches = entryName(month, kind).filter((entry) => entry.id !== excludeEntryId && nameKey(entry.name) === key).length;
    count += matches;
    if (matches) months += 1;
  }
  return { count, months };
}

// The rule that currently names new transactions `name`, if any.
export function findRuleTargeting(rules: NameRule[], kind: NameKind, name: string): NameRule | undefined {
  const key = nameKey(name);
  return key ? rules.find((rule) => rule.kind === kind && nameKey(rule.to) === key) : undefined;
}

// The name a new transaction should get. Candidates are tried in order (the
// short merchant name first, then the raw bank text).
export function applyNameRules(rules: NameRule[], kind: NameKind, ...candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const key = nameKey(candidate);
    if (!key) continue;
    const rule = rules.find((item) => item.kind === kind && nameKey(item.from) === key);
    if (rule) return rule.to;
  }
  return undefined;
}

// Renames every `from` transaction of this kind, in every month, to `to`, and
// saves a rule so future imports follow. Renaming again keeps one rule per
// original name: rules that pointed at `from` now point at `to`.
export function renameEverywhere(state: LedgerState, kind: NameKind, from: string, to: string): { state: LedgerState; renamed: number } {
  const fromKey = nameKey(from);
  const nextName = to.trim();
  if (!fromKey || !nextName) return { state, renamed: 0 };

  let renamed = 0;
  const months = Object.fromEntries(
    Object.entries(state.months).map(([monthKey, month]) => {
      if (kind === "income") {
        return [
          monthKey,
          {
            ...month,
            incomes: month.incomes.map((income) => {
              if (nameKey(income.source) !== fromKey || income.source === nextName) return income;
              renamed += 1;
              return { ...income, source: nextName };
            }),
          },
        ];
      }
      return [
        monthKey,
        {
          ...month,
          expenses: month.expenses.map((expense) => {
            if (nameKey(expense.name) !== fromKey || expense.name === nextName) return expense;
            renamed += 1;
            return { ...expense, name: nextName };
          }),
        },
      ];
    }),
  );

  return {
    state: { ...state, months, nameRules: upsertNameRule(state.nameRules, kind, from, nextName, new Date().toISOString()) },
    renamed,
  };
}

export function upsertNameRule(rules: NameRule[], kind: NameKind, from: string, rawTo: string, timestamp: string): NameRule[] {
  const to = rawTo.trim();
  const fromKey = nameKey(from);
  const toKey = nameKey(to);
  const existing = rules.find((rule) => rule.kind === kind && nameKey(rule.from) === fromKey);

  const next = rules
    // The rule for `from` is replaced below. `to` is a name the user wants now,
    // so any rule renaming it away goes too.
    .filter((rule) => !(rule.kind === kind && (nameKey(rule.from) === fromKey || nameKey(rule.from) === toKey)))
    // A rule that renamed things to `from` now renames them to `to`.
    .map((rule) => (rule.kind === kind && nameKey(rule.to) === fromKey ? { ...rule, to, updatedAt: timestamp } : rule));

  next.push({
    id: existing?.id ?? createId("name-rule"),
    kind,
    from: from.trim(),
    to,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });

  // A chain that loops back to its own name ("A" → "B", then "B" → "A") does nothing.
  return next.filter((rule) => rule.from !== rule.to).slice(-200);
}

export function normalizeNameRules(rules: unknown): NameRule[] {
  if (!Array.isArray(rules)) return [];
  const now = new Date().toISOString();
  return rules
    .filter((rule): rule is NameRule => Boolean(rule) && typeof rule.from === "string" && typeof rule.to === "string")
    .filter((rule) => rule.from.trim() && rule.to.trim() && rule.from.trim() !== rule.to.trim())
    .map((rule) => ({
      id: typeof rule.id === "string" && rule.id ? rule.id : createId("name-rule"),
      kind: rule.kind === "income" ? "income" : "expense",
      from: rule.from.trim(),
      to: rule.to.trim(),
      createdAt: typeof rule.createdAt === "string" ? rule.createdAt : now,
      updatedAt: typeof rule.updatedAt === "string" ? rule.updatedAt : now,
    }));
}
