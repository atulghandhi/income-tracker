// Loading, normalising and comparing whole ledger states. Shared by the app, the
// sync engine and the merge, so every path that takes in a ledger (local storage,
// the cloud, a JSON backup) produces the same shape.
//
// Normalisers keep keys they do not recognise. A newer client (or the iOS and
// Android apps) may add fields; an older web build that dropped them and saved
// would erase them for everyone.

import { syncLinkedGoals, linkSavingsTransfers } from "./accountLinks";
import { assignMissingAccounts, distinctAccountColors, isoToday } from "./accountFlow";
import { normalizeAllocationSettings } from "./allocate";
import { syncScheduledDebtPayments } from "./debtSync";
import {
  CURRENT_SCHEMA_VERSION,
  clampDueDay,
  clampWholeNumber,
  colors,
  createId,
  createInitialState,
  currencyOptions,
  getMonthKey,
  isValidMonthKey,
  seedMonthFromPrevious,
} from "./finance";
import { tidyImportedNames } from "./importer";
import { normalizeInsightsState } from "./insightsState";
import { normalizeNameRules } from "./nameRules";
import { normalizeSidebarChoice } from "./navTools";
import { allAccountTypesForClass, countryFromCurrency, defaultTypeForClass, isCountryCode } from "./region";
import { syncPlanContributions } from "./retirement";
import { normalizeSubscriptionPrefs } from "./subscriptions";
import type {
  Account,
  AccountClass,
  AccountType,
  CategoryRule,
  CurrencyCode,
  ImportBatch,
  LedgerState,
  SavingsGoal,
} from "./types";

// Keys older schemas used that normalisation migrates away; never carried forward.
const LEGACY_ROOT_KEYS = ["goal", "debts"];
const LEGACY_ACCOUNT_KEYS = ["apr", "interestFreeMonths"];

export function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The raw object's keys (minus `drop`), overlaid by the normalised fields.
function keepExtras<T extends object>(raw: unknown, normalized: T, drop: string[] = []): T {
  if (!isPlainObject(raw)) return normalized;
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!drop.includes(key)) extras[key] = value;
  }
  return { ...extras, ...normalized } as T;
}

// Loaded state gets the same scheduled-debt-payment sync as every edit, so a new month opened
// on load already carries this month's planned payments.
export function normalizeState(rawState: Partial<LedgerState>): LedgerState {
  return syncLedgerLinks(normalizeStateFields(rawState));
}

// The cross-page sync every change goes through: savings transfers linked, scheduled debt
// payments in the ledger, every transaction on an account, and linked goals following their
// account's live balance (last, so it sees the balances the steps before settled).
export function syncLedgerLinks(state: LedgerState): LedgerState {
  return syncLinkedGoals(assignMissingAccounts(syncScheduledDebtPayments(linkSavingsTransfers(syncPlanContributions(state)))));
}

