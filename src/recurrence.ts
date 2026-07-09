import { canonicalizeMerchant } from "./importer";
import type { ExpenseEntry, IncomeEntry, LedgerState, MonthBudget } from "./types";

// Local recurring-transaction detection — no server, works in privacy mode.
// Groups ledger entries by canonical merchant and looks for a steady cadence
// with a steady amount. Powers the subscriptions panel, "mark as recurring"
// suggestions, missed-payment signals, and the seeded↔imported reconciliation.

export type RecurrenceCadence = "weekly" | "4-weekly" | "monthly" | "quarterly" | "annual";

export type RecurrenceEntryRef = {
  monthKey: string;
  entryId: string;
  kind: "income" | "expense";
};

export type RecurrenceCandidate = {
  key: string;
  label: string;
  kind: "income" | "expense";
  category: string;
  color: string;
  cadence: RecurrenceCadence;
  typicalAmount: number;
  monthlyEquivalent: number;
  occurrences: number;
  lastSeen: string; // ISO date or monthKey
  nextExpected: string | null; // ISO date; null when occurrences carry no dates
  confidence: number;
  alreadyRecurring: boolean;
  entryRefs: RecurrenceEntryRef[];
};

type Occurrence = {
  monthKey: string;
  entryId: string;
  kind: "income" | "expense";
  amount: number;
  date?: string;
  recurring: boolean;
  category: string;
  color: string;
  label: string;
};

const CADENCE_DAYS: Record<RecurrenceCadence, number> = {
  weekly: 7,
  "4-weekly": 28,
  monthly: 30,
  quarterly: 91,
  annual: 365,
};

const MONTHLY_FACTOR: Record<RecurrenceCadence, number> = {
  weekly: 52 / 12,
  "4-weekly": 13 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  annual: 1 / 12,
};

export function detectRecurringCandidates(state: LedgerState): RecurrenceCandidate[] {
  const groups = new Map<string, Occurrence[]>();

  for (const [monthKey, month] of Object.entries(state.months)) {
    for (const income of month.incomes) {
      pushOccurrence(groups, monthKey, income.id, "income", income.amount, income.date, income.recurring, "", income.color, income.source);
    }
    for (const expense of month.expenses) {
      pushOccurrence(groups, monthKey, expense.id, "expense", expense.amount, expense.date, expense.recurring, expense.category, expense.color, expense.name);
    }
  }

  const candidates: RecurrenceCandidate[] = [];
  for (const occurrences of groups.values()) {
    const candidate = classifyGroup(occurrences);
    if (candidate) candidates.push(candidate);
  }

  return candidates.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
}

// Detected-but-unflagged candidates: the "mark as recurring?" suggestion list.
export function suggestRecurringFlags(state: LedgerState): RecurrenceCandidate[] {
  return detectRecurringCandidates(state).filter((candidate) => !candidate.alreadyRecurring && candidate.confidence >= 0.6);
}

// Expense candidates on a repeating cadence — the subscriptions/bills panel.
export function detectSubscriptions(state: LedgerState): RecurrenceCandidate[] {
  return detectRecurringCandidates(state).filter(
    (candidate) => candidate.kind === "expense" && candidate.confidence >= 0.6,
  );
}

// Candidates whose next expected date has passed with no matching entry — the
// "council tax usually lands by the 3rd" signal. Grace of 4 days before flagging.
export function findMissedRecurring(state: LedgerState, todayIso: string): RecurrenceCandidate[] {
  const currentMonthKey = todayIso.slice(0, 7);
  return detectRecurringCandidates(state).filter((candidate) => {
    if (!candidate.nextExpected || candidate.confidence < 0.7) return false;
    if (candidate.cadence === "weekly") return false; // too noisy to nag about
    const graceCutoff = shiftIsoDate(candidate.nextExpected, 4);
    if (todayIso <= graceCutoff) return false;
    // Not missed if something already landed for it in the expected month.
    const expectedMonth = candidate.nextExpected.slice(0, 7);
    if (expectedMonth < currentMonthKey) return false;
    return !candidate.entryRefs.some((ref) => ref.monthKey === expectedMonth);
  });
}

