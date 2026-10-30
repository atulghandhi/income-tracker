import type { SidebarChoice } from "./navTools";

// Which layer decided an entry's category. "user" is sacred — no automation
// (rules, AI, feeds) may ever overwrite a category the user set by hand.
export type CategorySource = "user" | "rule" | "system" | "bank" | "ai" | "heuristic";

// Set on entries that were auto-copied into a new month because their source
// entry was recurring. Lets the UI badge them and lets a delete offer
// "stop repeating" back at the origin entry.
export type SeededFromRef = {
  monthKey: string;
  entryId: string;
};

export type IncomeEntry = {
  id: string;
  source: string;
  amount: number;
  color: string;
  // Whether this inflow repeats every month. Recurring items drive the annual run-rate and
  // net-worth forecast; one-offs are counted once. Manual entries default to recurring,
  // imported bank rows default to one-off.
  recurring: boolean;
  date?: string;
  imported?: ImportedTransactionMeta;
  // The account this money landed in; its balance moves with it. See accountFlow.ts.
  accountId?: string;
  seededFrom?: SeededFromRef;
  categorySource?: CategorySource;
};

export type ExpenseEntry = {
  id: string;
  name: string;
  category: string;
  amount: number;
  color: string;
  // See IncomeEntry.recurring — same meaning for outflows.
  recurring: boolean;
  date?: string;
  imported?: ImportedTransactionMeta;
  // The account this money left from (or, for a card, was spent on); its balance moves with it.
  accountId?: string;
  // Links this payment to a debt account. For any month that has linked payments, their sum
  // replaces that account's scheduled monthly payment in the balance roll-forward — so an
  // imported overpayment reduces the debt by the real amount instead of the scheduled one.
  debtAccountId?: string;
  // Set on the row the app adds each month from a debt account's scheduled payment. It is a
  // placeholder for the real payment: the first actual payment linked to the same account in
  // that month (an import, or a row the user typed) replaces it. Editing its amount confirms it
  // as the actual payment. See syncScheduledDebtPayments.
  scheduledPayment?: boolean;
  // Links a transfer into one of the user's savings, current or investment accounts. The money is
  // still leaving the budget, but it is the same money as that account's monthly contribution, so
  // the forecast and goal planner count it once (see recurringAccountTransfersByAccount).
  toAccountId?: string;
  seededFrom?: SeededFromRef;
  categorySource?: CategorySource;
};

export type GoalFundingMode = "fixed" | "fill" | "auto";

export type SavingsGoal = {
  id: string;
  name: string;
  target: number;
  saved: number;            // already saved (seed value counts from day 0)
  color: string;
  priority: number;         // 1 = highest; goals sorted ascending
  fundingMode: GoalFundingMode;
  monthlyAmount: number;    // contribution per month (fixed/auto); engine writes auto
  deadlineMonths: number;   // 0 = no deadline; >0 = must complete within N months
  interestRate: number;     // optional AER % compounded monthly on accumulated balance; 0 = flat
  // Optional savings/investment account this goal lives in. When set, `saved` and `interestRate`
  // follow the account (see syncLinkedGoals) and the account's monthly contribution funds this
  // goal before any shared surplus does.
  accountId?: string;
  note: string;
  createdAt: string;
};

export type MonthBudget = {
  incomes: IncomeEntry[];
  expenses: ExpenseEntry[];
  note: string;
};

export type ImportedTransactionMeta = {
  batchId: string;
  fileName: string;
  rowNumber: number;
  hash: string;
  originalDescription: string;
  importedAt: string;
};

export type ImportedTransactionRef = {
  monthKey: string;
  entryId: string;
  kind: "income" | "expense";
};

export type ImportBatch = {
  id: string;
  fileName: string;
  importedAt: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  transactionRefs: ImportedTransactionRef[];
};

export type TransactionKind = "income" | "expense" | "debt-payment" | "transfer";

export type CategoryRule = {
  id: string;
  pattern: string;
  category: string;
  kind: TransactionKind;
  // For debt-payment rules: future imports matching this pattern auto-link to this account.
  debtAccountId?: string;
  createdAt: string;
  updatedAt: string;
};

// Saved when the user renames every transaction called `from` to `to`. Future
// imports whose name (or raw bank text) is `from` arrive as `to`. Matching
// ignores case and spacing; `from` keeps the text the user saw.
export type NameRule = {
  id: string;
  kind: "income" | "expense";
  from: string;
  to: string;
  createdAt: string;
  updatedAt: string;
};

