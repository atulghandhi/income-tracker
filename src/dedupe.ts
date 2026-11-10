import { buildRulePattern, canonicalizeMerchant, type CsvImportRow, type LedgerMatch } from "./importer";
import type { ExpenseEntry, IncomeEntry, LedgerState, MonthBudget } from "./types";

// Keeps one transaction from being counted twice.
//
// The ledger holds two kinds of row: bank records (imported, with the bank's own text) and the
// user's own rows (typed by hand, or carried forward from last month because they repeat). The
// same money often arrives as both: a "Salary" row the user keeps every month, then the bank's
// "BGC ACME CORP LTD" when the statement is imported. The names rarely agree, so pairing them
// takes more than a text match:
//
//   1. Name    — the bank text names the row (or text that was folded into a row of that name
//                before). Any amount: pay and bills vary. Several bank rows may share one planned
//                row (four weekly wages against one monthly "Wages").
//   2. Amount  — same month, same amount (income: within 10%, since a typed salary is an
//                estimate). One bank row per own row.
//
// A paired bank row replaces the user's row and takes over its name, category and repeat flag.
// The import review shows every pairing and lets the user keep both instead. The same pairing
// runs over a month already in the ledger (findLedgerDuplicates) for doubles that got in earlier.

type Side = "income" | "expense";
type Entry = IncomeEntry | ExpenseEntry;

type BankRecord = {
  key: string;
  monthKey: string;
  side: Side;
  date?: string;
  amount: number;
  description: string;
  name: string;
  // Entry ids the user has said this record is not.
  apart?: string[];
};

type OwnEntry = {
  monthKey: string;
  side: Side;
  entry: Entry;
  label: string;
  // Expected every month (repeating, or carried forward), as opposed to a one-off typed row.
  planned: boolean;
};

type Pairing = { own: OwnEntry; basis: "name" | "amount" };

const INCOME_TOLERANCE = 0.1;
const ONE_OFF_DAY_WINDOW = 5;
// A planned row and the bank rows that name it must be about the same size of money, so a
// planned "Car" payment is not swallowed by a £4 "CAR PARK".
const NAME_MATCH_MIN_RATIO = 0.4;
const NAME_MATCH_MAX_RATIO = 2.5;

// Words in an income label that say nothing about who pays it.
const GENERIC_INCOME_WORDS = new Set(["income", "from", "take", "home", "monthly", "weekly", "main", "work", "part", "time", "full", "paid", "into", "bank", "money"]);

function labelOf(entry: Entry): string {
  return "source" in entry ? entry.source : entry.name;
}

function sideOf(row: Pick<CsvImportRow, "kind">): Side {
  return row.kind === "income" ? "income" : "expense";
}

function cents(amount: number): number {
  return Math.round(Math.abs(Number(amount) || 0) * 100);
}

function dayGap(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000));
}

function tokens(key: string): string[] {
  return key.split(" ").filter((token) => token.length >= 2 && !/^\d+$/.test(token));
}

function tokenHit(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}

// Is this own row a stand-in the app manages itself? Scheduled debt payments (and their carried
// copies) are swapped for the real payment by debtSync.
function isDebtPlaceholder(entry: Entry): boolean {
  if (!("name" in entry)) return false;
  return Boolean(entry.scheduledPayment || (entry.debtAccountId && entry.seededFrom));
}

function ownEntriesOf(monthKey: string, month: MonthBudget): OwnEntry[] {
  const own: OwnEntry[] = [];
  const push = (side: Side, entry: Entry) => {
    if (entry.imported || isDebtPlaceholder(entry) || cents(entry.amount) === 0) return;
    own.push({ monthKey, side, entry, label: labelOf(entry), planned: Boolean(entry.seededFrom) || entry.recurring !== false });
  };
  month.incomes.forEach((income) => push("income", income));
  month.expenses.forEach((expense) => push("expense", expense));
  return own;
}

