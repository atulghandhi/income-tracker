import { isoToday } from "./accountFlow";
import {
  buildFinancialSignals,
  buildMonthlyFlowPoints,
  buildNetWorthOutlook,
  calculateAssetSummary,
  calculateDebtSummary,
  calculateHealthScore,
  calculateNetWorthSummary,
  calculateProjection,
  clampDueDay,
  colors,
  countsTowardUtilization,
  deriveLiveAccounts,
  emptyBudget,
  formatMonth,
  getMonthKey,
  isRecurring,
  recurringAccountTransfersByAccount,
  runGoalSequence,
  shiftMonth,
} from "./finance";
import { goalPlanInputs } from "./accountLinks";
import { buildCategoryRows, buildExpenseGroups, type CategoryRow, type ExpenseGroup } from "./ledgerGroups";
import { detectRecurringCandidates, findMissedRecurring, type RecurrenceCandidate } from "./recurrence";
import type {
  Account,
  AssetSummary,
  DebtSummary,
  ExpenseEntry,
  FinancialSignal,
  GoalSequenceResult,
  HealthScoreBreakdown,
  LedgerState,
  MonthBudget,
  MonthlyFlowPoint,
  NetWorthPoint,
  NetWorthSummary,
  Projection,
  SavingsGoal,
} from "./types";

// ─── Insights model ──────────────────────────────────────────────────────────
//
// Everything the insights widgets draw, derived once per (ledger, month) by pure
// functions so the numbers on screen can be checked against the numbers typed in.
// A widget never sums a transaction itself; it reads from here.

export type FlowNode = {
  id: string;
  label: string;
  value: number;
  color: string;
  // Individual transactions behind a node, largest first (for the drill-down).
  items: Array<{ id: string; label: string; value: number; date?: string; recurring: boolean }>;
  // The same node over the six months ending with the selected one (for the drill-down).
  history?: Array<{ monthKey: string; label: string; value: number }>;
};

export type FlowModel = {
  // Income sources (plus a "Shortfall" source when the month is in deficit).
  sources: FlowNode[];
  // Spending categories (plus "Savings" when the month is in surplus).
  targets: FlowNode[];
  total: number;
  income: number;
  expenses: number;
  surplus: number;
};

export type SpendingPace = {
  monthKey: string;
  daysInMonth: number;
  // 0 for a future month, every day for a past one, today's date for the live month.
  daysElapsed: number;
  isLive: boolean;
  spent: number;
  income: number;
  dailyAverage: number;
  projectedSpend: number;
  // What can still go out per remaining day without spending more than the month's income.
  safePerDay: number;
  // Share of income spent versus share of the month elapsed.
  spentShare: number;
  elapsedShare: number;
};

export type CategoryDelta = {
  name: string;
  color: string;
  current: number;
  previous: number;
  delta: number;
  // +∞ when a category is brand new this month.
  percent: number;
};

export type UpcomingItem = {
  id: string;
  label: string;
  amount: number;
  date: string;
  kind: "recurring" | "debt";
  daysAway: number;
  color: string;
};

export type CalendarDay = {
  date: string;
  day: number;
  weekday: number;
  spent: number;
  count: number;
  intensity: number;
  isFuture: boolean;
};

export type CardUtilisation = {
  id: string;
  name: string;
  balance: number;
  limit: number;
  utilisation: number;
  color: string;
  dueDay: number;
  rate: number;
  promoMonths: number;
};

export type InsightsModel = {
  monthKey: string;
  label: string;
  today: string;
  isCurrentMonth: boolean;
  hasData: boolean;
  month: MonthBudget;
  projection: Projection;
  previous: { monthKey: string; label: string; projection: Projection; hasData: boolean };
  // The six months ending with the selected one, for sparklines.
  trend: MonthlyFlowPoint[];
  // All twelve calendar months of the selected month's year.
  year: MonthlyFlowPoint[];
  categories: CategoryRow[];
  groups: ExpenseGroup[];
  flow: FlowModel;
  health: HealthScoreBreakdown;
  signals: FinancialSignal[];
  accounts: Account[];
  debtSummary: DebtSummary;
  assetSummary: AssetSummary;
  netWorth: NetWorthSummary;
  cards: CardUtilisation[];
  recurring: RecurrenceCandidate[];
  recurringMonthlyTotal: number;
  missedRecurring: RecurrenceCandidate[];
  pace: SpendingPace;
  compare: CategoryDelta[];
  upcoming: UpcomingItem[];
  calendar: CalendarDay[];
  netWorthOutlook: Record<12 | 24 | 60, NetWorthPoint[]>;
  goals: SavingsGoal[];
  goalSequence: GoalSequenceResult;
  savingsTarget: number;
  currency: LedgerState["currency"];
};

