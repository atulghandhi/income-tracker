import { DEFAULT_ALLOCATION_SETTINGS, effectiveAnnualRate, monthlyRateFromAnnual } from "./finance";
import { estimateLumpSumTax, LUMP_SUM_SOURCES, type LumpSumTaxResult } from "./lumpSumTax";
import type { RegionKey } from "./region";
import type { Account, AccountType, AllocationSettings, CountryCode, CustomShares, LumpSumStudentLoan, LumpSumTaxSettings, PayoffMethod, PlanPriority, SavingsGoal, SavingsPriority, TaxProfile, TaxTreatment, UndergradLoanPlan } from "./types";

export type { AllocationSettings, CustomShares, PayoffMethod, PlanPriority, SavingsPriority } from "./types";
export { DEFAULT_ALLOCATION_SETTINGS } from "./finance";

// ─── Allocation planner ──────────────────────────────────────────────────────
//
// Splits the money a person has spare — a monthly surplus and/or a one-off lump sum — between
// their debts, a cash buffer, a tax reserve and savings, then simulates the result month by month
// so different approaches can be compared side by side.
//
// The debts, rates and 0% windows come from the live accounts; the same promo-aware compounding
// as the net-worth forecast (effectiveAnnualRate / monthlyRateFromAnnual) is used, so the two
// agree. Every strategy is expressed as the same two decisions:
//
//   1. a waterfall of buckets the money flows through (tax reserve → cash buffer → debts →
//      savings, in some order, with "custom" using fixed shares instead), and
//   2. the order debts are attacked in once money reaches the debt bucket: avalanche (highest
//      APR), snowball (smallest balance), cash-flow (largest payment freed per pound) or
//      utilisation (bring the most-used card down first, levelling cards as it goes).
//
// Everything here is an illustration from the figures entered, not advice: rates are held
// constant, payments are assumed on time, no new borrowing, and investment returns are whatever
// the user assumed. The UI says so, and points people with problem debt at free help.

export type BucketKind = "tax" | "buffer" | "debt" | "savings";

export const ALLOCATION_HORIZONS = [12, 24, 36, 60, 120];

export const PLAN_PRIORITIES: PlanPriority[] = ["interest", "payments", "quick-wins", "credit-score", "cash-buffer", "tax-buffer", "balanced", "custom"];
export const SAVINGS_PRIORITIES: SavingsPriority[] = ["safe-rate", "growth", "tax-efficient", "goals-first"];

export type PriorityInfo = {
  id: PlanPriority;
  label: string;
  method: PayoffMethod;
  methodLabel: string;
  // One line for the picker.
  summary: string;
  // A paragraph for the selected card.
  detail: string;
};

// Copy is written for the UK app; the US experience runs it through the text localiser.
export const PRIORITY_INFO: Record<PlanPriority, PriorityInfo> = {
  interest: {
    id: "interest",
    label: "Least interest",
    method: "avalanche",
    methodLabel: "Avalanche",
    summary: "Highest APR first. Pays the least interest overall.",
    detail:
      "The avalanche method: all the spare money goes to the debt charging the highest rate while the rest get their minimums. Once it is cleared, its payment rolls onto the next-highest rate. Mathematically this costs the least in interest, though the first account can take a while to disappear.",
  },
  payments: {
    id: "payments",
    label: "Lower payments soonest",
    method: "cashflow",
    methodLabel: "Cash-flow",
    summary: "Clear the debts whose payments are biggest relative to what is owed.",
    detail:
      "Targets the debt whose monthly payment is largest relative to its balance, so committed outgoings fall as early as possible. Useful when the monthly squeeze matters more than the total cost; it usually costs a little more interest than the avalanche.",
  },
  "quick-wins": {
    id: "quick-wins",
    label: "Quick wins",
    method: "snowball",
    methodLabel: "Snowball",
    summary: "Smallest balance first. Fewer accounts, sooner.",
    detail:
      "The snowball method: clear the smallest balance first, then roll its payment into the next smallest. Each cleared account is a visible win and one less payment to juggle. It typically costs more interest than the avalanche — the trade is momentum for money.",
  },
  "credit-score": {
    id: "credit-score",
    label: "Credit score recovery",
    method: "utilisation",
    methodLabel: "Utilisation",
    summary: "Bring the most-used cards under 30%, then 10%, before anything else.",
    detail:
      "Card utilisation — balance as a share of the limit — is one of the biggest factors in a credit score. Money goes to whichever card is the most used, levelling the cards down together and aiming to get each under 30% and then 10% of its limit. Loans and other debts are paid by highest APR once the cards are clear.",
  },
  "cash-buffer": {
    id: "cash-buffer",
    label: "Cash buffer first",
    method: "avalanche",
    methodLabel: "Avalanche after buffer",
    summary: "Build an emergency fund to your target, then attack debt by APR.",
    detail:
      "Money goes into an easy-access buffer until it covers your target number of months of spending, and only then to debts (highest APR first). Carrying debt a little longer costs interest, but a buffer means the next surprise bill does not land on a card.",
  },
  "tax-buffer": {
    id: "tax-buffer",
    label: "Tax bill first",
    method: "avalanche",
    methodLabel: "Avalanche after tax",
    summary: "Set aside an expected tax bill in full before overpaying anything.",
    detail:
      "For the self-employed or anyone expecting a tax bill: the reserve is funded first and fastest, from the lump sum and then all the spare money, so the bill is covered when it falls due. Debts get minimums until then, then the highest APR first.",
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    method: "avalanche",
    methodLabel: "Rate comparison",
    summary: "One month's buffer, then overpay only debts costing more than savings earn.",
    detail:
      "A starter buffer of one month's spending comes first. After that, spare money goes to debts whose APR is higher than your best savings rate (highest APR first); a debt costing less than savings earn — a cheap loan, a 0% card with time left on its promo — gets its minimum and the money earns interest instead. The 0% guard still clears a promo balance before its rate rises.",
  },
  custom: {
    id: "custom",
    label: "Custom split",
    method: "avalanche",
    methodLabel: "Your split",
    summary: "Choose the percentages yourself: debts, buffer, savings.",
    detail:
      "All spare money and the lump sum are split by the percentages you set. Anything a bucket cannot use (a buffer already at target, debts already cleared) spills into the next one.",
  },
};

export const METHOD_LABELS: Record<PayoffMethod, string> = {
  avalanche: "Avalanche (highest APR first)",
  snowball: "Snowball (smallest balance first)",
  cashflow: "Cash-flow (largest payment freed first)",
  utilisation: "Utilisation (most-used card first)",
};

export type SavingsPriorityInfo = { id: SavingsPriority; label: string; summary: string; detail: string };

