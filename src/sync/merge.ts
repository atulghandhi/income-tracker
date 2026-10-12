// Three-way merge of whole ledgers (docs/ANDROID_APP_SPEC.md §4.4–4.5).
//
// `base` is the last state this device knows the server had, `local` is what this
// device holds now, `remote` is what the server holds now. Every entity with an id
// (transactions, goals, accounts, rules, import batches) merges on its own, field by
// field, so two devices editing different things never lose each other's work.
//
// Rules, in order of precedence:
//   • Added on one side → kept. Deleted on one side and untouched on the other → deleted.
//   • Deleted on one side but edited on the other → the edit is kept. Losing a real
//     transaction is worse than a deleted one coming back.
//   • A field changed on one side only → that side's value.
//   • The same field changed differently on both sides → local wins. Only the device
//     whose push lost the race runs this merge, and its user has just acted.
//   • Fields that only make sense together (an account balance and the date it was
//     set, an entry's date and month) move as one unit, never mixed between sides.
//
// Keys this build does not recognise merge like any other field, so data written by
// a newer client survives. The result still needs `normalizeState` (the caller runs it).

import type { ExpenseEntry, IncomeEntry, LedgerState, MonthBudget } from "../types";
import { canonicalJson, valuesEqual } from "./canonical";

type Rec = Record<string, unknown>;
type Special = (base: unknown, local: unknown, remote: unknown) => unknown;

// Import history keeps the newest 25 batches (same cap as the import commit).
const IMPORT_BATCH_CAP = 25;

// Root keys holding collections merged per entity; everything else at the root is a field.
const COLLECTION_KEYS = new Set(["months", "goals", "accounts", "categoryRules", "nameRules", "importBatches"]);

// Month and kind travel with a transaction as pseudo-fields, so moving an entry to
// another month (a date edit) merges like any other edit.
const MONTH_FIELD = "__month";
const KIND_FIELD = "__kind";

const TRANSACTION_GROUPS = [
  ["date", MONTH_FIELD],
  // Editing a scheduled payment's amount confirms it as the real payment.
  ["amount", "scheduledPayment"],
];

const ACCOUNT_GROUPS = [
  ["balance", "balanceAsOf", "balanceSetOn", "ledgerOffset"],
  ["rate", "promoRate", "promoMonths", "promoAsOf"],
  ["accountClass", "type"],
];

const GOAL_GROUPS = [["fundingMode", "monthlyAmount"]];

export function mergeLedgerStates(
  base: LedgerState | null,
  local: LedgerState,
  remote: LedgerState,
  now: string = new Date().toISOString(),
): LedgerState {
  const baseTx = flattenTransactions(base);
  const localTx = flattenTransactions(local);
  const remoteTx = flattenTransactions(remote);

  // ── Transactions ──
  const mergedTx = new Map<string, Rec>();
  for (const id of unionIds(baseTx.order, localTx.order, remoteTx.order)) {
    const merged = mergeEntity(baseTx.byId.get(id), localTx.byId.get(id), remoteTx.byId.get(id), (b, l, r) =>
      mergeFields(b, l, r, TRANSACTION_GROUPS),
    );
    if (merged) mergedTx.set(id, merged);
  }

  const { dropped, survivorOf } = pairIndependentDuplicates(mergedTx, baseTx.byId, localTx.byId, remoteTx.byId, localTx.order, remoteTx.order);
  for (const id of dropped) mergedTx.delete(id);

  const months = buildMonths(base, local, remote, mergedTx, localTx.groupOrder, remoteTx.groupOrder);

  // ── Other collections ──
  const goals = mergeCollection(base?.goals, local.goals, remote.goals, (b, l, r) => mergeFields(b, l, r, GOAL_GROUPS));
  goals.sort((a, b) => Number(a.priority) - Number(b.priority));

  const accounts = mergeCollection(base?.accounts, local.accounts, remote.accounts, (b, l, r) =>
    mergeFields(b, l, r, ACCOUNT_GROUPS, { skippedPaymentMonths: mergeSet }),
  );

  const categoryRules = mergeCollection(base?.categoryRules, local.categoryRules, remote.categoryRules, (b, l, r) => mergeFields(b, l, r));
  const nameRules = mergeCollection(base?.nameRules ?? [], local.nameRules ?? [], remote.nameRules ?? [], (b, l, r) => mergeFields(b, l, r));

  const importBatches = mergeCollection(base?.importBatches, local.importBatches, remote.importBatches, (b, l, r) =>
    mergeFields(b, l, r, [], { transactionRefs: mergeSet }),
  )
    .map((batch) => remapBatchRefs(batch, survivorOf, mergedTx))
    .sort((a, b) => String(b.importedAt ?? "").localeCompare(String(a.importedAt ?? "")))
    .slice(0, IMPORT_BATCH_CAP);

  // ── Root fields ──
  const root = mergeFields(rootFields(base), rootFields(local) ?? {}, rootFields(remote) ?? {}, [], {
    // The month on screen is this device's business.
    selectedMonth: (_b, l) => l,
    schemaVersion: (_b, l, r) => Math.max(Number(l) || 0, Number(r) || 0),
    lastSavedAt: () => now,
  });

  return {
    ...root,
    months,
    goals,
    accounts,
    categoryRules,
    nameRules,
    importBatches,
  } as unknown as LedgerState;
}