function monthHasData(month: MonthBudget | undefined): boolean {
  return Boolean(month && (month.incomes.length || month.expenses.length));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─── Money flow ──────────────────────────────────────────────────────────────

export function buildFlowModel(month: MonthBudget, projection: Projection): FlowModel {
  const bySource = new Map<string, FlowNode>();
  month.incomes.forEach((entry, index) => {
    if (entry.amount <= 0) return;
    const label = entry.source.trim() || "Income";
    const key = label.toLowerCase();
    const item = { id: entry.id, label, value: entry.amount, date: entry.date, recurring: isRecurring(entry) };
    const existing = bySource.get(key);
    if (existing) {
      existing.value += entry.amount;
      existing.items.push(item);
    } else {
      bySource.set(key, { id: `src-${key}`, label, value: entry.amount, color: entry.color || colors[index % colors.length], items: [item] });
    }
  });
  let sources = [...bySource.values()].sort((a, b) => b.value - a.value);
  if (sources.length > 6) {
    const rest = sources.slice(5);
    sources = [
      ...sources.slice(0, 5),
      {
        id: "src-other",
        label: "Other income",
        value: rest.reduce((sum, node) => sum + node.value, 0),
        color: "#8e98a9",
        items: rest.flatMap((node) => node.items),
      },
    ];
  }

  let targets: FlowNode[] = buildExpenseGroups(month.expenses)
    .filter((group) => group.total > 0)
    .map((group) => ({
      id: `cat-${group.id}`,
      label: group.category || group.items[0]?.name || "Outflow",
      value: group.total,
      color: group.color,
      items: group.items.map((expense: ExpenseEntry) => ({ id: expense.id, label: expense.name, value: expense.amount, date: expense.date, recurring: isRecurring(expense) })),
    }))
    .sort((a, b) => b.value - a.value);
  if (targets.length > 9) {
    const rest = targets.slice(8);
    targets = [
      ...targets.slice(0, 8),
      {
        id: "cat-other",
        label: "Other",
        value: rest.reduce((sum, node) => sum + node.value, 0),
        color: "#8e98a9",
        items: rest.flatMap((node) => node.items).sort((a, b) => b.value - a.value),
      },
    ];
  }

  const surplus = projection.monthlySurplus;
  if (surplus > 0) {
    targets.unshift({ id: "cat-savings", label: "Savings", value: surplus, color: "var(--mint)", items: [] });
  } else if (surplus < 0) {
    sources.push({ id: "src-shortfall", label: "Shortfall", value: -surplus, color: "var(--red)", items: [] });
  }

  for (const node of [...sources, ...targets]) node.value = round2(node.value);
  const total = round2(targets.reduce((sum, node) => sum + node.value, 0));

  return { sources, targets, total, income: projection.monthlyIncome, expenses: projection.monthlyExpenses, surplus };
}

// ─── Spending pace ───────────────────────────────────────────────────────────

function daysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

export function buildSpendingPace(month: MonthBudget, projection: Projection, monthKey: string, today: string): SpendingPace {
  const days = daysInMonth(monthKey);
  const todayMonth = today.slice(0, 7);
  const isLive = todayMonth === monthKey;
  const daysElapsed = isLive ? Number(today.slice(8, 10)) : monthKey < todayMonth ? days : 0;
  // Everything dated up to today counts as spent; undated rows are planned for the month and
  // count too. For a past month the whole month is spent.
  const spent = isLive
    ? month.expenses.filter((expense) => !expense.date || expense.date.slice(0, 10) <= today).reduce((sum, expense) => sum + expense.amount, 0)
    : monthKey < todayMonth
      ? projection.monthlyExpenses
      : 0;
  const recurringSpend = month.expenses.filter(isRecurring).reduce((sum, expense) => sum + expense.amount, 0);
  const variableSpent = Math.max(0, spent - Math.min(spent, recurringSpend));
  const dailyAverage = daysElapsed > 0 ? spent / daysElapsed : 0;
  const projectedSpend = isLive && daysElapsed > 0 ? recurringSpend + (variableSpent / daysElapsed) * days : isLive ? projection.monthlyExpenses : spent;
  const remainingDays = Math.max(1, days - daysElapsed);
  const income = projection.monthlyIncome;
  return {
    monthKey,
    daysInMonth: days,
    daysElapsed,
    isLive,
    spent: round2(spent),
    income,
    dailyAverage: round2(dailyAverage),
    projectedSpend: round2(projectedSpend),
    safePerDay: isLive ? round2(Math.max(0, income - spent) / remainingDays) : 0,
    spentShare: income > 0 ? spent / income : spent > 0 ? 1 : 0,
    elapsedShare: days > 0 ? daysElapsed / days : 0,
  };
}

// ─── Month on month ──────────────────────────────────────────────────────────

export function buildCategoryDeltas(current: CategoryRow[], previous: CategoryRow[]): CategoryDelta[] {
  const names = new Set([...current.map((row) => row.name), ...previous.map((row) => row.name)]);
  const deltas: CategoryDelta[] = [];
  for (const name of names) {
    const now = current.find((row) => row.name === name);
    const before = previous.find((row) => row.name === name);
    const currentValue = now?.monthly ?? 0;
    const previousValue = before?.monthly ?? 0;
    const delta = round2(currentValue - previousValue);
    deltas.push({
      name,
      color: now?.color ?? before?.color ?? "#8e98a9",
      current: round2(currentValue),
      previous: round2(previousValue),
      delta,
      percent: previousValue > 0 ? (delta / previousValue) * 100 : currentValue > 0 ? Number.POSITIVE_INFINITY : 0,
    });
  }
  return deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// ─── Upcoming ────────────────────────────────────────────────────────────────

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86_400_000);
}

