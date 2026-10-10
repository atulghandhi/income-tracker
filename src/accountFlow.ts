import type { Account, ExpenseEntry, IncomeEntry, LedgerState, MonthBudget } from "./types";

// Every ledger transaction belongs to the account the money moved through: where an expense was
// paid from, or where income landed. That account's balance moves with it.
//
//   • Asset accounts: income adds, spending subtracts.
//   • Debt accounts (a card you spend on): spending adds to what you owe, a refund takes it off.
//   • A debt payment keeps its `debtAccountId` link; the balance roll-forward takes it off the debt,
//     and its account dot (usually the current account) is where the money left from. If the dot
//     is the debt itself, only the debt side counts, so nothing is taken twice.
//   • A savings transfer (`toAccountId`) also adds to the account it went into.
//
// Which transactions count: a typed balance already includes everything that happened before it
// was typed. So an account only counts transactions dated on or after the day its balance was set
// (`balanceSetOn`), up to today. Ones dated on that day that were already there when it was typed
// are cancelled by `ledgerOffset`, as are transactions handed to an account after the fact (say
// when another account is deleted) — those moved no money, they only changed labels.

export function isoToday(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Undated rows (typed into a month without a day) count from the 1st of their month.
export function entryDate(monthKey: string, entry: { date?: string }): string {
  return entry.date && /^\d{4}-\d{2}-\d{2}/.test(entry.date) ? entry.date.slice(0, 10) : `${monthKey}-01`;
}

function isCounted(account: Account, date: string, todayIso: string): boolean {
  return date >= (account.balanceSetOn ?? "0000-00-00") && date <= todayIso;
}

function amountOf(entry: { amount: number }): number {
  return Math.max(0, Number(entry.amount) || 0);
}

// How one transaction moves an account's balance (as the app stores it: assets positive, debts as
// the amount owed).
export function flowEffect(account: Account, kind: "income" | "expense", amount: number): number {
  const sign = kind === "income" ? 1 : -1;
  return account.accountClass === "debt" ? -sign * amount : sign * amount;
}

type Effect = { accountId: string; amount: number };

// Every balance effect of one transaction, before the "counted" check.
export function entryEffects(kind: "income" | "expense", entry: IncomeEntry | ExpenseEntry, byId: Map<string, Account>): Effect[] {
  const effects: Effect[] = [];
  const amount = amountOf(entry);
  const own = entry.accountId ? byId.get(entry.accountId) : undefined;
  if (kind === "income") {
    if (own) effects.push({ accountId: own.id, amount: flowEffect(own, "income", amount) });
    return effects;
  }
  const expense = entry as ExpenseEntry;
  const into = expense.toAccountId ? byId.get(expense.toAccountId) : undefined;
  // Paying a debt "from" the debt itself, or moving money into the account it came from, is only
  // the second leg; the first leg would cancel it out.
  if (own && own.id !== expense.debtAccountId && own.id !== into?.id) {
    effects.push({ accountId: own.id, amount: flowEffect(own, "expense", amount) });
  }
  if (into && into.accountClass !== "debt") effects.push({ accountId: into.id, amount });
  return effects;
}

// Net ledger movement per account, counting only what has happened since each balance was set.
export function accountFlowTotals(accounts: Account[], months: Record<string, MonthBudget>, todayIso = isoToday()): Map<string, number> {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const totals = new Map<string, number>();
  const add = (date: string, effect: Effect) => {
    const account = byId.get(effect.accountId);
    if (!account || !isCounted(account, date, todayIso)) return;
    totals.set(account.id, (totals.get(account.id) ?? 0) + effect.amount);
  };
  for (const [monthKey, month] of Object.entries(months)) {
    for (const income of month.incomes) {
      const date = entryDate(monthKey, income);
      entryEffects("income", income, byId).forEach((effect) => add(date, effect));
    }
    for (const expense of month.expenses) {
      const date = entryDate(monthKey, expense);
      entryEffects("expense", expense, byId).forEach((effect) => add(date, effect));
    }
  }
  return totals;
}

// Adds the ledger's movement to each (already rolled-forward) balance. Debts never go below zero.
export function applyAccountFlows(accounts: Account[], months: Record<string, MonthBudget>, todayIso = isoToday()): Account[] {
  if (!accounts.length) return accounts;
  const totals = accountFlowTotals(accounts, months, todayIso);
  return accounts.map((account) => {
    const moved = (totals.get(account.id) ?? 0) + (Number(account.ledgerOffset) || 0);
    if (!moved) return account;
    const raw = Number(account.balance) + moved;
    const balance = Math.round((account.accountClass === "debt" ? Math.max(0, raw) : raw) * 100) / 100;
    return { ...account, balance };
  });
}

// What "already counted" adds up to for one account right now. Typing a balance cancels it, so
// the typed figure is what shows.
export function countedFlowFor(accountId: string, accounts: Account[], months: Record<string, MonthBudget>, todayIso = isoToday()): number {
  return accountFlowTotals(accounts, months, todayIso).get(accountId) ?? 0;
}

// ─── Which account a transaction belongs to ──────────────────────────────────

// The account new transactions go to unless something better is known: the one the user chose,
// else their first current account, else the first asset account, else any account.
export function defaultAccountId(state: Pick<LedgerState, "accounts" | "defaultAccountId">): string | undefined {
  const accounts = state.accounts;
  if (state.defaultAccountId && accounts.some((account) => account.id === state.defaultAccountId)) return state.defaultAccountId;
  return (
    accounts.find((account) => account.accountClass === "cash")?.id ??
    accounts.find((account) => account.accountClass !== "debt")?.id ??
    accounts[0]?.id
  );
}

function normalizedName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Where a debt payment is paid from: the default account if it holds money, else the first
// current/savings account. With none, undefined, and the payment counts only against the debt.
export function defaultPayingAccountId(state: Pick<LedgerState, "accounts" | "defaultAccountId">): string | undefined {
  const preferred = defaultAccountId(state);
  const accounts = state.accounts;
  if (preferred && accounts.find((account) => account.id === preferred)?.accountClass !== "debt") return preferred;
  return accounts.find((account) => account.accountClass === "cash")?.id ?? accounts.find((account) => account.accountClass !== "debt")?.id;
}

// Name → account the user last used for it, newest month first. Built once per pass.
export function buildAccountMemory(state: Pick<LedgerState, "accounts" | "months">): Map<string, string> {
  const ids = new Set(state.accounts.map((account) => account.id));
  const memory = new Map<string, string>();
  for (const monthKey of Object.keys(state.months).sort().reverse()) {
    const month = state.months[monthKey];
    for (const income of month.incomes) {
      const key = `income:${normalizedName(income.source)}`;
      if (income.accountId && ids.has(income.accountId) && !memory.has(key)) memory.set(key, income.accountId);
    }
    for (const expense of month.expenses) {
      const key = `expense:${normalizedName(expense.name)}`;
      if (expense.accountId && ids.has(expense.accountId) && !memory.has(key)) memory.set(key, expense.accountId);
    }
  }
  return memory;
}

// Same name as an earlier transaction → that one's account (the user taught it). Otherwise the default.
export function guessAccountId(
  state: Pick<LedgerState, "accounts" | "defaultAccountId" | "months">,
  kind: "income" | "expense",
  name: string,
  memory: Map<string, string> = buildAccountMemory(state),
): string | undefined {
  return memory.get(`${kind}:${normalizedName(name)}`) ?? defaultAccountId(state);
}

// Gives every transaction without a (still existing) account one, without moving any balance:
// these are labels catching up with money that already moved — existing data when the feature
// arrives, rows typed before any account existed, or rows whose account was deleted.
export function assignMissingAccounts(state: LedgerState, todayIso = isoToday()): LedgerState {
  if (!state.accounts.length) return state;
  const byId = new Map(state.accounts.map((account) => [account.id, account]));
  const fallback = defaultAccountId(state);
  if (!fallback) return state;

  const memory = buildAccountMemory(state);
  const offsets = new Map<string, number>();
  let changed = false;
  const months: Record<string, MonthBudget> = {};

  for (const [monthKey, month] of Object.entries(state.months)) {
    let monthChanged = false;
    const incomes = month.incomes.map((income) => {
      if (income.accountId && byId.has(income.accountId)) return income;
      monthChanged = true;
      const next = { ...income, accountId: guessAccountId(state, "income", income.source, memory) ?? fallback };
      compensate(offsets, byId, monthKey, "income", next, todayIso);
      return next;
    });
    const expenses = month.expenses.map((expense) => {
      if (expense.accountId && byId.has(expense.accountId)) return expense;
      monthChanged = true;
      // A debt payment is never paid from another debt: from a money account, or the debt itself.
      const accountId = expense.debtAccountId
        ? (defaultPayingAccountId(state) ?? expense.debtAccountId)
        : (guessAccountId(state, "expense", expense.name, memory) ?? fallback);
      const next = { ...expense, accountId };
      compensate(offsets, byId, monthKey, "expense", next, todayIso);
      return next;
    });
    if (monthChanged) changed = true;
    months[monthKey] = monthChanged ? { ...month, incomes, expenses } : month;
  }

  if (!changed) return state;
  const accounts = offsets.size
    ? state.accounts.map((account) =>
        offsets.has(account.id)
          ? { ...account, ledgerOffset: roundCents((Number(account.ledgerOffset) || 0) + offsets.get(account.id)!) }
          : account,
      )
    : state.accounts;
  return { ...state, accounts, months };
}

function compensate(
  offsets: Map<string, number>,
  byId: Map<string, Account>,
  monthKey: string,
  kind: "income" | "expense",
  entry: IncomeEntry | ExpenseEntry,
  todayIso: string,
) {
  const date = entryDate(monthKey, entry);
  for (const effect of entryEffects(kind, entry, byId)) {
    const account = byId.get(effect.accountId)!;
    if (!isCounted(account, date, todayIso)) continue;
    // Only the new account-dot leg is a relabel; a transfer's second leg was already counting.
    if (kind === "expense" && effect.accountId === (entry as ExpenseEntry).toAccountId) continue;
    offsets.set(effect.accountId, (offsets.get(effect.accountId) ?? 0) - effect.amount);
  }
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─── Account colours ─────────────────────────────────────────────────────────

// Ordered so the first few accounts get clearly different hues (blue, red, amber, green, purple…)
// rather than neighbouring shades. Validated for both themes alongside the main palette.
export const ACCOUNT_COLORS = ["#2f7fdd", "#e05656", "#c98500", "#1baf7a", "#7a6cd6", "#e26030", "#d55181", "#008300"];

function shade(hex: string, factor: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 0xff;
    const next = factor >= 0 ? c + (255 - c) * factor : c * (1 + factor);
    return Math.round(Math.max(0, Math.min(255, next)))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

// The first distinct hue nobody uses yet; once all eight are taken, lighter then darker shades of
// them, so dots stay tellable apart for as long as possible.
export function pickAccountColor(used: Iterable<string>): string {
  const taken = new Set(Array.from(used, (color) => color.toLowerCase()));
  const candidates = [...ACCOUNT_COLORS, ...ACCOUNT_COLORS.map((color) => shade(color, 0.35)), ...ACCOUNT_COLORS.map((color) => shade(color, -0.3))];
  return candidates.find((color) => !taken.has(color.toLowerCase())) ?? candidates[taken.size % candidates.length];
}

// Two accounts sharing a colour would make the ledger dots ambiguous: later duplicates get a fresh one.
export function distinctAccountColors(accounts: Account[]): Account[] {
  const used = new Set<string>();
  let changed = false;
  const next = accounts.map((account) => {
    const color = (account.color || "").toLowerCase();
    if (color && !used.has(color)) {
      used.add(color);
      return account;
    }
    changed = true;
    const fresh = pickAccountColor(used);
    used.add(fresh.toLowerCase());
    return { ...account, color: fresh };
  });
  return changed ? next : accounts;
}

// Next account in the cycle when a transaction's dot is clicked.
export function nextAccountId(accounts: Account[], currentId: string | undefined): string | undefined {
  if (!accounts.length) return undefined;
  const index = accounts.findIndex((account) => account.id === currentId);
  return accounts[(index + 1) % accounts.length].id;
}

// The swatch on an account row: the next colour in the list that no other account is using.
export function nextAccountColor(current: string, usedByOthers: Iterable<string>): string {
  const taken = new Set(Array.from(usedByOthers, (color) => color.toLowerCase()));
  const candidates = [...ACCOUNT_COLORS, ...ACCOUNT_COLORS.map((color) => shade(color, 0.35)), ...ACCOUNT_COLORS.map((color) => shade(color, -0.3))];
  const start = candidates.findIndex((color) => color.toLowerCase() === current.toLowerCase());
  for (let step = 1; step <= candidates.length; step += 1) {
    const candidate = candidates[(start + step + candidates.length) % candidates.length];
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return current;
}