export const SAVINGS_PRIORITY_INFO: Record<SavingsPriority, SavingsPriorityInfo> = {
  "safe-rate": {
    id: "safe-rate",
    label: "Highest safe rate",
    summary: "Cash savings with the highest rate.",
    detail: "Savings and cash accounts only, ranked by rate. Money is accessible and protected by the deposit guarantee scheme up to its limit; the return is modest and taxable above your allowance.",
  },
  growth: {
    id: "growth",
    label: "Highest expected return",
    summary: "Investments included, at the return you assume.",
    detail:
      "Ranks every savings and investment account by its rate, including stocks-and-shares accounts at the return you assume in Settings. Higher expected return comes with risk: investments can fall as well as rise, and a figure assumed here is not a forecast or a promise.",
  },
  "tax-efficient": {
    id: "tax-efficient",
    label: "Tax wrappers first",
    summary: "Tax-free and tax-deferred accounts before taxable ones.",
    detail: "Accounts with a tax advantage (ISAs, pensions and SIPPs; IRAs and HSAs) come first, ranked by rate within that. Payroll-only accounts are skipped because a lump sum cannot be paid into them directly.",
  },
  "goals-first": {
    id: "goals-first",
    label: "Fund my goals",
    summary: "Fill the goals on the Goals page in priority order.",
    detail: "Money left after the buckets ahead of savings tops up your goals one at a time, highest priority first, each growing at its own rate. Whatever is left once every goal is full goes to the highest safe rate.",
  },
};

// ─── Inputs ──────────────────────────────────────────────────────────────────

export type PlanDebt = {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  rate: number;
  promoRate: number;
  promoMonths: number;
  minimumPayment: number;
  creditLimit: number;
  color: string;
};

export type PlanSaver = {
  id: string;
  name: string;
  type: AccountType;
  accountClass: Account["accountClass"];
  rate: number;
  taxTreatment?: TaxTreatment;
  payroll: boolean;
  color: string;
};

export type PlanGoal = {
  id: string;
  name: string;
  target: number;
  saved: number;
  priority: number;
  interestRate: number;
  color: string;
};

export type PlanInputs = {
  debts: PlanDebt[];
  // Debts with a balance the user has left out of the plan. Not simulated; shown so they can be added.
  excludedDebts?: PlanDebt[];
  savers: PlanSaver[];
  goals: PlanGoal[];
  // Spare each month after bills, minimum payments and existing savings contributions.
  monthlyExtra: number;
  // The lump sum as received (before any tax to set aside from it).
  lumpSum: number;
  // Tax owed on the lump sum (UK, when it is untaxed income or a gain): held back today as a
  // reserve and paid in the month the bill falls due. See lumpSumTax.ts.
  lumpSumTax?: { amount: number; dueInMonths: number };
  lumpSumTaxResult?: LumpSumTaxResult | null;
  // Recurring monthly spending, to size the buffer.
  monthlyExpenses: number;
  // Easy-access savings already held, counted towards the buffer target.
  currentBuffer: number;
  bufferMonths: number;
  taxReserve: number;
  taxDueInMonths: number;
  horizonMonths: number;
  assumedInvestmentReturn: number;
  safeSavingsRate: number;
  promoGuard: boolean;
  rollover: boolean;
  customShares: CustomShares;
  customMethod: PayoffMethod;
  savingsPriority: SavingsPriority;
  region: RegionKey;
  startDate?: Date;
};

// ─── Outputs ─────────────────────────────────────────────────────────────────

export type PlanPoint = {
  month: number;
  label: string;
  totalDebt: number;
  debtBalances: Record<string, number>;
  interest: number;
  cumulativeInterest: number;
  // Minimum payments still committed at the end of the month (debts not yet cleared).
  paymentsCommitted: number;
  // Everything that went to debts this month: minimums plus extra.
  paidToDebt: number;
  utilisation: number;
  maxUtilisation: number;
  buffer: number;
  taxReserve: number;
  savings: number;
  goalsAdded: number;
  // Where this month's pool went.
  allocations: Record<BucketKind, number>;
  pool: number;
};

export type DebtOutcome = {
  id: string;
  name: string;
  color: string;
  type: AccountType;
  startBalance: number;
  rate: number;
  promoMonths: number;
  minimumPayment: number;
  payoffMonth: number | null;
  payoffLabel: string | null;
  interestPaid: number;
  // 1 = cleared first. null = not cleared within the simulation.
  order: number | null;
  lumpSumShare: number;
  firstMonthExtra: number;
};

export type SavingsDestination = {
  id: string | null;
  name: string;
  rate: number;
  kind: "cash" | "savings" | "investment" | "goal" | "assumed-cash" | "assumed-investment";
  taxTreatment?: TaxTreatment;
  color: string;
};

export type PlanSummary = {
  // Over the life of the debts (up to the 50-year cap), not just the horizon.
  totalInterest: number;
  interestWithinHorizon: number;
  debtFreeMonth: number | null;
  debtFreeLabel: string | null;
  paymentsNow: number;
  paymentsAfter12: number;
  monthsToHalvePayments: number | null;
  utilisationNow: number;
  utilisationAfter12: number;
  monthsToUtilisationUnder30: number | null;
  monthsToUtilisationUnder10: number | null;
  bufferTarget: number;
  bufferNow: number;
  bufferAfter12: number;
  bufferReachedMonth: number | null;
  taxFundedMonth: number | null;
  taxShortfall: number;
  endingSavings: number;
  endingBuffer: number;
  endingDebt: number;
  growthEarned: number;
  // Savings built (buffer, reserve still held, savings, goals) minus debt left, at the horizon.
  netPosition: number;
  lumpSumSplit: Record<BucketKind, number>;
  firstMonthSplit: Record<BucketKind, number>;
  // The part of lumpSumSplit.tax that is tax on the lump sum itself (the rest is the separate bill).
  lumpSumTaxHeld: number;
};

export type PlanResult = {
  priority: PlanPriority;
  method: PayoffMethod;
  points: PlanPoint[];
  debts: DebtOutcome[];
  summary: PlanSummary;
  destination: SavingsDestination;
  destinations: SavingsDestination[];
  hurdleRate: number | null;
  // Things worth knowing about this run: warnings need acting on, info explains a choice the plan made.
  notes: PlanNote[];
};

export type PlanNote = { id: string; tone: "warn" | "info"; text: string };

export type PlanComparison = {
  selected: PlanResult;
  baseline: PlanResult;
  results: PlanResult[];
  // Debts with a balance that are left out of the plan (their minimums carry on in the ledger).
  excluded: PlanDebt[];
  // The tax estimate behind `lumpSumTax`, when the lump sum is marked taxable (UK only).
  lumpSumTax: LumpSumTaxResult | null;
};

// ─── Building inputs from the ledger ─────────────────────────────────────────