// Bank text seen before under each label: once "BGC ACME CORP" has been folded into "Salary",
// next month's ACME row is known to be the salary whatever it is called.
function collectAliases(state: Pick<LedgerState, "months">): Map<string, Set<string>> {
  const aliases = new Map<string, Set<string>>();
  const learn = (side: Side, entry: Entry) => {
    const description = entry.imported?.originalDescription;
    if (!description) return;
    const labelKey = canonicalizeMerchant(labelOf(entry));
    const pattern = buildRulePattern(description);
    if (!labelKey || !pattern) return;
    const key = `${side}:${labelKey}`;
    if (!aliases.has(key)) aliases.set(key, new Set());
    aliases.get(key)!.add(pattern);
  };
  for (const month of Object.values(state.months)) {
    month.incomes.forEach((income) => learn("income", income));
    month.expenses.forEach((expense) => learn("expense", expense));
  }
  return aliases;
}

function nameMatches(own: OwnEntry, record: BankRecord, aliases: Map<string, Set<string>>): boolean {
  const labelKey = canonicalizeMerchant(own.label);
  if (!labelKey) return false;
  const descriptionKey = canonicalizeMerchant(record.description);
  const nameKey = canonicalizeMerchant(record.name);
  if (labelKey === descriptionKey || labelKey === nameKey) return true;

  const pattern = buildRulePattern(record.description);
  if (pattern && aliases.get(`${own.side}:${labelKey}`)?.has(pattern)) return true;

  const labelTokens = tokens(labelKey);
  if (!labelTokens.some((token) => token.length >= 3)) return false;
  const recordTokens = [...tokens(descriptionKey), ...tokens(nameKey)];
  // A month has few incomes, so one telling word in common is enough ("Salary (take-home)" and
  // "ACME LTD SALARY"). Spending needs the whole label ("Amazon Prime" is not every "AMAZON").
  if (own.side === "income") {
    return labelTokens.some((token) => token.length >= 4 && !GENERIC_INCOME_WORDS.has(token) && recordTokens.some((other) => tokenHit(token, other)));
  }
  return labelTokens.every((token) => recordTokens.some((other) => tokenHit(token, other)));
}

function keptApart(own: OwnEntry, record: BankRecord): boolean {
  return Boolean(own.entry.keptApart?.includes(record.key) || record.apart?.includes(own.entry.id));
}

function amountMatches(own: OwnEntry, record: BankRecord): boolean {
  const planned = cents(own.entry.amount);
  const actual = cents(record.amount);
  if (planned === actual) return true;
  return own.planned && own.side === "income" && Math.abs(planned - actual) <= planned * INCOME_TOLERANCE;
}