// What the user has decided about a detected subscription (see subscriptions.ts). Keyed by the
// subscription's id (merchant + cadence, plus a price discriminator when one payee has several).
// Detection itself is never stored — it is recomputed from the ledger — only these decisions are.
export type SubscriptionPreference = {
  id: string;
  // "cancelled" moves it to the cancelled list; "deleted" removes it from the page altogether.
  status?: "cancelled" | "deleted";
  cancelledAt?: string; // ISO date
  // Overrides the detected classification (a gym the app called a bill, say).
  kind?: "subscription" | "bill";
  // How many days early or late a payment may land and still count as on time.
  toleranceDays?: number;
  // A snapshot of what was cancelled, so the cancelled list can still show it if the ledger rows
  // behind it are later deleted.
  label?: string;
  cadence?: "weekly" | "fortnightly" | "4-weekly" | "monthly" | "quarterly" | "half-yearly" | "annual";
  price?: number;
  // The user said yes to a "possible subscription" (one only seen twice), so it is tracked.
  confirmed?: boolean;
  updatedAt: string;
};

// Debt sub-types. "loan" is the generic personal loan; mortgages, car finance and student loans
// are their own types so the app can offer the right fields (amortisation term, repayment plan).
export type DebtAccountType = "credit-card" | "loan" | "mortgage" | "auto-loan" | "student-loan" | "overdraft" | "other";

// Asset sub-types (for the savings/debit/investment side). Which of these a user is offered depends
// on their country (see region.ts): "isa"/"lisa"/"pension"/"sipp" are UK instruments, "hysa"/"cd"/
// "money-market"/"hsa"/"fsa"/"401k"/"403b"/"traditional-ira"/"roth-ira"/"529" are US ones. Every
// type stays valid whatever the country, so switching country never rewrites an account.
export type AssetAccountType =
  | "current"
  | "savings"
  | "isa"
  | "lisa"
  | "hysa"
  | "cd"
  | "money-market"
  | "hsa"
  | "fsa"
  | "investment"
  | "pension"
  | "sipp"
  | "401k"
  | "403b"
  | "traditional-ira"
  | "roth-ira"
  | "529"
  | "other-asset";

// How contributions and growth are taxed. Defaults per type live in region.ts; a 401(k) can be
// switched to "roth" by the user.
export type TaxTreatment = "pre-tax" | "roth" | "taxable" | "tax-free" | "triple";

// Where a contribution comes from. "payroll" money never reaches the user's bank account (it is
// taken from gross pay before take-home), so it must not be subtracted from the ledger surplus,
// which is built from take-home income. "personal" money moves out of the budget as before.
export type ContributionSource = "personal" | "payroll";

// US federal student-loan repayment plans (simplified).
export type RepaymentPlan = "standard" | "graduated" | "extended" | "income-driven";

// UK student-loan plans: repayments are a percentage of pay above the plan's threshold.
export type UkStudentLoanPlan = "plan1" | "plan2" | "plan4" | "plan5" | "postgrad";

// The high-level class decides whether the balance adds to or subtracts from net worth,
// and which fields are meaningful.
export type AccountClass = "cash" | "savings" | "investment" | "debt";

export type AccountType = DebtAccountType | AssetAccountType;