function positive(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const LOCKED_SAVER_TYPES = new Set<AccountType>(["hsa", "fsa", "lisa", "pension", "sipp", "401k", "403b", "529"]);
const RETIREMENT_TYPES = new Set<AccountType>(["pension", "sipp", "401k", "403b", "traditional-ira", "roth-ira"]);
const TAX_ADVANTAGED = new Set<TaxTreatment>(["tax-free", "pre-tax", "roth", "triple"]);

export function planDebtsFromAccounts(accounts: Account[]): PlanDebt[] {
  return accounts
    .filter((account) => account.accountClass === "debt" && positive(account.balance) > 0)
    .map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: positive(account.balance),
      rate: positive(account.rate),
      promoRate: positive(account.promoRate),
      promoMonths: Math.round(positive(account.promoMonths)),
      minimumPayment: positive(account.minimumPayment),
      creditLimit: positive(account.creditLimit),
      color: account.color,
    }));
}

// Whether a debt starts inside the plan. Mortgages are left out: they are usually the cheapest
// borrowing, often carry early-repayment charges, and swamp every chart. UK student loans are
// collected through payroll as a share of pay and written off after 30–40 years, so overpaying
// them is a different decision from clearing a card. Both can be switched on.
export function defaultDebtIncluded(debt: Pick<Account, "type">, region: RegionKey): boolean {
  if (debt.type === "mortgage") return false;
  if (debt.type === "student-loan" && region === "GB") return false;
  return true;
}

export function isDebtInPlan(debt: Pick<Account, "id" | "type">, settings: Pick<AllocationSettings, "debtIncluded">, region: RegionKey): boolean {
  return settings.debtIncluded[debt.id] ?? defaultDebtIncluded(debt, region);
}

// Why a debt is left out by default, for the table.
export function exclusionReason(debt: Pick<Account, "type">, region: RegionKey): string | null {
  if (debt.type === "mortgage") return "Left out by default: mortgages are usually the cheapest borrowing and may carry early-repayment charges. Include it to plan overpayments.";
  if (debt.type === "student-loan" && region === "GB") return "Left out by default: repaid through payroll as a share of pay above the threshold and written off after 30–40 years, so overpaying is a separate decision.";
  return null;
}

export function planSaversFromAccounts(accounts: Account[]): PlanSaver[] {
  return accounts
    .filter((account) => account.accountClass !== "debt")
    .filter((account) => !(account.accountClass === "investment" && account.type === "other-asset"))
    .map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      accountClass: account.accountClass,
      rate: positive(account.promoMonths) > 0 ? positive(account.promoRate) : positive(account.rate),
      taxTreatment: account.taxTreatment,
      payroll: account.contributionSource === "payroll",
      color: account.color,
    }));
}

export function planGoalsFromLedger(goals: SavingsGoal[]): PlanGoal[] {
  return [...goals]
    .filter((goal) => positive(goal.target) > positive(goal.saved))
    .sort((a, b) => a.priority - b.priority)
    .map((goal) => ({
      id: goal.id,
      name: goal.name || "Goal",
      target: positive(goal.target),
      saved: positive(goal.saved),
      priority: goal.priority,
      interestRate: positive(goal.interestRate),
      color: goal.color,
    }));
}

// Easy-access savings that could cover an emergency: savings-class accounts that are not locked
// up (not a CD, LISA, pension or medical account). The current account is working money for
// bills, so it is not counted.
export function accessibleSavings(accounts: Account[]): number {
  return accounts
    .filter((account) => account.accountClass === "savings" && !LOCKED_SAVER_TYPES.has(account.type) && account.type !== "cd")
    .reduce((sum, account) => sum + positive(account.balance), 0);
}

// ─── Savings destinations ────────────────────────────────────────────────────

function sortedGoals(goals: PlanGoal[]): PlanGoal[] {
  return [...goals].filter((goal) => goal.target > goal.saved).sort((a, b) => a.priority - b.priority);
}

function isCashStyle(saver: PlanSaver): boolean {
  return (saver.accountClass === "cash" || saver.accountClass === "savings") && !LOCKED_SAVER_TYPES.has(saver.type);
}

function assumedCash(inputs: PlanInputs): SavingsDestination {
  return {
    id: null,
    name: inputs.region === "US" ? "High-yield savings (assumed)" : "Easy-access savings (assumed)",
    rate: positive(inputs.safeSavingsRate),
    kind: "assumed-cash",
    color: "#1baf7a",
  };
}

function assumedInvestment(inputs: PlanInputs): SavingsDestination {
  return {
    id: null,
    name: inputs.region === "US" ? "Index fund in a brokerage or Roth IRA (assumed)" : "Global index fund in a stocks & shares ISA (assumed)",
    rate: positive(inputs.assumedInvestmentReturn),
    kind: "assumed-investment",
    color: "#7a6cd6",
  };
}

function toDestination(saver: PlanSaver): SavingsDestination {
  return {
    id: saver.id,
    name: saver.name,
    rate: saver.rate,
    kind: saver.accountClass === "investment" ? "investment" : saver.accountClass === "cash" ? "cash" : "savings",
    taxTreatment: saver.taxTreatment,
    color: saver.color,
  };
}

// The best safe rate the user has access to: the highest of their cash-style accounts, or the
// assumed rate for a new one. Used as the buffer's rate and as the "balanced" hurdle.
export function bestSafeRate(inputs: PlanInputs): number {
  const own = inputs.savers.filter(isCashStyle).reduce((best, saver) => Math.max(best, saver.rate), 0);
  return Math.max(own, positive(inputs.safeSavingsRate));
}

// Ranked places the plan's savings would go, for the chosen savings priority. The first is where
// the simulation puts the money; the rest are shown so the ranking is visible.
export function rankSavingsDestinations(inputs: PlanInputs, priority: SavingsPriority = inputs.savingsPriority): SavingsDestination[] {
  const byRate = (a: { rate: number }, b: { rate: number }) => b.rate - a.rate;
  const eligible = inputs.savers.filter((saver) => !saver.payroll);
  switch (priority) {
    case "safe-rate": {
      const own = eligible.filter(isCashStyle).sort(byRate).map(toDestination);
      return own.length ? own : [assumedCash(inputs)];
    }
    case "growth": {
      const own = eligible
        .filter((saver) => isCashStyle(saver) || (saver.accountClass === "investment" && !RETIREMENT_TYPES.has(saver.type)) || saver.type === "sipp" || saver.type === "roth-ira" || saver.type === "traditional-ira")
        .sort(byRate)
        .map(toDestination);
      const assumed = assumedInvestment(inputs);
      // A person with only cash accounts still sees what investing at the assumed return would do.
      if (!own.some((destination) => destination.kind === "investment")) own.push(assumed);
      return own.sort(byRate);
    }
    case "tax-efficient": {
      const wrapped = eligible.filter((saver) => saver.taxTreatment && TAX_ADVANTAGED.has(saver.taxTreatment) && !LOCKED_SAVER_TYPES.has(saver.type)).sort(byRate).map(toDestination);
      const rest = eligible.filter((saver) => !(saver.taxTreatment && TAX_ADVANTAGED.has(saver.taxTreatment)) && isCashStyle(saver)).sort(byRate).map(toDestination);
      if (!wrapped.length) {
        wrapped.push({
          id: null,
          name: inputs.region === "US" ? "Roth IRA (assumed)" : "Cash ISA (assumed)",
          rate: positive(inputs.safeSavingsRate),
          kind: "assumed-cash",
          taxTreatment: inputs.region === "US" ? "roth" : "tax-free",
          color: "#2f7fdd",
        });
      }
      return [...wrapped, ...rest];
    }
    case "goals-first": {
      const goals = sortedGoals(inputs.goals).map<SavingsDestination>((goal) => ({ id: goal.id, name: goal.name, rate: goal.interestRate, kind: "goal", color: goal.color }));
      return [...goals, ...rankSavingsDestinations(inputs, "safe-rate")];
    }
    default:
      return [assumedCash(inputs)];
  }
}

