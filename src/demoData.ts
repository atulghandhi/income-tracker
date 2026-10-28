import { colors, createInitialState, getMonthKey, shiftMonth } from "./finance";
import type { Account, ExpenseEntry, IncomeEntry, LedgerState, MonthBudget, SavingsGoal } from "./types";

// ─── Demo ledger ─────────────────────────────────────────────────────────────
//
// A year of plausible transactions for a renter in a UK city on a £2,850 take-home
// salary: rent, council tax, energy that climbs in winter, weekly supermarket shops,
// coffees, TfL, a few subscriptions, a credit card and a car loan, a summer holiday
// and a December that costs more than it should. Deterministic (seeded), so tests
// and screenshots are repeatable.
//
// Used in two places: the insights widgets draw it (greyed out) when a user asks to "show
// sample data", and the unit tests exercise the insights maths against it. The dev server's
// own sample ledger, per country, is sampleData.ts.

export const DEMO_SEED = 20260401;

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(rng: Rng, min: number, max: number): number {
  return Math.round((min + rng() * (max - min)) * 100) / 100;
}

function whole(rng: Rng, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

function pick<T>(rng: Rng, options: T[]): T {
  return options[Math.floor(rng() * options.length)];
}

function daysIn(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function dateIn(monthKey: string, day: number): string {
  return `${monthKey}-${String(Math.max(1, Math.min(daysIn(monthKey), day))).padStart(2, "0")}`;
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const DEMO_CATEGORY_COLORS: Record<string, string> = {
  Home: colors[0],
  Bills: colors[2],
  Food: colors[1],
  "Eating out": colors[7],
  Travel: colors[4],
  Subscriptions: colors[6],
  Shopping: colors[5],
  Health: colors[3],
  Entertainment: colors[4],
  "Debt payments": colors[5],
};

const DEMO_ACCOUNT_IDS = {
  current: "demo-account-monzo",
  savings: "demo-account-marcus",
  isa: "demo-account-vanguard",
  card: "demo-account-barclaycard",
  promoCard: "demo-account-halifax",
  loan: "demo-account-zopa",
};

type Draft = {
  name: string;
  category: string;
  amount: number;
  day: number;
  recurring: boolean;
  accountId?: string;
  debtAccountId?: string;
};

function expenseFromDraft(monthKey: string, index: number, draft: Draft): ExpenseEntry {
  return {
    id: `demo-expense-${monthKey}-${index}`,
    name: draft.name,
    category: draft.category,
    amount: draft.amount,
    color: DEMO_CATEGORY_COLORS[draft.category] ?? colors[index % colors.length],
    recurring: draft.recurring,
    date: dateIn(monthKey, draft.day),
    accountId: draft.accountId ?? DEMO_ACCOUNT_IDS.current,
    ...(draft.debtAccountId ? { debtAccountId: draft.debtAccountId } : {}),
  };
}

// Energy bills follow the seasons: January roughly double July.
function energyFor(monthIndex: number, rng: Rng): number {
  const seasonal = 0.5 + 0.5 * Math.cos(((monthIndex - 1) / 12) * Math.PI * 2);
  return between(rng, 78 + seasonal * 60, 86 + seasonal * 66);
}

function buildDemoMonth(monthKey: string, rng: Rng, todayIso: string, isCurrentMonth: boolean): MonthBudget {
  const monthIndex = Number(monthKey.split("-")[1]);
  const incomes: IncomeEntry[] = [];
  const drafts: Draft[] = [];

  // ── Income ──
  incomes.push({
    id: `demo-income-${monthKey}-salary`,
    source: "Salary — Acme Ltd",
    amount: 2850,
    color: colors[1],
    recurring: true,
    date: dateIn(monthKey, 25),
    accountId: DEMO_ACCOUNT_IDS.current,
  });
  incomes.push({
    id: `demo-income-${monthKey}-interest`,
    source: "Savings interest — Marcus",
    amount: between(rng, 19, 24),
    color: colors[0],
    recurring: true,
    date: dateIn(monthKey, 1),
    accountId: DEMO_ACCOUNT_IDS.savings,
  });
  if (monthIndex === 3) {
    incomes.push({
      id: `demo-income-${monthKey}-bonus`,
      source: "Annual bonus",
      amount: 900,
      color: colors[4],
      recurring: false,
      date: dateIn(monthKey, 25),
      accountId: DEMO_ACCOUNT_IDS.current,
    });
  }
  if (rng() < 0.35) {
    incomes.push({
      id: `demo-income-${monthKey}-freelance`,
      source: "Freelance design",
      amount: between(rng, 150, 450),
      color: colors[6],
      recurring: false,
      date: dateIn(monthKey, whole(rng, 6, 22)),
      accountId: DEMO_ACCOUNT_IDS.current,
    });
  }

  // ── Fixed outgoings ──
  drafts.push({ name: "Rent — Flat 4", category: "Home", amount: 1150, day: 1, recurring: true });
  drafts.push({ name: "Council tax", category: "Bills", amount: 158, day: 1, recurring: true });
  drafts.push({ name: "Octopus Energy", category: "Bills", amount: energyFor(monthIndex, rng), day: 15, recurring: true });
  drafts.push({ name: "Thames Water", category: "Bills", amount: 38.5, day: 8, recurring: true });
  drafts.push({ name: "Virgin Media broadband", category: "Bills", amount: 32, day: 12, recurring: true });
  drafts.push({ name: "EE mobile", category: "Bills", amount: 25, day: 20, recurring: true });
  drafts.push({ name: "Admiral car insurance", category: "Bills", amount: 48.2, day: 3, recurring: true });
  drafts.push({ name: "Netflix", category: "Subscriptions", amount: 10.99, day: 6, recurring: true });
  drafts.push({ name: "Spotify", category: "Subscriptions", amount: 11.99, day: 14, recurring: true });
  drafts.push({ name: "PureGym", category: "Subscriptions", amount: 24.99, day: 2, recurring: true });
  drafts.push({ name: "Amazon Prime", category: "Subscriptions", amount: 8.99, day: 19, recurring: true });
  drafts.push({ name: "iCloud storage", category: "Subscriptions", amount: 2.99, day: 9, recurring: true });
  drafts.push({ name: "Barclaycard payment", category: "Debt payments", amount: 150, day: 28, recurring: true, debtAccountId: DEMO_ACCOUNT_IDS.card });
  drafts.push({ name: "Halifax Clarity payment", category: "Debt payments", amount: 75, day: 16, recurring: true, debtAccountId: DEMO_ACCOUNT_IDS.promoCard });
  drafts.push({ name: "Zopa car loan", category: "Debt payments", amount: 185, day: 5, recurring: true, debtAccountId: DEMO_ACCOUNT_IDS.loan });

  // ── Groceries: a weekly big shop plus top-ups ──
  const shops = ["Tesco", "Sainsbury's", "Lidl", "Aldi"];
  for (let week = 0; week < 4; week += 1) {
    drafts.push({ name: pick(rng, shops), category: "Food", amount: between(rng, 42, 84), day: 2 + week * 7 + whole(rng, 0, 2), recurring: false });
  }
  for (let topUp = 0; topUp < whole(rng, 2, 4); topUp += 1) {
    drafts.push({ name: pick(rng, ["Co-op", "Tesco Express", "M&S Food"]), category: "Food", amount: between(rng, 5, 16), day: whole(rng, 1, 28), recurring: false });
  }

  // ── Eating out & coffee ──
  for (let coffee = 0; coffee < whole(rng, 3, 7); coffee += 1) {
    drafts.push({ name: pick(rng, ["Costa Coffee", "Pret a Manger", "Caffè Nero"]), category: "Eating out", amount: between(rng, 3.2, 6.4), day: whole(rng, 1, 28), recurring: false });
  }
  for (let meal = 0; meal < whole(rng, 1, 3); meal += 1) {
    drafts.push({ name: pick(rng, ["Deliveroo", "Nando's", "Wagamama", "Just Eat"]), category: "Eating out", amount: between(rng, 17, 38), day: whole(rng, 1, 28), recurring: false });
  }
  if (rng() < 0.6) {
    drafts.push({ name: pick(rng, ["The Crown pub", "Wetherspoons", "BrewDog"]), category: "Eating out", amount: between(rng, 14, 34), day: whole(rng, 1, 28), recurring: false });
  }

  // ── Travel ──
  for (let week = 0; week < 4; week += 1) {
    drafts.push({ name: "TfL travel", category: "Travel", amount: between(rng, 27, 36), day: 4 + week * 7, recurring: false });
  }
  if (rng() < 0.45) drafts.push({ name: "Trainline", category: "Travel", amount: between(rng, 22, 68), day: whole(rng, 1, 28), recurring: false });
  if (rng() < 0.5) drafts.push({ name: "Uber", category: "Travel", amount: between(rng, 9, 23), day: whole(rng, 1, 28), recurring: false });
  if (rng() < 0.6) drafts.push({ name: "Shell petrol", category: "Travel", amount: between(rng, 45, 70), day: whole(rng, 1, 28), recurring: false });

  // ── Shopping, health, fun ──
  for (let order = 0; order < whole(rng, 1, 3); order += 1) {
    drafts.push({ name: "Amazon", category: "Shopping", amount: between(rng, 11, 58), day: whole(rng, 1, 28), recurring: false });
  }
  if (rng() < 0.55) drafts.push({ name: pick(rng, ["Uniqlo", "Zara", "Argos", "IKEA", "Next"]), category: "Shopping", amount: between(rng, 24, 92), day: whole(rng, 1, 28), recurring: false });
  if (rng() < 0.6) drafts.push({ name: "Boots", category: "Health", amount: between(rng, 6, 24), day: whole(rng, 1, 28), recurring: false });
  if (monthIndex % 4 === 2) drafts.push({ name: "Dentist check-up", category: "Health", amount: between(rng, 45, 85), day: whole(rng, 3, 26), recurring: false });
  if (rng() < 0.5) drafts.push({ name: "Odeon cinema", category: "Entertainment", amount: between(rng, 11, 19), day: whole(rng, 1, 28), recurring: false });
  if (rng() < 0.4) drafts.push({ name: pick(rng, ["Steam", "Nintendo eShop", "Kindle store"]), category: "Entertainment", amount: between(rng, 9, 44), day: whole(rng, 1, 28), recurring: false });

  // ── The months that are not like the others ──
  if (monthIndex === 8) {
    drafts.push({ name: "easyJet", category: "Travel", amount: 238, day: 2, recurring: false });
    drafts.push({ name: "Booking.com", category: "Travel", amount: 486, day: 3, recurring: false });
    drafts.push({ name: "Holiday spending", category: "Eating out", amount: between(rng, 180, 260), day: 14, recurring: false });
  }
  if (monthIndex === 12) {
    drafts.push({ name: "John Lewis", category: "Shopping", amount: between(rng, 120, 220), day: 9, recurring: false });
    drafts.push({ name: "Amazon", category: "Shopping", amount: between(rng, 60, 140), day: 13, recurring: false });
    drafts.push({ name: "Christmas food shop", category: "Food", amount: between(rng, 90, 140), day: 22, recurring: false });
  }
  if (monthIndex === 5) drafts.push({ name: "Kwik Fit car service", category: "Travel", amount: 182, day: 11, recurring: false });
  if (monthIndex === 10) drafts.push({ name: "Winter coat — Uniqlo", category: "Shopping", amount: 89.9, day: 18, recurring: false });

  // The live month is in progress: variable spending only exists up to today, while the
  // planned (recurring) rows are already in place, just as the ledger seeds them.
  const kept = drafts.filter((draft) => !isCurrentMonth || draft.recurring || dateIn(monthKey, draft.day) <= todayIso);
  const expenses = kept
    .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name))
    .map((draft, index) => expenseFromDraft(monthKey, index, draft));
  const keptIncomes = incomes.filter((income) => !isCurrentMonth || income.recurring || (income.date ?? "") <= todayIso);

  return { incomes: keptIncomes, expenses, note: monthIndex === 8 ? "Holiday month — two weeks in Portugal." : "" };
}

function demoAccounts(monthKey: string, todayIso: string): Account[] {
  const base = {
    promoRate: 0,
    promoMonths: 0,
    promoAsOf: monthKey,
    monthlyContribution: 0,
    creditLimit: 0,
    minimumPayment: 0,
    dueDay: 1,
    balanceAsOf: monthKey,
    balanceSetOn: todayIso,
    includeInNetWorth: true,
    note: "",
  };
  return [
    { ...base, id: DEMO_ACCOUNT_IDS.current, name: "Monzo current account", accountClass: "cash", type: "current", balance: 1843.27, rate: 0, color: colors[0] },
    { ...base, id: DEMO_ACCOUNT_IDS.savings, name: "Marcus savings", accountClass: "savings", type: "savings", balance: 6200, rate: 4.3, monthlyContribution: 250, color: colors[1] },
    { ...base, id: DEMO_ACCOUNT_IDS.isa, name: "Vanguard S&S ISA", accountClass: "investment", type: "isa", balance: 9400, rate: 6, monthlyContribution: 100, color: colors[4] },
    { ...base, id: DEMO_ACCOUNT_IDS.card, name: "Barclaycard", accountClass: "debt", type: "credit-card", balance: 1240, rate: 24.9, creditLimit: 3500, minimumPayment: 150, dueDay: 28, color: colors[5] },
    { ...base, id: DEMO_ACCOUNT_IDS.promoCard, name: "Halifax Clarity", accountClass: "debt", type: "credit-card", balance: 900, rate: 22.9, promoRate: 0, promoMonths: 3, creditLimit: 2000, minimumPayment: 75, dueDay: 16, color: colors[7] },
    { ...base, id: DEMO_ACCOUNT_IDS.loan, name: "Zopa car loan", accountClass: "debt", type: "loan", balance: 4800, rate: 6.9, minimumPayment: 185, dueDay: 5, color: colors[2] },
  ];
}

function demoGoals(createdAt: string): SavingsGoal[] {
  return [
    {
      id: "demo-goal-emergency",
      name: "Emergency fund",
      target: 9000,
      saved: 6200,
      color: colors[1],
      priority: 1,
      fundingMode: "fixed",
      monthlyAmount: 250,
      deadlineMonths: 0,
      interestRate: 4.3,
      accountId: DEMO_ACCOUNT_IDS.savings,
      note: "Three months of essentials.",
      createdAt,
    },
    {
      id: "demo-goal-japan",
      name: "Japan trip",
      target: 3000,
      saved: 1150,
      color: colors[6],
      priority: 2,
      fundingMode: "fixed",
      monthlyAmount: 150,
      deadlineMonths: 14,
      interestRate: 0,
      note: "",
      createdAt,
    },
  ];
}

export function buildDemoLedger({ today = new Date(), months = 12, seed = DEMO_SEED }: { today?: Date; months?: number; seed?: number } = {}): LedgerState {
  const rng = mulberry32(seed);
  const currentKey = getMonthKey(today);
  const todayIso = isoDate(today);
  const ledgerMonths: Record<string, MonthBudget> = {};
  for (let offset = -(months - 1); offset <= 0; offset += 1) {
    const monthKey = shiftMonth(currentKey, offset);
    ledgerMonths[monthKey] = buildDemoMonth(monthKey, rng, todayIso, offset === 0);
  }
  const createdAt = new Date(today.getFullYear(), today.getMonth() - 6, 1).toISOString();

  return {
    ...createInitialState("GB"),
    selectedMonth: currentKey,
    months: ledgerMonths,
    goals: demoGoals(createdAt),
    goalPlannerSurplus: null,
    goalsHorizonMonths: 60,
    ledgerGoalId: null,
    savingsTarget: 20,
    accounts: demoAccounts(currentKey, todayIso),
    defaultAccountId: DEMO_ACCOUNT_IDS.current,
    assumedInvestmentReturn: 6,
    categoryRules: [],
    nameRules: [],
    importBatches: [],
    privacyMode: false,
    aiCategorizationEnabled: false,
    lastSavedAt: today.toISOString(),
  };
}