// A CSV/feed import can bring in the real salary or rent line for a month that
// auto-seeding already populated. Rather than doubling, the seeded copy folds
// into the imported actual: the import wins (real amount + metadata) and takes
// over the recurring role. Returns how many rows merged so the caller can toast.
export function reconcileSeededEntries(month: MonthBudget): { month: MonthBudget; merged: number } {
  let merged = 0;

  const importedIncomeKeys = new Set(
    month.incomes.filter((income) => !income.seededFrom && income.imported).map((income) => canonicalizeMerchant(income.source)),
  );
  const importedExpenseKeys = new Set(
    month.expenses.filter((expense) => !expense.seededFrom && expense.imported).map((expense) => canonicalizeMerchant(expense.name)),
  );

  const seededIncomeByKey = new Map(
    month.incomes.filter((income) => income.seededFrom).map((income) => [canonicalizeMerchant(income.source), income]),
  );
  const seededExpenseByKey = new Map(
    month.expenses.filter((expense) => expense.seededFrom).map((expense) => [canonicalizeMerchant(expense.name), expense]),
  );

  const incomes = month.incomes
    .filter((income) => {
      const drop = Boolean(income.seededFrom && importedIncomeKeys.has(canonicalizeMerchant(income.source)));
      if (drop) merged += 1;
      return !drop;
    })
    .map((income) => {
      if (income.seededFrom || !income.imported) return income;
      const seeded = seededIncomeByKey.get(canonicalizeMerchant(income.source));
      return seeded ? { ...income, recurring: true } : income;
    });

  const expenses = month.expenses
    .filter((expense) => {
      const drop = Boolean(expense.seededFrom && importedExpenseKeys.has(canonicalizeMerchant(expense.name)));
      if (drop) merged += 1;
      return !drop;
    })
    .map((expense) => {
      if (expense.seededFrom || !expense.imported) return expense;
      const seeded = seededExpenseByKey.get(canonicalizeMerchant(expense.name));
      if (!seeded) return expense;
      // The seeded copy knew the category (it came from the recurring template);
      // an Unsorted import inherits it instead of demanding a re-sort.
      return {
        ...expense,
        recurring: true,
        category: expense.category === "Unsorted" && seeded.category ? seeded.category : expense.category,
        color: expense.category === "Unsorted" && seeded.category ? seeded.color : expense.color,
      };
    });

  return merged ? { month: { ...month, incomes, expenses }, merged } : { month, merged: 0 };
}

// Back-fill the recurring flag on every entry that belongs to a candidate.
export function applyRecurringFlag(state: LedgerState, candidate: RecurrenceCandidate): LedgerState {
  const refKeys = new Set(candidate.entryRefs.map((ref) => `${ref.monthKey}:${ref.entryId}`));
  const months = Object.fromEntries(
    Object.entries(state.months).map(([monthKey, month]) => [
      monthKey,
      {
        ...month,
        incomes: month.incomes.map((income: IncomeEntry) =>
          refKeys.has(`${monthKey}:${income.id}`) ? { ...income, recurring: true } : income,
        ),
        expenses: month.expenses.map((expense: ExpenseEntry) =>
          refKeys.has(`${monthKey}:${expense.id}`) ? { ...expense, recurring: true } : expense,
        ),
      },
    ]),
  );
  return { ...state, months };
}

function pushOccurrence(
  groups: Map<string, Occurrence[]>,
  monthKey: string,
  entryId: string,
  kind: "income" | "expense",
  amount: number,
  date: string | undefined,
  recurring: boolean,
  category: string,
  color: string,
  label: string,
) {
  const key = canonicalizeMerchant(label);
  if (!key || amount <= 0) return;
  const groupKey = `${kind}:${key}`;
  const list = groups.get(groupKey) ?? [];
  list.push({ monthKey, entryId, kind, amount, date, recurring, category, color, label });
  groups.set(groupKey, list);
}