// ─── Entity and field merging ────────────────────────────────────────────────

function mergeEntity(
  base: Rec | undefined,
  local: Rec | undefined,
  remote: Rec | undefined,
  merge: (base: Rec | undefined, local: Rec, remote: Rec) => Rec,
): Rec | null {
  if (!base) {
    if (local && remote) return merge(undefined, local, remote);
    return local ?? remote ?? null;
  }
  if (!local && !remote) return null;
  if (!local) return valuesEqual(remote, base) ? null : remote!;
  if (!remote) return valuesEqual(local, base) ? null : local;
  return merge(base, local, remote);
}

function mergeFields(
  base: Rec | undefined,
  local: Rec,
  remote: Rec,
  groups: string[][] = [],
  special: Record<string, Special> = {},
): Rec {
  const groupOf = new Map<string, string[]>();
  for (const group of groups) for (const key of group) groupOf.set(key, group);

  const keys = new Set([...Object.keys(base ?? {}), ...Object.keys(local), ...Object.keys(remote)]);
  const out: Rec = {};
  const done = new Set<string>();

  for (const key of keys) {
    if (done.has(key)) continue;

    if (special[key]) {
      done.add(key);
      const value = special[key](base?.[key], local[key], remote[key]);
      if (value !== undefined) out[key] = value;
      continue;
    }

    const group = groupOf.get(key) ?? [key];
    const pick = (source: Rec | undefined) => group.map((member) => source?.[member]);
    const baseValues = pick(base);
    const localValues = pick(local);
    const remoteValues = pick(remote);

    let from: Rec;
    if (valuesEqual(localValues, baseValues)) from = remote;
    else if (valuesEqual(remoteValues, baseValues)) from = local;
    else from = local;

    for (const member of group) {
      done.add(member);
      if (from[member] !== undefined) out[member] = from[member];
    }
  }

  return out;
}