// The core pairing, shared by the import review and the in-ledger check.
function pairRecords(records: BankRecord[], own: OwnEntry[], aliases: Map<string, Set<string>>): Map<string, Pairing> {
  const pairings = new Map<string, Pairing>();
  const groups = new Map<string, { records: BankRecord[]; own: OwnEntry[] }>();
  const groupFor = (monthKey: string, side: Side) => {
    const key = `${monthKey}|${side}`;
    if (!groups.has(key)) groups.set(key, { records: [], own: [] });
    return groups.get(key)!;
  };
  records.forEach((record) => groupFor(record.monthKey, record.side).records.push(record));
  own.forEach((entry) => groupFor(entry.monthKey, entry.side).own.push(entry));

  for (const group of groups.values()) {
    if (!group.records.length || !group.own.length) continue;
    const claims = new Map<OwnEntry, number>();

    // 1. Name. Only planned rows: a one-off the user typed is a single purchase, matched below.
    // Each bank row goes to the planned row nearest in amount, so two planned rows of one name
    // (salary and expenses from one employer) take a bank row each.
    const planned = group.own.filter((candidate) => candidate.planned);
    const assigned = new Map<OwnEntry, BankRecord[]>();
    for (const record of group.records) {
      const best = planned
        .filter((candidate) => !keptApart(candidate, record) && nameMatches(candidate, record, aliases))
        .sort(
          (a, b) =>
            Math.abs(cents(a.entry.amount) - cents(record.amount)) - Math.abs(cents(b.entry.amount) - cents(record.amount)) ||
            (assigned.get(a)?.length ?? 0) - (assigned.get(b)?.length ?? 0),
        )[0];
      if (best) assigned.set(best, [...(assigned.get(best) ?? []), record]);
    }
    for (const [candidate, hits] of assigned) {
      const expected = cents(candidate.entry.amount);
      const total = hits.reduce((sum, record) => sum + cents(record.amount), 0);
      if (total < expected * NAME_MATCH_MIN_RATIO || total > expected * NAME_MATCH_MAX_RATIO) continue;
      claims.set(candidate, hits.length);
      hits.forEach((record) => pairings.set(record.key, { own: candidate, basis: "name" }));
    }

    // 2. Amount, one to one, closest first.
    const candidates: Array<{ record: BankRecord; own: OwnEntry; diff: number; gap: number }> = [];
    for (const record of group.records) {
      if (pairings.has(record.key)) continue;
      for (const candidate of group.own) {
        if (claims.has(candidate) || keptApart(candidate, record) || !amountMatches(candidate, record)) continue;
        // A planned row's date is only the day it was typed or last paid; a one-off is a real day.
        const gap = !candidate.planned && candidate.entry.date && record.date ? dayGap(candidate.entry.date, record.date) : 0;
        if (gap > ONE_OFF_DAY_WINDOW) continue;
        candidates.push({ record, own: candidate, diff: Math.abs(cents(candidate.entry.amount) - cents(record.amount)), gap });
      }
    }
    candidates.sort((a, b) => a.diff - b.diff || a.gap - b.gap);
    for (const candidate of candidates) {
      if (pairings.has(candidate.record.key) || claims.has(candidate.own)) continue;
      claims.set(candidate.own, 1);
      pairings.set(candidate.record.key, { own: candidate.own, basis: "amount" });
    }
  }
  return pairings;
}

// ─── Import review ───────────────────────────────────────────────────────────

function descriptorsAlike(a: string, b: string): boolean {
  const keyA = canonicalizeMerchant(a);
  const keyB = canonicalizeMerchant(b);
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;
  const patternA = buildRulePattern(a);
  if (patternA && patternA === buildRulePattern(b)) return true;
  const tokensA = tokens(keyA);
  const tokensB = tokens(keyB);
  if (!tokensA.length || !tokensB.length) return false;
  const shared = tokensA.filter((token) => tokensB.some((other) => tokenHit(token, other))).length;
  return shared / (tokensA.length + tokensB.length - shared) >= 0.5;
}

// The same bank transaction read from another export (the CSV, then the PDF statement; a bank
// feed, then the file) rarely carries identical text, so the exact hash misses it. Same day,
// same amount and much the same wording is the same transaction. Each ledger entry can account
// for one row only: two equal fares on one day stay two.
function flagRepeatImports(rows: CsvImportRow[], state: Pick<LedgerState, "months">): CsvImportRow[] {
  const exactHashes = new Set(rows.filter((row) => row.duplicate).map((row) => row.hash));
  const byKey = new Map<string, Entry[]>();
  for (const [monthKey, month] of Object.entries(state.months)) {
    const index = (side: Side, entry: Entry) => {
      if (!entry.imported || !entry.date || exactHashes.has(entry.imported.hash)) return;
      const key = `${monthKey}|${side}|${entry.date}|${cents(entry.amount)}`;
      byKey.set(key, [...(byKey.get(key) ?? []), entry]);
    };
    month.incomes.forEach((income) => index("income", income));
    month.expenses.forEach((expense) => index("expense", expense));
  }
  if (!byKey.size) return rows;

  return rows.map((row) => {
    if (row.duplicate || row.kind === "transfer") return row;
    const pool = byKey.get(`${row.monthKey}|${sideOf(row)}|${row.date}|${cents(row.amount)}`);
    const at = pool?.findIndex(
      (entry) => descriptorsAlike(row.description, entry.imported?.originalDescription ?? labelOf(entry)) || descriptorsAlike(row.name, labelOf(entry)),
    );
    if (!pool || at === undefined || at < 0) return row;
    const [entry] = pool.splice(at, 1);
    return { ...row, duplicate: true, include: false, note: `Already imported as “${labelOf(entry)}”` };
  });
}