export type Account = {
  id: string;
  name: string;
  accountClass: AccountClass;
  type: AccountType;
  balance: number;
  // Growth — unified across every class.
  // rate    = ongoing annual %: APR for debt, AER for savings, expected return for investment.
  // promoRate / promoMonths = an intro offer that applies for the first N months, then `rate` takes over.
  //   A 0%-for-18-months credit card is { promoRate: 0, promoMonths: 18, rate: 24.9 }.
  //   A 5%-for-12-months intro saver is { promoRate: 5, promoMonths: 12, rate: 2 }.
  rate: number;
  promoRate: number;
  promoMonths: number;
  // Month key ("YYYY-MM") `promoMonths` was entered in. The live months-left figure counts down
  // from this anchor (see promoMonthsRemaining), so "12 months left" becomes 11 next month.
  promoAsOf: string;
  // Assets only: how much monthly surplus is routed into this account.
  monthlyContribution: number;
  // Debt only.
  creditLimit: number;
  minimumPayment: number;
  dueDay: number;
  // Month key ("YYYY-MM") the stored balance was last set in. Debt balances are never shown
  // raw: they are rolled forward from this anchor to the current month, paying the scheduled
  // monthly payment (or that month's linked ledger payments) and charging interest along the
  // way. Editing the balance re-anchors to the current month.
  balanceAsOf: string;
  // Debt only: months ("YYYY-MM") the user removed the scheduled payment row from the ledger,
  // meaning "not paying this one". The roll-forward charges no payment for them and the ledger
  // does not re-add the row.
  skippedPaymentMonths?: string[];
  // Day ("YYYY-MM-DD") the balance was last typed. Ledger transactions dated from then on move
  // the balance; earlier ones are already in the typed figure. See accountFlow.ts.
  balanceSetOn?: string;
  // Cancels ledger movement that should not move money: transactions already counted when the
  // balance was typed, or re-labelled to this account after the fact.
  ledgerOffset?: number;
  // Shared.
  includeInNetWorth: boolean;
  color: string;
  note: string;

  // ── Optional plan details ─────────────────────────────────────────────────
  // Everything below is optional and only offered for the account types it applies to. An account
  // with none of it set behaves exactly as before. See retirement.ts and loans.ts.

  // Retirement, pension and tax-advantaged accounts.
  taxTreatment?: TaxTreatment;
  contributionSource?: ContributionSource;
  // Employee contribution as a % of gross pay. When set and a gross salary is known (taxProfile),
  // `monthlyContribution` is kept in step with it by syncPlanContributions.
  contributionPercent?: number;
  // Employer money: a match on what the employee pays in ("100% of the first 4%") and/or a fixed
  // % of pay regardless (UK auto-enrolment minimum 3%, US non-elective contributions). Resolved to
  // `employerMonthlyContribution` when a salary is known; typed directly when it is not.
  employerMatchPercent?: number;
  employerMatchCapPercent?: number;
  employerContributionPercent?: number;
  employerMonthlyContribution?: number;
  // Contribution limits: the statutory annual limit is looked up by type and year; these adjust it.
  annualLimitOverride?: number;
  catchUpEligible?: boolean;
  coverage?: "self" | "family";

  // Fixed terms: a CD's term, or a loan's remaining amortisation term in months.
  termMonths?: number;

  // Student loans.
  studentLoanType?: "federal" | "private";
  repaymentPlan?: RepaymentPlan;
  studentLoanPlan?: UkStudentLoanPlan;
  familySize?: number;
};

// Back-compat alias for code/signatures still referring to a debt account shape.
export type DebtAccount = Account;

// Gross-to-net inputs shared by the US and UK estimators, and by workplace-plan contributions that
// are expressed as a % of pay. Every figure is optional; the estimators say so loudly.
export type TaxProfile = {
  grossAnnualSalary: number;
  payFrequency: PayFrequency;
  // US
  filingStatus: FilingStatus;
  state: string;
  stateRateOverride: number | null;
  // UK
  studentLoanPlan: UkStudentLoanPlan | "none";
  postgradLoan: boolean;
  // Estimated monthly health-insurance premium taken before tax (US). Kept here rather than on the
  // health plan so the estimator works without one.
  preTaxHealthPremiumMonthly: number;
  // Pension paid from pay each month, on top of any set up on accounts. UK: salary sacrifice
  // (lowers tax, NI and student loan) or a net-pay contribution (lowers tax only). US: pre-tax 401(k).
  pensionMonthly: number;
  pensionMethod: "sacrifice" | "net-pay";
  // Bonus or commission. One-off: a single yearly payment shown separately, so monthly take-home
  // stays salary-based. Otherwise it is paid every month and folded into regular pay.
  bonusAmount: number;
  bonusOneOff: boolean;
};

export type PayFrequency = "monthly" | "semimonthly" | "biweekly" | "weekly";
export type FilingStatus = "single" | "married-joint" | "married-separate" | "head";

// US health cover: what the plan costs and where the deductible / out-of-pocket maximum sit, so
// medical spending in the ledger can be measured against them.
export type HealthPlan = {
  planType: "" | "hdhp" | "ppo" | "hmo" | "epo" | "other";
  coverage: "self" | "family";
  premiumMonthly: number;
  deductible: number;
  outOfPocketMax: number;
  // 1 = January. Most plans run on the calendar year.
  planYearStartMonth: number;
};

// ─── Allocation planner ──────────────────────────────────────────────────────
// How spare money and lump sums are split between debts, a buffer, a tax reserve and savings,
// and the order debts are attacked in. See allocate.ts.

export type PayoffMethod = "avalanche" | "snowball" | "cashflow" | "utilisation";

export type PlanPriority =
  | "interest" // minimise total interest paid
  | "payments" // free up monthly cash flow as fast as possible
  | "quick-wins" // clear the most accounts soonest (snowball)
  | "credit-score" // bring card utilisation down first
  | "cash-buffer" // build an emergency buffer before overpaying
  | "tax-buffer" // set aside a tax bill first
  | "balanced" // starter buffer, then only overpay debts that cost more than savings earn
  | "custom"; // fixed percentage split chosen by the user

