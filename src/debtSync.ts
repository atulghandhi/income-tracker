import { clampDueDay, colors, createId, deriveLiveAccounts, getMonthKey } from "./finance";
import type { CsvImportRow } from "./importer";
import type { Account, ExpenseEntry, LedgerState, MonthBudget } from "./types";

// Keeps the ledger and the Accounts page telling the same story about debt payments.
//
// A debt account with a monthly payment is the source of truth for that payment. Each month
// from now on, the ledger carries exactly one row for it:
//
//   • a *scheduled* row (placeholder at the account's planned amount) until the real payment
//     shows up, then
//   • the *actual* payment: any row linked to the account that the user typed or imported.
//
// The actual always wins, so importing "223231 HSBCBANKPLC −£101.34" replaces the "HSBC card
// payment £100" placeholder instead of sitting beside it. Months before the current one are
// history: placeholders there are never created, only replaced when an actual lands.

export const DEBT_PAYMENT_CATEGORY = "Debt payments";

export function isScheduledDebt(account: Account): boolean {
  return account.accountClass === "debt" && Math.max(0, Number(account.minimumPayment) || 0) > 0;
}

export function scheduledPaymentName(account: Account): string {
  return `${account.name} payment`;
}

function dueDateIn(monthKey: string, dueDay: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${monthKey}-${String(Math.min(clampDueDay(dueDay), lastDay)).padStart(2, "0")}`;
}

// Generic words that say nothing about *which* lender a statement line is for.
const GENERIC_NAME_WORDS = new Set([
  "card", "cards", "credit", "loan", "loans", "account", "payment", "payments", "the", "my", "and", "bank", "plc", "ltd",
  "limited", "mortgage", "overdraft", "car", "personal", "finance", "cc", "visa", "mastercard", "debt", "other", "new", "old",
]);

// Distinctive lowercase tokens from an account name ("HSBC credit card" → ["hsbc"]).
export function accountNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !GENERIC_NAME_WORDS.has(token));
}

// Bank text often glues words together ("HSBCBANKPLC"), so compare on letters and digits only.
function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function nameMentionsAccount(text: string, account: Account): boolean {
  const haystack = compact(text);
  return accountNameTokens(account.name).some((token) => haystack.includes(token));
}

function amountTolerance(planned: number): number {
  return Math.max(2, planned * 0.15);
}

// An unlinked row the user already keeps for this payment ("HSBC payment £100", recurring for
// months). Linking it beats adding a second row beside it. Must be unambiguous.
function findAdoptableRow(expenses: ExpenseEntry[], account: Account): ExpenseEntry | undefined {
  const planned = Number(account.minimumPayment) || 0;
  // It must name the lender. Then either the amount is close to the plan, or the user already
  // filed it as a debt payment (card payments often differ a lot from the minimum).
  const candidates = expenses.filter((expense) => {
    if (expense.debtAccountId) return false;
    if (!nameMentionsAccount(`${expense.name} ${expense.imported?.originalDescription ?? ""}`, account)) return false;
    return Math.abs(Number(expense.amount) - planned) <= amountTolerance(planned) || expense.category === DEBT_PAYMENT_CATEGORY;
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

function sameExpense(a: ExpenseEntry, b: ExpenseEntry): boolean {
  return (
    a.name === b.name &&
    a.amount === b.amount &&
    a.category === b.category &&
    a.color === b.color &&
    a.recurring === b.recurring &&
    a.date === b.date &&
    a.debtAccountId === b.debtAccountId &&
    a.scheduledPayment === b.scheduledPayment &&
    a.seededFrom === b.seededFrom
  );
}

function syncMonth(
  monthKey: string,
  month: MonthBudget,
  accounts: Account[],
  liveBalanceById: Map<string, number>,
  currentMonthKey: string,
): MonthBudget {
  const isCurrentOrFuture = monthKey >= currentMonthKey;
  let expenses = month.expenses;
  const scheduledIds = new Set(accounts.filter(isScheduledDebt).map((account) => account.id));

  // Placeholders for accounts that were deleted or no longer have a monthly payment.
  const orphaned = (expense: ExpenseEntry) =>
    Boolean(expense.scheduledPayment && (!expense.debtAccountId || !scheduledIds.has(expense.debtAccountId)));
  if (isCurrentOrFuture && expenses.some(orphaned)) {
    expenses = expenses.filter((expense) => !orphaned(expense));
  }

  for (const account of accounts) {
    if (!scheduledIds.has(account.id)) continue;

    const linked = expenses.filter((expense) => expense.debtAccountId === account.id);
    const placeholders = linked.filter((expense) => expense.scheduledPayment || expense.seededFrom);
    const actuals = linked.filter((expense) => !expense.scheduledPayment && !expense.seededFrom);

    if (actuals.length) {
      // The real payment is in: placeholders and carried-forward copies go, and the actual takes
      // over the placeholder's recurring role so the monthly run rate still includes the payment.
      if (placeholders.length) {
        expenses = expenses
          .filter((expense) => !placeholders.includes(expense))
          .map((expense) => (actuals.includes(expense) && !expense.recurring ? { ...expense, recurring: true } : expense));
      }
      continue;
    }
    if (!isCurrentOrFuture) continue;

    const skipped = account.skippedPaymentMonths?.includes(monthKey) ?? false;
    const owing = (liveBalanceById.get(account.id) ?? 0) > 0;
    if (skipped || !owing) {
      if (placeholders.length) expenses = expenses.filter((expense) => !placeholders.includes(expense));
      continue;
    }

    const adoptable = placeholders.length ? undefined : findAdoptableRow(expenses, account);
    if (adoptable) {
      // The user's own row becomes the actual payment for this month.
      expenses = expenses.map((expense) => (expense === adoptable ? { ...expense, debtAccountId: account.id } : expense));
      continue;
    }

    const keep = placeholders.find((expense) => expense.scheduledPayment) ?? placeholders[0];
    const planned = Math.max(0, Number(account.minimumPayment) || 0);
    const next: ExpenseEntry = keep
      ? {
          ...keep,
          // A carried-forward copy of last month's *actual* would otherwise show the bank's text
          // ("223231 Hsbcbankplc"). A planned row the user renamed keeps their name.
          name: keep.scheduledPayment ? keep.name : scheduledPaymentName(account),
          amount: planned,
          recurring: true,
          debtAccountId: account.id,
          scheduledPayment: true,
          seededFrom: undefined,
          imported: undefined,
          date: dueDateIn(monthKey, account.dueDay),
        }
      : {
          id: createId("expense"),
          name: scheduledPaymentName(account),
          category: DEBT_PAYMENT_CATEGORY,
          amount: planned,
          color: account.color || colors[0],
          recurring: true,
          date: dueDateIn(monthKey, account.dueDay),
          debtAccountId: account.id,
          scheduledPayment: true,
          categorySource: "system",
        };

    if (keep && placeholders.length === 1 && sameExpense(keep, next)) continue;
    const others = new Set(placeholders);
    if (keep) {
      expenses = expenses.flatMap((expense) => (expense === keep ? [next] : others.has(expense) ? [] : [expense]));
    } else {
      expenses = [...expenses, next];
    }
  }

  return expenses === month.expenses ? month : { ...month, expenses };
}

// Idempotent: returns the same state object when nothing needs to change, so it can run after
// every ledger update without churning saves or renders.
export function syncScheduledDebtPayments(state: LedgerState, currentMonthKey = getMonthKey()): LedgerState {
  const hasScheduled = state.accounts.some(isScheduledDebt);
  const hasPlaceholders =
    hasScheduled || Object.values(state.months).some((month) => month.expenses.some((expense) => expense.scheduledPayment));
  if (!hasPlaceholders) return state;

  const live = deriveLiveAccounts({ accounts: state.accounts, months: state.months, currentMonthKey });
  const liveBalanceById = new Map(live.map((account) => [account.id, Math.max(0, Number(account.balance) || 0)]));

  let changed = false;
  const months: Record<string, MonthBudget> = {};
  for (const [monthKey, month] of Object.entries(state.months)) {
    const next = syncMonth(monthKey, month, state.accounts, liveBalanceById, currentMonthKey);
    if (next !== month) changed = true;
    months[monthKey] = next;
  }
  return changed ? { ...state, months } : state;
}

// Deleting a placeholder means "I'm not paying this one": remember it so the row is not re-added
// and the balance roll-forward charges no payment that month.
export function skipScheduledPayment(state: LedgerState, accountId: string, monthKey: string): LedgerState {
  return {
    ...state,
    accounts: state.accounts.map((account) =>
      account.id === accountId
        ? { ...account, skippedPaymentMonths: Array.from(new Set([...(account.skippedPaymentMonths ?? []), monthKey])).sort() }
        : account,
    ),
  };
}

// ─── Import matching ─────────────────────────────────────────────────────────
//
// Statement text rarely looks like the account name the user typed ("223231 HSBCBANKPLC" vs
// "HSBC credit card"), and card payments wobble month to month (£101.34 against a planned £100).
// So a bank row is scored against each scheduled debt on several weak signals; it is linked only
// when one account clearly wins. Once linked, the import learns a rule for that bank text, so the
// next statement links on the description alone.

export type DebtPaymentMatch = { accountId: string; score: number; reason: string };

export function scoreDebtPayment(row: Pick<CsvImportRow, "description" | "name" | "amount" | "date" | "suggestedKind">, account: Account): DebtPaymentMatch | null {
  if (!isScheduledDebt(account)) return null;
  const paid = Math.abs(Number(row.amount) || 0);
  if (row.amount >= 0 || paid <= 0) return null;
  const planned = Number(account.minimumPayment) || 0;
  const reasons: string[] = [];
  let score = 0;

  if (nameMentionsAccount(`${row.description} ${row.name}`, account)) {
    score += 0.5;
    reasons.push("name");
  }

  const diff = Math.abs(paid - planned);
  const fixedPayment = account.type === "loan";
  if (diff <= Math.max(1, planned * 0.02)) {
    // Loans charge the same amount every month, so an exact match says a lot more than it does for a card.
    score += fixedPayment ? 0.45 : 0.35;
    reasons.push("amount");
  } else if (diff <= amountTolerance(planned)) {
    score += 0.25;
    reasons.push("amount");
  } else if (!fixedPayment && paid >= planned * 0.5) {
    // Card payments vary with the statement balance; a bigger-than-usual payment is still plausible.
    score += 0.1;
  }

  const day = Number(row.date?.slice(8, 10));
  if (Number.isFinite(day) && day > 0) {
    const due = clampDueDay(account.dueDay);
    const gap = Math.min(Math.abs(day - due), 31 - Math.abs(day - due));
    if (gap <= 5) {
      score += 0.15;
      reasons.push("date");
    }
  }

  if (row.suggestedKind === "debt-payment") score += 0.1;

  return { accountId: account.id, score, reason: reasons.join("+") };
}

export function bestDebtPaymentMatch(
  row: Pick<CsvImportRow, "description" | "name" | "amount" | "date" | "suggestedKind">,
  accounts: Account[],
): DebtPaymentMatch | null {
  const scored = accounts
    .map((account) => scoreDebtPayment(row, account))
    .filter((match): match is DebtPaymentMatch => Boolean(match))
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score < 0.6) return null;
  if (second && best.score - second.score < 0.15) return null;
  return best;
}

// Links import rows to the scheduled debt payment they most likely are. Rows the user or a
// learned rule already linked, duplicates and transfers are left alone.
export function matchDebtPaymentRows(rows: CsvImportRow[], accounts: Account[], formatter?: Intl.NumberFormat): CsvImportRow[] {
  const scheduled = accounts.filter(isScheduledDebt);
  if (!scheduled.length) return rows;
  return rows.map((row) => {
    if (row.debtAccountId || row.duplicate || row.kind === "transfer" || row.kind === "income") return row;
    const match = bestDebtPaymentMatch(row, scheduled);
    if (!match) return row;
    const account = scheduled.find((item) => item.id === match.accountId)!;
    const planned = formatter ? formatter.format(account.minimumPayment) : String(account.minimumPayment);
    return {
      ...row,
      kind: "debt-payment",
      debtAccountId: account.id,
      category: DEBT_PAYMENT_CATEGORY,
      color: account.color || row.color,
      confidence: Math.max(row.confidence, Math.min(0.95, match.score)),
      note: `Your ${account.name} payment (planned ${planned}) — replaces the planned row`,
    };
  });
}