function nextDueDate(dueDay: number, today: string): string {
  const monthKey = today.slice(0, 7);
  const day = clampDueDay(dueDay);
  const thisMonth = `${monthKey}-${String(Math.min(day, daysInMonth(monthKey))).padStart(2, "0")}`;
  if (thisMonth >= today) return thisMonth;
  const next = shiftMonth(monthKey, 1);
  return `${next}-${String(Math.min(day, daysInMonth(next))).padStart(2, "0")}`;
}

export function buildUpcoming(recurring: RecurrenceCandidate[], accounts: Account[], today: string, horizonDays = 14): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  for (const candidate of recurring) {
    if (!candidate.nextExpected || candidate.kind !== "expense") continue;
    const daysAway = dayDiff(today, candidate.nextExpected);
    if (daysAway < 0 || daysAway > horizonDays) continue;
    items.push({
      id: `recurring-${candidate.key}`,
      label: candidate.label,
      amount: candidate.typicalAmount,
      date: candidate.nextExpected,
      kind: "recurring",
      daysAway,
      color: candidate.color,
    });
  }
  for (const account of accounts) {
    if (account.accountClass !== "debt" || account.balance <= 0 || account.minimumPayment <= 0) continue;
    const date = nextDueDate(account.dueDay, today);
    const daysAway = dayDiff(today, date);
    if (daysAway > horizonDays) continue;
    // Skip a card payment the recurring detector already lists.
    if (items.some((item) => item.kind === "recurring" && item.label.toLowerCase().includes(account.name.toLowerCase()))) continue;
    items.push({
      id: `debt-${account.id}`,
      label: `${account.name} payment`,
      amount: account.minimumPayment,
      date,
      kind: "debt",
      daysAway,
      color: account.color,
    });
  }
  return items.sort((a, b) => a.daysAway - b.daysAway || b.amount - a.amount);
}

// ─── Calendar ────────────────────────────────────────────────────────────────