// ─── The simulation ──────────────────────────────────────────────────────────

const MAX_MONTHS = 600;

type DebtState = PlanDebt & {
  startBalance: number;
  interestPaid: number;
  payoffMonth: number | null;
  lumpSumShare: number;
  firstMonthExtra: number;
};

type GoalState = PlanGoal & { added: number };

function emptyAllocations(): Record<BucketKind, number> {
  return { tax: 0, buffer: 0, debt: 0, savings: 0 };
}

function monthLabel(start: Date, month: number): string {
  const date = new Date(start.getFullYear(), start.getMonth() + month, 1);
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(date);
}

function utilisationOf(debts: DebtState[]): { overall: number; max: number } {
  const cards = debts.filter((debt) => debt.type === "credit-card" && debt.creditLimit > 0);
  const limit = cards.reduce((sum, card) => sum + card.creditLimit, 0);
  const balance = cards.reduce((sum, card) => sum + Math.max(0, card.balance), 0);
  const max = cards.reduce((best, card) => Math.max(best, (Math.max(0, card.balance) / card.creditLimit) * 100), 0);
  return { overall: limit > 0 ? (balance / limit) * 100 : 0, max };
}

// Debts in the order the method attacks them this month.
function orderDebts(debts: DebtState[], method: PayoffMethod, month: number): DebtState[] {
  const open = debts.filter((debt) => debt.balance > 0.005);
  const byBalance = (a: DebtState, b: DebtState) => a.balance - b.balance;
  switch (method) {
    case "snowball":
      return open.sort(byBalance);
    case "cashflow":
      return open.sort((a, b) => {
        const ratioA = a.minimumPayment > 0 ? a.minimumPayment / a.balance : 0;
        const ratioB = b.minimumPayment > 0 ? b.minimumPayment / b.balance : 0;
        return ratioB - ratioA || byBalance(a, b);
      });
    case "utilisation":
      // Cards by utilisation, then everything else by rate. The water-fill in payDebts handles
      // levelling the cards; the order just decides who is looked at first.
      return open.sort((a, b) => {
        const cardA = a.type === "credit-card" && a.creditLimit > 0;
        const cardB = b.type === "credit-card" && b.creditLimit > 0;
        if (cardA !== cardB) return cardA ? -1 : 1;
        if (cardA && cardB) return b.balance / b.creditLimit - a.balance / a.creditLimit;
        return effectiveAnnualRate(b, Math.max(1, month)) - effectiveAnnualRate(a, Math.max(1, month)) || byBalance(a, b);
      });
    case "avalanche":
    default:
      return open.sort((a, b) => effectiveAnnualRate(b, Math.max(1, month)) - effectiveAnnualRate(a, Math.max(1, month)) || byBalance(a, b));
  }
}

// How much a 0% debt needs on top of its minimum so it is cleared before the promo rate ends.
// Month 0 is the lump sum: it covers whatever the minimums alone will not. Later months spread
// the remaining shortfall evenly over the promo months left.
function promoTopUp(debt: DebtState, month: number): number {
  if (debt.promoMonths <= 0 || debt.promoRate >= debt.rate || debt.balance <= 0.005) return 0;
  if (month > debt.promoMonths) return 0;
  const monthsLeft = debt.promoMonths - month;
  if (month === 0) return Math.max(0, debt.balance - debt.minimumPayment * debt.promoMonths);
  if (monthsLeft <= 0) return debt.balance;
  return Math.max(0, (debt.balance - debt.minimumPayment * monthsLeft) / (monthsLeft + 1));
}

function payDebt(debt: DebtState, amount: number, month: number): number {
  const paid = Math.min(amount, debt.balance);
  if (paid <= 0) return 0;
  debt.balance -= paid;
  if (month === 0) debt.lumpSumShare += paid;
  if (month === 1) debt.firstMonthExtra += paid;
  if (debt.balance <= 0.005) {
    debt.balance = 0;
    if (debt.payoffMonth === null) debt.payoffMonth = month;
  }
  return paid;
}

// Sends `amount` to debts under the method's rules. Returns what could not be used (all debts
// clear, or none eligible).
function payDebts(amount: number, debts: DebtState[], method: PayoffMethod, month: number, hurdle: number | null, promoGuard: boolean): number {
  let remaining = amount;
  if (remaining <= 0) return 0;

  if (promoGuard) {
    for (const debt of debts) {
      if (remaining <= 0) break;
      const topUp = promoTopUp(debt, month);
      if (topUp > 0) remaining -= payDebt(debt, Math.min(remaining, topUp), month);
    }
  }

  const eligible = orderDebts(debts, method, month).filter((debt) => hurdle === null || effectiveAnnualRate(debt, Math.max(1, month)) > hurdle);

  if (method === "utilisation") {
    // Water-fill: bring the most-used card down to the next card's level, then both down
    // together, and so on, until every card is clear. Then the rest by rate.
    const cards = eligible.filter((debt) => debt.type === "credit-card" && debt.creditLimit > 0);
    let guard = 0;
    while (remaining > 0.005 && cards.some((card) => card.balance > 0.005) && guard < 1000) {
      guard += 1;
      const open = cards.filter((card) => card.balance > 0.005).sort((a, b) => b.balance / b.creditLimit - a.balance / a.creditLimit);
      const top = open[0];
      const topUtil = top.balance / top.creditLimit;
      // Cards already level with the top one move down together.
      const group = open.filter((card) => Math.abs(card.balance / card.creditLimit - topUtil) < 1e-6);
      const next = open.find((card) => card.balance / card.creditLimit < topUtil - 1e-6);
      const targetUtil = next ? next.balance / next.creditLimit : 0;
      const needed = group.reduce((sum, card) => sum + (card.balance - targetUtil * card.creditLimit), 0);
      const spend = Math.min(remaining, needed);
      if (spend <= 0) break;
      // Split in proportion to each card's limit so they land on the same utilisation.
      const limitTotal = group.reduce((sum, card) => sum + card.creditLimit, 0);
      for (const card of group) remaining -= payDebt(card, spend * (card.creditLimit / limitTotal), month);
    }
    for (const debt of eligible.filter((item) => !(item.type === "credit-card" && item.creditLimit > 0))) {
      if (remaining <= 0.005) break;
      remaining -= payDebt(debt, remaining, month);
    }
    return Math.max(0, remaining);
  }

  for (const debt of eligible) {
    if (remaining <= 0.005) break;
    remaining -= payDebt(debt, remaining, month);
  }
  return Math.max(0, remaining);
}