function matchNote(own: OwnEntry, basis: Pairing["basis"], rowAmount: number, formatter?: Intl.NumberFormat): string {
  const planned = formatter ? formatter.format(own.entry.amount) : String(own.entry.amount);
  if (!own.planned) return `Same amount as “${own.label}”, which you added by hand — replaces it`;
  if (basis === "name") {
    return cents(own.entry.amount) === cents(rowAmount)
      ? `Your planned “${own.label}” — replaces it`
      : `Your planned “${own.label}” (${planned}) — replaces it`;
  }
  return cents(own.entry.amount) === cents(rowAmount)
    ? `Same amount as your planned “${own.label}” — replaces it`
    : `Close to your planned “${own.label}” (${planned}) — replaces it`;
}

// Runs over freshly parsed rows before the review opens. Rows the ledger already has are
// flagged as duplicates; rows that are the real version of one of the user's own entries are
// marked to replace it (row.replaces) and take its name and category.
export function matchLedgerEntries(rows: CsvImportRow[], state: Pick<LedgerState, "months">, formatter?: Intl.NumberFormat): CsvImportRow[] {
  const flagged = flagRepeatImports(rows, state);
  // Debt payments linked to an account are reconciled against its planned payment by debtSync.
  const eligible = flagged.filter((row) => !row.duplicate && row.kind !== "transfer" && !row.debtAccountId && !row.replaces);
  if (!eligible.length) return flagged;

  const monthKeys = new Set(eligible.map((row) => row.monthKey));
  const own = [...monthKeys].flatMap((monthKey) => (state.months[monthKey] ? ownEntriesOf(monthKey, state.months[monthKey]) : []));
  if (!own.length) return flagged;

  const records: BankRecord[] = eligible.map((row) => ({
    key: row.id,
    monthKey: row.monthKey,
    side: sideOf(row),
    date: row.date,
    amount: row.amount,
    description: row.description,
    name: row.name,
  }));
  const pairings = pairRecords(records, own, collectAliases(state));
  if (!pairings.size) return flagged;

  return flagged.map((row) => {
    const pairing = pairings.get(row.id);
    if (!pairing) return row;
    const { own: match, basis } = pairing;
    const entry = match.entry;
    // The user's own category beats a guess, but not a rule they saved or an edit they made.
    const inheritCategory =
      "category" in entry &&
      row.kind === "expense" &&
      Boolean(entry.category) &&
      entry.category !== "Unsorted" &&
      row.categorySource !== "rule" &&
      row.categorySource !== "user";
    const replaces: LedgerMatch = {
      monthKey: match.monthKey,
      entryId: entry.id,
      kind: match.side,
      label: match.label,
      amount: entry.amount,
      basis,
      rowName: row.name,
      rowCategory: row.category,
      rowColor: row.color,
      rowConfidence: row.confidence,
      rowNote: row.note,
    };
    return {
      ...row,
      name: match.label,
      category: inheritCategory ? (entry as ExpenseEntry).category : row.category,
      color: inheritCategory ? entry.color : row.color,
      // A name match is as good as a saved rule; an amount match is worth a glance.
      confidence: basis === "name" ? Math.max(row.confidence, 0.92) : 0.8,
      note: matchNote(match, basis, row.amount, formatter),
      replaces,
    };
  });
}

// "Keep both" in the review: the row goes back to how it was parsed and remembers the entry it
// is not, so the ledger does not ask about the pair again.
export function keepRowApart(row: CsvImportRow): CsvImportRow {
  if (!row.replaces) return row;
  const { replaces, ...rest } = row;
  return {
    ...rest,
    name: replaces.rowName,
    category: replaces.rowCategory,
    color: replaces.rowColor,
    confidence: replaces.rowConfidence,
    note: replaces.rowNote,
    keptApartFrom: replaces.entryId,
  };
}