export function buildCalendar(month: MonthBudget, monthKey: string, today: string): CalendarDay[] {
  const days = daysInMonth(monthKey);
  const [year, monthNumber] = monthKey.split("-").map(Number);
  const spentByDay = new Map<number, { spent: number; count: number }>();
  for (const expense of month.expenses) {
    if (!expense.date || !expense.date.startsWith(monthKey)) continue;
    const day = Number(expense.date.slice(8, 10));
    const entry = spentByDay.get(day) ?? { spent: 0, count: 0 };
    entry.spent += expense.amount;
    entry.count += 1;
    spentByDay.set(day, entry);
  }
  const max = Math.max(1, ...[...spentByDay.values()].map((entry) => entry.spent));
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    const entry = spentByDay.get(day) ?? { spent: 0, count: 0 };
    return {
      date,
      day,
      weekday: (new Date(year, monthNumber - 1, day).getDay() + 6) % 7,
      spent: round2(entry.spent),
      count: entry.count,
      intensity: entry.spent > 0 ? Math.min(1, Math.sqrt(entry.spent / max)) : 0,
      isFuture: date > today,
    };
  });
}

// ─── Extra warnings ──────────────────────────────────────────────────────────

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

// Signals the core finance module does not raise: category spikes against the recent
// average, subscription creep, and recurring bills that usually would have landed by now.
export function buildExtraSignals({
  monthKey,
  categories,
  history,
  projection,
  recurringMonthlyTotal,
  missedRecurring,
  formatter,
}: {
  monthKey: string;
  categories: CategoryRow[];
  history: Array<{ monthKey: string; categories: CategoryRow[] }>;
  projection: Projection;
  recurringMonthlyTotal: number;
  missedRecurring: RecurrenceCandidate[];
  formatter: Intl.NumberFormat;
}): FinancialSignal[] {
  const signals: FinancialSignal[] = [];
  const priorMonths = history.filter((entry) => entry.monthKey < monthKey && entry.categories.length);
  if (priorMonths.length >= 2) {
    for (const row of categories) {
      const past = priorMonths.map((entry) => entry.categories.find((candidate) => candidate.name === row.name)?.monthly ?? 0);
      const average = past.reduce((sum, value) => sum + value, 0) / past.length;
      if (average <= 0 || row.monthly < average * 1.5 || row.monthly - average < 50) continue;
      signals.push({
        id: `category-spike-${row.name.toLowerCase()}`,
        title: `${row.name} is up sharply`,
        summary: `${formatter.format(row.monthly)} this month against a ${formatter.format(average)} average over the last ${priorMonths.length} months.`,
        detail: "A one-off purchase is fine; a new normal is worth knowing about. Open the category in the money flow to see what drove it.",
        tone: row.monthly - average > Math.max(150, projection.monthlyIncome * 0.1) ? "warning" : "info",
      });
    }
  }
  if (projection.monthlyIncome > 0 && recurringMonthlyTotal / projection.monthlyIncome >= 0.3) {
    signals.push({
      id: "recurring-share",
      title: "Subscriptions and bills take a big slice",
      summary: `Detected recurring payments come to ${formatter.format(recurringMonthlyTotal)} a month — ${formatPercent((recurringMonthlyTotal / projection.monthlyIncome) * 100)} of income.`,
      detail: "Recurring payments are the easiest spending to trim: each one cancelled saves every month. Check the recurring payments widget for anything no longer used.",
      tone: "info",
    });
  }
  for (const candidate of missedRecurring.slice(0, 3)) {
    signals.push({
      id: `missed-${candidate.key}`,
      title: `${candidate.label} hasn't landed yet`,
      summary: `Usually ${formatter.format(candidate.typicalAmount)} around ${candidate.nextExpected ?? candidate.lastSeen} — not seen this cycle.`,
      detail: "Either the payment is late, the amount changed, or it was cancelled. If it is gone for good, nothing to do; otherwise expect it to show up.",
      tone: "warning",
    });
  }
  return signals;
}

// ─── The model ───────────────────────────────────────────────────────────────

// Recurring-payment detection scans every month of the ledger and does not depend on which
// month is on screen, so it is computed once per ledger object and reused as the user moves
// between months.
const recurringCache = new WeakMap<LedgerState, { subscriptions: RecurrenceCandidate[]; missed: Map<string, RecurrenceCandidate[]> }>();