function classifyGroup(occurrences: Occurrence[]): RecurrenceCandidate | null {
  if (occurrences.length < 3) return null;

  const sorted = [...occurrences].sort((a, b) => (a.date ?? a.monthKey).localeCompare(b.date ?? b.monthKey));
  const amounts = sorted.map((occurrence) => occurrence.amount);
  const typicalAmount = median(amounts.slice(-3));
  const tolerance = Math.max(2, typicalAmount * 0.15);
  const amountsStable = amounts.filter((amount) => Math.abs(amount - typicalAmount) <= tolerance).length >= sorted.length - 1;
  if (!amountsStable) return null;

  const dated = sorted.filter((occurrence) => occurrence.date);
  let cadence: RecurrenceCadence | null = null;
  let gapStability = 0;

  if (dated.length >= 3) {
    const gaps: number[] = [];
    for (let index = 1; index < dated.length; index += 1) {
      gaps.push(dayDiff(dated[index - 1].date!, dated[index].date!));
    }
    const medianGap = median(gaps);
    cadence = cadenceFromGap(medianGap);
    if (cadence) {
      const window = cadence === "weekly" ? 2 : 4;
      const inWindow = gaps.filter((gap) => Math.abs(gap - medianGap) <= window).length;
      gapStability = inWindow / gaps.length;
      if (gapStability < 0.6) cadence = null;
    }
  }

  if (!cadence) {
    // Undated (manual) entries: appearing in 3+ distinct, mostly-consecutive months
    // with a stable amount is a monthly pattern.
    const months = Array.from(new Set(sorted.map((occurrence) => occurrence.monthKey))).sort();
    if (months.length < 3) return null;
    const consecutive = countConsecutiveMonthPairs(months);
    if (consecutive < months.length - 2) return null;
    cadence = "monthly";
    gapStability = consecutive / (months.length - 1);
  }

  const last = sorted[sorted.length - 1];
  const lastSeen = last.date ?? last.monthKey;
  const nextExpected = last.date ? shiftIsoDate(last.date, CADENCE_DAYS[cadence]) : null;

  const confidence = Math.min(
    0.95,
    0.55 + 0.05 * Math.min(sorted.length, 7) + 0.2 * gapStability,
  );

  const latestCategorized = [...sorted].reverse().find((occurrence) => occurrence.category);
  return {
    key: canonicalizeMerchant(last.label),
    label: last.label,
    kind: last.kind,
    category: latestCategorized?.category ?? "",
    color: last.color,
    cadence,
    typicalAmount,
    monthlyEquivalent: Number((typicalAmount * MONTHLY_FACTOR[cadence]).toFixed(2)),
    occurrences: sorted.length,
    lastSeen,
    nextExpected,
    confidence: Number(confidence.toFixed(2)),
    alreadyRecurring: sorted.every((occurrence) => occurrence.recurring),
    entryRefs: sorted.map((occurrence) => ({ monthKey: occurrence.monthKey, entryId: occurrence.entryId, kind: occurrence.kind })),
  };
}

function cadenceFromGap(medianGap: number): RecurrenceCadence | null {
  if (medianGap >= 5 && medianGap <= 9) return "weekly";
  // 4-weekly only when the gap sits tightly at 27–29; day-of-month billing drifts 28–33.
  if (medianGap >= 26 && medianGap < 29.5) return "4-weekly";
  if (medianGap >= 29.5 && medianGap <= 33) return "monthly";
  if (medianGap >= 85 && medianGap <= 97) return "quarterly";
  if (medianGap >= 350 && medianGap <= 380) return "annual";
  return null;
}

function countConsecutiveMonthPairs(sortedMonths: string[]): number {
  let pairs = 0;
  for (let index = 1; index < sortedMonths.length; index += 1) {
    if (monthDiff(sortedMonths[index - 1], sortedMonths[index]) === 1) pairs += 1;
  }
  return pairs;
}

function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function shiftIsoDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