type Step = { bucket: BucketKind; cap: number };

// The order (and limits) money flows through this month for a priority.
function stepsFor(priority: PlanPriority, pool: number, shares: CustomShares, needs: { tax: number; buffer: number }): Step[] {
  const tax: Step = { bucket: "tax", cap: needs.tax };
  const buffer: Step = { bucket: "buffer", cap: needs.buffer };
  const debt: Step = { bucket: "debt", cap: Infinity };
  const savings: Step = { bucket: "savings", cap: Infinity };
  switch (priority) {
    case "cash-buffer":
      return [tax, buffer, debt, savings];
    case "balanced":
      return [tax, buffer, debt, savings];
    case "tax-buffer":
      return [tax, debt, savings];
    case "custom": {
      const total = Math.max(1, positive(shares.debts) + positive(shares.buffer) + positive(shares.savings));
      return [
        tax,
        { bucket: "buffer", cap: Math.min(needs.buffer, (pool * positive(shares.buffer)) / total) },
        { bucket: "debt", cap: (pool * positive(shares.debts)) / total },
        { bucket: "savings", cap: (pool * positive(shares.savings)) / total },
        debt,
        savings,
      ];
    }
    default:
      return [tax, debt, savings];
  }
}

export function simulatePlan(inputs: PlanInputs, priority: PlanPriority, options: { baseline?: boolean } = {}): PlanResult {
  const start = inputs.startDate ?? new Date();
  const horizon = Math.max(1, Math.round(inputs.horizonMonths));
  const baseline = options.baseline === true;
  const info = PRIORITY_INFO[priority];
  const method: PayoffMethod = priority === "custom" ? inputs.customMethod : info.method;
  const safeRate = bestSafeRate(inputs);
  const hurdle = priority === "balanced" ? safeRate : null;
  const destinations = rankSavingsDestinations(inputs);
  const destination = destinations[0];
  const fallback = destinations.find((item) => item.kind !== "goal") ?? assumedCash(inputs);

  const debts: DebtState[] = inputs.debts.map((debt) => ({ ...debt, startBalance: debt.balance, interestPaid: 0, payoffMonth: null, lumpSumShare: 0, firstMonthExtra: 0 }));
  const goals: GoalState[] = sortedGoals(inputs.goals).map((goal) => ({ ...goal, added: 0 }));
  const bufferMonths = priority === "balanced" ? Math.min(1, positive(inputs.bufferMonths)) : positive(inputs.bufferMonths);
  const bufferTarget = baseline ? 0 : bufferMonths * positive(inputs.monthlyExpenses);
  const taxReserve = baseline ? 0 : positive(inputs.taxReserve);
  const taxDue = Math.max(0, Math.round(inputs.taxDueInMonths));

  const paymentsNow = debts.reduce((sum, debt) => sum + debt.minimumPayment, 0);
  const utilisationNow = utilisationOf(debts).overall;

  let bufferAdded = 0;
  let taxSaved = 0;
  // Tax owed on the lump sum itself: kept back from day one, paid when the bill is due.
  const lumpTax = Math.min(positive(inputs.lumpSum), positive(inputs.lumpSumTax?.amount));
  const lumpTaxDue = Math.max(0, Math.round(inputs.lumpSumTax?.dueInMonths ?? 0));
  let lumpTaxHeld = 0;
  let taxFundedMonth: number | null = null;
  let taxShortfall = 0;
  let savingsAdded = 0;
  let idleCash = 0;
  let growthEarned = 0;
  let cumulativeInterest = 0;
  let freedMinimums = 0;
  let bufferReachedMonth: number | null = bufferTarget > 0 && inputs.currentBuffer >= bufferTarget ? 0 : null;
  let lumpSumSplit = emptyAllocations();
  let firstMonthSplit = emptyAllocations();

  const points: PlanPoint[] = [];
  const bufferRate = monthlyRateFromAnnual(safeRate);
  const destinationRate = monthlyRateFromAnnual(fallback.rate);

  for (let month = 0; month <= MAX_MONTHS; month += 1) {
    let interest = 0;
    let paidToDebt = 0;
    const allocations = emptyAllocations();

    // 1. Interest and minimum payments (not in month 0, which is "today" with the lump sum).
    if (month > 0) {
      for (const debt of debts) {
        if (debt.balance <= 0) continue;
        const charge = debt.balance * monthlyRateFromAnnual(effectiveAnnualRate(debt, month));
        debt.balance += charge;
        debt.interestPaid += charge;
        interest += charge;
        const payment = Math.min(debt.minimumPayment, debt.balance);
        debt.balance -= payment;
        paidToDebt += payment;
        if (debt.balance <= 0.005) {
          debt.balance = 0;
          if (debt.payoffMonth === null) debt.payoffMonth = month;
          // The unused part of this month's minimum is spare straight away.
          if (inputs.rollover) freedMinimums += debt.minimumPayment - payment;
        }
      }
      cumulativeInterest += interest;
      // Savings and the buffer grow on what the plan has put in so far.
      // (The tax reserve is held as cash: it is short-term money, so it is not grown.)
      const bufferGrowth = bufferAdded * bufferRate;
      const savingsGrowth = savingsAdded * destinationRate;
      let goalGrowth = 0;
      for (const goal of goals) {
        const growth = goal.added * monthlyRateFromAnnual(goal.interestRate);
        goal.added += growth;
        goalGrowth += growth;
      }
      bufferAdded += bufferGrowth;
      savingsAdded += savingsGrowth;
      growthEarned += bufferGrowth + savingsGrowth + goalGrowth;
    }

    // 2. This month's pool: the lump sum today, then the monthly spare plus rolled-over payments.
    const rolled = inputs.rollover ? freedMinimums : 0;
    let pool = month === 0 ? positive(inputs.lumpSum) - lumpTax : positive(inputs.monthlyExtra) + rolled;
    const poolThisMonth = pool;
    if (month === 0 && lumpTax > 0) {
      lumpTaxHeld = lumpTax;
      allocations.tax += lumpTax;
    }

    if (baseline) {
      // Minimums only: spare money sits idle so the comparison is like for like.
      idleCash += pool;
      pool = 0;
    } else if (pool > 0) {
      // 3. Flow through the buckets.
      const taxRemaining = Math.max(0, taxReserve - taxSaved);
      const taxMonthsLeft = Math.max(0, taxDue - month + 1);
      const taxNeed =
        taxRemaining <= 0 || month > taxDue
          ? 0
          : priority === "tax-buffer"
            ? taxRemaining
            : month === 0
              ? taxDue <= 0
                ? taxRemaining
                : 0
              : taxRemaining / Math.max(1, taxMonthsLeft);
      const bufferNeed = Math.max(0, bufferTarget - (inputs.currentBuffer + bufferAdded));
      for (const step of stepsFor(priority, pool, inputs.customShares, { tax: taxNeed, buffer: bufferNeed })) {
        if (pool <= 0.005) break;
        const offer = Math.min(pool, step.cap);
        if (offer <= 0) continue;
        let used = 0;
        switch (step.bucket) {
          case "tax": {
            used = Math.min(offer, Math.max(0, taxReserve - taxSaved));
            taxSaved += used;
            break;
          }
          case "buffer": {
            used = Math.min(offer, Math.max(0, bufferTarget - (inputs.currentBuffer + bufferAdded)));
            bufferAdded += used;
            break;
          }
          case "debt": {
            const leftover = payDebts(offer, debts, method, month, hurdle, inputs.promoGuard);
            used = offer - leftover;
            paidToDebt += used;
            break;
          }
          case "savings": {
            let left = offer;
            if (inputs.savingsPriority === "goals-first") {
              for (const goal of goals) {
                if (left <= 0.005) break;
                const room = Math.max(0, goal.target - goal.saved - goal.added);
                const put = Math.min(left, room);
                goal.added += put;
                left -= put;
              }
            }
            savingsAdded += left;
            used = offer;
            break;
          }
        }
        allocations[step.bucket] += used;
        pool -= used;
      }
      // Nothing left to do with it (no debts, nothing to save for): it is still money kept.
      if (pool > 0.005) {
        savingsAdded += pool;
        allocations.savings += pool;
        pool = 0;
      }
    }

    // From next month the whole minimum of every cleared debt is spare (the snowball effect).
    freedMinimums = inputs.rollover ? debts.filter((debt) => debt.balance <= 0).reduce((sum, debt) => sum + debt.minimumPayment, 0) : 0;

    if (month === 0) lumpSumSplit = { ...allocations };
    if (month === 1) firstMonthSplit = { ...allocations };

    // 4. Tax reserve: funded? due?
    if (taxReserve > 0 && taxFundedMonth === null && taxSaved >= taxReserve - 0.005) taxFundedMonth = month;
    if (taxReserve > 0 && month === taxDue) {
      taxShortfall = Math.max(0, taxReserve - taxSaved);
      taxSaved = 0;
    }
    if (lumpTaxHeld > 0 && month === lumpTaxDue && month > 0) lumpTaxHeld = 0;
    if (bufferTarget > 0 && bufferReachedMonth === null && inputs.currentBuffer + bufferAdded >= bufferTarget - 0.005) bufferReachedMonth = month;

    const totalDebt = debts.reduce((sum, debt) => sum + debt.balance, 0);
    if (month <= horizon) {
      const util = utilisationOf(debts);
      const goalsAdded = goals.reduce((sum, goal) => sum + goal.added, 0);
      points.push({
        month,
        label: monthLabel(start, month),
        totalDebt,
        debtBalances: Object.fromEntries(debts.map((debt) => [debt.id, round2(debt.balance)])),
        interest,
        cumulativeInterest,
        paymentsCommitted: debts.filter((debt) => debt.balance > 0).reduce((sum, debt) => sum + debt.minimumPayment, 0),
        paidToDebt,
        utilisation: util.overall,
        maxUtilisation: util.max,
        buffer: inputs.currentBuffer + bufferAdded,
        taxReserve: taxSaved + lumpTaxHeld,
        savings: savingsAdded + goalsAdded + idleCash,
        goalsAdded,
        allocations,
        pool: poolThisMonth,
      });
    }

    // Past the horizon the loop only continues to find the payoff date and lifetime interest.
    if (month >= horizon && totalDebt <= 0.005) break;
  }

  const last = points[points.length - 1];
  const at12 = points[Math.min(12, points.length - 1)];
  const debtFreeMonth = debts.length ? (debts.every((debt) => debt.payoffMonth !== null) ? Math.max(...debts.map((debt) => debt.payoffMonth ?? 0)) : null) : 0;
  const firstMonthWhere = (test: (point: PlanPoint) => boolean): number | null => points.find(test)?.month ?? null;
  const order = [...debts]
    .filter((debt) => debt.payoffMonth !== null)
    .sort((a, b) => (a.payoffMonth ?? 0) - (b.payoffMonth ?? 0) || a.startBalance - b.startBalance)
    .map((debt) => debt.id);

  const notes: PlanNote[] = [];
  if (debts.some((debt) => debt.minimumPayment <= 0)) {
    notes.push({
      id: "no-minimum",
      tone: "warn",
      text: `No minimum payment is set for ${debts.filter((debt) => debt.minimumPayment <= 0).map((debt) => debt.name).join(", ")} — add one on Accounts so the plan can pay it down.`,
    });
  }
  if (hurdle !== null) {
    const parked = debts.filter((debt) => effectiveAnnualRate(debt, 1) <= hurdle);
    if (parked.length) {
      notes.push({ id: "parked", tone: "info", text: `${parked.map((debt) => debt.name).join(", ")} cost${parked.length === 1 ? "s" : ""} less than ${safeRate.toFixed(1)}% — minimums only while savings earn more.` });
    }
  }
  if (priority === "credit-score" && !debts.some((debt) => debt.type === "credit-card" && debt.creditLimit > 0)) {
    notes.push({ id: "no-cards", tone: "info", text: "No credit cards with a limit are tracked, so this works like the avalanche." });
  }

  return {
    priority,
    method,
    points,
    debts: debts.map((debt) => ({
      id: debt.id,
      name: debt.name,
      color: debt.color,
      type: debt.type,
      startBalance: debt.startBalance,
      rate: debt.rate,
      promoMonths: debt.promoMonths,
      minimumPayment: debt.minimumPayment,
      payoffMonth: debt.payoffMonth,
      payoffLabel: debt.payoffMonth === null ? null : debt.payoffMonth === 0 ? "Today" : monthLabel(start, debt.payoffMonth),
      interestPaid: round2(debt.interestPaid),
      order: debt.payoffMonth === null ? null : order.indexOf(debt.id) + 1,
      lumpSumShare: round2(debt.lumpSumShare),
      firstMonthExtra: round2(debt.firstMonthExtra),
    })),
    summary: {
      totalInterest: round2(debts.reduce((sum, debt) => sum + debt.interestPaid, 0)),
      interestWithinHorizon: round2(last?.cumulativeInterest ?? 0),
      debtFreeMonth,
      debtFreeLabel: debtFreeMonth === null ? null : debtFreeMonth === 0 ? "Today" : monthLabel(start, debtFreeMonth),
      paymentsNow,
      paymentsAfter12: at12?.paymentsCommitted ?? paymentsNow,
      monthsToHalvePayments: paymentsNow > 0 ? firstMonthWhere((point) => point.paymentsCommitted <= paymentsNow / 2) : null,
      utilisationNow,
      utilisationAfter12: at12?.utilisation ?? utilisationNow,
      monthsToUtilisationUnder30: utilisationNow > 0 ? firstMonthWhere((point) => point.maxUtilisation < 30) : null,
      monthsToUtilisationUnder10: utilisationNow > 0 ? firstMonthWhere((point) => point.maxUtilisation < 10) : null,
      bufferTarget,
      bufferNow: inputs.currentBuffer,
      bufferAfter12: at12?.buffer ?? inputs.currentBuffer,
      bufferReachedMonth,
      taxFundedMonth,
      taxShortfall: round2(taxShortfall),
      endingSavings: round2(last?.savings ?? 0),
      endingBuffer: round2(last?.buffer ?? inputs.currentBuffer),
      endingDebt: round2(last?.totalDebt ?? 0),
      growthEarned: round2(growthEarned),
      netPosition: round2((last?.savings ?? 0) + ((last?.buffer ?? inputs.currentBuffer) - inputs.currentBuffer) + (last?.taxReserve ?? 0) - (last?.totalDebt ?? 0)),
      lumpSumSplit,
      firstMonthSplit,
      lumpSumTaxHeld: round2(lumpTax),
    },
    destination,
    destinations,
    hurdleRate: hurdle,
    notes,
  };
}