// Set-valued fields: union of both sides minus anything either side removed.
function mergeSet(base: unknown, local: unknown, remote: unknown): unknown {
  const asList = (value: unknown) => (Array.isArray(value) ? value : []);
  if (local === undefined && remote === undefined) return undefined;

  const baseKeys = new Set(asList(base).map((item) => canonicalJson(item)));
  const localKeys = new Set(asList(local).map((item) => canonicalJson(item)));
  const remoteKeys = new Set(asList(remote).map((item) => canonicalJson(item)));
  const removed = new Set([...baseKeys].filter((key) => !localKeys.has(key) || !remoteKeys.has(key)));

  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const item of [...asList(local), ...asList(remote)]) {
    const key = canonicalJson(item);
    if (removed.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function mergeCollection<T>(
  base: T[] | undefined,
  local: T[],
  remote: T[],
  merge: (base: Rec | undefined, local: Rec, remote: Rec) => Rec,
): Rec[] {
  const index = (items: T[] | undefined) => {
    const byId = new Map<string, Rec>();
    const order: string[] = [];
    for (const item of items ?? []) {
      const record = item as unknown as Rec;
      const id = String(record.id ?? "");
      if (!id || byId.has(id)) continue;
      byId.set(id, record);
      order.push(id);
    }
    return { byId, order };
  };

  const b = index(base);
  const l = index(local);
  const r = index(remote);

  const merged = new Map<string, Rec>();
  for (const id of unionIds(b.order, l.order, r.order)) {
    const result = mergeEntity(b.byId.get(id), l.byId.get(id), r.byId.get(id), merge);
    if (result) merged.set(id, result);
  }

  return mergeOrder(l.order, r.order, new Set(merged.keys())).map((id) => merged.get(id)!);
}

// Local order of the survivors, with each remote-only item placed right after its
// nearest preceding survivor in remote order (or first).
function mergeOrder(localIds: string[], remoteIds: string[], keep: Set<string>): string[] {
  const result: string[] = [];
  const placed = new Set<string>();
  for (const id of localIds) {
    if (keep.has(id) && !placed.has(id)) {
      result.push(id);
      placed.add(id);
    }
  }

  let anchor: string | null = null;
  for (const id of remoteIds) {
    if (!keep.has(id)) continue;
    if (!placed.has(id)) {
      const at = anchor === null ? 0 : result.indexOf(anchor) + 1;
      result.splice(at, 0, id);
      placed.add(id);
    }
    anchor = id;
  }

  for (const id of [...keep].sort()) {
    if (!placed.has(id)) result.push(id);
  }
  return result;
}

function unionIds(...orders: string[][]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const order of orders) {
    for (const id of order) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

// ─── Transactions ────────────────────────────────────────────────────────────

type FlatTransactions = {
  byId: Map<string, Rec>;
  order: string[];
  groupOrder: Map<string, string[]>;
};

function groupKey(monthKey: string, kind: string): string {
  return `${monthKey}\u0000${kind}`;
}

function flattenTransactions(state: LedgerState | null): FlatTransactions {
  const byId = new Map<string, Rec>();
  const order: string[] = [];
  const groupOrder = new Map<string, string[]>();
  if (!state) return { byId, order, groupOrder };

  for (const monthKey of Object.keys(state.months).sort()) {
    const month = state.months[monthKey];
    const lists: Array<[string, Array<IncomeEntry | ExpenseEntry>]> = [
      ["income", month?.incomes ?? []],
      ["expense", month?.expenses ?? []],
    ];
    for (const [kind, entries] of lists) {
      const key = groupKey(monthKey, kind);
      const ids: string[] = [];
      for (const entry of entries) {
        const id = String(entry.id ?? "");
        if (!id || byId.has(id)) continue;
        byId.set(id, { ...(entry as unknown as Rec), [MONTH_FIELD]: monthKey, [KIND_FIELD]: kind });
        order.push(id);
        ids.push(id);
      }
      groupOrder.set(key, ids);
    }
  }
  return { byId, order, groupOrder };
}

function buildMonths(
  base: LedgerState | null,
  local: LedgerState,
  remote: LedgerState,
  mergedTx: Map<string, Rec>,
  localGroupOrder: Map<string, string[]>,
  remoteGroupOrder: Map<string, string[]>,
): Record<string, MonthBudget> {
  const idsByGroup = new Map<string, Set<string>>();
  const monthKeys = new Set([...Object.keys(local.months), ...Object.keys(remote.months)]);
  for (const [id, entry] of mergedTx) {
    const monthKey = String(entry[MONTH_FIELD]);
    monthKeys.add(monthKey);
    const key = groupKey(monthKey, String(entry[KIND_FIELD]));
    if (!idsByGroup.has(key)) idsByGroup.set(key, new Set());
    idsByGroup.get(key)!.add(id);
  }

  const stripArrays = (month: MonthBudget | undefined): Rec | undefined => {
    if (!month) return undefined;
    const { incomes: _incomes, expenses: _expenses, ...rest } = month as unknown as Rec;
    return rest;
  };

  const months: Record<string, MonthBudget> = {};
  for (const monthKey of [...monthKeys].sort()) {
    const baseMonth = stripArrays(base?.months[monthKey]);
    // A side without the month has not touched it: stand in the base so the other side wins.
    const localMonth = stripArrays(local.months[monthKey]) ?? baseMonth ?? {};
    const remoteMonth = stripArrays(remote.months[monthKey]) ?? baseMonth ?? {};
    const fields = mergeFields(baseMonth, localMonth, remoteMonth);

    const entriesFor = (kind: string) => {
      const key = groupKey(monthKey, kind);
      const ids = mergeOrder(localGroupOrder.get(key) ?? [], remoteGroupOrder.get(key) ?? [], idsByGroup.get(key) ?? new Set());
      return ids.map((id) => {
        const { [MONTH_FIELD]: _month, [KIND_FIELD]: _kind, ...entry } = mergedTx.get(id)!;
        return entry;
      });
    };

    months[monthKey] = {
      ...fields,
      note: typeof fields.note === "string" ? fields.note : "",
      incomes: entriesFor("income") as unknown as IncomeEntry[],
      expenses: entriesFor("expense") as unknown as ExpenseEntry[],
    } as MonthBudget;
  }
  return months;
}

// Two devices can each create "the same" entry on their own: both seed the new month's
// recurring items on the 1st, both add this month's scheduled debt payment, or both
// import the same statement before syncing. Such pairs are matched one-to-one, only
// between an entry added on this device and one added on the other since the base (two
// identical coffees typed on one device are two coffees), and the remote copy is kept.
function pairIndependentDuplicates(
  merged: Map<string, Rec>,
  baseTx: Map<string, Rec>,
  localTx: Map<string, Rec>,
  remoteTx: Map<string, Rec>,
  localOrder: string[],
  remoteOrder: string[],
): { dropped: Set<string>; survivorOf: Map<string, string> } {
  const dropped = new Set<string>();
  const survivorOf = new Map<string, string>();

  const localAdded = localOrder.filter((id) => merged.has(id) && !baseTx.has(id) && !remoteTx.has(id));
  const remoteAdded = remoteOrder.filter((id) => merged.has(id) && !baseTx.has(id) && !localTx.has(id));
  if (!localAdded.length || !remoteAdded.length) return { dropped, survivorOf };

  const signatures: Array<(entry: Rec) => string | null> = [
    (entry) => {
      const seeded = entry.seededFrom as { monthKey?: string; entryId?: string } | undefined;
      return seeded?.monthKey && seeded.entryId ? `seeded:${seeded.monthKey}:${seeded.entryId}` : null;
    },
    (entry) => (entry.scheduledPayment && typeof entry.debtAccountId === "string" ? `scheduled:${entry.debtAccountId}` : null),
    (entry) => {
      const imported = entry.imported as { hash?: string } | undefined;
      return imported?.hash ? `imported:${imported.hash}` : null;
    },
  ];

  for (const signature of signatures) {
    const remoteBuckets = new Map<string, string[]>();
    for (const id of remoteAdded) {
      if (dropped.has(id)) continue;
      const entry = merged.get(id)!;
      const sig = signature(entry);
      if (!sig) continue;
      const key = `${entry[MONTH_FIELD]}|${entry[KIND_FIELD]}|${sig}`;
      if (!remoteBuckets.has(key)) remoteBuckets.set(key, []);
      remoteBuckets.get(key)!.push(id);
    }

    for (const id of localAdded) {
      if (dropped.has(id)) continue;
      const entry = merged.get(id)!;
      const sig = signature(entry);
      if (!sig) continue;
      const key = `${entry[MONTH_FIELD]}|${entry[KIND_FIELD]}|${sig}`;
      const partner = remoteBuckets.get(key)?.shift();
      if (!partner) continue;
      dropped.add(id);
      survivorOf.set(id, partner);
    }
  }

  return { dropped, survivorOf };
}

function remapBatchRefs(batch: Rec, survivorOf: Map<string, string>, mergedTx: Map<string, Rec>): Rec {
  if (!Array.isArray(batch.transactionRefs) || !survivorOf.size) return batch;
  const seen = new Set<string>();
  const refs: Rec[] = [];
  for (const ref of batch.transactionRefs as Rec[]) {
    const survivor = survivorOf.get(String(ref.entryId));
    const entry = survivor ? mergedTx.get(survivor) : undefined;
    const next = survivor && entry ? { ...ref, entryId: survivor, monthKey: entry[MONTH_FIELD], kind: entry[KIND_FIELD] } : ref;
    const key = canonicalJson(next);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(next);
  }
  return { ...batch, transactionRefs: refs };
}

function rootFields(state: LedgerState | null): Rec | undefined {
  if (!state) return undefined;
  const out: Rec = {};
  for (const [key, value] of Object.entries(state)) {
    if (!COLLECTION_KEYS.has(key)) out[key] = value;
  }
  return out;
}