function findEntry(months: Record<string, MonthBudget>, ref: { monthKey: string; entryId: string; kind: Side }): Entry | undefined {
  const month = months[ref.monthKey];
  if (!month) return undefined;
  return ref.kind === "income" ? month.incomes.find((income) => income.id === ref.entryId) : month.expenses.find((expense) => expense.id === ref.entryId);
}

// The entry a row is about to replace, if it is still there (the ledger can change under an
// open review when another device syncs).
export function replacedEntryFor(months: Record<string, MonthBudget>, row: CsvImportRow): Entry | undefined {
  if (!row.replaces || row.replaces.kind !== sideOf(row)) return undefined;
  const entry = findEntry(months, row.replaces);
  return entry && !entry.imported ? entry : undefined;
}

export function removeEntries(months: Record<string, MonthBudget>, refs: Array<{ monthKey: string; entryId: string; kind: Side }>): Record<string, MonthBudget> {
  if (!refs.length) return months;
  const next = { ...months };
  for (const ref of refs) {
    const month = next[ref.monthKey];
    if (!month) continue;
    next[ref.monthKey] =
      ref.kind === "income"
        ? { ...month, incomes: month.incomes.filter((income) => income.id !== ref.entryId) }
        : { ...month, expenses: month.expenses.filter((expense) => expense.id !== ref.entryId) };
  }
  return next;
}

// ─── Doubles already in the ledger ───────────────────────────────────────────

export type DuplicateEntryRef = {
  entryId: string;
  label: string;
  amount: number;
  date?: string;
  imported: boolean;
};

export type DuplicateGroup = {
  id: string;
  monthKey: string;
  kind: Side;
  // "planned": one of the user's own rows and the bank transaction(s) that are the same money.
  // "repeat": the same row twice.
  reason: "planned" | "repeat";
  remove: DuplicateEntryRef;
  keep: DuplicateEntryRef[];
};

function refOf(entry: Entry): DuplicateEntryRef {
  return { entryId: entry.id, label: labelOf(entry), amount: entry.amount, date: entry.date, imported: Boolean(entry.imported) };
}

function apartEitherWay(a: Entry, b: Entry): boolean {
  return Boolean(a.keptApart?.includes(b.id) || b.keptApart?.includes(a.id));
}

// Pairs in one month that look like the same money counted twice. Nothing is changed: the
// ledger shows them and the user merges or keeps both.
export function findLedgerDuplicates(state: Pick<LedgerState, "months">, monthKey: string): DuplicateGroup[] {
  const month = state.months[monthKey];
  if (!month) return [];
  const groups: DuplicateGroup[] = [];
  const used = new Set<string>();
  const sides: Array<[Side, Entry[]]> = [
    ["income", month.incomes],
    ["expense", month.expenses],
  ];

  // The user's own rows against the bank transactions beside them.
  const own = ownEntriesOf(monthKey, month);
  const bankEntries = new Map<string, Entry>();
  const records: BankRecord[] = [];
  for (const [side, entries] of sides) {
    for (const entry of entries) {
      if (!entry.imported) continue;
      bankEntries.set(entry.id, entry);
      records.push({
        key: entry.id,
        monthKey,
        side,
        date: entry.date,
        amount: entry.amount,
        description: entry.imported.originalDescription || labelOf(entry),
        name: labelOf(entry),
        apart: entry.keptApart,
      });
    }
  }
  if (own.length && records.length) {
    const byOwn = new Map<OwnEntry, Entry[]>();
    for (const [recordKey, pairing] of pairRecords(records, own, collectAliases(state))) {
      byOwn.set(pairing.own, [...(byOwn.get(pairing.own) ?? []), bankEntries.get(recordKey)!]);
    }
    for (const [match, keep] of byOwn) {
      used.add(match.entry.id);
      keep.forEach((entry) => used.add(entry.id));
      groups.push({ id: `dup-${match.entry.id}`, monthKey, kind: match.side, reason: "planned", remove: refOf(match.entry), keep: keep.map(refOf) });
    }
  }

  for (const [side, entries] of sides) {
    for (let index = 0; index < entries.length; index += 1) {
      const first = entries[index];
      if (used.has(first.id) || cents(first.amount) === 0 || isDebtPlaceholder(first)) continue;
      for (let later = index + 1; later < entries.length; later += 1) {
        const second = entries[later];
        if (used.has(second.id) || isDebtPlaceholder(second) || apartEitherWay(first, second)) continue;
        if (cents(first.amount) !== cents(second.amount)) continue;
        if (Boolean(first.imported) !== Boolean(second.imported)) continue;
        const same = first.imported
          ? // Two bank records: same day and wording, from different imports. Twins inside one
            // statement (two bus fares) are real.
            Boolean(second.imported) &&
            first.imported.batchId !== second.imported!.batchId &&
            Boolean(first.date) &&
            first.date === second.date &&
            (first.imported.hash === second.imported!.hash ||
              descriptorsAlike(first.imported.originalDescription || labelOf(first), second.imported!.originalDescription || labelOf(second)))
          : // Two of the user's own rows with one name and amount.
            Boolean(canonicalizeMerchant(labelOf(first))) && canonicalizeMerchant(labelOf(first)) === canonicalizeMerchant(labelOf(second));
        if (!same) continue;
        used.add(second.id);
        groups.push({ id: `dup-${second.id}`, monthKey, kind: side, reason: "repeat", remove: refOf(second), keep: [refOf(first)] });
        break;
      }
    }
  }
  return groups;
}