// Every priority under the same inputs, plus the minimums-only baseline to measure them against.
export function comparePlans(inputs: PlanInputs, selected: PlanPriority): PlanComparison {
  const results = PLAN_PRIORITIES.filter((priority) => priority !== "custom" || selected === "custom").map((priority) => simulatePlan(inputs, priority));
  const baseline = simulatePlan(inputs, "interest", { baseline: true });
  return {
    selected: results.find((result) => result.priority === selected) ?? results[0],
    baseline,
    results,
    excluded: inputs.excludedDebts ?? [],
    lumpSumTax: inputs.lumpSumTaxResult ?? null,
  };
}

// ─── Settings plumbing ───────────────────────────────────────────────────────

export function isPlanPriority(value: unknown): value is PlanPriority {
  return typeof value === "string" && (PLAN_PRIORITIES as string[]).includes(value);
}

export function isSavingsPriority(value: unknown): value is SavingsPriority {
  return typeof value === "string" && (SAVINGS_PRIORITIES as string[]).includes(value);
}

export function isPayoffMethod(value: unknown): value is PayoffMethod {
  return typeof value === "string" && ["avalanche", "snowball", "cashflow", "utilisation"].includes(value);
}

function finite(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function isLumpSumSource(value: unknown): value is LumpSumTaxSettings["source"] {
  return typeof value === "string" && LUMP_SUM_SOURCES.some((option) => option.value === value);
}

const UNDERGRAD: UndergradLoanPlan[] = ["plan1", "plan2", "plan4", "plan5"];

function isUndergradPlan(value: unknown): value is UndergradLoanPlan {
  return typeof value === "string" && (UNDERGRAD as string[]).includes(value);
}

function normalizeStudentLoan(raw: unknown): LumpSumStudentLoan | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<Record<keyof LumpSumStudentLoan, unknown>>;
  return { repaying: candidate.repaying === true, plan: isUndergradPlan(candidate.plan) ? candidate.plan : null, postgrad: candidate.postgrad === true };
}