export function normalizeStateFields(rawState: Partial<LedgerState>): LedgerState {
  const fallback = createInitialState();

  // ── v6 → v7 migration: single `goal` → `goals[]` ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = { ...rawState } as any;
  if (!Array.isArray(state.goals)) {
    const old = state.goal as { id?: string; name?: string; saved?: number; target?: number } | undefined;
    state.goals = old && (old.name || (old.target ?? 0) > 0)
      ? [{
          id: old.id ?? createId("goal"),
          name: old.name || "Savings goal",
          target: finiteNumber(old.target, 0),
          saved: finiteNumber(old.saved, 0),
          color: colors[0],
          priority: 1,
          fundingMode: "fixed",
          monthlyAmount: 0,
          deadlineMonths: 0,
          interestRate: 0,
          note: "",
          createdAt: new Date().toISOString(),
        }]
      : [];
  }

  // Always open on the real current month — the stored selectedMonth is
  // whatever month was on screen when state was last saved (often last
  // month). When today's month doesn't exist yet, seed it from the month the
  // user last worked in, same as navigating forward in the ledger.
  const storedMonth = typeof state.selectedMonth === "string" && state.selectedMonth ? state.selectedMonth : fallback.selectedMonth;
  const selectedMonth = getMonthKey();
  const months = tidyImportedNames(normalizeMonths(state.months, fallback.months));
  const normalizedMonths = months[selectedMonth]
    ? months
    : {
        ...months,
        [selectedMonth]: seedMonthFromPrevious(months[storedMonth], {
          fromMonthKey: storedMonth,
          toMonthKey: selectedMonth,
        }),
      };

  const currency: CurrencyCode = currencyOptions.some((option) => option.code === state.currency) ? state.currency : fallback.currency;

  return keepExtras(
    rawState,
    {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      currency,
      // v8 → v9: ledgers saved before the country existed take it from their currency, so a USD
      // ledger opens on the US experience and everything else keeps the UK-geared app.
      country: isCountryCode(state.country) ? state.country : countryFromCurrency(currency),
      taxProfile: normalizeTaxProfile(state.taxProfile),
      healthPlan: normalizeHealthPlan(state.healthPlan),
      selectedMonth,
      months: normalizedMonths,
      goals: normalizeGoals(state.goals),
      goalPlannerSurplus: Number.isFinite(state.goalPlannerSurplus) ? state.goalPlannerSurplus : null,
      goalsHorizonMonths: Number.isFinite(state.goalsHorizonMonths) && state.goalsHorizonMonths > 0 ? state.goalsHorizonMonths : 60,
      ledgerGoalId: typeof state.ledgerGoalId === "string" ? state.ledgerGoalId : null,
      savingsTarget: Number.isFinite(state.savingsTarget) ? state.savingsTarget : fallback.savingsTarget,
      // Distinct colours, so each account's dot in the ledger can only mean one account.
      accounts: distinctAccountColors(normalizeAccounts(state)),
      defaultAccountId: typeof state.defaultAccountId === "string" ? state.defaultAccountId : null,
      assumedInvestmentReturn: Number.isFinite(state.assumedInvestmentReturn)
        ? Math.max(-50, Math.min(50, state.assumedInvestmentReturn as number))
        : fallback.assumedInvestmentReturn,
      categoryRules: normalizeCategoryRules(state.categoryRules),
      nameRules: normalizeNameRules(state.nameRules),
      importBatches: normalizeImportBatches(state.importBatches),
      subscriptionPrefs: normalizeSubscriptionPrefs(state.subscriptionPrefs),
      privacyMode: Boolean(state.privacyMode),
      aiCategorizationEnabled: Boolean(state.aiCategorizationEnabled),
      ...(state.sidebar ? { sidebar: normalizeSidebarChoice(state.sidebar) } : {}),
      // v9 → v10: ledgers saved before the Allocate page existed start on the default plan.
      allocation: keepExtras(state.allocation, normalizeAllocationSettings(state.allocation)),
      // The Insights widgets' own data (looks, dismissed warnings, notes, to-dos).
      insights: keepExtras(state.insights, normalizeInsightsState(state.insights)),
      lastSavedAt: state.lastSavedAt ?? new Date().toISOString(),
    },
    LEGACY_ROOT_KEYS,
  );
}

function normalizeMonths(months: LedgerState["months"] | undefined, fallback: LedgerState["months"]): LedgerState["months"] {
  if (!months || !Object.keys(months).length) return fallback;

  return Object.fromEntries(
    Object.entries(months).map(([monthKey, month]) => [
      monthKey,
      keepExtras(month, {
        incomes: Array.isArray(month?.incomes)
          ? month.incomes.map((income, index) => ({
              ...income,
              id: income.id || createId("income"),
              source: income.source ?? "Imported income",
              amount: finiteNumber(income.amount, 0),
              color: income.color || colors[index % colors.length],
              // Migration: untagged manual entries become recurring, imported rows become one-off.
              recurring: typeof income.recurring === "boolean" ? income.recurring : !income.imported,
            }))
          : [],
        expenses: Array.isArray(month?.expenses)
          ? month.expenses.map((expense, index) => ({
              ...expense,
              id: expense.id || createId("expense"),
              name: expense.name ?? "Imported expense",
              category: expense.category ?? "",
              amount: finiteNumber(expense.amount, 0),
              color: expense.color || colors[(index + 2) % colors.length],
              // Migration: untagged manual entries become recurring, imported rows become one-off.
              recurring: typeof expense.recurring === "boolean" ? expense.recurring : !expense.imported,
            }))
          : [],
        note: month?.note ?? "",
      }),
    ]),
  );
}