function recurringFor(ledger: LedgerState, today: string) {
  let entry = recurringCache.get(ledger);
  if (!entry) {
    // Expense candidates on a steady cadence: the same filter the old subscriptions panel used.
    // (The Subscriptions page has its own, fuller engine in subscriptions.ts.)
    const subscriptions = detectRecurringCandidates(ledger).filter((candidate) => candidate.kind === "expense" && candidate.confidence >= 0.6);
    entry = { subscriptions, missed: new Map() };
    recurringCache.set(ledger, entry);
  }
  let missed = entry.missed.get(today);
  if (!missed) {
    missed = findMissedRecurring(ledger, today).slice(0, 4);
    entry.missed.set(today, missed);
  }
  return { subscriptions: entry.subscriptions, missed };
}

export function buildInsightsModel(ledger: LedgerState, monthKey: string, options: { today?: string; formatter?: Intl.NumberFormat } = {}): InsightsModel {
  const today = options.today ?? isoToday();
  const formatter = options.formatter ?? new Intl.NumberFormat("en-GB", { style: "currency", currency: ledger.currency, maximumFractionDigits: 0 });
  const month = ledger.months[monthKey] ?? emptyBudget;
  const projection = calculateProjection(month);
  const previousKey = shiftMonth(monthKey, -1);
  const previousMonth = ledger.months[previousKey] ?? emptyBudget;
  const previousProjection = calculateProjection(previousMonth);

  // Account balances as of today — a past month's insights still show where the accounts stand now.
  const currentMonthKey = getMonthKey(new Date(`${today}T00:00:00`));
  const accounts = deriveLiveAccounts({ accounts: ledger.accounts, months: ledger.months, currentMonthKey, todayIso: today });
  const debtSummary = calculateDebtSummary(accounts);
  const assetSummary = calculateAssetSummary(accounts);
  const netWorth = calculateNetWorthSummary(accounts);
  const health = calculateHealthScore({ projection, debtSummary, accounts, savingsTarget: ledger.savingsTarget });

  const categories = buildCategoryRows(month, projection);
  const groups = buildExpenseGroups(month.expenses);
  const previousCategories = buildCategoryRows(previousMonth, previousProjection);
  const recurringEntry = recurringFor(ledger, today);
  const recurring = recurringEntry.subscriptions;
  const recurringMonthlyTotal = round2(recurring.reduce((sum, candidate) => sum + candidate.monthlyEquivalent, 0));
  const missedRecurring = monthKey === currentMonthKey ? recurringEntry.missed : [];

  const history = Array.from({ length: 3 }, (_, index) => {
    const key = shiftMonth(monthKey, -(index + 1));
    const budget = ledger.months[key];
    return { monthKey: key, categories: budget ? buildCategoryRows(budget, calculateProjection(budget)) : [] };
  });
  const coreSignals = buildFinancialSignals({ projection, debtSummary, accounts, assetSummary, month, savingsTarget: ledger.savingsTarget });
  const extraSignals = buildExtraSignals({ monthKey, categories, history, projection, recurringMonthlyTotal, missedRecurring, formatter });
  const onlyAllClear = coreSignals.length === 1 && coreSignals[0].id === "no-urgent-signals";
  const signals = onlyAllClear && extraSignals.length ? extraSignals : [...coreSignals.filter((signal) => signal.id !== "no-urgent-signals" || !extraSignals.length), ...extraSignals];

  const yearLedger = { ...ledger, selectedMonth: monthKey };
  const year = buildMonthlyFlowPoints(yearLedger);
  const trend = Array.from({ length: 6 }, (_, index) => {
    const key = shiftMonth(monthKey, index - 5);
    const budget = ledger.months[key];
    const point = calculateProjection(budget ?? emptyBudget);
    const [pointYear, pointMonth] = key.split("-").map(Number);
    return {
      monthKey: key,
      label: new Date(pointYear, pointMonth - 1, 1).toLocaleString("en", { month: "short" }),
      income: point.monthlyIncome,
      expenses: point.monthlyExpenses,
      surplus: point.monthlySurplus,
      hasData: monthHasData(budget),
    };
  });

  // Six months of history for every node of the money flow, so the drill-down can show a trend.
  const flow = buildFlowModel(month, projection);
  const trendMonths = trend.map((point) => {
    const budget = ledger.months[point.monthKey] ?? emptyBudget;
    const pointProjection = calculateProjection(budget);
    const rows = buildCategoryRows(budget, pointProjection);
    const incomeBySource = new Map<string, number>();
    for (const income of budget.incomes) {
      const key = (income.source.trim() || "Income").toLowerCase();
      incomeBySource.set(key, (incomeBySource.get(key) ?? 0) + income.amount);
    }
    return { point, rows, incomeBySource, projection: pointProjection };
  });
  for (const node of flow.targets) {
    if (node.id === "cat-other") continue;
    node.history = trendMonths.map(({ point, rows, projection: pointProjection }) => ({
      monthKey: point.monthKey,
      label: point.label,
      value: node.id === "cat-savings" ? Math.max(0, pointProjection.monthlySurplus) : rows.find((row) => row.name === node.label)?.monthly ?? 0,
    }));
  }
  for (const node of flow.sources) {
    if (node.id === "src-other" || node.id === "src-shortfall") continue;
    node.history = trendMonths.map(({ point, incomeBySource }) => ({ monthKey: point.monthKey, label: point.label, value: incomeBySource.get(node.label.toLowerCase()) ?? 0 }));
  }

  const linkedTransfers = recurringAccountTransfersByAccount(month);
  const outlook = (months: 12 | 24 | 60) => buildNetWorthOutlook({ accounts, projection, months, linkedTransfers });
  const goalPlan = goalPlanInputs({
    goals: ledger.goals,
    accounts,
    month,
    recurringSurplus: projection.recurringMonthlySurplus,
    override: ledger.goalPlannerSurplus,
  });
  const goalSequence = runGoalSequence({
    goals: ledger.goals,
    monthlySurplus: goalPlan.monthlySurplus,
    horizonMonths: ledger.goalsHorizonMonths,
    dedicatedMonthly: goalPlan.dedicatedMonthly,
  });

  const cards: CardUtilisation[] = accounts
    .filter((account) => countsTowardUtilization(account) && account.creditLimit > 0)
    .map((account) => ({
      id: account.id,
      name: account.name,
      balance: Math.max(0, account.balance),
      limit: account.creditLimit,
      utilisation: (Math.max(0, account.balance) / Math.max(1, account.creditLimit)) * 100,
      color: account.color,
      dueDay: account.dueDay,
      rate: account.rate,
      promoMonths: account.promoMonths,
    }))
    .sort((a, b) => b.utilisation - a.utilisation);

  return {
    monthKey,
    label: formatMonth(monthKey),
    today,
    isCurrentMonth: monthKey === currentMonthKey,
    hasData: monthHasData(ledger.months[monthKey]),
    month,
    projection,
    previous: { monthKey: previousKey, label: formatMonth(previousKey), projection: previousProjection, hasData: monthHasData(ledger.months[previousKey]) },
    trend,
    year,
    categories,
    groups,
    flow,
    health,
    signals,
    accounts,
    debtSummary,
    assetSummary,
    netWorth,
    cards,
    recurring,
    recurringMonthlyTotal,
    missedRecurring,
    pace: buildSpendingPace(month, projection, monthKey, today),
    compare: buildCategoryDeltas(categories, previousCategories),
    upcoming: buildUpcoming(recurring, accounts, today),
    calendar: buildCalendar(month, monthKey, today),
    netWorthOutlook: { 12: outlook(12), 24: outlook(24), 60: outlook(60) },
    goals: ledger.goals,
    goalSequence,
    savingsTarget: ledger.savingsTarget,
    currency: ledger.currency,
  };
}

// Which warnings are on screen: everything not dismissed. The all-clear card is never hidden.
export function visibleSignals(signals: FinancialSignal[], hidden: string[]): { shown: FinancialSignal[]; hiddenCount: number } {
  const hiddenSet = new Set(hidden);
  const shown = signals.filter((signal) => !hiddenSet.has(signal.id));
  return { shown, hiddenCount: signals.length - shown.length };
}