function mapEntries(month: MonthBudget, kind: Side, update: (entry: Entry) => Entry | null): MonthBudget {
  const apply = <T extends Entry>(entries: T[]) => entries.flatMap((entry) => {
    const next = update(entry);
    return next ? [next as T] : [];
  });
  return kind === "income" ? { ...month, incomes: apply(month.incomes) } : { ...month, expenses: apply(month.expenses) };
}

// Merge: the extra row goes. When it was the user's planned row, the bank transactions that
// stay take over its name, category and repeat flag, exactly as an import would have done.
export function mergeDuplicateGroup(state: LedgerState, group: DuplicateGroup): LedgerState {
  const month = state.months[group.monthKey];
  if (!month) return state;
  const removed = findEntry(state.months, { monthKey: group.monthKey, entryId: group.remove.entryId, kind: group.kind });
  if (!removed) return state;
  const keepIds = new Set(group.keep.map((ref) => ref.entryId));
  const planned = group.reason === "planned";
  const repeats = Boolean(removed.seededFrom) || removed.recurring !== false;

  const next = mapEntries(month, group.kind, (entry) => {
    if (entry.id === removed.id) return null;
    if (!planned || !keepIds.has(entry.id)) return entry;
    const merged: Entry = { ...entry, recurring: entry.recurring || repeats };
    if ("source" in merged) return { ...merged, source: labelOf(removed) };
    const from = removed as ExpenseEntry;
    const inheritCategory = Boolean(from.category) && from.category !== "Unsorted" && merged.categorySource !== "user" && merged.categorySource !== "rule";
    return {
      ...merged,
      name: from.name,
      category: inheritCategory ? from.category : merged.category,
      color: inheritCategory ? from.color : merged.color,
      toAccountId: merged.toAccountId ?? from.toAccountId,
    };
  });
  return { ...state, months: { ...state.months, [group.monthKey]: next } };
}

// Keep both: the pair is remembered on the row that would have gone, so it is not raised again.
export function keepDuplicateGroupApart(state: LedgerState, group: DuplicateGroup): LedgerState {
  const month = state.months[group.monthKey];
  if (!month) return state;
  const keepIds = group.keep.map((ref) => ref.entryId);
  const next = mapEntries(month, group.kind, (entry) =>
    entry.id === group.remove.entryId ? { ...entry, keptApart: Array.from(new Set([...(entry.keptApart ?? []), ...keepIds])) } : entry,
  );
  return { ...state, months: { ...state.months, [group.monthKey]: next } };
}