function normalizeGoals(raw: unknown): SavingsGoal[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((g, index) =>
    keepExtras(g, {
      id: typeof g.id === "string" ? g.id : createId("goal"),
      name: typeof g.name === "string" ? g.name : "Goal",
      target: finiteNumber(g.target, 0),
      saved: finiteNumber(g.saved, 0),
      color: typeof g.color === "string" ? g.color : colors[index % colors.length],
      priority: Number.isFinite(g.priority) ? g.priority : index + 1,
      fundingMode: ["fixed", "fill", "auto"].includes(g.fundingMode) ? g.fundingMode : "fixed",
      monthlyAmount: finiteNumber(g.monthlyAmount, 0),
      deadlineMonths: finiteNumber(g.deadlineMonths, 0),
      interestRate: finiteNumber(g.interestRate, 0),
      // The savings/investment account this goal lives in (see syncLinkedGoals).
      accountId: typeof g.accountId === "string" && g.accountId ? g.accountId : undefined,
      note: typeof g.note === "string" ? g.note : "",
      createdAt: typeof g.createdAt === "string" ? g.createdAt : new Date().toISOString(),
    }),
  );
}

// Reads the new accounts[] array if present, otherwise migrates the legacy debts[] array
// (schema < 5), mapping apr -> rate and interestFreeMonths -> promoMonths.
function normalizeAccounts(state: Partial<LedgerState>): Account[] {
  const raw = state as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const source: any[] = Array.isArray(raw.accounts)
    ? (raw.accounts as unknown[] as any[])
    : Array.isArray(raw.debts)
      ? (raw.debts as unknown[] as any[])
      : [];

  return source.map((item, index) => {
    const candidateClass = typeof item?.accountClass === "string" ? item.accountClass : "debt";
    const accountClass: AccountClass = (["cash", "savings", "investment", "debt"] as AccountClass[]).includes(candidateClass)
      ? candidateClass
      : "debt";
    const isDebt = accountClass === "debt";

    const validTypes = allAccountTypesForClass(accountClass) as string[];
    const type: AccountType = validTypes.includes(item?.type) ? item.type : defaultTypeForClass(accountClass);

    return keepExtras(
      item,
      {
        id: item?.id || createId("account"),
        name: item?.name || (isDebt ? "Debt account" : "Account"),
        accountClass,
        type,
        balance: finiteNumber(item?.balance, 0),
        // new `rate` falls back to legacy `apr`
        rate: finiteNumber(item?.rate, finiteNumber(item?.apr, 0)),
        promoRate: Math.max(0, finiteNumber(item?.promoRate, 0)),
        // new `promoMonths` falls back to legacy `interestFreeMonths`
        promoMonths: clampWholeNumber(finiteNumber(item?.promoMonths, finiteNumber(item?.interestFreeMonths, 0)), 120),
        monthlyContribution: isDebt ? 0 : Math.max(0, finiteNumber(item?.monthlyContribution, 0)),
        creditLimit: isDebt ? finiteNumber(item?.creditLimit, 0) : 0,
        minimumPayment: isDebt ? finiteNumber(item?.minimumPayment, 0) : 0,
        dueDay: isDebt ? clampDueDay(item?.dueDay) : 1,
        // v7 → v8: pre-existing balances anchor to the month this version first loads, so the
        // roll-forward starts from now rather than retroactively repricing old snapshots.
        balanceAsOf: isValidMonthKey(item?.balanceAsOf) ? item.balanceAsOf : getMonthKey(),
        // Promo counts saved before they ticked down start counting from the month this loads.
        promoAsOf: isValidMonthKey(item?.promoAsOf) ? item.promoAsOf : getMonthKey(),
        skippedPaymentMonths: Array.isArray(item?.skippedPaymentMonths) ? item.skippedPaymentMonths.filter(isValidMonthKey) : undefined,
        // Balances saved before the ledger moved them are taken as set today: only what happens from
        // now on moves them, so nothing jumps when this version first loads.
        balanceSetOn: typeof item?.balanceSetOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.balanceSetOn) ? item.balanceSetOn : isoToday(),
        ledgerOffset: Number.isFinite(item?.ledgerOffset) ? item.ledgerOffset : 0,
        includeInNetWorth: item?.includeInNetWorth !== false,
        color: item?.color || colors[index % colors.length],
        note: item?.note ?? "",
        ...normalizePlanDetails(item, isDebt),
      },
      LEGACY_ACCOUNT_KEYS,
    );
  });
}