export type SavingsPriority =
  | "safe-rate" // highest rate on cash-style savings
  | "growth" // highest expected return, investments included (capital at risk)
  | "tax-efficient" // tax-advantaged wrappers first
  | "goals-first"; // fund the Goals page's goals in priority order

export type CustomShares = { debts: number; buffer: number; savings: number };

// UK only: whether the lump sum on the Allocate page is untaxed income or a gain, and what is
// needed to size the tax to set aside from it. See lumpSumTax.ts.
export type LumpSumSource = "self-employed" | "other-income" | "rental" | "savings-interest" | "dividends" | "capital-gain";

export type UndergradLoanPlan = Exclude<UkStudentLoanPlan, "postgrad">;

// Student loan repayments collected through Self Assessment on untaxed income. null = follow the
// tax profile (the Pay & tax page).
export type LumpSumStudentLoan = { repaying: boolean; plan: UndergradLoanPlan | null; postgrad: boolean };

export type LumpSumTaxSettings = {
  taxable: boolean;
  source: LumpSumSource;
  // Gross monthly salary already taxed through PAYE. null = follow the tax profile's salary.
  monthlySalary: number | null;
  // Already received this tax year from the same kind of source, before tax.
  priorThisYear: number;
  studentLoan: LumpSumStudentLoan | null;
};

export type AllocationSettings = {
  priority: PlanPriority;
  savingsPriority: SavingsPriority;
  lumpSum: number;
  // null = follow the ledger's spare-per-month figure.
  monthlyExtraOverride: number | null;
  // Emergency buffer target, in months of recurring expenses.
  bufferMonths: number;
  // A tax bill to set aside for (0 = none) and how many months until it is due.
  taxReserve: number;
  taxDueInMonths: number;
  horizonMonths: number;
  // Clear a 0% balance before its promo ends, whatever the ordering says.
  promoGuard: boolean;
  // Roll a cleared debt's payment into the next one (the "snowball" effect, used by every method).
  rollover: boolean;
  // Assumed rate for a new easy-access savings account when the user has none to compare with.
  safeSavingsRate: number;
  customShares: CustomShares;
  customMethod: PayoffMethod;
  // Per-debt overrides of whether it is in the plan, by account id. Absent = the default for its
  // type (mortgages and UK student loans start left out; see allocate.ts).
  debtIncluded: Record<string, boolean>;
  lumpSumTax: LumpSumTaxSettings;
};

export type LedgerState = {
  schemaVersion: number;
  currency: CurrencyCode;
  // Decides labels, account types and which region-specific tools show. See region.ts.
  country: CountryCode;
  taxProfile: TaxProfile;
  healthPlan: HealthPlan;
  selectedMonth: string;
  months: Record<string, MonthBudget>;
  /** Multi-goal list, ordered by priority ascending. Replaces the old single `goal`. */
  goals: SavingsGoal[];
  /** Surplus figure used by the goal planner. null = derive from live ledger recurring surplus. */
  goalPlannerSurplus: number | null;
  /** How many months the goal waterfall simulates. Default 60. */
  goalsHorizonMonths: number;
  /** Which goal ID the Ledger view widget shows. null = show goals[0]. */
  ledgerGoalId: string | null;
  savingsTarget: number;
  accounts: Account[];
  // Where new transactions go unless a better account is known (e.g. the account salary goes into).
  defaultAccountId?: string | null;
  assumedInvestmentReturn: number;
  categoryRules: CategoryRule[];
  nameRules: NameRule[];
  importBatches: ImportBatch[];
  // The user's decisions on the subscriptions page: cancelled, removed, reclassified, tolerance.
  subscriptionPrefs: SubscriptionPreference[];
  privacyMode: boolean;
  // No longer read: AI suggestions are on for everyone signed in. Kept because the iOS app and
  // older clients still write it.
  aiCategorizationEnabled?: boolean;
  // Which pages sit in the sidebar. Absent until someone changes it. See navTools.ts.
  sidebar?: SidebarChoice;
  // The Allocate page's plan: priority, lump sum, buffer and tax targets. See allocate.ts.
  allocation: AllocationSettings;
  // The Insights widgets' own data: the look each one uses, dismissed warnings, notes and to-dos.
  // Lives in the ledger so it persists and syncs exactly like transactions do.
  insights?: InsightsState;
  lastSavedAt: string;
};

// ─── Insights dashboard ──────────────────────────────────────────────────────