function normalizeLumpSumTax(raw: unknown): LumpSumTaxSettings {
  const defaults = DEFAULT_ALLOCATION_SETTINGS.lumpSumTax;
  const candidate = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof LumpSumTaxSettings, unknown>>;
  return {
    taxable: candidate.taxable === true,
    source: isLumpSumSource(candidate.source) ? candidate.source : defaults.source,
    monthlySalary: candidate.monthlySalary === null || candidate.monthlySalary === undefined ? null : finite(candidate.monthlySalary, 0, 0, 1e7),
    priorThisYear: finite(candidate.priorThisYear, 0, 0, 1e9),
    studentLoan: normalizeStudentLoan(candidate.studentLoan),
  };
}

// The student-loan answer in force: what the user set on Allocate, else what the tax profile says.
export function resolveStudentLoan(settings: Pick<LumpSumTaxSettings, "studentLoan">, taxProfile: Pick<TaxProfile, "studentLoanPlan" | "postgradLoan">): LumpSumStudentLoan {
  if (settings.studentLoan) return settings.studentLoan;
  const plan = taxProfile.studentLoanPlan && taxProfile.studentLoanPlan !== "none" && taxProfile.studentLoanPlan !== "postgrad" ? taxProfile.studentLoanPlan : null;
  const postgrad = Boolean(taxProfile.postgradLoan) || taxProfile.studentLoanPlan === "postgrad";
  return { repaying: Boolean(plan) || postgrad, plan, postgrad };
}

export function normalizeAllocationSettings(raw: unknown): AllocationSettings {
  const defaults = DEFAULT_ALLOCATION_SETTINGS;
  const candidate = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof AllocationSettings, unknown>>;
  const shares = (candidate.customShares && typeof candidate.customShares === "object" ? candidate.customShares : {}) as Partial<Record<keyof CustomShares, unknown>>;
  return {
    priority: isPlanPriority(candidate.priority) ? candidate.priority : defaults.priority,
    savingsPriority: isSavingsPriority(candidate.savingsPriority) ? candidate.savingsPriority : defaults.savingsPriority,
    lumpSum: finite(candidate.lumpSum, defaults.lumpSum, 0, 1e9),
    monthlyExtraOverride: candidate.monthlyExtraOverride === null || candidate.monthlyExtraOverride === undefined ? null : finite(candidate.monthlyExtraOverride, 0, 0, 1e7),
    bufferMonths: finite(candidate.bufferMonths, defaults.bufferMonths, 0, 24),
    taxReserve: finite(candidate.taxReserve, defaults.taxReserve, 0, 1e9),
    taxDueInMonths: Math.round(finite(candidate.taxDueInMonths, defaults.taxDueInMonths, 0, 60)),
    horizonMonths: ALLOCATION_HORIZONS.includes(Number(candidate.horizonMonths)) ? Number(candidate.horizonMonths) : defaults.horizonMonths,
    promoGuard: typeof candidate.promoGuard === "boolean" ? candidate.promoGuard : defaults.promoGuard,
    rollover: typeof candidate.rollover === "boolean" ? candidate.rollover : defaults.rollover,
    safeSavingsRate: finite(candidate.safeSavingsRate, defaults.safeSavingsRate, 0, 50),
    customShares: {
      debts: finite(shares.debts, defaults.customShares.debts, 0, 100),
      buffer: finite(shares.buffer, defaults.customShares.buffer, 0, 100),
      savings: finite(shares.savings, defaults.customShares.savings, 0, 100),
    },
    customMethod: isPayoffMethod(candidate.customMethod) ? candidate.customMethod : defaults.customMethod,
    debtIncluded: Object.fromEntries(
      Object.entries(candidate.debtIncluded && typeof candidate.debtIncluded === "object" ? (candidate.debtIncluded as Record<string, unknown>) : {}).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
      ),
    ),
    lumpSumTax: normalizeLumpSumTax(candidate.lumpSumTax),
  };
}