// Optional plan fields: only what is present and valid is kept, so accounts from before v9 stay
// exactly as they were.
function normalizePlanDetails(item: Record<string, unknown>, isDebt: boolean): Partial<Account> {
  const details: Partial<Account> = {};
  const optionalNumber = (key: keyof Account, max = 1_000_000_000) => {
    const value = Number(item?.[key]);
    if (Number.isFinite(value) && value >= 0) (details as Record<string, unknown>)[key] = Math.min(max, value);
  };
  if (!isDebt) {
    if (["pre-tax", "roth", "taxable", "tax-free", "triple"].includes(item?.taxTreatment as string)) details.taxTreatment = item.taxTreatment as Account["taxTreatment"];
    if (item?.contributionSource === "payroll" || item?.contributionSource === "personal") details.contributionSource = item.contributionSource;
    optionalNumber("contributionPercent", 100);
    optionalNumber("employerMatchPercent", 1000);
    optionalNumber("employerMatchCapPercent", 100);
    optionalNumber("employerContributionPercent", 100);
    optionalNumber("employerMonthlyContribution");
    optionalNumber("annualLimitOverride");
    if (typeof item?.catchUpEligible === "boolean") details.catchUpEligible = item.catchUpEligible;
    if (item?.coverage === "self" || item?.coverage === "family") details.coverage = item.coverage;
  } else {
    if (item?.studentLoanType === "federal" || item?.studentLoanType === "private") details.studentLoanType = item.studentLoanType;
    if (["standard", "graduated", "extended", "income-driven"].includes(item?.repaymentPlan as string)) details.repaymentPlan = item.repaymentPlan as Account["repaymentPlan"];
    if (["plan1", "plan2", "plan4", "plan5", "postgrad"].includes(item?.studentLoanPlan as string)) details.studentLoanPlan = item.studentLoanPlan as Account["studentLoanPlan"];
    optionalNumber("familySize", 20);
  }
  optionalNumber("termMonths", 1200);
  return details;
}

function normalizeTaxProfile(raw: unknown): LedgerState["taxProfile"] {
  const fallback = createInitialState().taxProfile;
  const item = (raw ?? {}) as Record<string, unknown>;
  const number = (value: unknown, defaultValue: number, max = 1_000_000_000) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.min(max, parsed) : defaultValue;
  };
  return keepExtras(raw, {
    grossAnnualSalary: number(item.grossAnnualSalary, fallback.grossAnnualSalary),
    payFrequency: ["monthly", "semimonthly", "biweekly", "weekly"].includes(item.payFrequency as string) ? (item.payFrequency as LedgerState["taxProfile"]["payFrequency"]) : fallback.payFrequency,
    filingStatus: ["single", "married-joint", "married-separate", "head"].includes(item.filingStatus as string) ? (item.filingStatus as LedgerState["taxProfile"]["filingStatus"]) : fallback.filingStatus,
    state: typeof item.state === "string" ? item.state.slice(0, 2).toUpperCase() : fallback.state,
    stateRateOverride: Number.isFinite(Number(item.stateRateOverride)) && item.stateRateOverride !== null && item.stateRateOverride !== "" ? Math.max(0, Math.min(30, Number(item.stateRateOverride))) : null,
    studentLoanPlan: ["none", "plan1", "plan2", "plan4", "plan5", "postgrad"].includes(item.studentLoanPlan as string) ? (item.studentLoanPlan as LedgerState["taxProfile"]["studentLoanPlan"]) : fallback.studentLoanPlan,
    postgradLoan: Boolean(item.postgradLoan),
    preTaxHealthPremiumMonthly: number(item.preTaxHealthPremiumMonthly, fallback.preTaxHealthPremiumMonthly),
    pensionMonthly: number(item.pensionMonthly, fallback.pensionMonthly),
    pensionMethod: item.pensionMethod === "net-pay" ? "net-pay" : fallback.pensionMethod,
    bonusAmount: number(item.bonusAmount, fallback.bonusAmount),
    bonusOneOff: typeof item.bonusOneOff === "boolean" ? item.bonusOneOff : fallback.bonusOneOff,
  });
}