export type InsightWidgetType =
  | "summary"
  | "moneyFlow"
  | "health"
  | "monthlyCashFlow"
  | "warnings"
  | "topCategories"
  | "recurring"
  | "annualSnapshot"
  | "savingsRate"
  | "spendingPace"
  | "netWorth"
  | "debt"
  | "goals"
  | "monthCompare"
  | "upcoming"
  | "calendar"
  | "accounts"
  | "todo"
  | "notes";

export type InsightWidgetInstance = {
  id: string;
  type: InsightWidgetType;
  // Which look the widget uses ("waterfall" vs "particles" for the money flow, and so on).
  variant?: string;
};

export type InsightTodoItem = { id: string; text: string; done: boolean; createdAt: string };

export type InsightsState = {
  version: 1;
  // One entry per widget that has a non-default look; the id is the widget's id on the page.
  widgets: InsightWidgetInstance[];
  hiddenWarnings: string[];
  notes: Record<string, string>;
  todos: Record<string, InsightTodoItem[]>;
};

export type Projection = {
  // Actuals for the selected month — every item, recurring and one-off.
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
  // Recurring-only run rate — the steady monthly flow that repeats. Used by the net-worth forecast.
  recurringMonthlyIncome: number;
  recurringMonthlyExpenses: number;
  recurringMonthlySurplus: number;
  // Annual projection: recurring items × 12, plus this month's one-offs counted once.
  annualIncome: number;
  annualExpenses: number;
  annualSurplus: number;
  savingsRate: number;
  paidTotal: number;
  unpaidTotal: number;
  // How many items in the selected month are flagged one-off (excluded from the run rate).
  oneOffCount: number;
};

export type DebtSummary = {
  totalDebt: number;
  totalCreditLimit: number;
  availableCredit: number;
  utilization: number;
  monthlyMinimums: number;
  weightedApr: number;
  nextDueDay: number | null;
};

export type AssetSummary = {
  totalAssets: number;
  totalCash: number;
  totalSavings: number;
  totalInvestments: number;
  // Everything going into asset accounts each month: the user's contributions plus employer money.
  monthlyContributions: number;
  // The part that leaves the budget (personal contributions, not payroll or employer ones).
  cashContributions: number;
  payrollContributions: number;
  employerContributions: number;
  weightedAssetRate: number;
};

export type NetWorthSummary = {
  netWorth: number;
  totalAssets: number;
  totalDebt: number;
};

export type NetWorthPoint = {
  monthIndex: number;
  label: string;
  netWorth: number;
  assetBalance: number;
  cashBalance: number;
  savingsBalance: number;
  investmentBalance: number;
  debtBalance: number;
  interestCharged: number;
  growthEarned: number;
};

export type MonthlyFlowPoint = {
  monthKey: string;
  label: string;
  income: number;
  expenses: number;
  surplus: number;
  hasData: boolean;
};

export type FinancialSignalTone = "good" | "info" | "warning" | "danger";

export type FinancialSignal = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  tone: FinancialSignalTone;
};

export type HealthScoreBreakdown = {
  score: number;
  estimatedCreditScore: number;
  cashFlowScore: number;
  debtLoadScore: number;
  utilizationScore: number;
  paymentPressureScore: number;
  savingsScore: number;
  summary: string;
  detail: string;
  /** True when there is no income, expense, or debt data to score against. */
  noData: boolean;
};

// ─── Goal sequencing ─────────────────────────────────────────────────────────

export type GoalMonthPoint = {
  month: number;       // 1-based index in the simulation
  label: string;       // e.g. "Jul 2025"
  perGoal: Record<string, {
    accumulated: number;
    contribution: number;
    complete: boolean;
  }>;
  unallocated: number; // surplus left after all goals this month
};

export type GoalStatus = "complete" | "on-track" | "tight" | "at-risk" | "no-deadline";

export type GoalOutcome = {
  goalId: string;
  name: string;
  color: string;
  target: number;
  completionMonth: number | null; // null = not reached within horizon
  completionDate: string | null;
  shortfall: number;
  extraMonthlyNeeded: number;     // add this much per month to hit deadline
  extraMonthsNeeded: number;      // extend deadline by this many months
  status: GoalStatus;
};

export type GoalSequenceResult = {
  timeline: GoalMonthPoint[];
  goals: GoalOutcome[];
  horizonMonths: number;
  avgUnallocatedSurplus: number;
};

export type CurrencyCode = "GBP" | "USD" | "EUR" | "CAD" | "AUD" | "INR" | "JPY";

// Countries the app can be set to. "US" and "GB" have their own experience; the rest use the
// GB-geared app with their own currency.
export type CountryCode = "US" | "GB" | "IE" | "CA" | "AU" | "IN" | "JP" | "OTHER";