// The tax to hold back from the lump sum. UK only: the feature sizes a UK Self Assessment bill.
export function lumpSumTaxFor({
  settings,
  taxProfile,
  country,
  today,
}: {
  settings: AllocationSettings;
  taxProfile: Pick<TaxProfile, "grossAnnualSalary" | "studentLoanPlan" | "postgradLoan">;
  country: CountryCode;
  today?: Date;
}): LumpSumTaxResult | null {
  if (country !== "GB" || !settings.lumpSumTax.taxable || positive(settings.lumpSum) <= 0) return null;
  const monthly = settings.lumpSumTax.monthlySalary;
  const grossAnnualSalary = monthly === null ? positive(taxProfile.grossAnnualSalary) : positive(monthly) * 12;
  const loan = resolveStudentLoan(settings.lumpSumTax, taxProfile);
  return estimateLumpSumTax({
    amount: positive(settings.lumpSum),
    source: settings.lumpSumTax.source,
    grossAnnualSalary,
    priorThisYear: positive(settings.lumpSumTax.priorThisYear),
    studentLoan: loan.repaying ? { plan: loan.plan, postgrad: loan.postgrad } : undefined,
    today,
  });
}

// Builds the engine's inputs from the ledger's live figures and the saved settings.
export function buildPlanInputs({
  accounts,
  goals,
  settings,
  monthlySurplus,
  monthlyExpenses,
  assumedInvestmentReturn,
  region,
  country,
  taxProfile,
  startDate,
}: {
  accounts: Account[];
  goals: SavingsGoal[];
  settings: AllocationSettings;
  // The ledger's spare-per-month figure (after bills, minimums and existing contributions).
  monthlySurplus: number;
  monthlyExpenses: number;
  assumedInvestmentReturn: number;
  region: RegionKey;
  // Country and salary decide whether, and how, tax is held back from a taxable lump sum.
  country?: CountryCode;
  taxProfile?: Pick<TaxProfile, "grossAnnualSalary" | "studentLoanPlan" | "postgradLoan">;
  startDate?: Date;
}): PlanInputs {
  const allDebts = planDebtsFromAccounts(accounts);
  const lumpSumTaxResult = lumpSumTaxFor({ settings, taxProfile: taxProfile ?? { grossAnnualSalary: 0, studentLoanPlan: "none", postgradLoan: false }, country: country ?? (region === "US" ? "US" : "OTHER"), today: startDate });
  return {
    lumpSumTaxResult,
    lumpSumTax: lumpSumTaxResult && lumpSumTaxResult.tax > 0 ? { amount: lumpSumTaxResult.tax, dueInMonths: lumpSumTaxResult.dueInMonths } : undefined,
    debts: allDebts.filter((debt) => isDebtInPlan(debt, settings, region)),
    excludedDebts: allDebts.filter((debt) => !isDebtInPlan(debt, settings, region)),
    savers: planSaversFromAccounts(accounts),
    goals: planGoalsFromLedger(goals),
    monthlyExtra: settings.monthlyExtraOverride ?? Math.max(0, monthlySurplus),
    lumpSum: positive(settings.lumpSum),
    monthlyExpenses: positive(monthlyExpenses),
    currentBuffer: accessibleSavings(accounts),
    bufferMonths: positive(settings.bufferMonths),
    taxReserve: positive(settings.taxReserve),
    taxDueInMonths: Math.max(0, Math.round(settings.taxDueInMonths)),
    horizonMonths: settings.horizonMonths,
    assumedInvestmentReturn: positive(assumedInvestmentReturn),
    safeSavingsRate: positive(settings.safeSavingsRate),
    promoGuard: settings.promoGuard,
    rollover: settings.rollover,
    customShares: settings.customShares,
    customMethod: settings.customMethod,
    savingsPriority: settings.savingsPriority,
    region,
    startDate,
  };
}

// ─── Comparison helpers for the UI ───────────────────────────────────────────

export type CompareMetric = {
  id: "interest" | "debt-free" | "payments" | "utilisation" | "buffer" | "net";
  label: string;
  hint: string;
  // Lower is better for costs and months; higher for money kept.
  better: "lower" | "higher";
  value: (result: PlanResult) => number | null;
};

export const COMPARE_METRICS: CompareMetric[] = [
  { id: "interest", label: "Total interest", hint: "Interest paid until every debt is cleared.", better: "lower", value: (result) => result.summary.totalInterest },
  { id: "debt-free", label: "Debt-free in", hint: "Months until the last debt is cleared.", better: "lower", value: (result) => result.summary.debtFreeMonth },
  { id: "payments", label: "Payments after 12 months", hint: "Minimum payments still committed a year from now.", better: "lower", value: (result) => result.summary.paymentsAfter12 },
  { id: "utilisation", label: "Cards under 30% by", hint: "Months until every card is under 30% of its limit.", better: "lower", value: (result) => result.summary.monthsToUtilisationUnder30 },
  { id: "buffer", label: "Buffer after 12 months", hint: "Easy-access savings a year from now.", better: "higher", value: (result) => result.summary.bufferAfter12 },
  { id: "net", label: "Net position at horizon", hint: "Savings built minus debt left at the end of the horizon.", better: "higher", value: (result) => result.summary.netPosition },
];

// The priorities that come out top on a metric (ties share it). null values never win.
export function bestOn(metric: CompareMetric, results: PlanResult[]): Set<PlanPriority> {
  const values = results.map((result) => ({ priority: result.priority, value: metric.value(result) })).filter((item): item is { priority: PlanPriority; value: number } => item.value !== null);
  if (!values.length) return new Set();
  const best = values.reduce((acc, item) => (metric.better === "lower" ? Math.min(acc, item.value) : Math.max(acc, item.value)), metric.better === "lower" ? Infinity : -Infinity);
  return new Set(values.filter((item) => Math.abs(item.value - best) < 0.5).map((item) => item.priority));
}

// Free, impartial help for people whose debts are a problem — shown with every plan.
export function debtHelpLinks(region: RegionKey): Array<{ name: string; url: string; note: string }> {
  if (region === "US") {
    return [
      { name: "Consumer Financial Protection Bureau", url: "https://www.consumerfinance.gov/consumer-tools/debt-collection/", note: "Government guidance on debt and your rights." },
      { name: "NFCC", url: "https://www.nfcc.org/", note: "Non-profit credit counseling agencies." },
      { name: "211", url: "https://www.211.org/", note: "Local help with bills, housing and essentials." },
    ];
  }
  return [
    { name: "MoneyHelper", url: "https://www.moneyhelper.org.uk/en/money-troubles/dealing-with-debt", note: "Free, government-backed guidance." },
    { name: "StepChange", url: "https://www.stepchange.org/", note: "Free debt advice charity — 0800 138 1111." },
    { name: "National Debtline", url: "https://www.nationaldebtline.org/", note: "Free advice — 0808 808 4000." },
    { name: "Citizens Advice", url: "https://www.citizensadvice.org.uk/debt-and-money/", note: "Help with priority debts and arrears." },
  ];
}