function normalizeHealthPlan(raw: unknown): LedgerState["healthPlan"] {
  const fallback = createInitialState().healthPlan;
  const item = (raw ?? {}) as Record<string, unknown>;
  const number = (value: unknown, defaultValue: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.min(1_000_000_000, parsed) : defaultValue;
  };
  const startMonth = Math.round(Number(item.planYearStartMonth));
  return keepExtras(raw, {
    planType: ["", "hdhp", "ppo", "hmo", "epo", "other"].includes(item.planType as string) ? (item.planType as LedgerState["healthPlan"]["planType"]) : fallback.planType,
    coverage: item.coverage === "family" ? "family" : "self",
    premiumMonthly: number(item.premiumMonthly, fallback.premiumMonthly),
    deductible: number(item.deductible, fallback.deductible),
    outOfPocketMax: number(item.outOfPocketMax, fallback.outOfPocketMax),
    planYearStartMonth: Number.isFinite(startMonth) && startMonth >= 1 && startMonth <= 12 ? startMonth : fallback.planYearStartMonth,
  });
}

function normalizeCategoryRules(rules: CategoryRule[] | undefined): CategoryRule[] {
  if (!Array.isArray(rules)) return [];

  return rules
    .filter((rule) => rule.pattern?.trim() && rule.category?.trim())
    .map((rule) =>
      keepExtras(rule, {
        id: rule.id || createId("rule"),
        pattern: rule.pattern.trim().toLowerCase(),
        category: rule.category.trim(),
        kind: rule.kind ?? "expense",
        debtAccountId: typeof rule.debtAccountId === "string" ? rule.debtAccountId : undefined,
        createdAt: rule.createdAt ?? new Date().toISOString(),
        updatedAt: rule.updatedAt ?? new Date().toISOString(),
      }),
    );
}

function normalizeImportBatches(batches: ImportBatch[] | undefined): ImportBatch[] {
  if (!Array.isArray(batches)) return [];

  return batches.map((batch) =>
    keepExtras(batch, {
      id: batch.id || createId("batch"),
      fileName: batch.fileName || "Imported CSV",
      importedAt: batch.importedAt ?? new Date().toISOString(),
      totalRows: finiteNumber(batch.totalRows, 0),
      importedRows: finiteNumber(batch.importedRows, 0),
      skippedRows: finiteNumber(batch.skippedRows, 0),
      transactionRefs: Array.isArray(batch.transactionRefs) ? batch.transactionRefs : [],
    }),
  );
}

export function hasLocalData(state: LedgerState): boolean {
  return (
    Object.values(state.months).some((m) => m.incomes.length > 0 || m.expenses.length > 0) ||
    state.accounts.length > 0
  );
}

// Two states are considered equivalent when every month has the same number of transactions
// and the same total amounts. This is fast enough to run on every page load and avoids a
// spurious conflict prompt when the same user opens the app on the same device after a sync.
export function statesAreEquivalent(a: LedgerState, b: LedgerState): boolean {
  const keysA = Object.keys(a.months).sort();
  const keysB = Object.keys(b.months).sort();
  if (keysA.join(",") !== keysB.join(",")) return false;
  return keysA.every((key) => {
    const ma = a.months[key];
    const mb = b.months[key];
    if (!ma || !mb) return false;
    if (ma.incomes.length !== mb.incomes.length) return false;
    if (ma.expenses.length !== mb.expenses.length) return false;
    const sumA = ma.incomes.reduce((s, i) => s + i.amount, 0) + ma.expenses.reduce((s, e) => s + e.amount, 0);
    const sumB = mb.incomes.reduce((s, i) => s + i.amount, 0) + mb.expenses.reduce((s, e) => s + e.amount, 0);
    return Math.abs(sumA - sumB) < 0.01;
  });
}

// True when both ledgers hold the same transactions and accounts (by id), whatever their
// field values. Used to decide whether a first sync can take the cloud copy without asking:
// a device that pushed this ledger earlier has the same ids, while two devices that started
// separately never do. (statesAreEquivalent compares only counts and totals, so two different
// £10 coffees look "equivalent" to it.)
export function sameEntities(a: LedgerState, b: LedgerState): boolean {
  const transactionIds = (state: LedgerState) =>
    Object.values(state.months)
      .flatMap((month) => [...month.incomes, ...month.expenses])
      .map((entry) => entry.id)
      .sort()
      .join("|");
  const accountIds = (state: LedgerState) => state.accounts.map((acc) => acc.id).sort().join("|");
  return transactionIds(a) === transactionIds(b) && accountIds(a) === accountIds(b);
}

export function ledgerSummary(state: LedgerState): { months: number; transactions: number } {
  let transactions = 0;
  let months = 0;
  for (const month of Object.values(state.months)) {
    if (month.incomes.length > 0 || month.expenses.length > 0) {
      months++;
      transactions += month.incomes.length + month.expenses.length;
    }
  }
  return { months, transactions };
}
