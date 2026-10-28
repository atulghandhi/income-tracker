import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import LandingPage from "./LandingPage";
import Onboarding, { type OnboardingResult } from "./Onboarding";
import type { CSSProperties, Dispatch, DragEvent, FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, Ref, SetStateAction } from "react";
import {
  Clock3,
  AlertCircle,
  Calculator,
  Landmark,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardPaste,
  Cloud,
  Coins,
  CreditCard,
  Database,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  FileJson,
  FolderPlus,
  Gauge,
  GraduationCap,
  Info,
  LayoutDashboard,
  LineChart,
  LogIn,
  LogOut,
  Moon,
  PenLine,
  PiggyBank,
  Plus,
  ReceiptText,
  Repeat,
  TrendingUp,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  Trash2,
  X,
  Upload,
  WalletCards,
} from "lucide-react";
import {
  isDebtClass,
  buildCsvExport,
  buildFinancialSignals,
  buildMonthlyFlowPoints,
  buildNetWorthOutlook,
  calculateAssetSummary,
  calculateHealthScore,
  calculateDebtSummary,
  calculateNetWorthSummary,
  calculateProjection,
  clampDueDay,
  clampPercent,
  clampWholeNumber,
  colors,
  createId,
  createInitialState,
  CURRENT_SCHEMA_VERSION,
  currencyOptions,
  DEFAULT_INVESTMENT_RETURN,
  formatMonth,
  getCurrencyFormatter,
  getPreciseCurrencyFormatter,
  getCurrencySymbol,
  getMonthKey,
  isValidMonthKey,
  deriveLiveAccounts,
  estimateDebtPayoff,
  recurringAccountTransfersByAccount,
  runGoalSequence,
  seedMonthFromPrevious,
  shiftMonth,
} from "./finance";
import { INCOME_SORT_OPTIONS, isIncomeSortMode, moveEntry, orderIncomes, type IncomeSortMode } from "./ledgerOrder";
import { buildRulePattern, canonicalizeMerchant, descriptionMatchesPattern, isTransferDescription, normalizeMerchant, parseBankText, sortImportRows, tidyImportedNames, type CsvImportResult, type CsvImportRow } from "./importer";
import { buildMerchantMemory } from "./merchantMemory";
import { extractPdfPages } from "./pdfExtract";
import { PDF_SUPPORTED_BANKS, PdfImportError, looksLikePdf, parsePdfStatementWithDetection, type PdfPageText } from "./pdfImporter";
import { countSameName, findRuleTargeting, normalizeNameRules, renameEverywhere, type NameKind } from "./nameRules";
import { parseQuickAdd } from "./quickAdd";
import {
  assignMissingAccounts,
  countedFlowFor,
  defaultAccountId,
  distinctAccountColors,
  guessAccountId,
  isoToday,
  nextAccountColor,
  nextAccountId,
  pickAccountColor,
} from "./accountFlow";
import { goalPlanInputs, linkSavingsTransfers, syncLinkedGoals } from "./accountLinks";
import { matchDebtPaymentRows, skipScheduledPayment, syncScheduledDebtPayments } from "./debtSync";
import { applyRecurringFlag, reconcileSeededEntries } from "./recurrence";
import {
  deleteSubscription,
  detectSubscriptions,
  markSubscriptionCancelled,
  normalizeSubscriptionPrefs,
  reactivateSubscription,
  restoreDeletedSubscriptions,
  setSubscriptionKind,
  setSubscriptionRecurring,
  setSubscriptionTolerance,
  type Subscription,
} from "./subscriptions";
import { aiCategorizeRows, applyAiSuggestions, isAiCategorizationAvailable, testAiConnection } from "./aiCategorize";
import { bucketCount, identifyAnalytics, track } from "./analytics";
import { DebtRemindersPanel, InstallBanner, MonthlyReminderPanel, NewMonthNudge } from "./RetentionPanels";
import {
  INSTALL_DISMISSED_KEY,
  NUDGE_DISMISSED_KEY,
  isIosSafari,
  isStandalone,
  readBankSlug,
  recordVisit,
  shouldShowNewMonthNudge,
  writeBankSlug,
} from "./retention";

// The browser's install prompt event (not yet in lib.dom).
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
import {
  BANK_FEED_SOURCE_NAME,
  completeBankConnection,
  consumeFeedCallbackCode,
  countStagedFeedRows,
  daysUntilConsentExpiry,
  disconnectBankConnection,
  fetchStagedFeedReview,
  isFeedBackendConfigured,
  isFeedsEnabled,
  listBankConnections,
  reconfirmBankConnection,
  resolveFeedRows,
  startBankConnection,
  syncFeedsNow,
  type BankConnection,
} from "./feeds";
import { GoalsView } from "./GoalsView";
import { SubscriptionsView, SubscriptionsWidget } from "./SubscriptionsView";
import {
  accountClassOptions,
  accountTypeOption,
  accountTypeOptions,
  accountTypeOptionsFor,
  allAccountTypesForClass,
  countryFromCurrency,
  countryOption,
  countryOptions,
  defaultContributionSource,
  defaultTaxTreatment,
  defaultTypeForClass,
  detectCountryFromBrowser,
  isCountryCode,
  isLoanType,
  regionOf,
  supportsPlanDetails,
  textLocalizer,
  type RegionKey,
} from "./region";
import { syncPlanContributions } from "./retirement";
import { buildPlanInputs, comparePlans, normalizeAllocationSettings } from "./allocate";
import { AllocateView, PayoffWidget } from "./AllocateView";
import { buildPlanSignals } from "./planSignals";
import { interpretCreditScore } from "./creditScore";
import { TOOL_VIEWS, initialPinned, isToolView, readNavTools, toolSuggestions, unseenSuggestionCount, writeNavTools, type NavToolsPrefs, type ToolView } from "./navTools";
import { APP_VIEWS, DEFAULT_VIEW, pathForView, viewFromPath, type AppView } from "./routes";
import { buildSampleLedger, sampleCountry } from "./sampleData";
import { WidgetGrid, type WidgetRenderer } from "./WidgetGrid";
import { INSIGHT_WIDGET_SPECS, InsightWidgetCard } from "./InsightWidgetCard";
import { buildCategoryRows, buildExpenseGroups, buildMonthlyBars, categoryColor, categoryEmoji } from "./ledgerGroups";
import { buildInsightsModel, visibleSignals } from "./insightsData";
import { normalizeInsightsState, setWidgetVariant } from "./insightsState";
import type { WidgetActions } from "./insightWidgets";
import { addWidget, clearLayout, cycleWidgetSize, defaultLayout, hiddenWidgets, loadLayout, moveWidget, moveWidgetBefore, removeWidget, resizeWidget, saveLayout, widgetDefinition, type LayoutPage, type PageLayout } from "./layout";
import {
  AccountPlanDetails,
  CreditScoreWidget,
  GoalsWidget,
  HousingWidget,
  LoanDetails,
  LoansWidget,
  MedicalWidget,
  PaycheckBreakdownWidget,
  RetirementWidget,
  TakeHomeEstimator,
  TakeHomeWidget,
} from "./RegionPanels";
import { computeTakeHome } from "./takeHome";
import {
  AnimatedCurrency,
  EmptyState,
  InfoHint,
  MetricCard,
  MoneyInput,
  NetWorthChart,
  NetWorthHorizonTabs,
  NumberInput,
  PanelTitle,
  ProgressRule,
  blurOnEnter,
  focusNextFrame,
  formatDecimal,
  formatShortDate,
  handleDraftEnter,
  healthTone,
  type NetWorthHorizon,
} from "./ui";
import { loadLedgerState, saveLedgerState } from "./storage";
import {
  getCurrentSession,
  isSupabaseConfigured,
  loadCloudLedgerState,
  saveCloudLedgerState,
  signInWithGoogle,
  signOut,
  submitFeedback,
  supabase,
  upsertUserProfile,
  type AuthSession,
  type FeedbackType,
} from "./supabase";
import type {
  Account,
  AccountClass,
  AccountType,
  AllocationSettings,
  CategoryRule,
  CountryCode,
  CurrencyCode,
  ExpenseEntry,
  FinancialSignal,
  GoalOutcome,
  GoalSequenceResult,
  GoalStatus,
  HealthScoreBreakdown,
  ImportBatch,
  ImportedTransactionRef,
  IncomeEntry,
  InsightsState,
  LedgerState,
  MonthBudget,
  MonthlyFlowPoint,
  NetWorthPoint,
  Projection,
  SavingsGoal,
  TransactionKind,
} from "./types";

type ProjectionView = "overview" | "category" | "month";

type ThemeMode = "light" | "dark";

const THEME_KEY = "it_theme";

function readStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // localStorage unavailable — fall through to the system preference.
  }
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// Income column order is a per-device view preference, like the theme, so it
// lives in localStorage rather than in the synced ledger.
const INCOME_SORT_KEY = "it_income_sort";

function readStoredIncomeSort(): IncomeSortMode {
  try {
    const stored = localStorage.getItem(INCOME_SORT_KEY);
    if (isIncomeSortMode(stored)) return stored;
  } catch {
    // localStorage unavailable — fall back to the user's own order.
  }
  return "custom";
}

type TutorialStep = { heading: string; bullets: string[] };
type PageTutorial = { title: string; badge: string; steps: TutorialStep[] };

function capitalizeFirst(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Short, skimmable per-page walkthroughs, replayable anytime from the sidebar
// "Tutorial" button. They no longer auto-open on first visit — the setup wizard
// and the dashboard getting-started checklist cover first-run guidance instead.
const TUTORIALS_GB: Record<AppView, PageTutorial> = {
  ledger: {
    title: "Track a month in seconds",
    badge: "Ledger",
    steps: [
      {
        heading: "Add what comes in and goes out",
        bullets: [
          "Left column is income, right column is expenses.",
          "Type a name and an amount — totals update as you type.",
          "Use the arrows up top to move between months.",
        ],
      },
      {
        heading: "Organise it",
        bullets: [
          "Drag one expense onto another to group them into a category.",
          "Toggle the loop icon to mark an item recurring, so it counts every month.",
          "Use the search bar up top to filter rows fast.",
        ],
      },
      {
        heading: "See the picture",
        bullets: [
          "Your surplus (income minus expenses) updates live.",
          "Import a bank CSV to fill a whole month in one go.",
          "Rough estimates are fine — you still get useful insights.",
        ],
      },
    ],
  },
  dashboard: {
    title: "Your money at a glance",
    badge: "Dashboard",
    steps: [
      {
        heading: "",
        bullets: [
          "This month's snapshot and the money flow show where income came from and where it went — click a stream to see what is inside.",
          "The health score rates cash flow, debt and savings; spending pace and the savings rate say how the month is going against your target.",
          "Anomalies flag unusual spending worth a second look; dismiss any with the ×.",
          "Customise rearranges, resizes, adds and removes widgets, such as to-dos, notes, a spending calendar or where your pay goes. The layout is remembered on this device.",
        ],
      },
    ],
  },
  accounts: {
    title: "Your whole net worth",
    badge: "Accounts",
    steps: [
      {
        heading: "",
        bullets: [
          "Add savings, current and investment accounts as assets.",
          "Add credit cards, loans and overdrafts as debts.",
          "Net worth = assets minus debts, updated as you type.",
          "Set rates, limits and 0% intro periods to power the forecast.",
          "Open Plan details on a pension or retirement account for contributions, employer match and limits.",
        ],
      },
    ],
  },
  pay: {
    title: "From gross salary to take-home",
    badge: "Pay & tax",
    steps: [
      {
        heading: "",
        bullets: [
          "Enter your gross annual salary and how often you're paid.",
          "Pick your student loan plan; pension contributions set to come from pay on Accounts are deducted automatically.",
          "Income tax, National Insurance and student loan are worked out for the current tax year — an estimate, not a payslip.",
          "Use the net figure as this month's income with one click.",
        ],
      },
    ],
  },
  goals: {
    title: "Plan what you're saving for",
    badge: "Goals",
    steps: [
      {
        heading: "",
        bullets: [
          "Add a goal with a target amount and an optional deadline.",
          "Pick how it's funded: Fixed, Auto, or Fill from spare surplus.",
          "The timeline shows when each goal completes.",
          "Higher-priority goals are funded first.",
        ],
      },
    ],
  },
  allocate: {
    title: "Decide where spare money goes",
    badge: "Allocate",
    steps: [
      {
        heading: "",
        bullets: [
          "Type a one-off lump sum (a bonus, a refund) and check the spare-per-month figure from your ledger.",
          "Pick a priority: least interest (avalanche), quick wins (snowball), lower payments soonest, credit score recovery, a cash buffer or a tax bill first.",
          "Charts compare every strategy against paying minimums only: interest, debt-free date, payments and card utilisation.",
          "Choose where savings go too — highest safe rate, highest expected return, tax wrappers or your goals.",
          "Illustrations from your figures, not advice — free debt help is linked at the bottom.",
        ],
      },
    ],
  },
  subscriptions: {
    title: "Everything you pay for repeatedly",
    badge: "Subscriptions",
    steps: [
      {
        heading: "",
        bullets: [
          "Subscriptions, bills and renewals are detected from your ledger — nothing to set up.",
          "Each one shows what it costs per year; 4-weekly payments count 13 times, not 12.",
          "Price rises are flagged with the extra cost per year. Charges in another currency wobble with the exchange rate and are not flagged.",
          "Yearly renewals show their next date. Anything that stops being paid moves to Cancelled — or mark it cancelled yourself, and delete it from there.",
          "Open a row for its payment history, to widen the on-time window, or to say it is not a subscription.",
        ],
      },
    ],
  },
  settings: {
    title: "Data, privacy & rules",
    badge: "Settings",
    steps: [
      {
        heading: "",
        bullets: [
          "Export or import your whole vault as JSON or CSV.",
          "Transfer rules auto-skip money moved between your own accounts.",
          "Privacy mode hides amounts; switch country, currency or animations anytime.",
        ],
      },
    ],
  },
};

// The same walkthroughs for the US experience: American instruments, the gross-to-net estimate,
// medical tracking and month-first statements, in American English.
const TUTORIALS_US: Record<AppView, PageTutorial> = {
  ledger: {
    title: "Track a month in seconds",
    badge: "Ledger",
    steps: [
      {
        heading: "Add what comes in and goes out",
        bullets: [
          "Left column is income, right column is expenses.",
          "Type a name and an amount — totals update as you type.",
          "Enter your take-home pay as income; the Paycheck & tax page can work it out from your salary.",
          "Use the arrows up top to move between months.",
        ],
      },
      {
        heading: "Organize it",
        bullets: [
          "Drag one expense onto another to group them into a category — Housing, Utilities, Medical, Transportation.",
          "Toggle the loop icon to mark an item recurring, so it counts every month.",
          "Name medical bills clearly (doctor, pharmacy, dental) and they count toward your deductible automatically.",
        ],
      },
      {
        heading: "See the picture",
        bullets: [
          "Your surplus (income minus expenses) updates live.",
          "Import a CSV from Chase, Bank of America, Capital One or any bank — dates are read month-first.",
          "Rough estimates are fine — you still get useful insights.",
        ],
      },
    ],
  },
  dashboard: {
    title: "Your money at a glance",
    badge: "Dashboard",
    steps: [
      {
        heading: "",
        bullets: [
          "This month's snapshot and the money flow show where income came from and where it went — click a stream to see what is inside.",
          "Retirement & tax-advantaged accounts tracks 401(k), IRA and HSA contributions against this year's limits, plus your employer match.",
          "Where your paycheck goes charts the Paycheck & tax estimate; the credit estimate reads on the FICO and VantageScore scales.",
          "Anomalies flag unusual spending, an employer match left on the table, or an FSA about to expire; dismiss any with the ×.",
          "Customize rearranges, resizes, adds and removes widgets, such as to-dos, notes or a spending calendar. The layout is remembered on this device.",
        ],
      },
    ],
  },
  accounts: {
    title: "Your whole net worth",
    badge: "Accounts",
    steps: [
      {
        heading: "",
        bullets: [
          "Add checking, savings (HYSA, CD, money market), brokerage and retirement accounts as assets.",
          "Add credit cards, mortgages, auto loans and student loans as debts.",
          "Net worth = assets minus debts, updated as you type.",
          "Tap the i beside a type for a plain-English explanation — 401(k), Roth IRA, HSA, 529 and the rest.",
          "Open Plan details on a 401(k), IRA or HSA for contribution source, % of pay, employer match, tax treatment and annual limits.",
          "Open Loan details on a student loan to set federal vs private and the repayment plan; mortgages and auto loans take a remaining term.",
        ],
      },
    ],
  },
  pay: {
    title: "From gross salary to your paycheck",
    badge: "Paycheck & tax",
    steps: [
      {
        heading: "",
        bullets: [
          "Enter your gross annual salary, filing status, state and pay frequency.",
          "401(k), HSA and FSA contributions set to come from your paycheck on Accounts are deducted automatically; add your pre-tax health premium.",
          "Federal brackets, Social Security, Medicare and a state rate give the net paycheck — an estimate, not tax advice.",
          "Use the net figure as this month's income with one click.",
        ],
      },
    ],
  },
  goals: {
    title: "Plan what you're saving for",
    badge: "Goals",
    steps: [
      {
        heading: "",
        bullets: [
          "Add a goal with a target amount and an optional deadline.",
          "Pick how it's funded: Fixed, Auto, or Fill from spare surplus.",
          "Link a goal to a HYSA or brokerage account and its balance and contributions flow in automatically.",
          "The timeline shows when each goal completes; higher-priority goals are funded first.",
        ],
      },
    ],
  },
  allocate: {
    title: "Decide where spare money goes",
    badge: "Allocate",
    steps: [
      {
        heading: "",
        bullets: [
          "Type a one-off lump sum (a bonus, a tax refund) and check the spare-per-month figure from your ledger.",
          "Pick a priority: least interest (avalanche), quick wins (snowball), lower payments soonest, credit score recovery, a cash buffer or estimated taxes first.",
          "Charts compare every strategy against paying minimums only: interest, debt-free date, payments and card utilization.",
          "Choose where savings go too — highest safe APY, highest expected return, tax-advantaged accounts or your goals.",
          "Illustrations from your figures, not advice — free credit counseling is linked at the bottom.",
        ],
      },
    ],
  },
  subscriptions: {
    title: "Everything you pay for repeatedly",
    badge: "Subscriptions",
    steps: [
      {
        heading: "",
        bullets: [
          "Subscriptions, bills and renewals are detected from your ledger — nothing to set up.",
          "Each one shows what it costs per year; every-4-weeks payments count 13 times, not 12.",
          "Price increases are flagged with the extra cost per year. Charges in another currency move with the exchange rate and are not flagged.",
          "Annual renewals show their next date. Anything that stops being paid moves to Canceled — or mark it canceled yourself, and delete it from there.",
          "Open a row for its payment history, to widen the on-time window, or to say it is not a subscription.",
        ],
      },
    ],
  },
  settings: {
    title: "Data, privacy & rules",
    badge: "Settings",
    steps: [
      {
        heading: "",
        bullets: [
          "Export or import your whole vault as JSON or CSV.",
          "Transfer rules auto-skip money moved between your own accounts.",
          "Privacy mode hides amounts; switch country, currency or animations anytime.",
        ],
      },
    ],
  },
};

function tutorialsFor(region: RegionKey): Record<AppView, PageTutorial> {
  return region === "US" ? TUTORIALS_US : TUTORIALS_GB;
}

// Development only (never in a production build): the dev server starts a brand-new browser
// profile on a filled-in sample ledger for the detected country, so every screen can be tried
// without typing data in. ?sample=us / ?sample=uk force a country, ?sample=blank starts empty.
// Automated browsers (Playwright sets navigator.webdriver) start blank unless they ask.
const DEV_SAMPLE_PARAM = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("sample") : null;
const DEV_SAMPLE_COUNTRY: CountryCode | null = import.meta.env.DEV ? sampleCountry(DEV_SAMPLE_PARAM) : null;
const DEV_AUTO_SAMPLE = import.meta.env.DEV && import.meta.env.VITE_DEV_SAMPLE !== "0" && DEV_SAMPLE_PARAM === null && !navigator.webdriver;

const TUTORIAL_SEEN_KEY = "tutorialSeenPages";
const ONBOARDING_KEY = "onboardingComplete";
const GETTING_STARTED_KEY = "gettingStartedDismissed";
// One-off announcement of PDF statement imports for people who were already using the app.
const PDF_NOTICE_KEY = "it_pdf_import_notice";

function readFlag(key: string): boolean {
  try {
    return Boolean(localStorage.getItem(key));
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // localStorage unavailable — the flag simply won't persist.
  }
}

function readSeenTutorials(): Set<AppView> {
  try {
    const raw = JSON.parse(localStorage.getItem(TUTORIAL_SEEN_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? (raw as AppView[]) : []);
  } catch {
    return new Set();
  }
}

type SaveState = "loading" | "saved" | "saving" | "offline";
type SyncConflict = { local: LedgerState; cloud: LedgerState };
type InsightChartView = "inflow-outflow" | "cash-flow" | "net-worth";
type ExpenseDropPreview =
  | { type: "reorder"; targetId: string; edge: "before" | "after" }
  | { type: "category"; category: string }
  | { type: "combine"; targetId: string }
  | null;
type ExpenseDropState = "before" | "after" | "combine";
type CategoryMenuState = { expenseId: string; x: number; y: number };
type RenamePrompt = { kind: NameKind; entryId: string; from: string; to: string; others: number; months: number };
type CategoryOption = { name: string; color: string; count: number; total: number };
type ImportReviewState = {
  fileName: string;
  rows: CsvImportRow[];
  errors: string[];
  totalRows: number;
  // Credit-card statements: amounts were auto-negated so charges count as
  // spending. canFlip is false for sources that can't re-parse (bank feeds).
  signInverted: boolean;
  canFlip: boolean;
  // Every row in one statement comes from one account; the user can change which.
  accountId?: string;
  // Where the rows came from, for the header ("PDF statement review") and analytics.
  format: ImportFormat;
  // Issuer read from a PDF's letterhead, when recognised.
  bank?: string;
};
// What a review was parsed from. Text sources re-parse from the raw text when the
// sign-flip toggle is used; PDF sources re-parse from the extracted page text.
type ImportSource = { kind: "text"; text: string } | { kind: "pdf"; pages: PdfPageText[] };
type ImportFormat = "csv" | "ofx" | "qif" | "pdf" | "paste" | "feed";
type LastImportAction = {
  batchId: string;
  fileName: string;
  importedRows: number;
};

type IncomeDraft = {
  source: string;
  amount: string;
};

type ExpenseDraft = {
  name: string;
  amount: string;
};

type AccountDraft = {
  name: string;
  accountClass: AccountClass;
  type: AccountType;
  balance: string;
  rate: string;
  promoRate: string;
  promoMonths: string;
  monthlyContribution: string;
  creditLimit: string;
  minimumPayment: string;
  dueDay: string;
};

// Account sub-types and their labels come from the user's country (region.ts): a UK user sees
// "Current account" and "Cash ISA", a US user "Checking account" and "401(k)".

const initialIncomeDraft: IncomeDraft = {
  source: "",
  amount: "",
};

const initialExpenseDraft: ExpenseDraft = {
  name: "",
  amount: "",
};

const initialAccountDraft: AccountDraft = {
  name: "",
  accountClass: "debt",
  type: "credit-card",
  balance: "",
  rate: "",
  promoRate: "",
  promoMonths: "",
  monthlyContribution: "",
  creditLimit: "",
  minimumPayment: "",
  dueDay: "",
};

function App() {
  // A deep link straight into an app page (/accounts) skips the marketing landing.
  const [showLanding, setShowLanding] = useState(() => !DEV_SAMPLE_COUNTRY && !viewFromPath(window.location.pathname) && !localStorage.getItem("hasSeenLanding"));
  // A brand-new ledger starts on the country the browser suggests; anything stored replaces it.
  const [ledger, setLedger] = useState<LedgerState>(() => createInitialState(detectCountryFromBrowser()));
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authWorking, setAuthWorking] = useState(false);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const authUserIdRef = useRef<string | null>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showSyncNudge, setShowSyncNudge] = useState(false);
  const [syncConflict, setSyncConflict] = useState<SyncConflict | null>(null);
  const nudgeDismissedRef = useRef(false);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [incomeDraft, setIncomeDraft] = useState<IncomeDraft>(initialIncomeDraft);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>(initialExpenseDraft);
  const [accountDraft, setAccountDraft] = useState<AccountDraft>(initialAccountDraft);
  const [projectionView, setProjectionView] = useState<ProjectionView>("overview");
  const [insightChartView, setInsightChartView] = useState<InsightChartView>("inflow-outflow");
  const [netWorthHorizon, setNetWorthHorizon] = useState<NetWorthHorizon>(24);
  // Dashboard first: it matches the nav order and hosts the getting-started
  // checklist, so new users land on an overview instead of a data-entry screen.
  // The URL names the page (/ledger, /accounts, …) so a refresh stays put.
  const [activeView, setActiveViewState] = useState<AppView>(() => viewFromPath(window.location.pathname) ?? DEFAULT_VIEW);
  const [layoutEditing, setLayoutEditing] = useState<LayoutPage | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme);
  const [tutorialView, setTutorialView] = useState<AppView | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(() => readFlag(GETTING_STARTED_KEY));
  const [showPdfNotice, setShowPdfNotice] = useState(false);
  // Whether hydration found a saved ledger — the difference between a returning user and a new one.
  const storedLedgerRef = useRef(false);

  // Retention: remembered bank, the new-month nudge, and the install prompt.
  const [bankSlug, setBankSlugState] = useState(() => readBankSlug());
  const [nudgeDismissedMonth, setNudgeDismissedMonth] = useState<string | null>(() => {
    try {
      return localStorage.getItem(NUDGE_DISMISSED_KEY);
    } catch {
      return null;
    }
  });
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(() => readFlag(INSTALL_DISMISSED_KEY));
  const [visitCount] = useState(() => recordVisit());

  function setBankSlug(slug: string) {
    setBankSlugState(slug);
    writeBankSlug(slug);
    if (slug) track("bank_selected", { bank: slug });
  }

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      track("app_installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  // Motion is on for everyone, except people who have asked their system to reduce it.
  const [animationsEnabled, setAnimationsEnabled] = useState(() => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const onChange = () => setAnimationsEnabled(!query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const [query, setQuery] = useState("");
  // Starts empty so nothing flashes on load — the toast effect ignores empty values.
  const [toast, setToast] = useState("");
  // Brief pill naming the account a transaction now belongs to, in that account's colour.
  const [accountToast, setAccountToast] = useState<{ name: string; color: string; stamp: number } | null>(null);
  const [draggingExpenseId, setDraggingExpenseId] = useState<string | null>(null);
  const [groupingSourceId, setGroupingSourceId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<ExpenseDropPreview>(null);
  const [incomeSort, setIncomeSort] = useState<IncomeSortMode>(readStoredIncomeSort);
  const [draggingIncomeId, setDraggingIncomeId] = useState<string | null>(null);
  const [incomeDropPreview, setIncomeDropPreview] = useState<{ targetId: string; edge: "before" | "after" } | null>(null);
  const [categoryMenu, setCategoryMenu] = useState<CategoryMenuState | null>(null);
  const [renamePrompt, setRenamePrompt] = useState<RenamePrompt | null>(null);
  const [importReview, setImportReview] = useState<ImportReviewState | null>(null);
  const [lastImportAction, setLastImportAction] = useState<LastImportAction | null>(null);
  const [quickAddInput, setQuickAddInput] = useState("");
  const [seededBannerDismissed, setSeededBannerDismissed] = useState<Set<string>>(() => new Set());
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const toastFirstRenderRef = useRef(true);
  const [bankConnections, setBankConnections] = useState<BankConnection[]>([]);
  const [stagedFeedCount, setStagedFeedCount] = useState(0);
  const [feedsReady, setFeedsReady] = useState(false);
  const [feedsBusy, setFeedsBusy] = useState(false);
  // review-row id → feed_transactions.id for the currently open bank-feed review.
  const feedRowMapRef = useRef<Map<string, string> | null>(null);
  // The last file/paste import's source, so the "flip in/out" toggle can re-parse.
  const lastImportSourceRef = useRef<{ source: ImportSource; sourceName: string } | null>(null);
  const [transferRuleInput, setTransferRuleInput] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const incomeSourceInputRef = useRef<HTMLInputElement | null>(null);
  const incomeAmountInputRef = useRef<HTMLInputElement | null>(null);
  const expenseNameInputRef = useRef<HTMLInputElement | null>(null);
  const expenseAmountInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const user = session?.user ?? null;

  function setActiveView(view: AppView) {
    setActiveViewState(view);
    const path = pathForView(view);
    if (window.location.pathname !== path) {
      window.history.pushState({ view }, "", path + window.location.search + window.location.hash);
    }
  }

  useEffect(() => {
    const onPopState = () => setActiveViewState(viewFromPath(window.location.pathname) ?? DEFAULT_VIEW);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Keep the address bar naming the page on show: "/" becomes "/dashboard" once the shell is up,
  // and going back to the homepage clears it again.
  useEffect(() => {
    const path = showLanding ? "/" : pathForView(activeView);
    if (window.location.pathname !== path) {
      window.history.replaceState({ view: activeView }, "", path + window.location.search + window.location.hash);
    }
  }, [showLanding, activeView]);

  // Country decides the experience: US labels, account types and tools, or the UK-geared original.
  const region: RegionKey = regionOf(ledger.country);
  const t = useMemo(() => textLocalizer(region), [region]);
  const [dashboardLayout, setDashboardLayout] = useState<PageLayout>(() => loadLayout("dashboard", region));
  // Each region keeps its own arrangement; switching country loads that region's saved layout.
  useEffect(() => {
    setDashboardLayout(loadLayout("dashboard", region));
    setLayoutEditing(null);
  }, [region]);

  const currentMonth = ledger.months[ledger.selectedMonth] ?? seedMonthFromPrevious();
  const moneyFormatter = useMemo(() => getCurrencyFormatter(ledger.currency), [ledger.currency]);
  // Prices to the penny, for subscriptions where £10.99 → £12.99 is the whole story.
  const preciseFormatter = useMemo(() => getPreciseCurrencyFormatter(ledger.currency), [ledger.currency]);
  const currencySymbol = useMemo(() => getCurrencySymbol(ledger.currency), [ledger.currency]);
  const projection = useMemo(() => calculateProjection(currentMonth), [currentMonth]);
  // Debt balances rolled forward from their snapshot month to today, and 0%/intro windows
  // counted down — every summary, chart, and the accounts screen read these, so a card set up
  // months ago shows what's left after the scheduled (or linked) payments, and "12 months
  // interest-free" reads 11 a month later, not the stale snapshot.
  const effectiveAccounts = useMemo(
    () => deriveLiveAccounts({ accounts: ledger.accounts, months: ledger.months }),
    [ledger.accounts, ledger.months],
  );
  const debtSummary = useMemo(() => calculateDebtSummary(effectiveAccounts), [effectiveAccounts]);
  const assetSummary = useMemo(() => calculateAssetSummary(effectiveAccounts), [effectiveAccounts]);
  const netWorthSummary = useMemo(() => calculateNetWorthSummary(effectiveAccounts), [effectiveAccounts]);
  const netWorthOutlook = useMemo(
    () =>
      buildNetWorthOutlook({
        accounts: effectiveAccounts,
        projection,
        months: netWorthHorizon,
        linkedTransfers: recurringAccountTransfersByAccount(currentMonth),
      }),
    [effectiveAccounts, netWorthHorizon, projection, currentMonth],
  );
  const categoryRows = useMemo(() => buildCategoryRows(currentMonth, projection), [currentMonth, projection]);
  const expenseGroups = useMemo(() => buildExpenseGroups(currentMonth.expenses), [currentMonth.expenses]);
  const categoryOptions: CategoryOption[] = useMemo(
    () =>
      expenseGroups
        .filter((group) => group.category)
        .map((group) => ({ name: group.category, color: group.color, count: group.items.length, total: group.total })),
    [expenseGroups],
  );
  const importCategoryOptions = useMemo(() => {
    const names = new Set(
      region === "US"
        ? ["Unsorted", "Income", "Housing", "Food", "Utilities", "Transportation", "Subscriptions", "Medical", "Health", "Tax", "Debt payments", "Transfers"]
        : ["Unsorted", "Income", "Home", "Food", "Bills", "Travel", "Subscriptions", "Health", "Tax", "Debt payments", "Transfers"],
    );
    categoryOptions.forEach((option) => names.add(option.name));
    importReview?.rows.forEach((row) => {
      if (row.category) names.add(row.category);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [categoryOptions, importReview?.rows, region]);
  const transferRules = useMemo(
    () => ledger.categoryRules.filter((rule) => rule.kind === "transfer"),
    [ledger.categoryRules],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleIncomes = useMemo(() => {
    const ordered = orderIncomes(currentMonth.incomes, incomeSort);
    if (!normalizedQuery) return ordered;
    return ordered.filter((income) => income.source.toLowerCase().includes(normalizedQuery));
  }, [currentMonth.incomes, incomeSort, normalizedQuery]);
  const visibleExpenseGroups = useMemo(() => {
    if (!normalizedQuery) return expenseGroups;
    return buildExpenseGroups(
      currentMonth.expenses.filter(
        (expense) =>
          expense.name.toLowerCase().includes(normalizedQuery) ||
          expense.category.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [currentMonth.expenses, expenseGroups, normalizedQuery]);
  const monthlyBars = useMemo(() => buildMonthlyBars(ledger), [ledger, currentMonth]);
  const monthlyFlowPoints = useMemo(() => buildMonthlyFlowPoints(ledger), [ledger]);
  const healthScore = useMemo(
    () => calculateHealthScore({ projection, debtSummary, accounts: effectiveAccounts, savingsTarget: ledger.savingsTarget }),
    [debtSummary, effectiveAccounts, ledger.savingsTarget, projection],
  );
  const financialSignals = useMemo(
    () => buildFinancialSignals({ projection, debtSummary, accounts: effectiveAccounts, assetSummary, month: currentMonth, savingsTarget: ledger.savingsTarget }),
    [currentMonth, debtSummary, assetSummary, effectiveAccounts, ledger.savingsTarget, projection],
  );
  // Plan-level signals (employer match left behind, limits exceeded, FSA expiring) join the
  // ledger-based anomalies.
  const planSignals = useMemo(
    () =>
      buildPlanSignals({
        accounts: effectiveAccounts,
        taxProfile: ledger.taxProfile,
        healthPlan: ledger.healthPlan,
        months: ledger.months,
        region,
        formatter: moneyFormatter,
      }),
    [effectiveAccounts, ledger.taxProfile, ledger.healthPlan, ledger.months, region, moneyFormatter],
  );
  const allSignals = useMemo(() => {
    if (!planSignals.length) return financialSignals;
    const ledgerSignals = financialSignals.filter((signal) => signal.id !== "no-urgent-signals");
    return [...ledgerSignals, ...planSignals].slice(0, 8);
  }, [financialSignals, planSignals]);
  // The Insights widgets' own data, and the model the money-flow family of widgets draws from.
  // The model walks every month of the ledger, so it is only built while the Dashboard is open.
  const insightsState = useMemo(() => normalizeInsightsState(ledger.insights), [ledger.insights]);
  const insightsModel = useMemo(
    () => (activeView === "dashboard" ? buildInsightsModel(ledger, ledger.selectedMonth, { formatter: moneyFormatter }) : null),
    [activeView, ledger, moneyFormatter],
  );
  // Anomalies: the ledger and plan signals, plus the month-on-month ones the insights model adds
  // (category spikes, subscription creep, bills that usually would have landed by now).
  const anomalySignals = useMemo(() => {
    if (!insightsModel) return allSignals;
    const known = new Set([...allSignals, ...financialSignals].map((signal) => signal.id));
    const extra = insightsModel.signals.filter((signal) => !known.has(signal.id) && signal.id !== "no-urgent-signals");
    if (!extra.length) return allSignals;
    return [...allSignals.filter((signal) => signal.id !== "no-urgent-signals"), ...extra].slice(0, 10);
  }, [allSignals, financialSignals, insightsModel]);
  const creditReading = useMemo(() => interpretCreditScore(healthScore.estimatedCreditScore, region), [healthScore.estimatedCreditScore, region]);
  const takeHome = useMemo(() => computeTakeHome(region, ledger.taxProfile, ledger.accounts), [region, ledger.taxProfile, ledger.accounts]);
  const payrollAccounts = useMemo(
    () => ledger.accounts.filter((account) => account.accountClass !== "debt" && account.contributionSource === "payroll" && Number(account.monthlyContribution) > 0),
    [ledger.accounts],
  );
  // Goals share only the money that isn't already routed into an account each month; a goal's
  // own account pays its contribution straight in.
  const goalPlan = useMemo(
    () =>
      goalPlanInputs({
        goals: ledger.goals,
        accounts: effectiveAccounts,
        month: currentMonth,
        recurringSurplus: projection.recurringMonthlySurplus,
        override: ledger.goalPlannerSurplus,
      }),
    [ledger.goals, effectiveAccounts, currentMonth, projection.recurringMonthlySurplus, ledger.goalPlannerSurplus],
  );
  const goalPlannerSurplus = goalPlan.monthlySurplus;
  const goalSequence = useMemo(
    () =>
      runGoalSequence({
        goals: ledger.goals,
        monthlySurplus: goalPlannerSurplus,
        horizonMonths: ledger.goalsHorizonMonths,
        dedicatedMonthly: goalPlan.dedicatedMonthly,
      }),
    [ledger.goals, goalPlannerSurplus, ledger.goalsHorizonMonths, goalPlan.dedicatedMonthly],
  );
  // The Allocate page and its widget: every payoff strategy simulated from the live debts, the
  // same spare-per-month figure the goal planner uses, and the saved plan settings.
  // "Spare each month" for the plan is the ledger's own figure, whatever the Goals page was told.
  const ledgerSpare = ledger.goalPlannerSurplus === null
    ? goalPlannerSurplus
    : goalPlanInputs({ goals: ledger.goals, accounts: effectiveAccounts, month: currentMonth, recurringSurplus: projection.recurringMonthlySurplus, override: null }).monthlySurplus;
  const allocationPlan = useMemo(
    () =>
      comparePlans(
        buildPlanInputs({
          accounts: effectiveAccounts,
          goals: ledger.goals,
          settings: ledger.allocation,
          monthlySurplus: ledgerSpare,
          monthlyExpenses: projection.recurringMonthlyExpenses,
          assumedInvestmentReturn: ledger.assumedInvestmentReturn,
          region,
          country: ledger.country,
          taxProfile: ledger.taxProfile,
        }),
        ledger.allocation.priority,
      ),
    [effectiveAccounts, ledger.goals, ledger.allocation, ledgerSpare, projection.recurringMonthlyExpenses, ledger.assumedInvestmentReturn, region, ledger.country, ledger.taxProfile],
  );
  const selectedYear = ledger.selectedMonth.split("-")[0];
  const menuExpense = categoryMenu ? currentMonth.expenses.find((expense) => expense.id === categoryMenu.expenseId) : undefined;
  const debtAccountNameById = useMemo(
    () => new Map(ledger.accounts.filter((account) => account.accountClass === "debt").map((account) => [account.id, account.name])),
    [ledger.accounts],
  );
  const accountNameById = useMemo(() => new Map(ledger.accounts.map((account) => [account.id, account.name])), [ledger.accounts]);
  const accountById = useMemo(() => new Map(ledger.accounts.map((account) => [account.id, account])), [ledger.accounts]);
  const merchantMemory = useMemo(() => buildMerchantMemory(ledger), [ledger]);
  const quickAddPreview = useMemo(() => {
    if (!quickAddInput.trim()) return null;
    return parseQuickAdd(quickAddInput, { state: ledger, memory: merchantMemory, monthKey: ledger.selectedMonth });
  }, [quickAddInput, ledger, merchantMemory]);
  const seededEntryCount = useMemo(
    () =>
      currentMonth.incomes.filter((income) => income.seededFrom).length +
      currentMonth.expenses.filter((expense) => expense.seededFrom).length,
    [currentMonth],
  );
  const showSeededBanner = seededEntryCount > 0 && !seededBannerDismissed.has(ledger.selectedMonth);
  // Subscriptions, bills and renewals detected from the ledger, with the user's decisions applied.
  const subscriptionReport = useMemo(() => detectSubscriptions(ledger), [ledger]);
  // Learned (non-transfer) rules with live match counts, for the hygiene panel.
  const learnedRules = useMemo(() => {
    const rules = ledger.categoryRules.filter((rule) => rule.kind !== "transfer");
    if (!rules.length) return [];
    const canonicals: string[] = [];
    for (const month of Object.values(ledger.months)) {
      for (const income of month.incomes) canonicals.push(canonicalizeMerchant(income.imported?.originalDescription || income.source));
      for (const expense of month.expenses) canonicals.push(canonicalizeMerchant(expense.imported?.originalDescription || expense.name));
    }
    return rules
      .map((rule) => ({ rule, matches: canonicals.filter((canonical) => descriptionMatchesPattern(canonical, rule.pattern)).length }))
      .sort((a, b) => b.matches - a.matches || a.rule.pattern.localeCompare(b.rule.pattern));
  }, [ledger.categoryRules, ledger.months]);

  // Getting-started checklist: derived from real data, so items tick themselves
  // off as the user (or the setup wizard) fills things in.
  const setupProgress = useMemo(() => {
    const monthsList = Object.values(ledger.months);
    return {
      income: monthsList.some((month) => month.incomes.length > 0),
      expenses: monthsList.some((month) => month.expenses.length > 0),
      account: ledger.accounts.length > 0,
      pay: Number(ledger.taxProfile.grossAnnualSalary) > 0,
      goal: ledger.goals.length > 0,
      imported: ledger.importBatches.length > 0,
    };
  }, [ledger.months, ledger.accounts, ledger.goals, ledger.importBatches, ledger.taxProfile.grossAnnualSalary]);

  // Which specialist pages sit in the sidebar. See navTools.ts.
  const [navTools, setNavTools] = useState<NavToolsPrefs | null>(readNavTools);
  const [toolsTrayOpen, setToolsTrayOpen] = useState(false);
  useEffect(() => {
    if (!hydrated || navTools) return;
    const hasData = Object.values(setupProgress).some(Boolean);
    const initial = { pinned: initialPinned(hasData), seen: [] };
    setNavTools(initial);
    writeNavTools(initial);
  }, [hydrated, navTools, setupProgress]);
  const toolPrefs: NavToolsPrefs = navTools ?? { pinned: [...TOOL_VIEWS], seen: [] };
  const suggestedTools = useMemo(
    () =>
      toolSuggestions({
        hasIncome: setupProgress.income,
        salaryEntered: setupProgress.pay,
        debtCount: ledger.accounts.filter((account) => isDebtClass(account) && account.balance > 0).length,
        monthlySurplus: projection.monthlySurplus,
        hasGoals: ledger.goals.length > 0,
      }),
    [setupProgress.income, setupProgress.pay, ledger.accounts, projection.monthlySurplus, ledger.goals.length],
  );
  function updateNavTools(change: (prefs: NavToolsPrefs) => NavToolsPrefs) {
    const next = change(toolPrefs);
    setNavTools(next);
    writeNavTools(next);
  }
  function setToolPinned(tool: ToolView, pinned: boolean) {
    updateNavTools((prefs) => ({
      ...prefs,
      pinned: pinned ? TOOL_VIEWS.filter((t) => t === tool || prefs.pinned.includes(t)) : prefs.pinned.filter((t) => t !== tool),
    }));
    track("nav_tool", { tool, action: pinned ? "add" : "remove" });
  }
  function toggleToolsTray() {
    if (!toolsTrayOpen) {
      // Opening the list shows every current suggestion, so the badge is cleared.
      const shown = TOOL_VIEWS.filter((tool) => suggestedTools[tool]);
      if (shown.some((tool) => !toolPrefs.seen.includes(tool))) {
        updateNavTools((prefs) => ({ ...prefs, seen: TOOL_VIEWS.filter((t) => shown.includes(t) || prefs.seen.includes(t)) }));
      }
    }
    setToolsTrayOpen((open) => !open);
  }

  useEffect(() => {
    let alive = true;

    async function hydrate() {
      try {
        const stored = await loadLedgerState();
        if (!alive) return;
        if (DEV_SAMPLE_COUNTRY) {
          loadSampleData(DEV_SAMPLE_COUNTRY);
          return;
        }
        // Successful loads are silent — startup toasts were noise.
        if (stored) {
          storedLedgerRef.current = true;
          setLedger(normalizeState(stored));
        } else if (DEV_AUTO_SAMPLE) {
          loadSampleData(detectCountryFromBrowser());
        }
      } catch {
        setToast("Storage unavailable — changes won't survive a refresh");
        setSaveState("offline");
      } finally {
        if (alive) {
          setHydrated(true);
        }
      }
    }

    hydrate();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadSession() {
      if (!supabase) {
        setAuthLoading(false);
        return;
      }

      try {
        const currentSession = await getCurrentSession();
        if (alive) {
          authUserIdRef.current = currentSession?.user?.id ?? null;
          identifyAnalytics(authUserIdRef.current);
          setSession(currentSession);
        }
      } catch {
        if (alive) setToast("Auth check failed");
      } finally {
        if (alive) setAuthLoading(false);
      }
    }

    void loadSession();
    const subscription = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      // Supabase re-emits SIGNED_IN/TOKEN_REFRESHED on tab refocus; only
      // re-open the vault when the signed-in user actually changes.
      const nextUserId = nextSession?.user?.id ?? null;
      if (authUserIdRef.current !== nextUserId) {
        authUserIdRef.current = nextUserId;
        setCloudHydrated(false);
        identifyAnalytics(nextUserId);
        if (nextUserId) track("signed_in");
      }
    }).data.subscription;

    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !user) return;
    // Narrowed copy: `user` from the closure is nullable again inside the async body.
    const activeUser = user;
    let alive = true;

    async function hydrateCloudLedger() {
      setSaveState("loading");
      try {
        await upsertUserProfile(activeUser);
        const cloudState = await loadCloudLedgerState();
        if (!alive) return;

        if (cloudState) {
          const normalizedCloud = normalizeState(cloudState);
          if (hasLocalData(ledger)) {
            // Only show conflict modal if the two sides are genuinely different.
            // If they're identical (e.g. same device, same session) silently adopt cloud.
            if (statesAreEquivalent(ledger, normalizedCloud)) {
              setLedger(normalizedCloud);
              setToast("Cloud data restored");
            } else {
              setSyncConflict({ local: ledger, cloud: normalizedCloud });
              return;
            }
          } else {
            setLedger(normalizedCloud);
            setToast("Cloud data restored");
          }
        } else {
          await saveCloudLedgerState(activeUser.id, ledger);
          if (!alive) return;
          setToast("Data backed up to cloud");
        }

        setCloudHydrated(true);
        setSaveState("saved");
      } catch {
        if (!alive) return;
        setCloudHydrated(true);
        setSaveState("offline");
        setToast("Cloud unavailable — working offline");
      }
    }

    void hydrateCloudLedger();

    return () => {
      alive = false;
    };
  }, [hydrated, user?.id]);

  // Returning users are told once that PDF statements now import directly. Someone
  // opening the app for the first time after the feature shipped has nothing to be
  // told, so the flag is stamped straight away and the notice never appears for them.
  useEffect(() => {
    if (!hydrated || showLanding || readFlag(PDF_NOTICE_KEY)) return;
    const hasData = setupProgress.income || setupProgress.expenses || setupProgress.account || setupProgress.imported;
    const returning = storedLedgerRef.current && (hasData || visitCount > 1);
    if (returning) setShowPdfNotice(true);
    else writeFlag(PDF_NOTICE_KEY);
  }, [hydrated, showLanding]);

  function dismissPdfNotice(action: "dismiss" | "import") {
    writeFlag(PDF_NOTICE_KEY);
    setShowPdfNotice(false);
    track("pdf_notice", { action });
    if (action === "import") {
      setActiveView("settings");
      csvInputRef.current?.click();
    }
  }

  // Nudge unsigned-in users to back up — but not in their first minutes.
  // Interrupting a brand-new user mid-setup cost more than the nudge earned.
  useEffect(() => {
    if (user || !hydrated) return;
    const timer = window.setTimeout(() => {
      if (!nudgeDismissedRef.current) setShowSyncNudge(true);
    }, 300_000);
    return () => clearTimeout(timer);
  }, [user, hydrated]);

  useEffect(() => {
    if (!hydrated || authLoading || (user && !cloudHydrated)) return;

    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      saveLedgerState(ledger)
        .then(async () => {
          if (user) {
            await saveCloudLedgerState(user.id, ledger);
          }
          setSaveState("saved");
        })
        .catch(() => {
          setSaveState("offline");
          setToast(user ? "Cloud sync paused — changes kept on this device" : "Saved in this browser only");
        });
    }, 240);

    return () => window.clearTimeout(timeout);
  }, [ledger, hydrated, authLoading, cloudHydrated, user?.id]);

  useEffect(() => {
    try {
      localStorage.setItem(INCOME_SORT_KEY, incomeSort);
    } catch {
      // localStorage unavailable — the order simply won't persist.
    }
  }, [incomeSort]);

  // Apply the theme to <html> so every surface (landing, auth gate, modals) picks
  // it up, persist the choice, and keep the browser chrome colour in step.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // localStorage unavailable — the theme simply won't persist.
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#051424" : "#eef1f8");
  }, [theme]);

  // Static content pages (guides, tools, privacy) link "Contact us" to /?feedback=1.
  // Pick that up on load, open the feedback modal, then strip the param from the URL
  // so a refresh doesn't reopen it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    if (params.has("feedback")) {
      setShowFeedbackModal(true);
      params.delete("feedback");
      changed = true;
    }
    if (params.has("sample")) {
      params.delete("sample");
      changed = true;
    }
    // Static pages tag their CTAs with ?ref=<page> so we can see which guides,
    // calculators and comparisons actually send people into the app.
    const ref = params.get("ref");
    if (ref !== null) {
      const clean = ref.replace(/[^a-z0-9_-]/gi, "").slice(0, 60);
      if (clean) {
        track("landing_ref", { ref: clean });
        try {
          if (!localStorage.getItem("it_first_ref")) localStorage.setItem("it_first_ref", clean);
        } catch {
          // Storage unavailable; attribution is best-effort.
        }
      }
      params.delete("ref");
      changed = true;
    }
    if (changed) {
      const query = params.toString();
      const url = window.location.pathname + (query ? `?${query}` : "") + window.location.hash;
      window.history.replaceState(null, "", url);
    }
  }, []);

  // Auto-dismiss the "imported" toast after 5 seconds. The user can still undo from the
  // settings import history; they can also close it early with the X button.
  useEffect(() => {
    if (!lastImportAction) return;
    const timer = window.setTimeout(() => setLastImportAction(null), 5000);
    return () => window.clearTimeout(timer);
  }, [lastImportAction]);

  // First-run setup: once everything has hydrated (local and, when signed in,
  // cloud), open the wizard for anyone who has never completed it and has no
  // data yet. Tutorials no longer auto-pop on every page — the wizard plus the
  // dashboard checklist replace that; tutorials stay replayable from the sidebar.
  useEffect(() => {
    if (showLanding || !hydrated || authLoading) return;
    if (user && !cloudHydrated) return;
    if (readFlag(ONBOARDING_KEY)) return;
    if (hasLocalData(ledger)) {
      // Existing user from before the wizard existed — never interrupt them.
      writeFlag(ONBOARDING_KEY);
      return;
    }
    setOnboardingOpen(true);
    // Deliberately not keyed on `ledger`: the gate should only re-evaluate when
    // hydration/auth state settles, not on every keystroke afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLanding, hydrated, authLoading, user?.id, cloudHydrated]);

  function finishOnboarding(result: OnboardingResult, meta: { completed: boolean; skippedSteps: number }) {
    writeFlag(ONBOARDING_KEY);
    setOnboardingOpen(false);
    const added = result.incomes.length + result.expenses.length + result.accounts.length + (result.goal ? 1 : 0);

    if (added > 0) {
      const now = new Date().toISOString();
      updateLedger((current) => {
        const monthKey = current.selectedMonth;
        const month = current.months[monthKey] ?? { incomes: [], expenses: [], note: "" };
        const incomes = [
          ...month.incomes,
          ...result.incomes.map((row, index) => ({
            id: createId("income"),
            source: row.source,
            amount: row.amount,
            color: colors[(month.incomes.length + index) % colors.length],
            recurring: true,
            categorySource: "user" as const,
          })),
        ];
        const expenses = [
          ...month.expenses,
          ...result.expenses.map((row, index) => ({
            id: createId("expense"),
            name: row.name,
            category: row.category,
            amount: row.amount,
            color: colors[(month.expenses.length + index) % colors.length],
            recurring: true,
            categorySource: "user" as const,
          })),
        ];
        const accounts = [
          ...current.accounts,
          ...result.accounts.map((row, index) => ({
            id: createId("account"),
            name: row.name,
            accountClass: row.accountClass,
            type: row.type,
            ...(row.accountClass === "debt"
              ? {}
              : {
                  taxTreatment: defaultTaxTreatment(regionOf(result.country), row.accountClass, row.type),
                  contributionSource: defaultContributionSource(regionOf(result.country), row.accountClass, row.type),
                }),
            balance: row.balance,
            rate: row.accountClass === "investment" ? current.assumedInvestmentReturn : 0,
            promoRate: 0,
            promoMonths: 0,
            monthlyContribution: 0,
            creditLimit: 0,
            minimumPayment: 0,
            dueDay: 1,
            balanceAsOf: getMonthKey(),
            promoAsOf: getMonthKey(),
            balanceSetOn: isoToday(),
            ledgerOffset: 0,
            includeInNetWorth: true,
            // Placeholder; distinctAccountColors below gives each a different hue.
            color: "",
            note: "",
          })),
        ];
        const goals = result.goal
          ? [
              ...current.goals,
              {
                id: createId("goal"),
                name: result.goal.name,
                target: result.goal.target,
                saved: result.goal.saved,
                color: colors[current.goals.length % colors.length],
                priority: current.goals.length + 1,
                // "fill" needs no further configuration: the goal absorbs spare
                // monthly surplus, so the planner can forecast a finish date.
                fundingMode: "fill" as const,
                monthlyAmount: 0,
                deadlineMonths: 0,
                interestRate: 0,
                note: "",
                createdAt: now,
              },
            ]
          : current.goals;

        return {
          ...current,
          country: result.country,
          currency: result.currency,
          months: { ...current.months, [monthKey]: { ...month, incomes, expenses } },
          accounts: distinctAccountColors(accounts),
          goals,
        };
      });
      setToast("Setup saved — your dashboard is live");
    } else if (result.country !== ledger.country || result.currency !== ledger.currency) {
      // Nothing else entered, but the country/currency choice still counts.
      updateLedger((current) => ({ ...current, country: result.country, currency: result.currency }));
    }

    setActiveView("dashboard");
    track(meta.completed ? "onboarding_completed" : "onboarding_skipped", {
      added: bucketCount(added),
      skipped_steps: meta.skippedSteps,
    });
  }

  function closeTutorial() {
    setTutorialView((current) => {
      if (current) {
        const seen = readSeenTutorials();
        seen.add(current);
        try {
          localStorage.setItem(TUTORIAL_SEEN_KEY, JSON.stringify([...seen]));
        } catch {
          // localStorage unavailable — tutorial will simply show again next time.
        }
      }
      return null;
    });
  }

  // The status toast has always been *set* throughout the app but never shown.
  // Render it briefly on every change — it's how rule-saved / seeded / import
  // feedback reaches the user. The initial "Loading…" value is skipped.
  useEffect(() => {
    if (toastFirstRenderRef.current) {
      toastFirstRenderRef.current = false;
      return;
    }
    if (!toast) return;
    setToastVisible(true);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastVisible(false), 3200);
  }, [toast]);

  useEffect(() => {
    if (!accountToast) return;
    const timer = window.setTimeout(() => setAccountToast(null), 1400);
    return () => window.clearTimeout(timer);
  }, [accountToast]);

  useEffect(() => {
    if (!categoryMenu) return;

    const openedAt = performance.now();
    function closeMenu() {
      setCategoryMenu(null);
    }
    // Opening the menu can itself nudge the page (touch browsers settle the tap target into view
    // a frame later); only scrolling that happens after that counts as "scrolled away".
    function closeOnScroll() {
      if (performance.now() - openedAt > 400) closeMenu();
    }

    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeOnScroll, true);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [categoryMenu]);

  function updateLedger(updater: (current: LedgerState) => LedgerState) {
    // Every change re-syncs scheduled debt payments, so an account edit, a new month, or an
    // import that brings in the real payment all leave exactly one payment row per debt.
    setLedger((current) => ({
      ...syncLedgerLinks(updater(current)),
      lastSavedAt: new Date().toISOString(),
    }));
  }

  // The Insights widgets' own data (looks, dismissed flags, notes, to-dos) lives in the ledger.
  function patchInsights(updater: (current: InsightsState) => InsightsState) {
    updateLedger((current) => ({ ...current, insights: updater(normalizeInsightsState(current.insights)) }));
  }

  function updateAllocation(patch: Partial<AllocationSettings>) {
    updateLedger((current) => ({ ...current, allocation: { ...current.allocation, ...patch } }));
    const field = Object.keys(patch)[0];
    if (field) track("allocation_changed", { field, ...(field === "priority" || field === "savingsPriority" ? { value: String(patch[field as keyof AllocationSettings]) } : {}) });
  }

  function updateCurrentMonth(updater: (month: MonthBudget) => MonthBudget) {
    updateLedger((current) => ({
      ...current,
      months: {
        ...current.months,
        [current.selectedMonth]: updater(current.months[current.selectedMonth] ?? seedMonthFromPrevious()),
      },
    }));
  }

  function changeMonth(offset: number) {
    if (offset > 0 && !ledger.months[shiftMonth(ledger.selectedMonth, offset)]) {
      const seedCount =
        currentMonth.incomes.filter((income) => income.recurring).length +
        currentMonth.expenses.filter((expense) => expense.recurring).length;
      if (seedCount > 0) track("month_seeded", { count: seedCount });
    }
    updateLedger((current) => {
      const nextKey = shiftMonth(current.selectedMonth, offset);
      const months = current.months[nextKey]
        ? current.months
        : {
            ...current.months,
            // Moving forward auto-seeds the new month with the recurring entries;
            // moving back to an untouched past month stays empty.
            [nextKey]: seedMonthFromPrevious(current.months[current.selectedMonth], {
              fromMonthKey: current.selectedMonth,
              toMonthKey: nextKey,
            }),
          };

      return {
        ...current,
        selectedMonth: nextKey,
        months,
      };
    });
    setToast("Month switched");
  }

  // A row typed into the current month happened today, so it moves its account's balance now.
  // Rows typed into another month keep no day (past months are already in typed balances; future
  // ones count from the 1st when that month arrives).
  function newEntryDate(): string | undefined {
    return ledger.selectedMonth === getMonthKey() ? isoToday() : undefined;
  }

  // Clicking a transaction's dot moves it to the next account; its money moves with it.
  function cycleEntryAccount(kind: "income" | "expense", id: string) {
    const entry =
      kind === "income" ? currentMonth.incomes.find((income) => income.id === id) : currentMonth.expenses.find((expense) => expense.id === id);
    const nextId = nextAccountId(ledger.accounts, entry?.accountId);
    const account = ledger.accounts.find((item) => item.id === nextId);
    if (!account) return;
    if (kind === "income") updateIncome(id, { accountId: account.id });
    else updateExpense(id, { accountId: account.id });
    showAccountToast(account);
  }

  function showAccountToast(account: Account) {
    setToastVisible(false);
    setAccountToast({ name: account.name, color: account.color, stamp: Date.now() });
  }

  function addIncome() {
    const amount = Number(incomeDraft.amount);
    if (!incomeDraft.source.trim()) {
      setToast("Add a source and amount");
      focusNextFrame(incomeSourceInputRef);
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setToast("Add a source and amount");
      focusNextFrame(incomeAmountInputRef);
      return;
    }

    updateCurrentMonth((month) => ({
      ...month,
      incomes: [
        ...month.incomes,
        {
          id: createId("income"),
          source: incomeDraft.source.trim(),
          amount,
          color: colors[month.incomes.length % colors.length],
          recurring: true,
          date: newEntryDate(),
          accountId: guessAccountId(ledger, "income", incomeDraft.source),
        },
      ],
    }));
    setIncomeDraft(initialIncomeDraft);
    setToast("Income added");
    track("entry_added", { method: "manual", kind: "income" });
    focusNextFrame(incomeSourceInputRef);
  }

  function addExpense() {
    const amount = Number(expenseDraft.amount);
    if (!expenseDraft.name.trim()) {
      setToast("Add an expense name and amount");
      focusNextFrame(expenseNameInputRef);
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setToast("Add an expense name and amount");
      focusNextFrame(expenseAmountInputRef);
      return;
    }

    // Merchant memory auto-fills what the user already taught us: a repeat
    // merchant lands pre-categorised with its usual color and recurring flag.
    const remembered = merchantMemory.find("expense", expenseDraft.name);
    updateCurrentMonth((month) => ({
      ...month,
      expenses: [
        ...month.expenses,
        {
          id: createId("expense"),
          name: expenseDraft.name.trim(),
          amount,
          category: remembered?.category ?? "",
          color: remembered?.category ? remembered.color : colors[(month.expenses.length + 2) % colors.length],
          recurring: remembered?.recurring ?? true,
          categorySource: remembered?.category ? ("rule" as const) : undefined,
          date: newEntryDate(),
          accountId: guessAccountId(ledger, "expense", expenseDraft.name),
        },
      ],
    }));
    setExpenseDraft(initialExpenseDraft);
    setToast(remembered?.category ? `Expense added to ${remembered.category}` : "Expense added");
    track("entry_added", { method: "manual", kind: "expense", category_prefilled: Boolean(remembered?.category) });
    focusNextFrame(expenseNameInputRef);
  }

  function addQuickEntry() {
    if (!quickAddPreview) return;
    if (!quickAddPreview.ok) {
      setToast(quickAddPreview.error);
      return;
    }

    const draft = quickAddPreview.draft;
    updateCurrentMonth((month) => {
      if (draft.kind === "income") {
        return {
          ...month,
          incomes: [
            ...month.incomes,
            {
              id: createId("income"),
              source: capitalizeFirst(draft.description),
              amount: draft.amount,
              color: draft.color ?? colors[month.incomes.length % colors.length],
              recurring: draft.recurring,
              date: draft.date ?? newEntryDate(),
              accountId: guessAccountId(ledger, "income", draft.description),
            },
          ],
        };
      }
      return {
        ...month,
        expenses: [
          ...month.expenses,
          {
            id: createId("expense"),
            name: capitalizeFirst(draft.description),
            amount: draft.amount,
            category: draft.category === "Unsorted" ? "" : draft.category,
            color: draft.color ?? colors[(month.expenses.length + 2) % colors.length],
            recurring: draft.recurring,
            date: draft.date ?? newEntryDate(),
            accountId: guessAccountId(ledger, "expense", draft.description),
            categorySource: draft.category && draft.category !== "Unsorted" ? draft.categorySource : undefined,
          },
        ],
      };
    });
    setQuickAddInput("");
    setToast(draft.kind === "income" ? "Income added" : draft.category && draft.category !== "Unsorted" ? `Added to ${draft.category}` : "Expense added");
    track("entry_added", { method: "quick_add", kind: draft.kind, category_prefilled: Boolean(draft.category && draft.category !== "Unsorted") });
  }

  function updateIncome(id: string, patch: Partial<IncomeEntry>) {
    updateCurrentMonth((month) => ({
      ...month,
      incomes: month.incomes.map((income) => (income.id === id ? { ...income, ...patch } : income)),
    }));
  }

  function updateExpense(id: string, patch: Partial<ExpenseEntry>) {
    updateCurrentMonth((month) => ({
      ...month,
      expenses: month.expenses.map((expense) => {
        if (expense.id !== id) return expense;
        // Typing a different amount into a planned debt payment confirms what was actually paid.
        const confirms = expense.scheduledPayment && "amount" in patch && patch.amount !== expense.amount;
        return { ...expense, ...patch, ...(confirms ? { scheduledPayment: false } : {}) };
      }),
    }));
  }

  // Called when a name edit is committed (blur or Enter). If other transactions
  // carry the old name, or a rename rule produces it, offer to rename them all.
  function offerRenameAll(kind: NameKind, entryId: string, previousName: string) {
    const entry =
      kind === "income"
        ? currentMonth.incomes.find((income) => income.id === entryId)
        : currentMonth.expenses.find((expense) => expense.id === entryId);
    if (!entry) return;
    const from = previousName.trim();
    const to = ("source" in entry ? entry.source : entry.name).trim();
    if (!from || !to || from === to) return;

    const others = countSameName(ledger, kind, from, entryId);
    const hasRule = Boolean(findRuleTargeting(ledger.nameRules, kind, from));
    if (!others.count && !hasRule) return;
    setRenamePrompt({ kind, entryId, from, to, others: others.count, months: others.months });
  }

  function confirmRenameAll(prompt: RenamePrompt) {
    const preview = renameEverywhere(ledger, prompt.kind, prompt.from, prompt.to);
    updateLedger((current) => renameEverywhere(current, prompt.kind, prompt.from, prompt.to).state);
    setRenamePrompt(null);
    const others = Math.max(0, preview.renamed - 1);
    setToast(
      others
        ? `Renamed ${others} more to “${prompt.to.trim()}” — new imports will match`
        : `New “${prompt.from}” imports will be named “${prompt.to.trim()}”`,
    );
    track("rename_all", { renamed: bucketCount(preview.renamed) });
  }

  function removeNameRule(id: string) {
    updateLedger((current) => ({ ...current, nameRules: current.nameRules.filter((rule) => rule.id !== id) }));
    setToast("Rename rule removed — new imports keep their bank name");
  }

  function removeIncome(id: string) {
    const entry = currentMonth.incomes.find((income) => income.id === id);
    updateLedger((current) => stopSeededRepeat(current, entry?.seededFrom, "income"));
    updateCurrentMonth((month) => ({
      ...month,
      incomes: month.incomes.filter((income) => income.id !== id),
    }));
    setToast(entry?.seededFrom ? "Removed — won’t auto-add next month" : "Income removed");
  }

  function removeExpense(id: string) {
    const entry = currentMonth.expenses.find((expense) => expense.id === id);
    if (entry?.scheduledPayment && entry.debtAccountId) {
      // A planned debt payment comes from the account, not from last month's row. Removing it
      // means "not paying this one this month"; the account's monthly payment stays as it was.
      const accountId = entry.debtAccountId;
      const accountName = ledger.accounts.find((account) => account.id === accountId)?.name ?? "this account";
      updateLedger((current) => {
        const skipped = skipScheduledPayment(current, accountId, current.selectedMonth);
        const month = skipped.months[current.selectedMonth];
        if (!month) return skipped;
        return {
          ...skipped,
          months: { ...skipped.months, [current.selectedMonth]: { ...month, expenses: month.expenses.filter((expense) => expense.id !== id) } },
        };
      });
      setToast(`Skipped ${accountName} for ${formatMonth(ledger.selectedMonth)}. Set its monthly payment to 0 on Accounts to stop it.`);
      return;
    }
    updateLedger((current) => stopSeededRepeat(current, entry?.seededFrom, "expense"));
    updateCurrentMonth((month) => ({
      ...month,
      expenses: month.expenses.filter((expense) => expense.id !== id),
    }));
    setToast(entry?.seededFrom ? "Removed — won’t auto-add next month" : "Expense removed");
  }

  function cancelSubscription(subscription: Subscription, cancelledAt: string) {
    updateLedger((current) => markSubscriptionCancelled(current, subscription, cancelledAt));
    setToast(t(`${subscription.label} marked cancelled — it won't be copied into new months`));
    track("subscription_cancelled", { cadence: subscription.cadence, detected: subscription.status === "stopped" });
  }

  function addAccount() {
    const name = accountDraft.name.trim();
    if (!name) {
      setToast("Add an account name");
      return;
    }

    const cls = accountDraft.accountClass;
    const isDebt = cls === "debt";
    const type = accountDraft.type;
    // Investment accounts default their rate to the global assumed return when left blank.
    const fallbackRate = cls === "investment" ? ledger.assumedInvestmentReturn : 0;
    const rate = accountDraft.rate.trim() === "" ? fallbackRate : Math.max(-50, Number(accountDraft.rate) || 0);
    // Tax treatment and where contributions come from follow the type; both can be changed later.
    const planDefaults: Partial<Account> = isDebt
      ? type === "student-loan" && region === "US"
        ? { studentLoanType: "federal", repaymentPlan: "standard" }
        : {}
      : { taxTreatment: defaultTaxTreatment(region, cls, type), contributionSource: defaultContributionSource(region, cls, type) };

    updateLedger((current) => ({
      ...current,
      accounts: [
        ...current.accounts,
        {
          id: createId("account"),
          name,
          accountClass: cls,
          type: accountDraft.type,
          balance: Math.max(0, Number(accountDraft.balance) || 0),
          rate,
          promoRate: Math.max(0, Number(accountDraft.promoRate) || 0),
          promoMonths: clampWholeNumber(Number(accountDraft.promoMonths) || 0, 120),
          monthlyContribution: isDebt ? 0 : Math.max(0, Number(accountDraft.monthlyContribution) || 0),
          creditLimit: isDebt && !isLoanType(type) ? Math.max(0, Number(accountDraft.creditLimit) || 0) : 0,
          minimumPayment: isDebt ? Math.max(0, Number(accountDraft.minimumPayment) || 0) : 0,
          dueDay: isDebt ? clampDueDay(Number(accountDraft.dueDay) || 1) : 1,
          balanceAsOf: getMonthKey(),
          promoAsOf: getMonthKey(),
          balanceSetOn: isoToday(),
          ledgerOffset: 0,
          includeInNetWorth: true,
          color: pickAccountColor(current.accounts.map((account) => account.color)),
          note: "",
          ...planDefaults,
        },
      ],
    }));
    setAccountDraft({ ...initialAccountDraft, accountClass: cls, type: accountDraft.type });
    setToast(isDebt ? "Debt account added" : "Account added");
  }

  function updateAccount(id: string, patch: Partial<Account>) {
    // Editing the balance is the "true up against my statement" gesture: re-anchor the
    // snapshot to now so the debt roll-forward and the ledger's movements restart from the value
    // just typed. Promo months work the same way: the typed number is "months left as of now".
    const anchored: Partial<Account> = { ...patch };
    if ("balance" in patch) {
      anchored.balanceAsOf = getMonthKey();
      anchored.balanceSetOn = isoToday();
      anchored.ledgerOffset = 0;
    }
    if ("promoMonths" in patch) anchored.promoAsOf = getMonthKey();
    updateLedger((current) => {
      let accounts = current.accounts.map((account) => (account.id === id ? { ...account, ...anchored } : account));
      if ("balance" in patch) {
        // Today's ledger rows on this account are already in the figure the user typed.
        const counted = countedFlowFor(id, accounts, current.months);
        accounts = accounts.map((account) => (account.id === id ? { ...account, ledgerOffset: -counted } : account));
      }
      return { ...current, accounts };
    });
  }

  function removeAccount(id: string) {
    updateLedger((current) => ({
      ...current,
      accounts: current.accounts.filter((account) => account.id !== id),
    }));
    setToast("Account removed");
  }

  // Replaces the ledger with the sample for a country (development aid; see sampleData.ts).
  function loadSampleData(country: CountryCode) {
    writeFlag(ONBOARDING_KEY);
    try {
      localStorage.setItem("hasSeenLanding", "1");
    } catch {
      // Storage unavailable; the sample still loads.
    }
    setLedger(normalizeState(buildSampleLedger(country)));
    setShowLanding(false);
    setToast(country === "US" ? "US sample data loaded" : "UK sample data loaded");
  }

  function changeCurrency(currency: CurrencyCode) {
    updateLedger((current) => ({ ...current, currency }));
    setToast(`Currency set to ${currency}`);
  }

  // Picking a country also sets its currency ("Other" keeps whatever is set — pick one in Settings).
  function changeCountry(country: CountryCode) {
    const option = countryOption(country);
    updateLedger((current) => ({ ...current, country, currency: option.currency ?? current.currency }));
    setToast(option.region === "US" ? "Switched to the US experience" : country === "GB" ? "Switched to the UK experience" : `Country set to ${option.label}`);
    track("country_changed", { country });
  }

  function updateLayout(page: LayoutPage, updater: (layout: PageLayout) => PageLayout) {
    setDashboardLayout((current) => {
      const next = updater(current);
      if (next !== current) saveLayout(page, region, next);
      return next;
    });
  }

  function addGoal() {
    const newGoal: SavingsGoal = {
      id: createId("goal"),
      name: "",
      target: 0,
      saved: 0,
      color: colors[ledger.goals.length % colors.length],
      priority: ledger.goals.length + 1,
      fundingMode: "fixed",
      monthlyAmount: 0,
      deadlineMonths: 0,
      interestRate: 0,
      note: "",
      createdAt: new Date().toISOString(),
    };
    updateLedger((current) => ({ ...current, goals: [...current.goals, newGoal] }));
    return newGoal.id;
  }

  function updateGoal(id: string, patch: Partial<SavingsGoal>) {
    updateLedger((current) => ({
      ...current,
      goals: current.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  }

  function removeGoal(id: string) {
    updateLedger((current) => ({
      ...current,
      goals: current.goals.filter((g) => g.id !== id).map((g, i) => ({ ...g, priority: i + 1 })),
      ledgerGoalId: current.ledgerGoalId === id ? null : current.ledgerGoalId,
    }));
    setToast("Goal removed");
  }

  function reorderGoal(id: string, direction: "up" | "down") {
    updateLedger((current) => {
      const sorted = [...current.goals].sort((a, b) => a.priority - b.priority);
      const idx = sorted.findIndex((g) => g.id === id);
      if (idx < 0) return current;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return current;
      const newOrder = [...sorted];
      [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
      return {
        ...current,
        goals: newOrder.map((g, i) => ({ ...g, priority: i + 1 })),
      };
    });
  }

  function assignCategoryByDrop(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;

    updateCurrentMonth((month) => {
      const source = month.expenses.find((expense) => expense.id === sourceId);
      const target = month.expenses.find((expense) => expense.id === targetId);
      if (!source || !target) return month;

      const category = target.category || source.category || nextCategoryName(month.expenses);
      const color = target.category ? target.color : source.category ? source.color : randomCategoryColor(month.expenses);

      return {
        ...month,
        expenses: month.expenses.map((expense) => {
          if (expense.id === source.id || expense.id === target.id) {
            return { ...expense, category, color };
          }
          return expense;
        }),
      };
    });
    setToast("Category created");
    setGroupingSourceId(null);
  }

  function assignExpenseToCategory(sourceId: string, category: string) {
    const correctedExpense = currentMonth.expenses.find((expense) => expense.id === sourceId);

    updateCurrentMonth((month) => {
      const source = month.expenses.find((expense) => expense.id === sourceId);
      const remaining = month.expenses.filter((expense) => expense.id !== sourceId);
      const categoryAnchor = remaining.find((expense) => expense.category === category) ?? (source?.category === category ? source : undefined);
      if (!source || !categoryAnchor) return month;

      const movedExpense = { ...source, category, color: categoryAnchor.color, categorySource: "user" as const };
      const lastCategoryIndex = findLastExpenseIndex(remaining, (expense) => expense.category === category);
      const insertIndex = lastCategoryIndex >= 0 ? lastCategoryIndex + 1 : remaining.length;
      return {
        ...month,
        expenses: [...remaining.slice(0, insertIndex), movedExpense, ...remaining.slice(insertIndex)],
      };
    });

    // A correction on an imported row is consent to learn: save the rule silently
    // and sweep other not-yet-user-sorted matches into the same category, so the
    // same fix is never needed twice. Manual (typed) entries don't create rules —
    // their names are too free-form to generalize from.
    if (correctedExpense?.imported && category.trim() && category !== "Unsorted" && correctedExpense.category !== category) {
      const description = correctedExpense.imported.originalDescription || correctedExpense.name;
      // Preview against the current snapshot for the toast (state updaters run at
      // render time, not call time) — same pattern as addTransferRule.
      const preview = learnCategoryRule(ledger, description, category, "expense", sourceId);
      updateLedger((current) => learnCategoryRule(current, description, category, "expense", sourceId).state);
      track("rule_learned", { retro_applied: preview.retroactivelyApplied });
      setToast(
        preview.retroactivelyApplied > 0
          ? `Rule saved — also sorted ${preview.retroactivelyApplied} matching`
          : "Moved into category · rule saved",
      );
    } else {
      setToast("Moved into category");
    }
    setGroupingSourceId(null);
  }

  // Dragging while an automatic order is showing adopts what's on screen as the
  // custom order first, so the row lands where it was dropped and stays there.
  function reorderIncome(sourceId: string, targetId: string, edge: "before" | "after") {
    if (sourceId === targetId) return;
    updateCurrentMonth((month) => ({ ...month, incomes: moveEntry(orderIncomes(month.incomes, incomeSort), sourceId, targetId, edge) }));
    setToast(incomeSort === "custom" ? "Income reordered" : "Income reordered · now using your order");
    setIncomeSort("custom");
  }

  function moveIncomeByKeyboard(id: string, direction: -1 | 1) {
    const index = visibleIncomes.findIndex((income) => income.id === id);
    const neighbour = visibleIncomes[index + direction];
    if (index === -1 || !neighbour) return;
    reorderIncome(id, neighbour.id, direction === -1 ? "before" : "after");
    // React moves the row's DOM node, which drops focus; put it back on the handle.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-income-id="${id}"] .dragHandle`)?.focus());
  }

  function previewIncomeDrop(event: DragEvent<HTMLDivElement>, target: IncomeEntry) {
    if (!draggingIncomeId) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (draggingIncomeId === target.id) {
      setIncomeDropPreview(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const edge = event.clientY - rect.top < rect.height / 2 ? "before" : "after";
    setIncomeDropPreview((current) => (current?.targetId === target.id && current.edge === edge ? current : { targetId: target.id, edge }));
  }

  function dropOnIncome(target: IncomeEntry) {
    if (draggingIncomeId && incomeDropPreview?.targetId === target.id) {
      reorderIncome(draggingIncomeId, target.id, incomeDropPreview.edge);
    }
    clearIncomeDragState();
  }

  function clearIncomeDragState() {
    setDraggingIncomeId(null);
    setIncomeDropPreview(null);
  }

  function reorderExpense(sourceId: string, targetId: string, edge: "before" | "after") {
    if (sourceId === targetId) return;

    let movedCategory: string | null = null;
    updateCurrentMonth((month) => {
      const source = month.expenses.find((expense) => expense.id === sourceId);
      const target = month.expenses.find((expense) => expense.id === targetId);
      if (!source || !target) return month;

      // Dropping next to a target also moves the item into that target's category. This is what
      // makes dragging out to the ungrouped zone work — the source adopts the empty category and
      // leaves its old group, instead of just shuffling array order while staying categorised.
      const moved =
        source.category === target.category
          ? source
          : { ...source, category: target.category, color: target.category ? target.color : source.color };
      movedCategory = moved.category;

      const remaining = month.expenses.filter((expense) => expense.id !== sourceId);
      const targetIndex = remaining.findIndex((expense) => expense.id === targetId);
      if (targetIndex === -1) return month;

      const insertIndex = edge === "before" ? targetIndex : targetIndex + 1;
      return {
        ...month,
        expenses: [...remaining.slice(0, insertIndex), moved, ...remaining.slice(insertIndex)],
      };
    });
    setToast(movedCategory === "" ? "Removed from category" : "Expense reordered");
    setGroupingSourceId(null);
  }

  function renameExpenseCategory(from: string, to: string) {
    if (from === to) return;
    updateCurrentMonth((month) => ({
      ...month,
      expenses: month.expenses.map((expense) => (expense.category === from ? { ...expense, category: to } : expense)),
    }));
    setCollapsedCategories((current) => {
      if (!current.has(from)) return current;
      const next = new Set(current);
      next.delete(from);
      next.add(to);
      return next;
    });
  }

  function deleteExpenseCategory(category: string) {
    updateCurrentMonth((month) => ({
      ...month,
      expenses: month.expenses.map((expense) => (expense.category === category ? { ...expense, category: "" } : expense)),
    }));
    setDropPreview(null);
    setGroupingSourceId(null);
    setCollapsedCategories((current) => {
      if (!current.has(category)) return current;
      const next = new Set(current);
      next.delete(category);
      return next;
    });
    setToast("Category removed");
  }

  function toggleCategoryCollapse(category: string) {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  function ungroupExpense(id: string) {
    updateCurrentMonth((month) => ({
      ...month,
      expenses: month.expenses.map((expense) => (expense.id === id ? { ...expense, category: "" } : expense)),
    }));
    setCategoryMenu(null);
    setToast("Removed from category");
  }

  function linkExpenseToDebt(id: string, debtAccountId: string | undefined) {
    const accountName = debtAccountId ? ledger.accounts.find((account) => account.id === debtAccountId)?.name : undefined;
    // A row is either a debt payment or a transfer into savings, never both.
    updateExpense(id, { debtAccountId, ...(debtAccountId ? { toAccountId: undefined } : {}) });
    setCategoryMenu(null);
    setToast(accountName ? `Counted as payment towards ${accountName}` : "Payment unlinked from debt account");
  }

  function linkExpenseToSavings(id: string, toAccountId: string | undefined) {
    const accountName = toAccountId ? ledger.accounts.find((account) => account.id === toAccountId)?.name : undefined;
    updateExpense(id, { toAccountId, ...(toAccountId ? { debtAccountId: undefined } : {}) });
    setCategoryMenu(null);
    setToast(accountName ? `Counted as money into ${accountName}` : "Unlinked from savings account");
  }

  function clearDragState() {
    setDraggingExpenseId(null);
    setDropPreview(null);
  }

  function previewExpenseDrop(event: DragEvent<HTMLDivElement>, target: ExpenseEntry) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";

    const sourceId = event.dataTransfer.getData("text/plain") || draggingExpenseId;
    if (!sourceId || sourceId === target.id) {
      setDropPreview(null);
      return;
    }

    if (target.category) {
      setDropPreview({ type: "category", category: target.category });
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const reorderBand = Math.max(16, rect.height * 0.28);

    if (y <= reorderBand) {
      setDropPreview({ type: "reorder", targetId: target.id, edge: "before" });
      return;
    }

    if (y >= rect.height - reorderBand) {
      setDropPreview({ type: "reorder", targetId: target.id, edge: "after" });
      return;
    }

    setDropPreview({ type: "combine", targetId: target.id });
  }

  function previewCategoryDrop(event: DragEvent<HTMLDivElement>, category: string) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";

    const sourceId = event.dataTransfer.getData("text/plain") || draggingExpenseId;
    if (sourceId) setDropPreview({ type: "category", category });
  }

  function dropOnExpense(sourceId: string, target: ExpenseEntry) {
    if (!sourceId || sourceId === target.id) {
      clearDragState();
      return;
    }

    if (dropPreview?.type === "reorder" && dropPreview.targetId === target.id) {
      reorderExpense(sourceId, target.id, dropPreview.edge);
    } else if (dropPreview?.type === "category" && target.category === dropPreview.category) {
      assignExpenseToCategory(sourceId, dropPreview.category);
    } else if (dropPreview?.type === "combine" && dropPreview.targetId === target.id) {
      assignCategoryByDrop(sourceId, target.id);
    } else if (target.category) {
      assignExpenseToCategory(sourceId, target.category);
    } else {
      assignCategoryByDrop(sourceId, target.id);
    }

    clearDragState();
  }

  function dropOnCategory(sourceId: string, category: string) {
    if (sourceId) assignExpenseToCategory(sourceId, category);
    clearDragState();
  }

  function handleDropLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDropPreview(null);
    }
  }

  function openCategoryMenu(event: ReactMouseEvent<HTMLDivElement>, expenseId: string) {
    event.preventDefault();
    event.stopPropagation();
    setDropPreview(null);
    setCategoryMenu({
      expenseId,
      x: Math.max(12, Math.min(event.clientX, window.innerWidth - 248)),
      y: Math.max(12, Math.min(event.clientY, window.innerHeight - 286)),
    });
  }

  function moveExpenseFromMenu(expenseId: string, category: string) {
    assignExpenseToCategory(expenseId, category);
    setCategoryMenu(null);
  }

  function exportJson() {
    downloadFile(`ledgerlite-${ledger.selectedMonth}.json`, JSON.stringify(ledger, null, 2), "application/json");
    setToast("JSON exported");
  }

  function exportCsv() {
    downloadFile(`ledgerlite-${ledger.selectedMonth}.csv`, buildCsvExport(ledger), "text/csv");
    setToast("CSV exported");
  }

  async function importJson(file: File) {
    try {
      const text = await file.text();
      const parsed = normalizeState(JSON.parse(text) as LedgerState);
      setLedger(parsed);
      setToast("Budget imported");
    } catch {
      setToast("Import failed");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  // One picker for every statement format. PDFs are sniffed from their bytes
  // (not just the extension) and read locally with pdf.js; everything else is text.
  async function importStatementFile(file: File) {
    try {
      const bytes = await file.arrayBuffer();
      if (looksLikePdf(bytes, file.name)) {
        setToast("Reading PDF…");
        const pages = await extractPdfPages(bytes);
        openImportReview({ kind: "pdf", pages }, file.name);
        return;
      }
      openImportReview({ kind: "text", text: new TextDecoder().decode(bytes) }, file.name);
    } catch (error) {
      if (error instanceof PdfImportError) {
        setImportReview({ fileName: file.name, rows: [], errors: [error.message], totalRows: 0, signInverted: false, canFlip: false, format: "pdf" });
        setToast("Couldn’t read this PDF");
        track("import_reviewed", { source: "pdf", rows: bucketCount(0), auto: 0, check: 0, needs: 0 });
      } else {
        setToast("Import failed");
      }
    } finally {
      if (csvInputRef.current) {
        csvInputRef.current.value = "";
      }
    }
  }

  // ── Stage E: bank feeds ──────────────────────────────────────────────────

  useEffect(() => {
    if (!isFeedsEnabled() || !user) return;
    let alive = true;

    async function bootstrapFeeds() {
      // Returning from the provider's hosted auth? Finish the connection first.
      const callbackCode = consumeFeedCallbackCode();
      if (callbackCode) {
        const connection = await completeBankConnection(callbackCode);
        if (connection && alive) {
          setToast(`${connection.display_name} connected`);
          track("feed_connected");
        }
      }

      const configured = await isFeedBackendConfigured();
      if (!alive || !configured) return;
      setFeedsReady(true);
      const [connections, staged] = await Promise.all([listBankConnections(), countStagedFeedRows()]);
      if (!alive) return;
      setBankConnections(connections);
      setStagedFeedCount(staged);
    }

    void bootstrapFeeds();
    return () => {
      alive = false;
    };
  }, [user]);

  async function connectBank() {
    setFeedsBusy(true);
    const url = await startBankConnection();
    if (url) {
      window.location.href = url;
      return;
    }
    setFeedsBusy(false);
    setToast("Couldn’t start the bank connection");
  }

  async function refreshFeedState() {
    const [connections, staged] = await Promise.all([listBankConnections(), countStagedFeedRows()]);
    setBankConnections(connections);
    setStagedFeedCount(staged);
  }

  async function syncBankFeeds() {
    setFeedsBusy(true);
    const summary = await syncFeedsNow();
    await refreshFeedState();
    setFeedsBusy(false);
    setToast(summary ? `Synced — ${summary.staged} new transaction${summary.staged === 1 ? "" : "s"}` : "Sync failed");
  }

  async function reviewBankFeed() {
    setFeedsBusy(true);
    const review = await fetchStagedFeedReview(ledger);
    setFeedsBusy(false);
    if (!review.rows.length) {
      setToast("No new bank transactions to review");
      setStagedFeedCount(0);
      return;
    }
    feedRowMapRef.current = review.feedIdByRowId;
    track("import_reviewed", {
      source: "feed",
      rows: bucketCount(review.rows.length),
      auto: review.rows.filter((row) => !row.duplicate && row.confidence >= 0.9).length,
      check: review.rows.filter((row) => !row.duplicate && row.confidence >= 0.6 && row.confidence < 0.9).length,
      needs: review.rows.filter((row) => row.duplicate || row.confidence < 0.6).length,
    });
    setImportReview({
      fileName: BANK_FEED_SOURCE_NAME,
      rows: matchDebtPaymentRows(review.rows, effectiveAccounts, moneyFormatter),
      errors: [],
      totalRows: review.total,
      signInverted: false,
      canFlip: false,
      accountId: suggestImportAccount(false),
      format: "feed",
    });
  }

  async function reconfirmBank(connectionId: string) {
    const connection = await reconfirmBankConnection(connectionId);
    if (connection) {
      setBankConnections((current) => current.map((item) => (item.id === connection.id ? connection : item)));
      setToast("Connection kept for another 90 days");
    }
  }

  async function disconnectBank(connectionId: string) {
    const ok = await disconnectBankConnection(connectionId);
    if (ok) {
      setBankConnections((current) => current.filter((item) => item.id !== connectionId));
      setToast("Bank disconnected — staged data deleted, your ledger is untouched");
      void countStagedFeedRows().then(setStagedFeedCount);
    }
  }

  async function importFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setToast("Clipboard is empty");
        return;
      }
      openImportReview({ kind: "text", text }, "Pasted transactions");
    } catch {
      setToast("Couldn’t read the clipboard — check browser permissions");
    }
  }

  // A card statement most likely belongs to a card; anything else to the default account.
  function suggestImportAccount(cardStatement: boolean): string | undefined {
    if (cardStatement) {
      const card = ledger.accounts.find((account) => account.accountClass === "debt" && account.type === "credit-card");
      if (card) return card.id;
    }
    return defaultAccountId(ledger);
  }

  // Shared inlet for every capture path (file upload, PDF statement, paste). Parses
  // whatever format arrives, opens the review, and — when the user opted in — asks
  // the AI backstop to upgrade the low-confidence rows in the background.
  function openImportReview(source: ImportSource, sourceName: string, flipOverride?: boolean) {
    lastImportSourceRef.current = { source, sourceName };
    const common = { fileName: sourceName, state: ledger, fallbackMonthKey: ledger.selectedMonth, flipSigns: flipOverride };
    let result: CsvImportResult;
    let bank: string | undefined;
    if (source.kind === "pdf") {
      const statement = parsePdfStatementWithDetection({ ...common, pages: source.pages });
      result = statement;
      bank = statement.bank;
      // Counts only, never transaction text: enough to see which page lost rows.
      console.info(
        `[import] ${sourceName}: ${statement.pageCount} page(s), ${statement.bank ?? "bank not recognised"}, ${statement.layout} layout — ` +
          statement.diagnostics.map((page) => `p${page.page}: ${page.lines} lines, header ${page.header ? "found" : "missing"}, ${page.rows} rows`).join("; "),
      );
    } else {
      result = parseBankText({ ...common, text: source.text });
    }
    const format: ImportFormat = source.kind === "pdf" ? "pdf" : importSourceOf(sourceName);
    setImportReview({
      fileName: sourceName,
      rows: matchDebtPaymentRows(result.rows, effectiveAccounts, moneyFormatter),
      errors: result.errors,
      totalRows: result.totalRows,
      signInverted: Boolean(result.signInverted),
      canFlip: true,
      accountId: suggestImportAccount(Boolean(result.signInverted)),
      format,
      bank,
    });
    const count = result.rows.length;
    setToast(
      !count
        ? source.kind === "pdf"
          ? "No transactions found in this PDF"
          : "Nothing recognisable to import"
        : result.signInverted
          ? "Credit-card statement detected — amounts flipped"
          : source.kind === "pdf"
            ? `${bank ? `${bank} statement` : "PDF statement"} read — ${count} transaction${count === 1 ? "" : "s"} ready for review`
            : "Transactions ready for review",
    );
    if (result.rows.length) {
      track("import_reviewed", {
        source: format,
        rows: bucketCount(result.rows.length),
        auto: result.rows.filter((row) => !row.duplicate && row.confidence >= 0.9).length,
        check: result.rows.filter((row) => !row.duplicate && row.confidence >= 0.6 && row.confidence < 0.9).length,
        needs: result.rows.filter((row) => row.duplicate || row.confidence < 0.6).length,
      });
    }

    if (result.rows.length && isAiCategorizationAvailable(Boolean(user), Boolean(ledger.aiCategorizationEnabled))) {
      const categories = Array.from(
        new Set([
          ...(region === "US" ? ["Housing", "Food", "Utilities", "Transportation", "Subscriptions", "Medical", "Personal", "Work"] : ["Home", "Food", "Bills", "Travel", "Subscriptions", "Health", "Personal", "Work"]),
          ...categoryOptions.map((option) => option.name),
        ]),
      );
      void aiCategorizeRows(result.rows, categories)
        .then((suggestions) => {
          if (!suggestions.length) return;
          track("ai_suggestions_applied", { count: suggestions.length });
          setToast(`AI suggested categories for ${suggestions.length} transaction${suggestions.length === 1 ? "" : "s"}`);
          setImportReview((current) =>
            current && current.fileName === sourceName
              ? { ...current, rows: applyAiSuggestions(current.rows, suggestions) }
              : current,
          );
        })
        .catch(() => {
          // AI upgrades are best-effort; local suggestions already rendered.
        });
    }
  }

  // "This is a card statement" toggle in the review — re-parses the original
  // text with the opposite sign convention (user edits reset by design).
  function toggleImportSignFlip() {
    const last = lastImportSourceRef.current;
    if (!last || !importReview) return;
    openImportReview(last.source, last.sourceName, !importReview.signInverted);
  }

  function updateImportReviewRow(id: string, patch: Partial<CsvImportRow>) {
    if (patch.category || patch.kind) {
      track("import_row_corrected", { source: importReview ? importSourceOf(importReview.fileName) : "unknown" });
    }
    setImportReview((current) => {
      if (!current) return current;
      return {
        ...current,
        rows: current.rows.map((row, index) =>
          row.id === id
            ? {
                ...row,
                ...patch,
                color: patch.category ? categoryColor(patch.category, index) : row.color,
                // A manual category/type edit locks the row against later automation
                // (AI upgrades, retroactive rules never touch "user" rows).
                categorySource: patch.category || patch.kind ? ("user" as const) : patch.categorySource ?? row.categorySource,
              }
            : row,
        ),
      };
    });
  }

  function setAllImportRowsIncluded(include: boolean) {
    setImportReview((current) => {
      if (!current) return current;
      return {
        ...current,
        rows: current.rows.map((row) => ({ ...row, include })),
      };
    });
  }

  function skipDuplicateImportRows() {
    setImportReview((current) => {
      if (!current) return current;
      return {
        ...current,
        rows: current.rows.map((row) => (row.duplicate ? { ...row, include: false } : row)),
      };
    });
  }

  function applyImportCategoryToIncluded(category: string) {
    const trimmed = category.trim();
    if (!trimmed) return;
    setImportReview((current) => {
      if (!current) return current;
      return {
        ...current,
        rows: sortImportRows(
          current.rows.map((row, index) =>
            row.include
              ? {
                  ...row,
                  category: trimmed,
                  color: categoryColor(trimmed, index),
                }
              : row,
          ),
        ),
      };
    });
  }

  function addTransferRule() {
    const pattern = buildRulePattern(transferRuleInput);
    if (!pattern) {
      setToast("Enter a payee to match");
      return;
    }
    // Preview the sweep against the current snapshot so the toast can report removals.
    const previewRules = upsertTransferRule(ledger.categoryRules, pattern, new Date().toISOString());
    const removed = sweepTransferEntries(ledger.months, previewRules).removed;

    updateLedger((current) => {
      const rules = upsertTransferRule(current.categoryRules, pattern, new Date().toISOString());
      const swept = sweepTransferEntries(current.months, rules);
      return { ...current, categoryRules: rules, months: swept.months };
    });

    setTransferRuleInput("");
    setToast(removed ? `Transfer rule added — removed ${removed} matching` : "Transfer rule added");
  }

  function removeTransferRule(id: string) {
    updateLedger((current) => ({
      ...current,
      categoryRules: current.categoryRules.filter((rule) => rule.id !== id),
    }));
    setToast("Transfer rule removed");
  }

  function removeCategoryRule(id: string) {
    updateLedger((current) => ({
      ...current,
      categoryRules: current.categoryRules.filter((rule) => rule.id !== id),
    }));
    setToast("Rule removed — correct a matching transaction to re-learn it");
  }

  function confirmCsvImport() {
    if (!importReview) return;
    const rowsToImport = importReview.rows.filter((row) => row.include && row.kind !== "transfer");
    // Rows flagged as transfers between the user's own accounts: never imported, but their
    // payee patterns are saved so future imports auto-skip them and existing matches are swept.
    const transferRows = importReview.rows.filter((row) => row.kind === "transfer");
    if (!rowsToImport.length && !transferRows.length) {
      setToast("No transactions selected");
      return;
    }

    const batchId = createId("batch");
    const importedAt = new Date().toISOString();
    const transactionRefs: ImportedTransactionRef[] = [];

    updateLedger((current) => {
      const months = { ...current.months };

      rowsToImport.forEach((row, index) => {
        const month = months[row.monthKey] ?? seedMonthFromPrevious();
        const imported = {
          batchId,
          fileName: importReview.fileName,
          rowNumber: row.rowNumber,
          hash: row.hash,
          originalDescription: row.description,
          importedAt,
        };

        if (row.kind === "income") {
          const entry: IncomeEntry = {
            id: createId("income"),
            source: row.name.trim() || row.description,
            amount: Math.abs(row.amount),
            color: row.color || colors[index % colors.length],
            // Imported bank rows are historical actuals — one-off by default, not run-rate.
            recurring: false,
            date: row.date,
            imported,
            accountId: importReview.accountId,
            categorySource: row.categorySource,
          };
          months[row.monthKey] = {
            ...month,
            incomes: [...month.incomes, entry],
          };
          transactionRefs.push({ monthKey: row.monthKey, entryId: entry.id, kind: "income" });
          return;
        }

        const entry: ExpenseEntry = {
          id: createId("expense"),
          name: row.name.trim() || row.description,
          amount: Math.abs(row.amount),
          category: row.category.trim() || (row.kind === "debt-payment" ? "Debt payments" : "Unsorted"),
          color: row.color || colors[(index + 2) % colors.length],
          // Imported bank rows are historical actuals — one-off by default, not run-rate.
          recurring: false,
          date: row.date,
          imported,
          debtAccountId: row.kind === "debt-payment" ? row.debtAccountId : undefined,
          accountId: importReview.accountId,
          categorySource: row.categorySource,
        };
        months[row.monthKey] = {
          ...month,
          expenses: [...month.expenses, entry],
        };
        transactionRefs.push({ monthKey: row.monthKey, entryId: entry.id, kind: "expense" });
      });

      // Auto-seeded recurring rows fold into the imported actuals for the same
      // merchant instead of doubling — the import wins, and inherits the
      // recurring role (and category) from the seeded template.
      const touchedMonthKeys = new Set(rowsToImport.map((row) => row.monthKey));
      for (const monthKey of touchedMonthKeys) {
        if (months[monthKey]) {
          months[monthKey] = reconcileSeededEntries(months[monthKey]).month;
        }
      }

      // Learn rules from both imported rows and transfer rows, then sweep any existing ledger
      // entries (from earlier imports) that match the now-known transfer payees.
      const nextRules = mergeCategoryRules(current.categoryRules, [...rowsToImport, ...transferRows], importedAt);
      const swept = sweepTransferEntries(months, nextRules);

      const importBatches =
        transactionRefs.length > 0
          ? [
              {
                id: batchId,
                fileName: importReview.fileName,
                importedAt,
                totalRows: importReview.totalRows,
                importedRows: transactionRefs.length,
                skippedRows: Math.max(0, importReview.totalRows - transactionRefs.length),
                transactionRefs,
              } satisfies ImportBatch,
              ...current.importBatches,
            ].slice(0, 25)
          : current.importBatches;

      return {
        ...current,
        months: swept.months,
        categoryRules: nextRules,
        importBatches,
      };
    });

    // Recompute against the current snapshot so the toast can report how many existing
    // entries the new transfer rules swept out.
    const learnedRules = mergeCategoryRules(ledger.categoryRules, [...rowsToImport, ...transferRows], importedAt);
    const removed = sweepTransferEntries(ledger.months, learnedRules).removed;

    // Bank-feed reviews resolve their staged rows: included → imported,
    // reviewed-but-excluded → dismissed. Cancelling leaves everything staged.
    if (importReview.fileName === BANK_FEED_SOURCE_NAME && feedRowMapRef.current) {
      const map = feedRowMapRef.current;
      const importedIds = importReview.rows.filter((row) => row.include).map((row) => map.get(row.id)).filter((id): id is string => Boolean(id));
      const dismissedIds = importReview.rows.filter((row) => !row.include).map((row) => map.get(row.id)).filter((id): id is string => Boolean(id));
      void resolveFeedRows(importedIds, "imported")
        .then(() => resolveFeedRows(dismissedIds, "dismissed"))
        .then(() => countStagedFeedRows())
        .then(setStagedFeedCount)
        .catch(() => {
          // Staged rows simply reappear next review — no data loss.
        });
      feedRowMapRef.current = null;
    }

    setImportReview(null);
    if (rowsToImport.length) {
      setLastImportAction({ batchId, fileName: importReview.fileName, importedRows: rowsToImport.length });
    }
    setActiveView("ledger");

    track("import_committed", {
      source: importSourceOf(importReview.fileName),
      imported: rowsToImport.length,
      transfers: transferRows.length,
    });

    const parts: string[] = [];
    if (rowsToImport.length) parts.push(`Imported ${rowsToImport.length} transaction${rowsToImport.length === 1 ? "" : "s"}`);
    if (transferRows.length) parts.push(`saved ${transferRows.length} transfer rule${transferRows.length === 1 ? "" : "s"}`);
    if (removed) parts.push(`removed ${removed} matching`);
    setToast(parts.join(" · ") || "Nothing to import");
  }

  function undoImportBatch(batchId: string) {
    updateLedger((current) => removeImportBatchFromState(current, batchId));
    setLastImportAction((current) => (current?.batchId === batchId ? null : current));
    setToast("Import removed");
  }

  function resetMonth() {
    updateCurrentMonth(() => ({ incomes: [], expenses: [], note: "" }));
    setToast("Month cleared");
  }

  // Everything back to how a brand-new user finds it: an empty ledger (overwriting the cloud copy
  // when signed in), the short sidebar, the default dashboard, the checklist and the setup wizard.
  // Only the country, theme and sign-in survive.
  async function clearAllData() {
    const fresh = { ...createInitialState(ledger.country), lastSavedAt: new Date().toISOString() };
    try {
      for (const key of [ONBOARDING_KEY, GETTING_STARTED_KEY, TUTORIAL_SEEN_KEY]) localStorage.removeItem(key);
    } catch {
      // localStorage unavailable — nothing was stored there either.
    }
    for (const key of ["GB", "US"] as const) clearLayout("dashboard", key);
    const tools = { pinned: initialPinned(false), seen: [] };
    writeNavTools(tools);
    setNavTools(tools);
    setToolsTrayOpen(false);
    setDashboardLayout(defaultLayout("dashboard", region));
    setChecklistDismissed(false);
    setConfirmClearAll(false);
    setLedger(fresh);
    try {
      await saveLedgerState(fresh);
      if (user) await saveCloudLedgerState(user.id, fresh);
      setToast("All data cleared");
    } catch {
      setToast("Cleared here — the cloud copy will update when you're back online");
    }
    setActiveView("dashboard");
    setOnboardingOpen(true);
  }

  function openNewTransaction() {
    setActiveView("ledger");
    focusNextFrame(incomeSourceInputRef);
  }

  async function handleSignIn() {
    setAuthWorking(true);
    setToast("Redirecting to Google");
    try {
      await signInWithGoogle();
    } catch {
      setAuthWorking(false);
      setToast("Google sign-in unavailable");
    }
  }

  async function handleSignOut() {
    setAuthWorking(true);
    try {
      await signOut();
      const fresh = createInitialState(detectCountryFromBrowser());
      await saveLedgerState(fresh);
      setLedger(fresh);
      setSyncConflict(null);
      setToast("Signed out — local data cleared");
    } catch {
      setToast("Sign out failed");
    } finally {
      setAuthWorking(false);
    }
  }

  async function handleKeepLocal() {
    if (!syncConflict || !user) return;
    const local = syncConflict.local;
    setSyncConflict(null);
    try {
      await saveCloudLedgerState(user.id, local);
      setLedger(local);
      setCloudHydrated(true);
      setSaveState("saved");
      setToast("Local data saved to cloud");
    } catch {
      setCloudHydrated(true);
      setSaveState("offline");
      setToast("Sync failed — using local data");
    }
  }

  function handleUseCloud() {
    if (!syncConflict) return;
    const cloud = syncConflict.cloud;
    setSyncConflict(null);
    setLedger(cloud);
    setCloudHydrated(true);
    setSaveState("saved");
    setToast("Cloud data loaded");
  }

  function focusSearch() {
    // The search field only lives on the Ledger view now — jump there first,
    // then focus once the input has mounted.
    setActiveView("ledger");
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }

  useEffect(() => {
    function handleGlobalShortcuts(event: globalThis.KeyboardEvent) {
      const key = event.key.toLowerCase();
      const isCommand = event.metaKey || event.ctrlKey;
      const isEditable = isEditableTarget(event.target);

      if (isCommand && key === "k") {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (!isEditable && event.key === "/") {
        event.preventDefault();
        focusSearch();
        return;
      }

      if ((isCommand && key === "n") || (!isEditable && (key === "n" || key === "c"))) {
        event.preventDefault();
        openNewTransaction();
        return;
      }

      if (!isEditable && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.key === "ArrowLeft") {
        event.preventDefault();
        changeMonth(-1);
        return;
      }

      if (!isEditable && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.key === "ArrowRight") {
        event.preventDefault();
        changeMonth(1);
        return;
      }

      if (event.key === "Escape" && (query || groupingSourceId || categoryMenu)) {
        event.preventDefault();
        setQuery("");
        setGroupingSourceId(null);
        setCategoryMenu(null);
        setToast("Cleared");
      }
    }

    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, [categoryMenu, groupingSourceId, query]);

  function changeLayout(page: LayoutPage, action: "move" | "resize" | "remove" | "add" | "reset", updater: (layout: PageLayout) => PageLayout) {
    updateLayout(page, updater);
    track("layout_changed", { page, action });
  }

  // The Ledger's "see the year" link: the annual projection on the Dashboard, added back if it was
  // removed, and scrolled to.
  function openAnnualView() {
    updateLayout("dashboard", (layout) => addWidget(layout, "dashboard", region, "annual"));
    setActiveView("dashboard");
    window.requestAnimationFrame(() => document.querySelector('[data-widget-id="annual"]')?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  // The estimator lives on its own page; every "estimate your pay" link lands there.
  function openEstimator() {
    setActiveView("pay");
  }

  // "Use as monthly income" on the estimator: one recurring take-home row in the current month,
  // updated in place if it already exists.
  function applyTakeHomeIncome(monthlyNet: number) {
    const amount = Math.round(monthlyNet * 100) / 100;
    if (amount <= 0) return;
    const source = "Salary (take-home)";
    updateCurrentMonth((month) => {
      const existing = month.incomes.find((income) => income.source.trim().toLowerCase() === source.toLowerCase());
      if (existing) {
        return { ...month, incomes: month.incomes.map((income) => (income.id === existing.id ? { ...income, amount, recurring: true } : income)) };
      }
      return {
        ...month,
        incomes: [
          ...month.incomes,
          {
            id: createId("income"),
            source,
            amount,
            color: colors[month.incomes.length % colors.length],
            recurring: true,
            date: newEntryDate(),
            accountId: guessAccountId(ledger, "income", source),
          },
        ],
      };
    });
    setToast(`${moneyFormatter.format(amount)} a month added as take-home income`);
  }

  const insightWidgetActions: WidgetActions = {
    patchInsights,
    markRecurring: (candidate) => {
      updateLedger((current) => applyRecurringFlag(current, candidate));
      setToast(`${candidate.label} marked recurring — it now feeds the forecast`);
      track("recurring_marked", { cadence: candidate.cadence });
    },
    navigate: (view) => setActiveView(view),
    setSavingsTarget: (value) => updateLedger((current) => ({ ...current, savingsTarget: value })),
    toast: setToast,
  };

  // Every widget on the Dashboard. The money-flow family draws through InsightWidgetCard; the
  // rest are rendered here.
  const renderDashboardWidget: WidgetRenderer = (id, size) => {
    const spec = INSIGHT_WIDGET_SPECS[id];
    if (spec && insightsModel) {
      return (
        <InsightWidgetCard
          id={id}
          title={t(widgetDefinition("dashboard", id)?.title[region] ?? id)}
          spec={spec}
          model={insightsModel}
          insights={insightsState}
          actions={insightWidgetActions}
          formatter={moneyFormatter}
          privacy={ledger.privacyMode}
          animations={animationsEnabled}
          editing={layoutEditing === "dashboard"}
          onVariant={(variant) => patchInsights((current) => setWidgetVariant(current, id, spec.type, variant))}
        />
      );
    }
    switch (id) {
      case "snapshot":
        return (
          <section className="summaryStrip" aria-label="Monthly snapshot">
            <MetricCard label="Income" value={projection.monthlyIncome} tone="green" privacy={ledger.privacyMode} formatter={moneyFormatter} />
            <MetricCard label="Spending" value={projection.monthlyExpenses} tone="red" privacy={ledger.privacyMode} formatter={moneyFormatter} />
            <MetricCard label="Surplus" value={projection.monthlySurplus} tone={projection.monthlySurplus >= 0 ? "green" : "red"} privacy={ledger.privacyMode} formatter={moneyFormatter} />
            <MetricCard label="Savings rate" value={projection.savingsRate} suffix="%" tone={projection.savingsRate >= ledger.savingsTarget ? "green" : "amber"} />
          </section>
        );
      case "net-worth":
        return (
          <article className="miniPanel flowPanel">
            <PanelTitle
              title="Net worth outlook"
              icon={<LineChart size={16} />}
              action={<NetWorthHorizonTabs horizon={netWorthHorizon} onChange={setNetWorthHorizon} compact />}
            />
            <p className="panelSubcopy">Projects your recurring monthly surplus, debt payments, and interest after any 0% period ends. One-off items are not extrapolated.</p>
            <NetWorthChart points={netWorthOutlook} formatter={moneyFormatter} privacy={ledger.privacyMode} compact />
          </article>
        );
      case "retirement":
        return (
          <RetirementWidget
            accounts={effectiveAccounts}
            region={region}
            taxProfile={ledger.taxProfile}
            formatter={moneyFormatter}
            privacy={ledger.privacyMode}
            onOpenAccounts={() => setActiveView("accounts")}
            onOpenEstimator={openEstimator}
          />
        );
      case "take-home":
        return <TakeHomeWidget region={region} taxProfile={ledger.taxProfile} accounts={ledger.accounts} formatter={moneyFormatter} privacy={ledger.privacyMode} onOpen={openEstimator} />;
      case "medical":
        return (
          <MedicalWidget
            months={ledger.months}
            healthPlan={ledger.healthPlan}
            accounts={effectiveAccounts}
            formatter={moneyFormatter}
            symbol={currencySymbol}
            privacy={ledger.privacyMode}
            onChange={(patch) => updateLedger((current) => ({ ...current, healthPlan: { ...current.healthPlan, ...patch } }))}
            onOpenAccounts={() => setActiveView("accounts")}
          />
        );
      case "loans":
        return <LoansWidget accounts={effectiveAccounts} region={region} taxProfile={ledger.taxProfile} formatter={moneyFormatter} privacy={ledger.privacyMode} onOpenAccounts={() => setActiveView("accounts")} />;
      case "housing":
        return <HousingWidget month={currentMonth} income={projection.monthlyIncome} region={region} formatter={moneyFormatter} privacy={ledger.privacyMode} onOpenLedger={() => setActiveView("ledger")} />;
      case "credit":
        return <CreditScoreWidget estimate={healthScore.estimatedCreditScore} noData={healthScore.noData} region={region} privacy={ledger.privacyMode} />;
      case "goals":
        return <GoalsWidget goals={ledger.goals} goalSequence={goalSequence} formatter={moneyFormatter} privacy={ledger.privacyMode} onOpenGoals={() => setActiveView("goals")} />;
      case "payoff":
        // Narrow it is the chosen plan at a glance; given the width it compares every strategy.
        return (
          <PayoffWidget
            comparison={allocationPlan}
            settings={ledger.allocation}
            formatter={moneyFormatter}
            privacy={ledger.privacyMode}
            t={t}
            compare={size === "l" || size === "xl"}
            onOpen={() => setActiveView("allocate")}
            onOpenAccounts={() => setActiveView("accounts")}
          />
        );
      case "subscriptions":
        return <SubscriptionsWidget report={subscriptionReport} formatter={moneyFormatter} preciseFormatter={preciseFormatter} privacy={ledger.privacyMode} t={t} onOpen={() => setActiveView("subscriptions")} />;
      case "health":
        return (
          <article className={`miniPanel healthPanel ${healthScore.noData ? "" : healthTone(healthScore.score)}`}>
            <PanelTitle title="Health score" icon={<Gauge size={16} />} action={<InfoHint label="How health score is calculated" text={t(healthScore.detail)} />} />
            <div className="scoreHeadline">
              <div className="scoreNumber">
                {healthScore.noData ? "N/A" : formatDecimal(healthScore.score)}
                {!healthScore.noData && <small>/10</small>}
              </div>
              {!healthScore.noData && <span className="scoreBadge">{healthScore.summary}</span>}
            </div>
            {healthScore.noData && <span className="scoreCaption">Add data to generate a score</span>}
            {!healthScore.noData && (
              <>
                <div className="creditEstimate">
                  <span>Estimated credit score</span>
                  <strong>
                    {creditReading.primary.score}
                    <small>
                      {" "}
                      {creditReading.primary.scale} · {creditReading.primary.band.label}
                    </small>
                  </strong>
                </div>
                <div className="ruleList">
                  <ProgressRule label="Cash flow" value={healthScore.cashFlowScore} target={75} />
                  <ProgressRule label="Debt load" value={healthScore.debtLoadScore} target={75} />
                  <ProgressRule label="Payments" value={healthScore.paymentPressureScore} target={75} />
                  <ProgressRule label="Card headroom" value={healthScore.utilizationScore} target={75} />
                  <ProgressRule label="Savings" value={healthScore.savingsScore} target={75} />
                </div>
              </>
            )}
          </article>
        );
      case "chart":
        return (
          <article className="miniPanel chartPanel">
            <PanelTitle
              title={insightChartTitle}
              icon={insightChartView === "cash-flow" ? <BarChart3 size={16} /> : <LineChart size={16} />}
              action={<InsightChartToggle value={insightChartView} onChange={setInsightChartView} />}
            />
            {insightChartView === "inflow-outflow" && <InflowOutflowChart points={monthlyFlowPoints} privacy={ledger.privacyMode} formatter={moneyFormatter} />}
            {insightChartView === "cash-flow" && <BarChart bars={monthlyBars} privacy={ledger.privacyMode} formatter={moneyFormatter} />}
            {insightChartView === "net-worth" && (
              <>
                <div className="chartUtilityRow">
                  <NetWorthHorizonTabs horizon={netWorthHorizon} onChange={setNetWorthHorizon} compact />
                </div>
                <NetWorthChart points={netWorthOutlook} formatter={moneyFormatter} privacy={ledger.privacyMode} compact />
              </>
            )}
          </article>
        );
      case "categories":
        return (
          <article className="miniPanel categoryPanel">
            <PanelTitle title="Top categories" icon={<Database size={16} />} />
            <div className="categoryList">
              {categoryRows.length ? (
                categoryRows.slice(0, 5).map((row) => (
                  <div className="categoryRow" key={row.name}>
                    <span className="swatch small" style={{ background: row.color }} />
                    <span>{row.name}</span>
                    <strong className={ledger.privacyMode ? "masked" : ""}>{moneyFormatter.format(row.annual / 12)}</strong>
                    <em>{formatDecimal(row.share)}%</em>
                  </div>
                ))
              ) : (
                <EmptyState icon={<FolderPlus size={18} />} title="No categories yet" text="Drag related expenses together in Ledger to build this view." />
              )}
            </div>
          </article>
        );
      case "anomalies": {
        const { shown, hiddenCount } = visibleSignals(anomalySignals, insightsState.hiddenWarnings);
        return (
          <article className="miniPanel anomalyPanel">
            <PanelTitle
              title="Detected anomalies"
              icon={
                <InfoHint
                  label="About detected anomalies"
                  text={t("Flags are generated only from local income, outflow, debt, card limit, APR, payment, and categorisation data. They are not financial advice, but they point to pressure worth checking.")}
                />
              }
            />
            <div className="anomalyList">
              {shown.map((signal) => (
                <FinancialSignalCard
                  key={signal.id}
                  signal={signal}
                  t={t}
                  onDismiss={
                    signal.id === "no-urgent-signals"
                      ? undefined
                      : () => patchInsights((current) => ({ ...current, hiddenWarnings: [...current.hiddenWarnings, signal.id] }))
                  }
                />
              ))}
              {!shown.length && <p className="panelHint">{t("Everything here has been dismissed.")}</p>}
            </div>
            {hiddenCount > 0 && (
              <button className="linkButton" type="button" onClick={() => patchInsights((current) => ({ ...current, hiddenWarnings: [] }))}>
                {t(`Show ${hiddenCount} dismissed ${hiddenCount === 1 ? "flag" : "flags"}`)}
              </button>
            )}
          </article>
        );
      }
      case "paycheck":
        return <PaycheckBreakdownWidget region={region} taxProfile={ledger.taxProfile} accounts={ledger.accounts} formatter={moneyFormatter} privacy={ledger.privacyMode} onOpenPay={openEstimator} />;
      case "annual":
        return (
          <section className="projectionPanel" aria-label="Annual calculation">
            <div className="sectionHeading">
              <div>
                <h2>Annual projection</h2>
                <p>Automatic from the selected monthly plan</p>
              </div>
              <div className="tabs" role="tablist" aria-label="Projection view">
                <button className={projectionView === "overview" ? "selected" : ""} type="button" onClick={() => setProjectionView("overview")}>
                  Overview
                </button>
                <button className={projectionView === "category" ? "selected" : ""} type="button" onClick={() => setProjectionView("category")}>
                  By category
                </button>
                <button className={projectionView === "month" ? "selected" : ""} type="button" onClick={() => setProjectionView("month")}>
                  By month
                </button>
              </div>
            </div>
            <div className="annualGrid">
              <AnnualSnapshot projection={projection} privacy={ledger.privacyMode} formatter={moneyFormatter} />
              <SavingsGauge projection={projection} target={ledger.savingsTarget} onTargetChange={(value) => updateLedger((current) => ({ ...current, savingsTarget: value }))} />
              <ProjectionDetail view={projectionView} projection={projection} categoryRows={categoryRows} monthlyBars={monthlyBars} privacy={ledger.privacyMode} formatter={moneyFormatter} />
            </div>
          </section>
        );
      default:
        return null;
    }
  };

  const payPageTitle = region === "US" ? "Paycheck & tax" : "Pay & tax";
  const coreNavItems: Array<{ id: AppView; label: string; icon: ReactNode }> = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { id: "ledger", label: "Ledger", icon: <ReceiptText size={20} /> },
    { id: "accounts", label: "Accounts", icon: <CreditCard size={20} /> },
    { id: "subscriptions", label: "Subscriptions", icon: <Repeat size={20} /> },
  ];
  const toolNavItems: Record<ToolView, { id: ToolView; label: string; icon: ReactNode; blurb: string }> = {
    pay: {
      id: "pay",
      label: payPageTitle,
      icon: <Calculator size={20} />,
      blurb: region === "US" ? "Gross salary to take-home after federal, state and FICA" : "Gross salary to take-home after tax, NI and student loan",
    },
    allocate: { id: "allocate", label: "Allocate", icon: <Coins size={20} />, blurb: "Plan the fastest way to pay off debt and where spare money goes" },
    goals: { id: "goals", label: "Goals", icon: <Target size={20} />, blurb: "Save towards things you want and see when you'll get there" },
  };
  // A tool opened from a widget or link shows in the sidebar while it is the page being viewed.
  const visibleTools = TOOL_VIEWS.filter((tool) => toolPrefs.pinned.includes(tool) || activeView === tool);
  const navItems = [...coreNavItems, ...visibleTools.map((tool) => toolNavItems[tool])];
  const unpinnedTools = TOOL_VIEWS.filter((tool) => !toolPrefs.pinned.includes(tool));
  const toolBadge = unseenSuggestionCount(toolPrefs, suggestedTools);
  const unpinnedActiveTool = isToolView(activeView) && !toolPrefs.pinned.includes(activeView) ? activeView : null;
  const insightChartTitle =
    insightChartView === "cash-flow"
      ? "Cash flow volatility"
      : insightChartView === "net-worth"
        ? "Net worth outlook"
        : "Monthly cash flow";
  const userName =
    (typeof user?.user_metadata.name === "string" && user.user_metadata.name) ||
    user?.email?.split("@")[0] ||
    "Secure user";
  const userAvatar = typeof user?.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : "";

  if (showLanding) {
    // The feedback modal lives in the main shell below, but the landing page
    // (and first-time visitors arriving via /?feedback=1) never reach it, so
    // "Contact us" would set state with nothing rendered. Render it here too.
    return (
      <>
        <LandingPage onEnter={() => setShowLanding(false)} onFeedback={() => setShowFeedbackModal(true)} />
        {showFeedbackModal && (
          <FeedbackModal
            userId={user?.id}
            onDismiss={() => setShowFeedbackModal(false)}
          />
        )}
      </>
    );
  }

  if (authLoading || !hydrated) {
    return <AuthGate mode="loading" onSignIn={handleSignIn} working={authWorking} configured={isSupabaseConfigured()} />;
  }

  return (
    <div className={`appShell ${ledger.privacyMode ? "privacy-on" : ""} ${animationsEnabled ? "motion-on" : "motion-off"}`}>
      <input
        ref={fileInputRef}
        className="hiddenFile"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importJson(file);
        }}
      />
      <input
        ref={csvInputRef}
        className="hiddenFile"
        type="file"
        accept="text/csv,.csv,.ofx,.qif,.txt,application/pdf,.pdf"
        aria-label="Import a bank statement file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importStatementFile(file);
        }}
      />

      <aside className="sideNav" aria-label="Primary">
        <div className="brandCluster">
          <img src="/icon.svg" alt="" width="36" height="36" style={{borderRadius: '10px', flexShrink: 0}} aria-hidden="true" />
          <div>
            <h1>The Income Tracker</h1>
          </div>
        </div>



        <nav className="navStack">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`navItem${activeView === item.id ? " active" : ""}${item.id === unpinnedActiveTool ? " preview" : ""}`}
              type="button"
              onClick={() => setActiveView(item.id)}
              aria-pressed={activeView === item.id}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
          <button
            key="settings"
            className={activeView === "settings" ? "navItem active" : "navItem"}
            type="button"
            onClick={() => setActiveView("settings")}
            aria-pressed={activeView === "settings"}
          >
            <SettingsIcon size={20} />
            Settings
          </button>
        </nav>

        {unpinnedTools.length > 0 && (
          <div className="navTools">
            <button
              className={toolsTrayOpen ? "navToolsToggle open" : "navToolsToggle"}
              type="button"
              onClick={toggleToolsTray}
              aria-expanded={toolsTrayOpen}
              aria-controls="navToolsTray"
            >
              <Plus size={16} />
              More tools
              {toolBadge > 0 && (
                <span className="navToolsBadge" aria-label={`${toolBadge} suggested for you`}>
                  {toolBadge}
                </span>
              )}
              <ChevronDown size={15} className="navToolsChevron" aria-hidden="true" />
            </button>
            {toolsTrayOpen && (
              <ul className="navToolsTray" id="navToolsTray" aria-label="Tools you can add to the sidebar">
                {unpinnedTools.map((tool) => {
                  const item = toolNavItems[tool];
                  const reason = suggestedTools[tool];
                  return (
                    <li key={tool} className={reason ? "navToolRow suggested" : "navToolRow"}>
                      <button
                        className="navToolOpen"
                        type="button"
                        onClick={() => {
                          setActiveView(tool);
                          setToolsTrayOpen(false);
                        }}
                      >
                        <span className="navToolIcon" aria-hidden="true">{item.icon}</span>
                        <span className="navToolText">
                          <strong>{item.label}</strong>
                          {reason && <em>{reason}</em>}
                          <small>{item.blurb}</small>
                        </span>
                      </button>
                      <button className="navToolAdd" type="button" onClick={() => setToolPinned(tool, true)} aria-label={`Add ${item.label} to sidebar`} data-tip="Add to sidebar">
                        <Plus size={15} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <div className={`saveStatusChip ${saveState}`} role="status" aria-live="off">
          <span className="saveDot" aria-hidden="true" />
          {saveState === "saved"
            ? user
              ? "Synced to cloud"
              : "Saved on this device"
            : saveState === "saving"
              ? "Saving…"
              : saveState === "loading"
                ? "Loading…"
                : "Offline — saved here only"}
        </div>

        <button
          className="sideTutorialBtn"
          type="button"
          onClick={() => setTutorialView(activeView)}
          data-tip={`Replay the ${tutorialsFor(region)[activeView].badge} tutorial`}
        >
          <GraduationCap size={16} />
          Tutorial
        </button>

        {user ? (
          <UserProfilePopup
            userName={userName}
            userAvatar={userAvatar}
            userEmail={user.email ?? ""}
            onSignOut={handleSignOut}
            authWorking={authWorking}
          />
        ) : (
          <button className="sideSignInBtn" type="button" onClick={() => setShowSignInModal(true)}>
            <LogIn size={16} />
            <div>
              <span>Sign in to sync</span>
              <small>Save your data to the cloud</small>
            </div>
          </button>
        )}
        <button
          className="viewHomepageBtn"
          type="button"
          onClick={() => { localStorage.removeItem("hasSeenLanding"); setShowLanding(true); }}
        >
          View homepage
        </button>
      </aside>

      <div className="workspace">
        <header className="appBar">
          {/* The page names itself in its own header below, so the bar only carries controls:
              the month switcher on the Ledger, and the country, theme and privacy toggles. */}
          <div className="appBarTitle">
            {activeView === "ledger" && (
              <div className="monthSwitch" aria-label="Selected month">
                <button className="iconButton" type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" aria-keyshortcuts="Alt+ArrowLeft">
                  <ChevronLeft size={19} />
                </button>
                <div className="monthLabel">
                  <strong>{formatMonth(ledger.selectedMonth)}</strong>
                </div>
                <button className="iconButton" type="button" onClick={() => changeMonth(1)} aria-label="Next month" aria-keyshortcuts="Alt+ArrowRight">
                  <ChevronRight size={19} />
                </button>
              </div>
            )}
          </div>

          {activeView === "ledger" && (
            <label className="searchShell">
              <Search size={18} />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search transactions..."
                aria-label="Search transactions"
                aria-keyshortcuts="/ Meta+K Control+K"
              />
            </label>
          )}

          <div className="topActions">
            <label className="currencyControl countryControl">
              <span>{currencySymbol}</span>
              <select value={ledger.country} onChange={(event) => changeCountry(event.target.value as CountryCode)} aria-label="Country">
                {countryOptions.map((option) => (
                  <option value={option.code} key={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="iconButton"
              type="button"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              data-tip={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className={ledger.privacyMode ? "iconButton active" : "iconButton"}
              type="button"
              onClick={() => updateLedger((current) => ({ ...current, privacyMode: !current.privacyMode }))}
              aria-label={ledger.privacyMode ? "Show amounts" : "Hide amounts"}
              data-tip={ledger.privacyMode ? "Show amounts" : "Hide amounts"}
            >
              {ledger.privacyMode ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
        </header>

        <main className="contentCanvas">
          {unpinnedActiveTool && (
            <div className="toolPinBanner" role="note">
              <span>
                <strong>{toolNavItems[unpinnedActiveTool].label}</strong> isn't in your sidebar yet.
              </span>
              <button className="linkButton" type="button" onClick={() => setToolPinned(unpinnedActiveTool, true)}>
                <Plus size={14} />
                Add to sidebar
              </button>
            </div>
          )}

          {activeView === "dashboard" && (
            <section className="viewStack" aria-label="Dashboard">
              <div className="pageHeader compactHeader">
                <div>
                  {/* Customise sits with the page title, apart from the month's figure on the right:
                      one changes the page, the other is what the page tells you. */}
                  <div className="pageTitleRow">
                    <h2>Dashboard</h2>
                    <LayoutEditButton page="dashboard" editing={layoutEditing === "dashboard"} onToggle={() => setLayoutEditing((current) => (current === "dashboard" ? null : "dashboard"))} t={t} />
                  </div>
                  <p>Your money at a glance — this month and where it&rsquo;s heading.</p>
                </div>
                <div className="pageHeaderSide">
                  <div className="netBlock">
                    <span>Left this month</span>
                    <strong className={projection.monthlySurplus >= 0 ? "positiveText sensitive" : "negativeText sensitive"}>
                      <AnimatedCurrency value={projection.monthlySurplus} formatter={moneyFormatter} />
                    </strong>
                  </div>
                </div>
              </div>

              {(() => {
                const today = new Date();
                const previousKey = shiftMonth(getMonthKey(today), -1);
                const previous = ledger.months[previousKey];
                const previousMonthHasImports = Boolean(
                  previous && (previous.expenses.some((entry) => entry.imported) || previous.incomes.some((entry) => entry.imported)),
                );
                const show = shouldShowNewMonthNudge({
                  today,
                  previousMonthHasImports,
                  hasImportedBefore: ledger.importBatches.length > 0,
                  hasBank: Boolean(bankSlug),
                  dismissedMonth: nudgeDismissedMonth,
                });
                if (!show) return null;
                const dismiss = () => {
                  const key = getMonthKey(today);
                  setNudgeDismissedMonth(key);
                  try {
                    localStorage.setItem(NUDGE_DISMISSED_KEY, key);
                  } catch {
                    // Storage unavailable; the nudge returns next load, which is acceptable.
                  }
                  track("new_month_nudge", { action: "dismiss" });
                };
                return (
                  <NewMonthNudge
                    bankSlug={bankSlug}
                    previousMonthLabel={formatMonth(previousKey).replace(/ \d{4}$/, "")}
                    onBankChange={setBankSlug}
                    onImport={() => {
                      track("new_month_nudge", { action: "import" });
                      csvInputRef.current?.click();
                    }}
                    onGuideOpened={() => track("new_month_nudge", { action: "guide" })}
                    onDismiss={dismiss}
                  />
                );
              })()}

              {!installDismissed && !isStandalone() && visitCount >= 2 && (installEvent || isIosSafari()) && (
                <InstallBanner
                  mode={installEvent ? "prompt" : "ios"}
                  onInstall={() => {
                    if (!installEvent) return;
                    track("install_prompt", { action: "shown" });
                    void installEvent.prompt().then(() =>
                      installEvent.userChoice.then((choice) => {
                        track("install_prompt", { action: choice.outcome });
                        if (choice.outcome === "dismissed") {
                          writeFlag(INSTALL_DISMISSED_KEY);
                          setInstallDismissed(true);
                        }
                        setInstallEvent(null);
                      }),
                    );
                  }}
                  onDismiss={() => {
                    track("install_prompt", { action: installEvent ? "dismissed" : "ios_hint" });
                    writeFlag(INSTALL_DISMISSED_KEY);
                    setInstallDismissed(true);
                  }}
                />
              )}

              {/* Out of the way while the layout is being customised; back once it is done. */}
              {!checklistDismissed && layoutEditing !== "dashboard" && (
                <GettingStartedCard
                  items={[
                    {
                      id: "income",
                      label: "Add your income",
                      hint: "Salary or anything else coming in",
                      done: setupProgress.income,
                      action: () => {
                        setActiveView("ledger");
                        focusNextFrame(incomeSourceInputRef);
                      },
                    },
                    {
                      id: "expenses",
                      label: "Add regular spending",
                      hint: "Rent, bills, groceries — rough is fine",
                      done: setupProgress.expenses,
                      action: () => {
                        setActiveView("ledger");
                        focusNextFrame(expenseNameInputRef);
                      },
                    },
                    {
                      id: "account",
                      label: "Add an account",
                      hint: "Savings, cards and loans build your net worth",
                      done: setupProgress.account,
                      action: () => setActiveView("accounts"),
                    },
                    {
                      id: "pay",
                      label: region === "US" ? "Estimate your paycheck" : "Estimate your take-home pay",
                      hint: region === "US" ? "Gross salary → net after federal, state and FICA" : "Gross salary → net after tax, NI and student loan",
                      done: setupProgress.pay,
                      action: () => setActiveView("pay"),
                    },
                    {
                      id: "goal",
                      label: "Set a savings goal",
                      hint: "See when you'll reach it",
                      done: setupProgress.goal,
                      action: () => setActiveView("goals"),
                    },
                    {
                      id: "import",
                      label: "Import a bank statement",
                      hint: "Fill a whole month from a CSV or PDF in seconds",
                      done: setupProgress.imported,
                      action: () => csvInputRef.current?.click(),
                    },
                  ]}
                  onRestartSetup={() => setOnboardingOpen(true)}
                  onDismiss={() => {
                    writeFlag(GETTING_STARTED_KEY);
                    setChecklistDismissed(true);
                  }}
                />
              )}

              <WidgetGrid
                page="dashboard"
                region={region}
                layout={dashboardLayout}
                editing={layoutEditing === "dashboard"}
                hidden={hiddenWidgets(dashboardLayout, "dashboard", region)}
                render={renderDashboardWidget}
                onMove={(id, delta) => changeLayout("dashboard", "move", (layout) => moveWidget(layout, id, delta))}
                onDrop={(id, targetId, edge) => changeLayout("dashboard", "move", (layout) => moveWidgetBefore(layout, id, targetId, edge))}
                onResize={(id, direction) => changeLayout("dashboard", "resize", (layout) => cycleWidgetSize(layout, "dashboard", id, direction))}
                onSetSize={(id, size) => changeLayout("dashboard", "resize", (layout) => resizeWidget(layout, "dashboard", id, size))}
                onRemove={(id) => changeLayout("dashboard", "remove", (layout) => removeWidget(layout, id))}
                onAdd={(id) => changeLayout("dashboard", "add", (layout) => addWidget(layout, "dashboard", region, id))}
                onReset={() => changeLayout("dashboard", "reset", () => defaultLayout("dashboard", region))}
              />
            </section>
          )}

          {activeView === "ledger" && (
            <section className="viewStack" aria-label="Ledger">
              <div className="pageHeader">
                <div>
                  <h2>Ledger</h2>
                  <p>Money in and money out this month. Rough numbers are fine.</p>
                </div>
                <div className="netBlock">
                  <span>Left this month</span>
                  <strong className={projection.monthlySurplus >= 0 ? "positiveText sensitive" : "negativeText sensitive"}>
                    {projection.monthlySurplus >= 0 ? "+ " : "- "}
                    <AnimatedCurrency value={Math.abs(projection.monthlySurplus)} formatter={moneyFormatter} />
                  </strong>
                </div>
              </div>

              {stagedFeedCount > 0 && (
                <div className="seededBanner feedBanner" role="status">
                  <CreditCard size={15} />
                  <span>
                    {stagedFeedCount} new bank transaction{stagedFeedCount === 1 ? "" : "s"} arrived from your connected accounts.
                  </span>
                  <button className="commandButton" type="button" disabled={feedsBusy} onClick={() => void reviewBankFeed()}>
                    Review
                  </button>
                </div>
              )}

              {showSeededBanner && (
                <div className="seededBanner" role="status">
                  <Repeat size={15} />
                  <span>
                    {seededEntryCount} recurring {seededEntryCount === 1 ? "item" : "items"} added automatically from last month — deleting one stops it repeating.
                  </span>
                  <button
                    className="iconButton"
                    type="button"
                    aria-label="Dismiss recurring items notice"
                    onClick={() => setSeededBannerDismissed((current) => new Set(current).add(ledger.selectedMonth))}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <div className="quickAddBar">
                <Sparkles size={16} aria-hidden="true" />
                <input
                  value={quickAddInput}
                  placeholder={
                    region === "US"
                      ? "Quick add — try “starbucks 4.35”, “salary 3400 recurring”, or “target 42.61 yesterday”"
                      : "Quick add — try “costa 4.35”, “salary 2400 recurring”, or “tesco 42.61 yesterday”"
                  }
                  aria-label="Quick add transaction"
                  onChange={(event) => setQuickAddInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addQuickEntry();
                    }
                    if (event.key === "Escape") setQuickAddInput("");
                  }}
                />
                {quickAddPreview && (
                  quickAddPreview.ok ? (
                    <button className="quickAddPreview" type="button" onClick={addQuickEntry}>
                      <span className={quickAddPreview.draft.kind === "income" ? "positiveText" : "negativeText"}>
                        {quickAddPreview.draft.kind === "income" ? "+" : "−"}
                        {moneyFormatter.format(quickAddPreview.draft.amount)}
                      </span>
                      <strong>{capitalizeFirst(quickAddPreview.draft.description)}</strong>
                      {quickAddPreview.draft.kind === "expense" && quickAddPreview.draft.category && quickAddPreview.draft.category !== "Unsorted" && (
                        <em>{quickAddPreview.draft.category}</em>
                      )}
                      {quickAddPreview.draft.recurring && <Repeat size={12} aria-label="Recurring" />}
                      <Check size={14} />
                    </button>
                  ) : (
                    <span className="quickAddHint">{quickAddPreview.error}</span>
                  )
                )}
              </div>

              <section className="monthlyGrid" aria-label="Monthly inputs and outputs">
                <Panel
                  title="Income"
                  total={projection.monthlyIncome}
                  tone="income"
                  count={currentMonth.incomes.length}
                  privacy={ledger.privacyMode}
                  formatter={moneyFormatter}
                  action={
                    currentMonth.incomes.length > 1 ? (
                      <label className="panelSort">
                        <ArrowUpDown size={13} aria-hidden="true" />
                        <select value={incomeSort} aria-label="Order income by" onChange={(event) => setIncomeSort(event.target.value as IncomeSortMode)}>
                          {INCOME_SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : undefined
                  }
                >
                  <div className="tableHeader incomeHeader">
                    <span>Source</span>
                    <span>Amount</span>
                    <span />
                  </div>
                  <div className="rowStack">
                    {visibleIncomes.length ? (
                      visibleIncomes.map((income) => (
                        <IncomeRow
                          key={income.id}
                          income={income}
                          account={accountById.get(income.accountId ?? "")}
                          onCycleAccount={() => cycleEntryAccount("income", income.id)}
                          privacy={ledger.privacyMode}
                          symbol={currencySymbol}
                          dragging={draggingIncomeId === income.id}
                          dropState={incomeDropPreview?.targetId === income.id ? incomeDropPreview.edge : undefined}
                          onDragStart={() => setDraggingIncomeId(income.id)}
                          onDragOver={(event) => previewIncomeDrop(event, income)}
                          onDragEnd={clearIncomeDragState}
                          onDrop={() => dropOnIncome(income)}
                          onMove={(direction) => moveIncomeByKeyboard(income.id, direction)}
                          onChange={(patch) => updateIncome(income.id, patch)}
                          onRenamed={(previousName) => offerRenameAll("income", income.id, previousName)}
                          onRemove={() => removeIncome(income.id)}
                        />
                      ))
                    ) : currentMonth.incomes.length ? (
                      <EmptyState icon={<Search size={18} />} title="No income matches" text="Clear search to see all income sources." />
                    ) : (
                      <EmptyState
                        icon={<Plus size={18} />}
                        title="Start with income"
                        text="Add salary, invoices, side work, or any money coming in this month."
                        onAction={() => focusNextFrame(incomeSourceInputRef)}
                      />
                    )}
                  </div>
                  <div className="addRow">
                    <button className="addIcon" type="button" onClick={addIncome} aria-label="Add income source">
                      <Plus size={19} />
                    </button>
                    <input
                      id="add-income-source"
                      ref={incomeSourceInputRef}
                      value={incomeDraft.source}
                      list="income-source-suggestions"
                      placeholder="Income source, e.g. Salary"
                      onChange={(event) => {
                        const source = capitalizeFirst(event.target.value);
                        // Picking a remembered merchant prefills its usual amount.
                        const remembered = merchantMemory.find("income", source);
                        setIncomeDraft((draft) => ({
                          source,
                          amount: draft.amount === "" && remembered?.stableAmount ? String(remembered.stableAmount) : draft.amount,
                        }));
                      }}
                      onKeyDown={(event) => handleDraftEnter(event, addIncome)}
                    />
                    <datalist id="income-source-suggestions">
                      {merchantMemory.suggest("income", incomeDraft.source).map((suggestion) => (
                        <option value={suggestion.label} key={suggestion.key} />
                      ))}
                    </datalist>
                    <MoneyInput
                      ariaLabel="Income amount"
                      inputRef={incomeAmountInputRef}
                      value={incomeDraft.amount}
                      symbol={currencySymbol}
                      onEnter={addIncome}
                      onChange={(value) => setIncomeDraft((draft) => ({ ...draft, amount: value }))}
                    />
                    <button className="checkButton" type="button" onClick={addIncome} aria-label="Confirm income">
                      <Check size={18} />
                    </button>
                  </div>
                </Panel>

                <Panel
                  title="Expenses"
                  total={projection.monthlyExpenses}
                  tone="expense"
                  count={currentMonth.expenses.length}
                  privacy={ledger.privacyMode}
                  formatter={moneyFormatter}
                >
                  <div className="tableHeader expenseHeader">
                    <span>Expense</span>
                    <span>Amount</span>
                    <span />
                  </div>
                  <div className="rowStack expenseGroups">
                    {visibleExpenseGroups.length ? (
                      visibleExpenseGroups.map((group) => {
                        const categoryDropActive = Boolean(
                          group.category && dropPreview?.type === "category" && dropPreview.category === group.category,
                        );
                        const categoryCollapsed = Boolean(group.category && collapsedCategories.has(group.category));

                        return (
                          <div
                            className={`${group.category ? "expenseGroup" : "expenseGroup ungrouped"} ${categoryDropActive ? "categoryDropTarget" : ""} ${categoryCollapsed ? "collapsed" : ""}`}
                            key={group.id}
                            style={group.category ? ({ "--category-color": group.color } as CSSProperties) : undefined}
                            onDragOver={group.category ? (event) => previewCategoryDrop(event, group.category) : undefined}
                            onDragLeave={group.category ? handleDropLeave : undefined}
                            onDrop={
                              group.category
                                ? (event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    dropOnCategory(event.dataTransfer.getData("text/plain"), group.category);
                                  }
                                : undefined
                            }
                          >
                            {group.category && (
                              <div className="expenseGroupHeader">
                                <button
                                  className="categoryCollapseButton"
                                  type="button"
                                  onClick={() => toggleCategoryCollapse(group.category)}
                                  aria-label={`${categoryCollapsed ? "Expand" : "Collapse"} ${group.category} category`}
                                  aria-expanded={!categoryCollapsed}
                                >
                                  {categoryCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                                </button>
                                {categoryEmoji(group.category) && (
                                  <span className="categoryEmoji" aria-hidden="true">
                                    {categoryEmoji(group.category)}
                                  </span>
                                )}
                                <input
                                  className="categoryNameInput"
                                  aria-label="Category name"
                                  defaultValue={group.category}
                                  onBlur={(event) => renameExpenseCategory(group.category, event.target.value.trim() || group.category)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") event.currentTarget.blur();
                                  }}
                                />
                                <em>{group.items.length} {group.items.length === 1 ? "expense" : "expenses"}</em>
                                <b className={ledger.privacyMode ? "masked" : ""}>{moneyFormatter.format(group.total)}</b>
                                <button
                                  className="categoryDeleteButton"
                                  type="button"
                                  onClick={() => deleteExpenseCategory(group.category)}
                                  aria-label={`Delete ${group.category} category`}
                                  title="Delete category"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                            {!categoryCollapsed && group.items.map((expense) => {
                              const dropState: ExpenseDropState | undefined =
                                dropPreview?.type === "reorder" && dropPreview.targetId === expense.id
                                  ? dropPreview.edge
                                  : dropPreview?.type === "combine" && dropPreview.targetId === expense.id
                                    ? "combine"
                                    : undefined;

                              return (
                                <ExpenseRow
                                  key={expense.id}
                                  expense={expense}
                                  account={accountById.get(expense.accountId ?? "")}
                                  onCycleAccount={() => cycleEntryAccount("expense", expense.id)}
                                  privacy={ledger.privacyMode}
                                  formatter={moneyFormatter}
                                  symbol={currencySymbol}
                                  linkedAccountName={expense.debtAccountId ? debtAccountNameById.get(expense.debtAccountId) : undefined}
                                  savingsAccountName={expense.toAccountId ? accountNameById.get(expense.toAccountId) : undefined}
                                  dragging={draggingExpenseId === expense.id}
                                  grouping={groupingSourceId === expense.id}
                                  dropState={dropState}
                                  onDragStart={() => setDraggingExpenseId(expense.id)}
                                  onDragOverExpense={(event) => previewExpenseDrop(event, expense)}
                                  onDragEnd={clearDragState}
                                  onDropOnExpense={(sourceId) => dropOnExpense(sourceId, expense)}
                                  onOpenCategoryMenu={(event) => openCategoryMenu(event, expense.id)}
                                  onSelectForGroup={() => {
                                    if (groupingSourceId && groupingSourceId !== expense.id) {
                                      assignCategoryByDrop(groupingSourceId, expense.id);
                                    } else {
                                      setGroupingSourceId(expense.id);
                                      setToast("Choose another expense to group");
                                    }
                                  }}
                                  onChange={(patch) => updateExpense(expense.id, patch)}
                                  onRenamed={(previousName) => offerRenameAll("expense", expense.id, previousName)}
                                  onRemove={() => removeExpense(expense.id)}
                                />
                              );
                            })}
                          </div>
                        );
                      })
                    ) : currentMonth.expenses.length ? (
                      <EmptyState icon={<Search size={18} />} title="No expenses match" text="Clear search to see every expense." />
                    ) : (
                      <EmptyState
                        icon={<FolderPlus size={18} />}
                        title="Add a few expenses"
                        text="Then drag one expense onto another to create a category you can name."
                        onAction={() => focusNextFrame(expenseNameInputRef)}
                      />
                    )}
                  </div>
                  <div className="addRow expenseAddRow">
                    <button className="addIcon expense" type="button" onClick={addExpense} aria-label="Add expense">
                      <Plus size={19} />
                    </button>
                    <input
                      ref={expenseNameInputRef}
                      value={expenseDraft.name}
                      list="expense-name-suggestions"
                      placeholder="What did you spend on?"
                      onChange={(event) => {
                        const name = capitalizeFirst(event.target.value);
                        // Picking a remembered merchant prefills its usual amount;
                        // addExpense fills category/color/recurring from memory too.
                        const remembered = merchantMemory.find("expense", name);
                        setExpenseDraft((draft) => ({
                          name,
                          amount: draft.amount === "" && remembered?.stableAmount ? String(remembered.stableAmount) : draft.amount,
                        }));
                      }}
                      onKeyDown={(event) => handleDraftEnter(event, addExpense)}
                    />
                    <datalist id="expense-name-suggestions">
                      {merchantMemory.suggest("expense", expenseDraft.name).map((suggestion) => (
                        <option value={suggestion.label} key={suggestion.key}>
                          {suggestion.category || undefined}
                        </option>
                      ))}
                    </datalist>
                    <MoneyInput
                      ariaLabel="Expense amount"
                      inputRef={expenseAmountInputRef}
                      value={expenseDraft.amount}
                      symbol={currencySymbol}
                      onEnter={addExpense}
                      onChange={(value) => setExpenseDraft((draft) => ({ ...draft, amount: value }))}
                    />
                    <button className="checkButton expense" type="button" onClick={addExpense} aria-label="Confirm expense">
                      <Check size={18} />
                    </button>
                  </div>
                </Panel>
              </section>

              <section className="notesBand">
                <LedgerAccountsPanel
                  accounts={effectiveAccounts}
                  defaultAccountId={defaultAccountId(ledger)}
                  month={currentMonth}
                  formatter={moneyFormatter}
                  privacy={ledger.privacyMode}
                  t={t}
                  onDefaultChange={(accountId) => updateLedger((current) => ({ ...current, defaultAccountId: accountId }))}
                  onGoToAccounts={() => setActiveView("accounts")}
                  onNoteChange={(note) => updateCurrentMonth((month) => ({ ...month, note }))}
                  onResetMonth={resetMonth}
                />
              </section>

              <div className="annualInsightsCta">
                <button className="commandButton" type="button" onClick={openAnnualView}>
                  <LineChart size={16} />
                  See the year on the Dashboard
                </button>
              </div>
            </section>
          )}

          {activeView === "accounts" && (
            <section className="viewStack" aria-label="Accounts">
              <div className="pageHeader compactHeader">
                <div>
                  <h2>Accounts</h2>
                  <p>{t("Savings, current accounts, and investments alongside debt — together they make your net worth.")}</p>
                </div>
                <div className="netBlock">
                  <span>Net Worth</span>
                  <strong className={`${netWorthSummary.netWorth >= 0 ? "positiveText" : "negativeText"} ${ledger.privacyMode ? "masked" : ""}`}>
                    <AnimatedCurrency value={netWorthSummary.netWorth} formatter={moneyFormatter} />
                  </strong>
                </div>
              </div>

              <section className="summaryStrip" aria-label="Net worth snapshot">
                <MetricCard label="Total assets" value={netWorthSummary.totalAssets} tone="green" privacy={ledger.privacyMode} formatter={moneyFormatter} />
                <MetricCard label="Total debt" value={debtSummary.totalDebt} tone="red" privacy={ledger.privacyMode} formatter={moneyFormatter} />
                <MetricCard label="Monthly into accounts" value={assetSummary.monthlyContributions} tone="amber" privacy={ledger.privacyMode} formatter={moneyFormatter} />
                <MetricCard label="Card utilization" value={debtSummary.utilization} suffix="%" tone={debtSummary.utilization < 30 ? "green" : "amber"} />
              </section>

              <section className="accountsGrid">
                <article className="miniPanel accountsPanel">
                  <PanelTitle title={region === "US" ? "Savings, cash, investments & retirement" : "Savings, cash & investments"} icon={<PiggyBank size={16} />} />
                  <div className="debtAccountList">
                    {effectiveAccounts.filter((a) => a.accountClass !== "debt").length ? (
                      effectiveAccounts
                        .filter((a) => a.accountClass !== "debt")
                        .map((account) => (
                          <AccountRow
                            key={account.id}
                            account={account}
                            otherColors={ledger.accounts.filter((other) => other.id !== account.id).map((other) => other.color)}
                            region={region}
                            taxProfile={ledger.taxProfile}
                            symbol={currencySymbol}
                            formatter={moneyFormatter}
                            privacy={ledger.privacyMode}
                            onChange={(patch) => updateAccount(account.id, patch)}
                            onRemove={() => removeAccount(account.id)}
                          />
                        ))
                    ) : (
                      <EmptyState
                        icon={<PiggyBank size={18} />}
                        title="No asset accounts"
                        text={
                          region === "US"
                            ? "Add a checking, savings, brokerage or retirement account (401(k), IRA, HSA) below to start tracking net worth."
                            : "Add a savings, current, or investment account below to start tracking net worth."
                        }
                      />
                    )}
                  </div>
                </article>

                <article className="miniPanel accountsPanel">
                  <PanelTitle title="Debt accounts" icon={<CreditCard size={16} />} />
                  <div className="debtAccountList">
                    {effectiveAccounts.filter((a) => a.accountClass === "debt").length ? (
                      effectiveAccounts
                        .filter((a) => a.accountClass === "debt")
                        .map((account) => (
                          <AccountRow
                            key={account.id}
                            account={account}
                            otherColors={ledger.accounts.filter((other) => other.id !== account.id).map((other) => other.color)}
                            region={region}
                            taxProfile={ledger.taxProfile}
                            symbol={currencySymbol}
                            formatter={moneyFormatter}
                            privacy={ledger.privacyMode}
                            autoNote={debtAutoTrackNote(account, ledger.accounts)}
                            onChange={(patch) => updateAccount(account.id, patch)}
                            onRemove={() => removeAccount(account.id)}
                          />
                        ))
                    ) : (
                      <EmptyState
                        icon={<CreditCard size={18} />}
                        title="No debt accounts"
                        text={region === "US" ? "Add a credit card, mortgage, auto loan, student loan or other balance to track it here." : "Add a credit card, loan, mortgage, student loan, overdraft, or other balance to track it here."}
                      />
                    )}
                  </div>
                </article>

                <DebtRemindersPanel
                  reminders={effectiveAccounts
                    .filter((account) => account.accountClass === "debt" && account.balance > 0)
                    .map((account) => ({
                      id: account.id,
                      name: account.name,
                      dueDay: clampDueDay(account.dueDay),
                      amountLabel: !ledger.privacyMode && account.minimumPayment > 0 ? moneyFormatter.format(account.minimumPayment) : null,
                    }))}
                  onDownloadIcs={(name, contents) => {
                    downloadFile(name, contents, "text/calendar");
                    setToast("Reminders saved. Open the file to add them to your calendar.");
                  }}
                  onReminderAdded={(method) => track("reminder_added", { method, kind: "debt" })}
                />

                <AccountEditor
                  draft={accountDraft}
                  setDraft={setAccountDraft}
                  region={region}
                  symbol={currencySymbol}
                  assumedReturn={ledger.assumedInvestmentReturn}
                  onAdd={addAccount}
                />

                <article className="miniPanel investmentSettingPanel">
                  <PanelTitle title="Investment assumption" icon={<TrendingUp size={16} />} />
                  <p className="panelSubcopy">
                    New investment accounts default to this assumed annual return. Returns are an estimate, not a guarantee — markets can fall as well as rise.
                  </p>
                  <label className="numberField hintField assumedReturnField">
                    <input
                      value={String(ledger.assumedInvestmentReturn)}
                      inputMode="decimal"
                      aria-label="Assumed annual investment return"
                      onChange={(event) =>
                        updateLedger((current) => ({ ...current, assumedInvestmentReturn: Math.max(-50, Math.min(50, Number(event.target.value) || 0)) }))
                      }
                    />
                    <span className="fieldSuffix">% / year</span>
                  </label>
                </article>
              </section>

            </section>
          )}

          {activeView === "pay" && (
            <section className="viewStack" aria-label={payPageTitle}>
              <div className="pageHeader compactHeader">
                <div>
                  <h2>{payPageTitle}</h2>
                  <p>
                    {region === "US"
                      ? "What your gross salary becomes after federal and state tax, Social Security, Medicare and paycheck deductions — and one click to use it as income."
                      : "What your gross salary becomes after income tax, National Insurance, student loan and pension — and one click to use it as income."}
                  </p>
                </div>
                <div className="netBlock">
                  <span>Take-home per month</span>
                  <strong className={`positiveText ${ledger.privacyMode ? "masked" : ""}`}>
                    <AnimatedCurrency value={takeHome.netMonthly} formatter={moneyFormatter} />
                  </strong>
                </div>
              </div>

              <TakeHomeEstimator
                region={region}
                taxProfile={ledger.taxProfile}
                accounts={ledger.accounts}
                formatter={moneyFormatter}
                symbol={currencySymbol}
                privacy={ledger.privacyMode}
                onChange={(patch) => updateLedger((current) => ({ ...current, taxProfile: { ...current.taxProfile, ...patch } }))}
                onUseAsIncome={applyTakeHomeIncome}
              />

              <section className="payGrid">
                <article className="miniPanel payrollPanel">
                  <PanelTitle title={region === "US" ? "Paycheck deductions from your accounts" : "Deductions from pay on your accounts"} icon={<Landmark size={16} />} />
                  {payrollAccounts.length ? (
                    <>
                      <p className="panelSubcopy">
                        {region === "US"
                          ? "Accounts set to contribute from your paycheck. Pre-tax money lowers the income tax above; Roth money comes out after tax."
                          : "Accounts set to contribute from your pay before tax. They lower the income tax above (net-pay arrangement)."}
                      </p>
                      <div className="retirementAccounts">
                        {payrollAccounts.map((account) => (
                          <div className="retirementAccount" key={account.id}>
                            <span className="swatch small" style={{ background: account.color }} />
                            <div className="subscriptionName">
                              <strong>{account.name}</strong>
                              <em>{accountTypeOption(region, account.accountClass, account.type).label}{account.taxTreatment === "roth" ? " · after tax" : " · before tax"}</em>
                            </div>
                            <strong className={ledger.privacyMode ? "masked" : ""}>{moneyFormatter.format(account.monthlyContribution)}/mo</strong>
                            <em className={ledger.privacyMode ? "masked" : ""}>{account.employerMonthlyContribution ? `+${moneyFormatter.format(account.employerMonthlyContribution)} employer` : ""}</em>
                          </div>
                        ))}
                      </div>
                      <button className="linkButton" type="button" onClick={() => setActiveView("accounts")}>
                        Change contributions on Accounts →
                      </button>
                    </>
                  ) : (
                    <EmptyState
                      icon={<Landmark size={18} />}
                      title={region === "US" ? "No paycheck deductions yet" : "No deductions from pay yet"}
                      text={
                        region === "US"
                          ? "Add a 401(k), 403(b), HSA or FSA on Accounts and set its contributions to come from your paycheck; they are taken off here automatically."
                          : "Add a workplace pension on Accounts and set its contributions to come from your pay; they are taken off here automatically."
                      }
                      onAction={() => setActiveView("accounts")}
                    />
                  )}
                </article>

                <article className="miniPanel payNotesPanel">
                  <PanelTitle title="What this covers" icon={<InfoHint label="About the estimate" text={region === "US" ? "Federal brackets and the standard deduction for your filing status, Social Security up to the wage base, Medicare including the additional 0.9%, and one flat state rate. Credits, itemized deductions, local taxes, bonuses and multiple jobs are not modeled." : "Income tax at the England, Wales and Northern Ireland rates with the standard personal allowance and its taper, employee Class 1 National Insurance, student-loan deductions by plan and net-pay pension contributions. Scottish rates, benefits in kind, other tax codes and the High Income Child Benefit Charge are not modelled."} />} />
                  <ul className="payNotes">
                    {region === "US" ? (
                      <>
                        <li>Federal income tax from the {takeHome.yearLabel} brackets and standard deduction.</li>
                        <li>Social Security (6.2%, up to the wage base) and Medicare (1.45%, plus 0.9% on high earners).</li>
                        <li>State income tax as a single rate — flat-tax states exactly, others roughly. Override it if you know yours.</li>
                        <li>401(k)/403(b), HSA and FSA contributions and pre-tax health premiums from your own figures.</li>
                        <li>Not included: credits, itemized deductions, local taxes, bonuses, a second job or a spouse's income.</li>
                      </>
                    ) : (
                      <>
                        <li>Income tax for {takeHome.yearLabel} at the England, Wales and Northern Ireland rates, with the personal allowance tapering above £100,000.</li>
                        <li>Employee National Insurance at 8% between the thresholds and 2% above the upper limit.</li>
                        <li>Student loan by plan — 9% of pay above the threshold, 6% for a postgraduate loan.</li>
                        <li>Pension contributions taken before tax from the accounts you set up.</li>
                        <li>Not included: Scottish rates, other tax codes, benefits in kind, bonuses or the High Income Child Benefit Charge.</li>
                      </>
                    )}
                  </ul>
                  <p className="panelSubcopy">An estimate for planning, not tax advice. Your payslip is the real figure.</p>
                </article>
              </section>
            </section>
          )}

          {activeView === "goals" && (
            <GoalsView
              goals={ledger.goals}
              goalSequence={goalSequence}
              goalPlannerSurplus={goalPlannerSurplus}
              routedElsewhere={goalPlan.routedElsewhere}
              dedicatedMonthly={goalPlan.dedicatedMonthly}
              savingsAccounts={effectiveAccounts.filter((account) => account.accountClass !== "debt")}
              surplexOverridden={ledger.goalPlannerSurplus !== null}
              goalsHorizonMonths={ledger.goalsHorizonMonths}
              currency={ledger.currency}
              symbol={currencySymbol}
              formatter={moneyFormatter}
              privacy={ledger.privacyMode}
              t={t}
              onAddGoal={addGoal}
              onUpdateGoal={updateGoal}
              onRemoveGoal={removeGoal}
              onReorderGoal={reorderGoal}
              onSurplusOverride={(v) => updateLedger((c) => ({ ...c, goalPlannerSurplus: v }))}
              onHorizonChange={(h) => updateLedger((c) => ({ ...c, goalsHorizonMonths: h }))}
            />
          )}

          {activeView === "allocate" && (
            <AllocateView
              comparison={allocationPlan}
              settings={ledger.allocation}
              ledgerSurplus={ledgerSpare}
              monthlyExpenses={projection.recurringMonthlyExpenses}
              assumedInvestmentReturn={ledger.assumedInvestmentReturn}
              region={region}
              country={ledger.country}
              taxProfile={ledger.taxProfile}
              symbol={currencySymbol}
              formatter={moneyFormatter}
              privacy={ledger.privacyMode}
              t={t}
              onChange={updateAllocation}
              onOpenAccounts={() => setActiveView("accounts")}
              onOpenGoals={() => setActiveView("goals")}
            />
          )}

          {activeView === "subscriptions" && (
            <SubscriptionsView
              report={subscriptionReport}
              formatter={moneyFormatter}
              preciseFormatter={preciseFormatter}
              privacy={ledger.privacyMode}
              t={t}
              onCancel={cancelSubscription}
              onReactivate={(subscription) => {
                updateLedger((current) => reactivateSubscription(current, subscription));
                setToast(t(`${subscription.label} is active again`));
              }}
              onDelete={(subscription) => {
                updateLedger((current) => deleteSubscription(current, subscription));
                setToast(t(`${subscription.label} removed from Subscriptions`));
                track("subscription_deleted", { status: subscription.status });
              }}
              onRestoreDeleted={() => {
                updateLedger((current) => restoreDeletedSubscriptions(current));
                setToast("Removed subscriptions restored");
              }}
              onSetKind={(subscription, kind) => updateLedger((current) => setSubscriptionKind(current, subscription, kind))}
              onSetTolerance={(subscription, days) => updateLedger((current) => setSubscriptionTolerance(current, subscription, days))}
              onMarkRecurring={(subscription) => {
                updateLedger((current) => setSubscriptionRecurring(current, subscription, true));
                setToast(`${subscription.label} marked recurring — it now feeds the forecast`);
                track("recurring_marked", { cadence: subscription.cadence });
              }}
              onOpenLedger={(monthKey) => {
                updateLedger((current) => (current.months[monthKey] ? { ...current, selectedMonth: monthKey } : current));
                setActiveView("ledger");
              }}
              onImport={() => csvInputRef.current?.click()}
            />
          )}

          {activeView === "settings" && (
            <section className="viewStack" aria-label="Settings">
              <div className="pageHeader settingsHeader">
                <div>
                  <h2>Settings</h2>
                  <p>Your data, imports, rules, and preferences.</p>
                </div>
                <button className="privacyBadge" type="button" onClick={() => setShowFeedbackModal(true)}>
                  <CircleHelp size={15} />
                  Submit feedback
                </button>
              </div>

              <article className="architectureNote">
                <Cloud size={21} />
                <div>
                  <h3>Where your data lives</h3>
                  <p>
                    Everything is saved in this browser. Sign in and it also backs up privately to the cloud, so you can pick up on
                    another device. Export a full copy below any time.
                  </p>
                </div>
                <button className="commandButton" type="button" onClick={() => setOnboardingOpen(true)}>
                  <Sparkles size={15} />
                  Run quick setup
                </button>
              </article>

              <section className="settingsGrid">
                <article className="settingsPanel dataPanel">
                  <PanelTitle title="Data control" icon={<Database size={17} />} />
                  <div className="dataActionGrid">
                    <div className="dataAction">
                      <Download size={20} />
                      <h3>Export vault</h3>
                      <p>Download a complete snapshot of your ledger and settings.</p>
                      <div className="buttonRow">
                        <button className="commandButton" type="button" onClick={exportJson}>
                          <FileJson size={16} />
                          Export JSON
                        </button>
                        <button className="commandButton" type="button" onClick={exportCsv}>
                          <Download size={16} />
                          Export CSV
                        </button>
                      </div>
                    </div>
                    <div className="dataAction">
                      <Upload size={20} />
                      <h3>Import data</h3>
                      <p>Review bank transactions from a CSV, OFX, QIF or PDF statement, or restore a previous JSON backup.</p>
                      <div className="buttonRow">
                        <button className="commandButton" type="button" onClick={() => csvInputRef.current?.click()}>
                          <FileSpreadsheet size={16} />
                          Import CSV / OFX / QIF / PDF
                        </button>
                        <button className="commandButton" type="button" onClick={() => void importFromClipboard()}>
                          <ClipboardPaste size={16} />
                          Paste
                        </button>
                        <button className="commandButton" type="button" onClick={() => fileInputRef.current?.click()}>
                          <Upload size={16} />
                          Import JSON
                        </button>
                      </div>
                    </div>
                  </div>
                  {ledger.importBatches.length > 0 && (
                    <div className="importHistory">
                      <div className="historyHead compact">
                        <span>Recent imports</span>
                        <span>Rows</span>
                        <span>Date</span>
                        <span />
                      </div>
                      {ledger.importBatches.slice(0, 5).map((batch) => (
                        <div className="importHistoryRow" key={batch.id}>
                          <strong>{batch.fileName}</strong>
                          <span>{batch.importedRows}</span>
                          <span>{new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(batch.importedAt))}</span>
                          <button className="commandButton" type="button" onClick={() => undoImportBatch(batch.id)}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <aside className="settingsSide">
                  <article className="settingsPanel compactSetting">
                    <PanelTitle title="Country & currency" icon={<WalletCards size={17} />} />
                    <p>
                      {region === "US"
                        ? "US accounts, tax tools and spelling are on. Currency only changes the symbol."
                        : "Country picks the account types, tools and spelling; the United States has its own experience. Currency only changes the symbol."}
                    </p>
                    <label className="selectField">
                      <select value={ledger.country} onChange={(event) => changeCountry(event.target.value as CountryCode)} aria-label="Settings country">
                        {countryOptions.map((option) => (
                          <option value={option.code} key={option.code}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="selectField">
                      <select value={ledger.currency} onChange={(event) => changeCurrency(event.target.value as CurrencyCode)} aria-label="Settings currency">
                        {currencyOptions.map((option) => (
                          <option value={option.code} key={option.code}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </article>

                  <MonthlyReminderPanel
                    bankSlug={bankSlug}
                    onBankChange={setBankSlug}
                    onDownloadIcs={(name, contents) => {
                      downloadFile(name, contents, "text/calendar");
                      setToast("Reminder saved. Open the file to add it to your calendar.");
                    }}
                    onReminderAdded={(method) => track("reminder_added", { method })}
                  />

                  {isSupabaseConfigured() && (
                    <article className="settingsPanel compactSetting">
                      <PanelTitle title="AI categorisation" icon={<Sparkles size={17} />} />
                      <p>
                        Let AI suggest categories for import rows nothing else matched. Only transaction descriptions leave this
                        device — never amounts, dates, or balances. Your own rules always win.
                        {!user && " Sign in to enable."}
                      </p>
                      <button
                        className={ledger.aiCategorizationEnabled && user ? "switch on" : "switch"}
                        type="button"
                        aria-label="Toggle AI categorisation"
                        disabled={!user}
                        onClick={() => {
                          const turningOn = !ledger.aiCategorizationEnabled;
                          updateLedger((current) => ({ ...current, aiCategorizationEnabled: !current.aiCategorizationEnabled }));
                          if (!turningOn) {
                            setToast("AI categorisation off");
                            return;
                          }
                          // Verify the whole chain now, not silently at the next import.
                          setToast("AI categorisation on — checking the connection…");
                          void testAiConnection().then((status) => {
                            setToast(
                              status === "ok"
                                ? "AI connected ✓ — low-confidence import rows will get suggestions"
                                : status === "no-api-key"
                                  ? "AI backend reachable but ANTHROPIC_API_KEY isn’t set in Supabase secrets"
                                  : status === "not-deployed"
                                    ? "The categorize-batch function isn’t deployed to Supabase yet"
                                    : status === "unauthenticated"
                                      ? "Sign in again — the AI backend rejected the session"
                                      : "Couldn’t reach the AI backend — check the Supabase function logs",
                            );
                          });
                        }}
                      >
                        <span />
                      </button>
                    </article>
                  )}
                </aside>
              </section>

              {isFeedsEnabled() && feedsReady && (
                <article className="settingsPanel bankFeedsPanel">
                  <PanelTitle title="Bank connections" icon={<CreditCard size={17} />} />
                  <p className="panelSubcopy">
                    Connect a bank through our regulated open-banking partner and new transactions arrive here automatically —
                    no credentials ever touch this app. UK rules ask you to reconfirm consent every 90 days, right here, one tap.
                  </p>
                  {bankConnections.length > 0 && (
                    <div className="bankConnectionList">
                      {bankConnections.map((connection) => {
                        const daysLeft = daysUntilConsentExpiry(connection);
                        const needsReconfirm = connection.status === "expired" || (daysLeft !== null && daysLeft <= 10);
                        return (
                          <div className="bankConnectionRow" key={connection.id}>
                            <div className="subscriptionName">
                              <strong>{connection.display_name}</strong>
                              <em>
                                {connection.status === "active"
                                  ? connection.last_synced_at
                                    ? `Synced ${new Intl.DateTimeFormat("en", { day: "2-digit", month: "short" }).format(new Date(connection.last_synced_at))}`
                                    : "Waiting for first sync"
                                  : connection.status}
                                {daysLeft !== null && daysLeft > 0 ? ` · consent ${daysLeft}d left` : ""}
                              </em>
                            </div>
                            {needsReconfirm && (
                              <button className="commandButton" type="button" onClick={() => void reconfirmBank(connection.id)}>
                                Keep connected
                              </button>
                            )}
                            <button className="commandButton" type="button" onClick={() => void disconnectBank(connection.id)}>
                              Disconnect
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="buttonRow">
                    <button className="commandButton" type="button" disabled={feedsBusy || !user} onClick={() => void connectBank()}>
                      <Plus size={15} />
                      Connect a bank
                    </button>
                    {bankConnections.length > 0 && (
                      <>
                        <button className="commandButton" type="button" disabled={feedsBusy} onClick={() => void syncBankFeeds()}>
                          <RotateCcw size={15} />
                          Sync now
                        </button>
                        {stagedFeedCount > 0 && (
                          <button className="commandButton" type="button" disabled={feedsBusy} onClick={() => void reviewBankFeed()}>
                            Review {stagedFeedCount} new
                          </button>
                        )}
                      </>
                    )}
                    {!user && <span className="quickAddHint">Sign in to connect a bank.</span>}
                  </div>
                </article>
              )}

              <article className="settingsPanel transferRulesPanel">
                <PanelTitle title="Transfer rules" icon={<Repeat size={17} />} />
                <p className="panelSubcopy">
                  Money moving between your own accounts isn’t income or spending. Mark a payee as a transfer during import — or add one
                  here — and it’s skipped on every future import and removed from your ledger.
                </p>
                <div className="transferRuleAdd">
                  <input
                    value={transferRuleInput}
                    placeholder="Payee to treat as a transfer, e.g. Transfer to Savings"
                    aria-label="Add a transfer payee"
                    onChange={(event) => setTransferRuleInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addTransferRule();
                    }}
                  />
                  <button className="commandButton" type="button" onClick={addTransferRule}>
                    <Plus size={16} />
                    Add
                  </button>
                </div>
                {transferRules.length ? (
                  <ul className="transferRuleList">
                    {transferRules.map((rule) => (
                      <li key={rule.id}>
                        <span>{rule.pattern}</span>
                        <button
                          className="iconButton"
                          type="button"
                          aria-label={`Remove transfer rule ${rule.pattern}`}
                          onClick={() => removeTransferRule(rule.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="transferRuleEmpty">
                    No transfer rules yet. Set a transaction’s type to “Transfer” during import, or add a payee above.
                  </p>
                )}
              </article>

              <article className="settingsPanel learnedRulesPanel">
                <PanelTitle title="Learned category rules" icon={<GraduationCap size={17} />} />
                <p className="panelSubcopy">
                  Created automatically when you correct an imported transaction — future imports matching the pattern get the
                  category instantly. Delete any rule that misfires; the next correction re-learns it.
                </p>
                {learnedRules.length ? (
                  <ul className="transferRuleList">
                    {learnedRules.map(({ rule, matches }) => (
                      <li key={rule.id}>
                        <code>{rule.pattern}</code>
                        <span className="learnedRuleTarget">
                          → {rule.category}
                          {rule.kind === "debt-payment" ? " (debt payment)" : rule.kind === "income" ? " (income)" : ""}
                        </span>
                        <em className="learnedRuleMatches">
                          {matches} match{matches === 1 ? "" : "es"}
                        </em>
                        <button
                          className="iconButton"
                          type="button"
                          aria-label={`Remove rule ${rule.pattern}`}
                          onClick={() => removeCategoryRule(rule.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="transferRuleEmpty">No learned rules yet — correct a category on an imported transaction to create one.</p>
                )}
              </article>

              <article className="settingsPanel learnedRulesPanel">
                <PanelTitle title="Rename rules" icon={<PenLine size={17} />} />
                <p className="panelSubcopy">
                  Created when you rename a transaction and choose “Rename all”. Future imports with the old name arrive with your
                  name instead. Renaming again updates the rule.
                </p>
                {ledger.nameRules.length ? (
                  <ul className="transferRuleList">
                    {ledger.nameRules.map((rule) => (
                      <li key={rule.id}>
                        <code>{rule.from}</code>
                        <span className="learnedRuleTarget">
                          → {rule.to}
                          {rule.kind === "income" ? " (income)" : ""}
                        </span>
                        <button
                          className="iconButton"
                          type="button"
                          aria-label={`Remove rename rule ${rule.from}`}
                          onClick={() => removeNameRule(rule.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="transferRuleEmpty">No rename rules yet — rename a transaction that shares its name with others to create one.</p>
                )}
              </article>

              <article className="dangerPanel">
                <div>
                  <h3>Danger Zone</h3>
                  <p>Clear the currently selected month. Your other saved months and settings remain intact.</p>
                </div>
                <button className="dangerButton" type="button" onClick={resetMonth}>
                  Clear selected month
                </button>
              </article>

              <article className="dangerPanel">
                <div>
                  <h3>Clear all data</h3>
                  <p>
                    {confirmClearAll
                      ? `This permanently deletes every month, account, goal, rule and import${user ? ", here and in the cloud" : ""}. It can't be undone — export a backup first if you might want it.`
                      : "Delete everything and start again as a new user. Your sign-in, country and theme stay."}
                  </p>
                </div>
                {confirmClearAll ? (
                  <div className="dangerConfirm">
                    <button className="commandButton" type="button" onClick={() => setConfirmClearAll(false)}>
                      Cancel
                    </button>
                    <button className="dangerButton" type="button" onClick={() => void clearAllData()}>
                      Yes, delete everything
                    </button>
                  </div>
                ) : (
                  <button className="dangerButton" type="button" onClick={() => setConfirmClearAll(true)}>
                    Clear all data
                  </button>
                )}
              </article>
            </section>
          )}
        </main>

        <footer className="bottomRail" aria-label="Annual summary">
          <span>{selectedYear} projection</span>
          <span>
            Yearly income <b className={ledger.privacyMode ? "masked" : ""}>{moneyFormatter.format(projection.annualIncome)}</b>
          </span>
          <span>
            Yearly spending <b className={ledger.privacyMode ? "masked" : ""}>{moneyFormatter.format(projection.annualExpenses)}</b>
          </span>
          <span>
            Left over <b className={projection.annualSurplus >= 0 ? "positiveText sensitive" : "negativeText sensitive"}>{moneyFormatter.format(projection.annualSurplus)}</b>
          </span>
        </footer>

        {lastImportAction && (
          <div className="undoImportToast" role="status">
            <span>
              <b>{lastImportAction.importedRows}</b> imported from {lastImportAction.fileName}
            </span>
            <button className="commandButton" type="button" onClick={() => undoImportBatch(lastImportAction.batchId)}>
              Undo import
            </button>
            <button
              className="iconButton undoImportClose"
              type="button"
              onClick={() => setLastImportAction(null)}
              aria-label="Dismiss"
              data-tip="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {onboardingOpen && <Onboarding initialCountry={ledger.country} initialCurrency={ledger.currency} onFinish={finishOnboarding} />}

        {tutorialView && <TutorialOverlay tutorial={tutorialsFor(region)[tutorialView]} t={t} onClose={closeTutorial} />}

        {toastVisible && (
          <div className="statusToast" role="status" aria-live="polite">
            {toast}
          </div>
        )}

        {accountToast && (
          <div className="statusToast accountToast" role="status" aria-live="polite" key={accountToast.stamp}>
            <span className="accountToastDot" style={{ background: accountToast.color }} />
            {accountToast.name}
          </div>
        )}

        {importReview && (
          <ImportReviewModal
            review={importReview}
            categoryOptions={importCategoryOptions}
            debtAccounts={ledger.accounts.filter((account) => account.accountClass === "debt")}
            accounts={ledger.accounts}
            formatter={moneyFormatter}
            onAccountChange={(accountId) => setImportReview((current) => (current ? { ...current, accountId } : current))}
            onClose={() => {
              feedRowMapRef.current = null; // cancelled feed reviews stay staged
              setImportReview(null);
            }}
            onToggleFlip={toggleImportSignFlip}
            onRowChange={updateImportReviewRow}
            onToggleAll={setAllImportRowsIncluded}
            onSkipDuplicates={skipDuplicateImportRows}
            onBulkCategory={applyImportCategoryToIncluded}
            onConfirm={confirmCsvImport}
          />
        )}

        {categoryMenu && menuExpense && (
          <CategoryContextMenu
            expense={menuExpense}
            options={categoryOptions}
            debtAccounts={effectiveAccounts.filter((account) => account.accountClass === "debt")}
            savingsAccounts={effectiveAccounts.filter((account) => account.accountClass !== "debt")}
            formatter={moneyFormatter}
            privacy={ledger.privacyMode}
            x={categoryMenu.x}
            y={categoryMenu.y}
            onMove={(category) => moveExpenseFromMenu(menuExpense.id, category)}
            onUngroup={() => ungroupExpense(menuExpense.id)}
            onLinkDebt={(debtAccountId) => linkExpenseToDebt(menuExpense.id, debtAccountId)}
            onLinkSavings={(toAccountId) => linkExpenseToSavings(menuExpense.id, toAccountId)}
          />
        )}
      </div>

      {user && !cloudHydrated && !syncConflict && <VaultOverlay />}

      {showSyncNudge && !user && (
        <SyncNudge
          onSignIn={() => { setShowSyncNudge(false); setShowSignInModal(true); }}
          onDismiss={() => { nudgeDismissedRef.current = true; setShowSyncNudge(false); }}
        />
      )}

      {(showSignInModal || authWorking) && !user && (
        <SignInModal
          onSignIn={handleSignIn}
          onDismiss={() => setShowSignInModal(false)}
          working={authWorking}
          configured={isSupabaseConfigured()}
        />
      )}

      {syncConflict && (
        <MergeConflictModal
          conflict={syncConflict}
          onKeepLocal={() => { void handleKeepLocal(); }}
          onUseCloud={handleUseCloud}
        />
      )}

      {renamePrompt && (
        <RenameAllModal
          prompt={renamePrompt}
          onRenameAll={() => confirmRenameAll(renamePrompt)}
          onJustThisOne={() => setRenamePrompt(null)}
        />
      )}

      {showFeedbackModal && (
        <FeedbackModal
          userId={user?.id}
          onDismiss={() => setShowFeedbackModal(false)}
        />
      )}

      {showPdfNotice && !onboardingOpen && !importReview && (
        <PdfImportNotice onImport={() => dismissPdfNotice("import")} onDismiss={() => dismissPdfNotice("dismiss")} />
      )}
      <Analytics />
    </div>
  );
}

function AuthGate({
  mode,
  onSignIn,
  working,
  configured,
}: {
  mode: "loading" | "signin" | "opening";
  onSignIn: () => void;
  working: boolean;
  configured: boolean;
}) {
  void onSignIn; void working; void configured;
  const detail = mode === "opening"
    ? "Checking your account and restoring the latest ledger snapshot."
    : "Loading your data…";

  return (
    <main className="authShell" aria-label="Loading">
      <section className="authPanel">
        <div className="authBrand">
          <img src="/icon.svg" alt="" width="36" height="36" style={{borderRadius: '10px', flexShrink: 0}} aria-hidden="true" />
          <div>
            <h1>The Income Tracker</h1>
          </div>
        </div>
        <div className="authCopy">
          <p>{detail}</p>
        </div>
        <div className="authLoadingRow">
          <div className="vaultSpinner" aria-hidden="true" />
          <span>Please wait…</span>
        </div>
      </section>
    </main>
  );
}

function SignInModal({
  onSignIn,
  onDismiss,
  working,
  configured,
}: {
  onSignIn: () => void;
  onDismiss: () => void;
  working: boolean;
  configured: boolean;
}) {
  return (
    <div
      className="modalBackdrop signInBackdrop"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div className="signInModal" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <button className="iconButton signInClose" type="button" onClick={onDismiss} aria-label="Close">
          <X size={18} />
        </button>
        <div className="signInModalBrand">
          <img src="/icon.svg" alt="" width="40" height="40" style={{ borderRadius: 10, flexShrink: 0 }} aria-hidden="true" />
          <div>
            <h2 id="signin-title">Sync your data</h2>
            <p>Back it up and use it anywhere</p>
          </div>
        </div>
        <ul className="signInBenefits">
          <li><ShieldCheck size={14} /> Data isolated with row-level security</li>
          <li><Cloud size={14} /> Automatic sync on every save</li>
          <li><RotateCcw size={14} /> Restore instantly on any device</li>
        </ul>
        {configured ? (
          <button className="googleButton" type="button" onClick={onSignIn} disabled={working}>
            <span aria-hidden="true">G</span>
            {working ? "Redirecting…" : "Continue with Google"}
          </button>
        ) : (
          <div className="authWarning" role="alert">
            <AlertCircle size={18} />
            Add `VITE_SUPABASE_PUBLISHABLE_KEY` to enable sign-in.
          </div>
        )}
        <button className="signInSkip" type="button" onClick={onDismiss}>
          Continue without signing in
        </button>
      </div>
    </div>
  );
}

function MergeConflictModal({
  conflict,
  onKeepLocal,
  onUseCloud,
}: {
  conflict: SyncConflict;
  onKeepLocal: () => void;
  onUseCloud: () => void;
}) {
  const local = ledgerSummary(conflict.local);
  const cloud = ledgerSummary(conflict.cloud);
  return (
    <div className="modalBackdrop mergeBackdrop">
      <div className="mergeModal" role="dialog" aria-modal="true" aria-labelledby="merge-title">
        <div className="mergeModalIcon">
          <Cloud size={24} />
        </div>
        <h2 id="merge-title">Your account already has data</h2>
        <p>Both this device and your cloud have separate data. Choose which to keep — the other will be overwritten.</p>
        <div className="mergeOptions">
          <button className="mergeOption" type="button" onClick={onKeepLocal}>
            <strong>Keep this device's data</strong>
            <span>{local.transactions} transaction{local.transactions !== 1 ? "s" : ""} · {local.months} month{local.months !== 1 ? "s" : ""}</span>
            <small>Cloud data will be replaced.</small>
          </button>
          <button className="mergeOption" type="button" onClick={onUseCloud}>
            <strong>Use cloud data</strong>
            <span>{cloud.transactions} transaction{cloud.transactions !== 1 ? "s" : ""} · {cloud.months} month{cloud.months !== 1 ? "s" : ""}</span>
            <small>Local data will be cleared.</small>
          </button>
        </div>
      </div>
    </div>
  );
}

function FeedbackModal({
  userId,
  onDismiss,
}: {
  userId?: string;
  onDismiss: () => void;
}) {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("general");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setStatus("sending");
    try {
      await submitFeedback({
        type: feedbackType,
        subject: subject.trim(),
        description: description.trim(),
        email: email.trim() || undefined,
        userId,
      });
      setStatus("sent");
      setTimeout(onDismiss, 2000);
    } catch {
      setStatus("error");
    }
  }

  const placeholder =
    feedbackType === "bug"
      ? "What went wrong?"
      : feedbackType === "feature"
        ? "What would you like to see?"
        : "Your message";

  return (
    <div
      className="modalBackdrop feedbackBackdrop"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div className="feedbackModal" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <button className="iconButton feedbackClose" type="button" onClick={onDismiss} aria-label="Close">
          <X size={18} />
        </button>
        {status === "sent" ? (
          <div className="feedbackSuccess">
            <Check size={32} />
            <h2 id="feedback-title">Thanks for your feedback!</h2>
            <p>We'll review it shortly.</p>
          </div>
        ) : (
          <form onSubmit={(e) => { void handleSubmit(e); }}>
            <h2 id="feedback-title">Send feedback</h2>
            <p>Help us improve the Income Tracker.</p>
            <div className="feedbackTypeRow">
              {(["bug", "feature", "general"] as FeedbackType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={feedbackType === t ? "feedbackTypeBtn active" : "feedbackTypeBtn"}
                  onClick={() => setFeedbackType(t)}
                >
                  {t === "bug" ? "Bug report" : t === "feature" ? "Feature request" : "General"}
                </button>
              ))}
            </div>
            <label className="feedbackLabel">
              Subject
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={placeholder}
                required
                maxLength={200}
              />
            </label>
            <label className="feedbackLabel">
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add more detail…"
                required
                rows={4}
                maxLength={2000}
              />
            </label>
            <label className="feedbackLabel">
              <span>Email <span className="feedbackOptional">(optional, for follow-up)</span></span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            {status === "error" && (
              <p className="feedbackError" role="alert">
                <AlertCircle size={14} /> Couldn't send feedback. Please try again.
              </p>
            )}
            <div className="feedbackFooter">
              <button type="button" className="commandButton" onClick={onDismiss}>Cancel</button>
              <button
                type="submit"
                className="commandButton feedbackSubmit"
                disabled={status === "sending" || !subject.trim() || !description.trim()}
              >
                {status === "sending" ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// "What's new" card for people who used the app before PDF import existed. The
// X, the backdrop and Escape all dismiss it; it is shown once per device.
function PdfImportNotice({ onImport, onDismiss }: { onImport: () => void; onDismiss: () => void }) {
  // Layout effect: the Escape handler is live the moment the card is on screen.
  useLayoutEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      className="modalBackdrop noticeBackdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div className="noticeModal" role="dialog" aria-modal="true" aria-labelledby="pdf-notice-title">
        <button className="iconButton noticeClose" type="button" onClick={onDismiss} aria-label="Close" autoFocus>
          <X size={18} />
        </button>
        <div className="noticeIcon" aria-hidden="true">
          <FileText size={24} />
        </div>
        <div>
          <span className="eyebrow">New</span>
          <h2 id="pdf-notice-title">PDF statements now import directly</h2>
        </div>
        <p>
          Upload the PDF statement your bank gives you and review the transactions exactly as you would a CSV: categories suggested, duplicates
          flagged, transfers skipped. No more copying rows out by hand.
        </p>
        <ul className="noticeBanks" aria-label="Supported banks">
          {PDF_SUPPORTED_BANKS.slice(0, 12).map((bank) => (
            <li key={bank}>{bank}</li>
          ))}
          <li>and more</li>
        </ul>
        <p className="noticeFootnote">
          <ShieldCheck size={14} aria-hidden="true" />
          The PDF is read on this device and never uploaded.
        </p>
        <div className="buttonRow noticeActions">
          <button className="navCta inlineCta" type="button" onClick={onImport}>
            <FileText size={16} />
            Import a PDF
          </button>
          <button className="commandButton" type="button" onClick={onDismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function SyncNudge({
  onSignIn,
  onDismiss,
}: {
  onSignIn: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="syncNudge" role="status">
      <div className="syncNudgeInner">
        <Cloud size={18} />
        <div className="syncNudgeText">
          <strong>Back up your data</strong>
          <span>Sign in to sync across devices</span>
        </div>
        <button className="googleButton syncNudgeSignIn" type="button" onClick={onSignIn}>
          <span aria-hidden="true">G</span>
          Sign in
        </button>
        <button className="iconButton" type="button" onClick={onDismiss} aria-label="Dismiss nudge">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

function VaultOverlay() {
  return (
    <div className="vaultOverlay" aria-live="polite" aria-label="Opening vault">
      <div className="vaultCard">
        <div className="vaultSpinner" aria-hidden="true" />
        <span>Opening your vault…</span>
      </div>
    </div>
  );
}

function hasLocalData(state: LedgerState): boolean {
  return (
    Object.values(state.months).some((m) => m.incomes.length > 0 || m.expenses.length > 0) ||
    state.accounts.length > 0
  );
}

// Two states are considered equivalent when every month has the same number of transactions
// and the same total amounts. This is fast enough to run on every page load and avoids a
// spurious conflict prompt when the same user opens the app on the same device after a sync.
function statesAreEquivalent(a: LedgerState, b: LedgerState): boolean {
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

function ledgerSummary(state: LedgerState): { months: number; transactions: number } {
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

function UserProfilePopup({
  userName,
  userAvatar,
  userEmail,
  onSignOut,
  authWorking,
}: {
  userName: string;
  userAvatar: string;
  userEmail: string;
  onSignOut: () => void;
  authWorking: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleClose() {
    hideTimerRef.current = setTimeout(() => setOpen(false), 500);
  }

  function cancelClose() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }

  return (
    <div
      className="profilePopupRoot"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
      onFocus={() => { cancelClose(); setOpen(true); }}
      onBlur={scheduleClose}
    >
      <button className="localIdentity profileTrigger" type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true">
        {userAvatar ? (
          <img className="identityAvatar" src={userAvatar} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="identityMark">
            <ShieldCheck size={17} />
          </div>
        )}
        <div>
          <strong>{userName}</strong>
          <span>{userEmail}</span>
        </div>
      </button>
      {open && (
        <div className="profilePopup" role="menu">
          <div className="profilePopupUser">
            <span className="profilePopupName">{userName}</span>
            <span className="profilePopupEmail">{userEmail}</span>
          </div>
          <button
            className="profileSignOutBtn"
            type="button"
            onClick={onSignOut}
            disabled={authWorking}
            role="menuitem"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function ImportReviewModal({
  review,
  categoryOptions,
  debtAccounts,
  accounts,
  formatter,
  onClose,
  onAccountChange,
  onToggleFlip,
  onRowChange,
  onToggleAll,
  onSkipDuplicates,
  onBulkCategory,
  onConfirm,
}: {
  review: ImportReviewState;
  categoryOptions: string[];
  debtAccounts: Account[];
  accounts: Account[];
  formatter: Intl.NumberFormat;
  onClose: () => void;
  onAccountChange: (accountId: string) => void;
  onToggleFlip: () => void;
  onRowChange: (id: string, patch: Partial<CsvImportRow>) => void;
  onToggleAll: (include: boolean) => void;
  onSkipDuplicates: () => void;
  onBulkCategory: (category: string) => void;
  onConfirm: () => void;
}) {
  const [bulkCategory, setBulkCategory] = useState("");
  const [showAutoRows, setShowAutoRows] = useState(false);
  const selectedCount = review.rows.filter((row) => row.include).length;
  const duplicateCount = review.rows.filter((row) => row.duplicate).length;
  const totalAmount = review.rows.filter((row) => row.include).reduce((sum, row) => sum + row.amount, 0);
  const hasErrors = review.errors.length > 0 && review.rows.length === 0;

  // Confidence triage: rows the pipeline is sure about stay out of the way; the
  // user's attention goes only where the system is unsure.
  const autoRows = review.rows.filter((row) => !row.duplicate && row.confidence >= 0.9);
  const checkRows = review.rows.filter((row) => !row.duplicate && row.confidence >= 0.6 && row.confidence < 0.9);
  const needsYouRows = review.rows.filter((row) => row.duplicate || row.confidence < 0.6);
  const reviewCount = checkRows.length + needsYouRows.length;

  function applyBulkCategory() {
    onBulkCategory(bulkCategory);
    setBulkCategory("");
  }

  return (
    <div className="modalBackdrop">
      <section className="importModal" role="dialog" aria-modal="true" aria-labelledby="import-review-title">
        <header className="importModalHeader">
          <div>
            <span className="eyebrow">{review.format === "pdf" ? `PDF statement review${review.bank ? ` · ${review.bank}` : ""}` : "CSV Review"}</span>
            <h2 id="import-review-title">{review.fileName}</h2>
          </div>
          <button className="iconButton" type="button" onClick={onClose} aria-label="Close CSV review">
            <X size={18} />
          </button>
        </header>

        <div className="importStats" aria-label="Import summary">
          <span>
            Rows <b>{review.totalRows}</b>
          </span>
          <span>
            Selected <b>{selectedCount}</b>
          </span>
          <span>
            Duplicates <b>{duplicateCount}</b>
          </span>
          <span>
            Net <b className={totalAmount >= 0 ? "positiveText" : "negativeText"}>{formatter.format(totalAmount)}</b>
          </span>
        </div>

        {review.canFlip && review.signInverted && (
          <div className="signFlipBanner" role="status">
            <CreditCard size={15} />
            <span>
              Credit-card statement detected — amounts were flipped so purchases count as spending and refunds as money in.
            </span>
            <button className="commandButton" type="button" onClick={onToggleFlip}>
              Undo flip
            </button>
          </div>
        )}

        {hasErrors ? (
          <div className="importErrorList" role="alert">
            {review.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : (
          <>
            <div className="importToolbar">
              <div className="buttonRow">
                <button className="commandButton" type="button" onClick={() => onToggleAll(true)}>
                  Select all
                </button>
                <button className="commandButton" type="button" onClick={() => onToggleAll(false)}>
                  Clear all
                </button>
                <button className="commandButton" type="button" onClick={onSkipDuplicates}>
                  Skip duplicates
                </button>
                {review.canFlip && !review.signInverted && (
                  <button
                    className="commandButton"
                    type="button"
                    title="Credit-card statements list purchases as positive amounts — flip so they count as spending"
                    onClick={onToggleFlip}
                  >
                    <CreditCard size={15} />
                    Card statement? Flip in/out
                  </button>
                )}
              </div>
              {accounts.length > 0 && (
                <label className="bulkCategoryField importAccountField">
                  <span className="accountToastDot" style={{ background: accounts.find((account) => account.id === review.accountId)?.color }} />
                  <span>All rows go into</span>
                  <select
                    value={review.accountId ?? ""}
                    onChange={(event) => onAccountChange(event.target.value)}
                    aria-label="Account these transactions belong to"
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="bulkCategoryField">
                <span>Bulk category</span>
                <input
                  value={bulkCategory}
                  list="import-category-options"
                  placeholder="Category"
                  onChange={(event) => setBulkCategory(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applyBulkCategory();
                  }}
                />
                <button className="commandButton" type="button" onClick={applyBulkCategory}>
                  Apply
                </button>
              </label>
            </div>

            <datalist id="import-category-options">
              {categoryOptions.map((option) => (
                <option value={option} key={option} />
              ))}
            </datalist>

            <div className="importTableShell">
              {autoRows.length > 0 && (
                <div className="importBucket auto">
                  <button className="importBucketHeader" type="button" onClick={() => setShowAutoRows((show) => !show)} aria-expanded={showAutoRows}>
                    <Check size={15} />
                    <span>
                      <b>{autoRows.length}</b> matched your rules — imported as-is
                    </span>
                    {showAutoRows ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                  {showAutoRows && (
                    <ImportBucketTable rows={autoRows} formatter={formatter} categoryOptions={categoryOptions} debtAccounts={debtAccounts} onRowChange={onRowChange} />
                  )}
                </div>
              )}

              {checkRows.length > 0 && (
                <div className="importBucket check">
                  <div className="importBucketHeader static">
                    <Info size={15} />
                    <span>
                      <b>{checkRows.length}</b> probably right — worth a glance
                    </span>
                  </div>
                  <ImportBucketTable rows={checkRows} formatter={formatter} categoryOptions={categoryOptions} debtAccounts={debtAccounts} onRowChange={onRowChange} />
                </div>
              )}

              {needsYouRows.length > 0 && (
                <div className="importBucket needs">
                  <div className="importBucketHeader static">
                    <AlertCircle size={15} />
                    <span>
                      <b>{needsYouRows.length}</b> need you — duplicates and unknowns
                    </span>
                  </div>
                  <ImportBucketTable rows={needsYouRows} formatter={formatter} categoryOptions={categoryOptions} debtAccounts={debtAccounts} onRowChange={onRowChange} />
                </div>
              )}
            </div>
          </>
        )}

        <footer className="importModalFooter">
          <button className="commandButton" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="navCta inlineCta" type="button" disabled={selectedCount === 0 || hasErrors} onClick={onConfirm}>
            {reviewCount > 0 ? `Import ${selectedCount} (review ${reviewCount})` : `Import ${selectedCount}`}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ImportBucketTable({
  rows,
  formatter,
  categoryOptions,
  debtAccounts,
  onRowChange,
}: {
  rows: CsvImportRow[];
  formatter: Intl.NumberFormat;
  categoryOptions: string[];
  debtAccounts: Account[];
  onRowChange: (id: string, patch: Partial<CsvImportRow>) => void;
}) {
  return (
    <table className="importTable">
      <thead>
        <tr>
          <th>Import</th>
          <th>Date</th>
          <th>Transaction</th>
          <th>Amount</th>
          <th>Type</th>
          <th>Category</th>
          <th>Signal</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <ImportReviewTableRow
            key={row.id}
            row={row}
            formatter={formatter}
            categoryOptions={categoryOptions}
            debtAccounts={debtAccounts}
            onChange={(patch) => onRowChange(row.id, patch)}
          />
        ))}
      </tbody>
    </table>
  );
}

function ImportReviewTableRow({
  row,
  formatter,
  categoryOptions,
  debtAccounts,
  onChange,
}: {
  row: CsvImportRow;
  formatter: Intl.NumberFormat;
  categoryOptions: string[];
  debtAccounts: Account[];
  onChange: (patch: Partial<CsvImportRow>) => void;
}) {
  return (
    <tr className={`${row.include ? "selected" : ""} ${row.duplicate ? "duplicate" : ""}`}>
      <td>
        <label className="checkCell">
          <input type="checkbox" checked={row.include} onChange={(event) => onChange({ include: event.target.checked })} aria-label={`Import ${row.description}`} />
        </label>
      </td>
      <td>{formatShortDate(row.date)}</td>
      <td>
        <input
          className="importNameInput"
          value={row.name}
          aria-label={`Name for ${row.description}`}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <span title={row.description}>{row.name === row.description ? `Row ${row.rowNumber}` : row.description}</span>
      </td>
      <td className={row.amount >= 0 ? "positiveText" : "negativeText"}>{formatter.format(row.amount)}</td>
      <td>
        <select
          value={row.kind}
          aria-label={`Type for ${row.description}`}
          onChange={(event) => onChange(importKindPatch(event.target.value as TransactionKind, row))}
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="debt-payment">Debt payment</option>
          <option value="transfer">Transfer (between accounts)</option>
        </select>
      </td>
      <td>
        <input
          value={row.category}
          list="import-category-options"
          aria-label={`Category for ${row.description}`}
          onChange={(event) => onChange({ category: event.target.value, note: row.suggestedCategory === event.target.value ? row.note : "Edited" })}
        />
        {row.kind === "debt-payment" && debtAccounts.length > 0 && (
          <select
            className="importDebtAccountSelect"
            value={row.debtAccountId ?? ""}
            aria-label={`Debt account for ${row.description}`}
            onChange={(event) => onChange({ debtAccountId: event.target.value || undefined })}
          >
            <option value="">Not linked to an account</option>
            {debtAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                Pays {account.name}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        <span className={row.duplicate ? "importSignal duplicate" : row.confidence < 0.5 ? "importSignal low" : "importSignal"}>
          {row.duplicate ? "Duplicate" : `${Math.round(row.confidence * 100)}%`}
        </span>
        <em>{row.note}</em>
      </td>
    </tr>
  );
}

function importKindPatch(kind: TransactionKind, row: CsvImportRow): Partial<CsvImportRow> {
  if (kind === "income") {
    return {
      kind,
      amount: Math.abs(row.amount),
      category: row.category === "Unsorted" || row.category === "Transfers" || row.category === "Debt payments" ? "Income" : row.category,
      include: true,
      note: row.suggestedKind === kind ? row.note : "Edited",
      debtAccountId: undefined,
    };
  }

  if (kind === "transfer") {
    return {
      kind,
      category: "Transfers",
      include: false,
      note: "Won’t import — saved as transfer",
      debtAccountId: undefined,
    };
  }

  if (kind === "debt-payment") {
    return {
      kind,
      amount: -Math.abs(row.amount),
      category: "Debt payments",
      include: true,
      note: row.suggestedKind === kind ? row.note : "Edited",
    };
  }

  return {
    kind,
    amount: -Math.abs(row.amount),
    category: row.category === "Income" || row.category === "Transfers" ? "Unsorted" : row.category,
    include: true,
    note: row.suggestedKind === kind ? row.note : "Edited",
    debtAccountId: undefined,
  };
}

type GettingStartedItem = {
  id: string;
  label: string;
  hint: string;
  done: boolean;
  action: () => void;
};

function GettingStartedCard({
  items,
  onRestartSetup,
  onDismiss,
}: {
  items: GettingStartedItem[];
  onRestartSetup: () => void;
  onDismiss: () => void;
}) {
  const doneCount = items.filter((item) => item.done).length;
  const allDone = doneCount === items.length;

  return (
    <article className="gettingStarted" aria-label="Getting started checklist">
      <div className="gettingStartedHead">
        <div className="gettingStartedTitle">
          <h3>{allDone ? "You're fully set up" : "Getting started"}</h3>
          <span>
            {doneCount} of {items.length} done
          </span>
        </div>
        <div className="gettingStartedMeter" aria-hidden="true">
          <span style={{ width: `${Math.round((doneCount / items.length) * 100)}%` }} />
        </div>
        {!allDone && (
          <button className="quietButton gettingStartedRestart" type="button" onClick={onRestartSetup}>
            <Sparkles size={13} />
            Quick setup
          </button>
        )}
        <button className="iconButton" type="button" onClick={onDismiss} aria-label="Hide getting started checklist" data-tip="Hide checklist">
          <X size={15} />
        </button>
      </div>
      <div className="gettingStartedItems">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.done ? "gsItem done" : "gsItem"}
            onClick={item.action}
            disabled={item.done}
          >
            <span className="gsCheck" aria-hidden="true">
              {item.done ? <Check size={13} /> : null}
            </span>
            <span className="gsLabel">
              <strong>{item.label}</strong>
              <em>{item.hint}</em>
            </span>
            {!item.done && <ChevronRight size={15} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </article>
  );
}

function CategoryContextMenu({
  expense,
  options,
  debtAccounts,
  savingsAccounts,
  formatter,
  privacy,
  x,
  y,
  onMove,
  onUngroup,
  onLinkDebt,
  onLinkSavings,
}: {
  expense: ExpenseEntry;
  options: CategoryOption[];
  debtAccounts: Account[];
  savingsAccounts: Account[];
  formatter: Intl.NumberFormat;
  privacy: boolean;
  x: number;
  y: number;
  onMove: (category: string) => void;
  onUngroup: () => void;
  onLinkDebt: (debtAccountId: string | undefined) => void;
  onLinkSavings: (toAccountId: string | undefined) => void;
}) {
  return (
    <div
      className="categoryContextMenu"
      role="menu"
      aria-label={`Move ${expense.name} to category`}
      style={{ left: x, top: y } as CSSProperties}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="contextMenuTitle">
        <span>Move to category</span>
        <strong>{expense.name}</strong>
      </div>
      <div className="contextMenuList">
        {options.length ? (
          options.map((option) => {
            const active = option.name === expense.category;
            return (
              <button
                className={active ? "contextMenuItem active" : "contextMenuItem"}
                type="button"
                role="menuitem"
                key={option.name}
                disabled={active}
                aria-label={active ? `${option.name} current category` : `Move to ${option.name}`}
                onClick={() => onMove(option.name)}
              >
                <span className="swatch small" style={{ background: option.color }} />
                <span>{option.name}</span>
                <em className={privacy ? "masked contextMenuMeta" : "contextMenuMeta"}>
                  {option.count} · {formatter.format(option.total)}
                </em>
                {active && <Check size={14} />}
              </button>
            );
          })
        ) : (
          <div className="contextMenuEmpty">No categories yet</div>
        )}
      </div>
      {expense.category && (
        <>
          <span className="contextMenuDivider" />
          <button className="contextMenuItem contextMenuUngroup" type="button" role="menuitem" onClick={onUngroup}>
            <span />
            <span>Remove from category</span>
          </button>
        </>
      )}
      {debtAccounts.length > 0 && (
        <>
          <span className="contextMenuDivider" />
          <div className="contextMenuTitle">
            <span>Count as payment towards</span>
          </div>
          <div className="contextMenuList">
            {debtAccounts.map((account) => {
              const active = account.id === expense.debtAccountId;
              return (
                <button
                  className={active ? "contextMenuItem active" : "contextMenuItem"}
                  type="button"
                  role="menuitem"
                  key={account.id}
                  aria-label={active ? `Unlink from ${account.name}` : `Count as payment towards ${account.name}`}
                  onClick={() => onLinkDebt(active ? undefined : account.id)}
                >
                  <span className="swatch small" style={{ background: account.color }} />
                  <span>{account.name}</span>
                  <em className={privacy ? "masked contextMenuMeta" : "contextMenuMeta"}>{formatter.format(account.balance)}</em>
                  {active && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </>
      )}
      {savingsAccounts.length > 0 && (
        <>
          <span className="contextMenuDivider" />
          <div className="contextMenuTitle">
            <span>Money moved into</span>
          </div>
          <div className="contextMenuList">
            {savingsAccounts.map((account) => {
              const active = account.id === expense.toAccountId;
              return (
                <button
                  className={active ? "contextMenuItem active" : "contextMenuItem"}
                  type="button"
                  role="menuitem"
                  key={account.id}
                  aria-label={active ? `Unlink from ${account.name}` : `Count as money into ${account.name}`}
                  onClick={() => onLinkSavings(active ? undefined : account.id)}
                >
                  <span className="swatch small" style={{ background: account.color }} />
                  <span>{account.name}</span>
                  <em className={privacy ? "masked contextMenuMeta" : "contextMenuMeta"}>{formatter.format(account.balance)}</em>
                  {active && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Panel({
  title,
  total,
  tone,
  count,
  privacy,
  formatter,
  action,
  children,
}: {
  title: string;
  total: number;
  tone: "income" | "expense";
  count: number;
  privacy: boolean;
  formatter: Intl.NumberFormat;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className={`panel ${tone}`}>
      <div className="panelHeader">
        <div>
          <h2>
            <span className="panelGlyph" aria-hidden="true">
              {tone === "income" ? <ArrowDown size={18} /> : <ArrowUp size={18} />}
            </span>
            {title}
          </h2>
          <span className="panelMeta">
            {count} {count === 1 ? "item" : "items"}
            {action}
          </span>
        </div>
        <strong className={privacy ? "masked" : ""}>
          <AnimatedCurrency value={total} formatter={formatter} />
        </strong>
      </div>
      {children}
    </article>
  );
}

// The account a transaction belongs to, as a dot in that account's colour. Clicking moves the
// transaction (and its money) to the next account. Hidden until the user has an account.
function AccountDot({ account, label, onCycle }: { account?: Account; label: string; onCycle: () => void }) {
  if (!account) return <span className="accountDot empty" aria-hidden="true" />;
  return (
    <button
      className="accountDot"
      type="button"
      style={{ background: account.color }}
      onClick={onCycle}
      aria-label={`${label} is in ${account.name}. Move to the next account`}
      data-tip={`${account.name} · click to change account`}
    />
  );
}

function IncomeRow({
  income,
  account,
  onCycleAccount,
  privacy,
  symbol,
  dragging,
  dropState,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onMove,
  onChange,
  onRenamed,
  onRemove,
}: {
  income: IncomeEntry;
  account?: Account;
  onCycleAccount: () => void;
  privacy: boolean;
  symbol: string;
  dragging: boolean;
  dropState?: "before" | "after";
  onDragStart: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onMove: (direction: -1 | 1) => void;
  onChange: (patch: Partial<IncomeEntry>) => void;
  onRenamed: (previousName: string) => void;
  onRemove: () => void;
}) {
  const renameTracking = useRenameTracking(onRenamed);
  // A custom MIME type keeps income drags out of the expense column's drop targets.
  function handleDragStart(event: DragEvent<HTMLElement>) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-income-id", income.id);
    onDragStart();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    onDrop();
  }

  const dropClass = dropState === "before" ? "dropBefore" : dropState === "after" ? "dropAfter" : "";

  return (
    <div
      className={`financeRow incomeRow ${dragging ? "dragging" : ""} ${dropClass}`}
      data-income-id={income.id}
      draggable
      onDragStart={handleDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={handleDrop}
    >
      <button
        className="dragHandle"
        type="button"
        draggable
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            onMove(event.key === "ArrowUp" ? -1 : 1);
          }
        }}
        aria-label={`Move ${income.source || "income"}`}
        data-tip="Drag to reorder, or focus and use the arrow keys"
      >
        ::
      </button>
      <AccountDot account={account} label={income.source || "income"} onCycle={onCycleAccount} />
      <input
        value={income.source}
        onChange={(event) => onChange({ source: capitalizeFirst(event.target.value) })}
        onKeyDown={blurOnEnter}
        {...renameTracking}
        aria-label="Income source"
      />
      <MoneyInput
        ariaLabel="Income amount"
        value={String(income.amount)}
        symbol={symbol}
        privacy={privacy}
        onEnter={({ currentTarget }) => currentTarget.blur()}
        onChange={(value) => onChange({ amount: Number(value) })}
      />
      <div className="rowActions">
        <RecurringToggle
          recurring={income.recurring}
          kind="income"
          onToggle={() => onChange({ recurring: !income.recurring })}
        />
        <button className="iconButton rowAction" type="button" onClick={onRemove} aria-label="Remove income">
          <Trash2 size={17} />
        </button>
      </div>
    </div>
  );
}

// Remembers a name field's value on focus and reports the old value when the
// edit is committed with a different name, so the ledger can offer "rename all".
function useRenameTracking(onRenamed: (previousName: string) => void) {
  const nameAtFocusRef = useRef<string | null>(null);
  return {
    onFocus: (event: { currentTarget: HTMLInputElement }) => {
      nameAtFocusRef.current = event.currentTarget.value;
    },
    onBlur: (event: { currentTarget: HTMLInputElement }) => {
      const previousName = nameAtFocusRef.current;
      nameAtFocusRef.current = null;
      if (previousName !== null && previousName.trim() !== event.currentTarget.value.trim()) onRenamed(previousName);
    },
  };
}

function RenameAllModal({
  prompt,
  onRenameAll,
  onJustThisOne,
}: {
  prompt: RenamePrompt;
  onRenameAll: () => void;
  onJustThisOne: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onJustThisOne);
  dismissRef.current = onJustThisOne;
  useEffect(() => {
    // Focus the dialog itself, not a button. The prompt opens on the keydown of the Enter that
    // committed the rename; Chromium delivers that keystroke's keypress to whatever is focused by
    // then and treats Enter on a button as a click — so focusing "Rename all" here would confirm
    // the prompt before anyone saw it. Tab reaches the buttons; Escape dismisses.
    dialogRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") dismissRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { from, to, others, months } = prompt;
  const noun = prompt.kind === "income" ? "income" : "expense";
  return (
    <div
      className="modalBackdrop mergeBackdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onJustThisOne();
      }}
    >
      <div className="mergeModal" role="dialog" aria-modal="true" aria-labelledby="rename-all-title" ref={dialogRef} tabIndex={-1}>
        <div className="mergeModalIcon">
          <PenLine size={24} />
        </div>
        <h2 id="rename-all-title">Rename every “{from}”?</h2>
        <p>
          {others
            ? `${others} other ${noun}${others === 1 ? "" : "s"} across ${months} month${months === 1 ? "" : "s"} ${others === 1 ? "is" : "are"} also called “${from}”.`
            : `New imports are named “${from}” because of an earlier rename.`}
        </p>
        <div className="mergeOptions">
          <button className="mergeOption" type="button" onClick={onRenameAll}>
            <strong>{others ? `Rename all to “${to}”` : `Use “${to}” from now on`}</strong>
            <span>{others ? `${others + 1} transactions` : "Future imports"}</span>
            <small>Future imports with this name will be called “{to}” too.</small>
          </button>
          <button className="mergeOption" type="button" onClick={onJustThisOne}>
            <strong>Just this one</strong>
            <span>1 transaction</span>
            <small>{others ? `The others stay “${from}”.` : "Future imports keep the old name."}</small>
          </button>
        </div>
      </div>
    </div>
  );
}

function RecurringToggle({
  recurring,
  kind,
  onToggle,
}: {
  recurring: boolean;
  kind: "income" | "expense";
  onToggle: () => void;
}) {
  const label = recurring
    ? `Recurring ${kind} — counts every month in the projection`
    : `One-off ${kind} — counted once, not projected forward`;
  return (
    <button
      className={recurring ? "recurToggle active" : "recurToggle"}
      type="button"
      onClick={onToggle}
      aria-pressed={recurring}
      aria-label={label}
      data-tip={label}
    >
      <Repeat size={15} />
    </button>
  );
}

function ExpenseRow({
  expense,
  account,
  onCycleAccount,
  privacy,
  formatter,
  symbol,
  linkedAccountName,
  savingsAccountName,
  dragging,
  grouping,
  dropState,
  onDragStart,
  onDragOverExpense,
  onDragEnd,
  onDropOnExpense,
  onOpenCategoryMenu,
  onSelectForGroup,
  onChange,
  onRenamed,
  onRemove,
}: {
  expense: ExpenseEntry;
  account?: Account;
  onCycleAccount: () => void;
  privacy: boolean;
  formatter: Intl.NumberFormat;
  symbol: string;
  linkedAccountName?: string;
  savingsAccountName?: string;
  dragging: boolean;
  grouping: boolean;
  dropState?: ExpenseDropState;
  onDragStart: () => void;
  onDragOverExpense: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDropOnExpense: (sourceId: string) => void;
  onOpenCategoryMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onSelectForGroup: () => void;
  onChange: (patch: Partial<ExpenseEntry>) => void;
  onRenamed: (previousName: string) => void;
  onRemove: () => void;
}) {
  const renameTracking = useRenameTracking(onRenamed);
  function handleDragStart(event: DragEvent<HTMLElement>) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", expense.id);
    onDragStart();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = event.dataTransfer.getData("text/plain");
    if (sourceId) onDropOnExpense(sourceId);
    onDragEnd();
  }

  const dropClass =
    dropState === "before" ? "dropBefore" : dropState === "after" ? "dropAfter" : dropState === "combine" ? "dropCombine" : "";

  return (
    <div
      className={`financeRow expenseRow ${expense.scheduledPayment ? "isPlanned" : ""} ${dragging ? "dragging" : ""} ${grouping ? "groupingSource" : ""} ${dropClass}`}
      data-expense-name={expense.name}
      data-expense-id={expense.id}
      draggable
      onDragStart={handleDragStart}
      onDragOver={onDragOverExpense}
      onDragEnd={onDragEnd}
      onDrop={handleDrop}
      onContextMenu={onOpenCategoryMenu}
    >
      <button
        className="dragHandle"
        type="button"
        draggable
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onClick={onSelectForGroup}
        aria-label={`Select ${expense.name} for grouping`}
        data-tip="Drag onto another expense, or tap two handles to group"
      >
        ::
      </button>
      <AccountDot account={account} label={expense.name || "expense"} onCycle={onCycleAccount} />
      <input
        value={expense.name}
        onChange={(event) => onChange({ name: capitalizeFirst(event.target.value) })}
        onKeyDown={blurOnEnter}
        {...renameTracking}
        aria-label="Expense name"
      />
      <MoneyInput
        ariaLabel="Expense amount"
        value={String(expense.amount)}
        symbol={symbol}
        privacy={privacy}
        onEnter={({ currentTarget }) => currentTarget.blur()}
        onChange={(value) => onChange({ amount: Number(value) })}
      />
      <span className={privacy ? "rowTotal masked" : "rowTotal"}>{formatter.format(expense.amount)}</span>
      <div className="rowActions">
        {expense.scheduledPayment && (
          <span
            className="plannedBadge"
            aria-label={`Planned from ${linkedAccountName ?? "your debt account"}. Your real payment replaces it when you import your statement, or type the amount you paid.`}
            data-tip={`Planned from ${linkedAccountName ?? "your debt account"}. Your real payment replaces it when you import your statement, or type the amount you paid.`}
          >
            <Clock3 size={15} />
          </span>
        )}
        {/* A planned row always repeats (it comes from the account), and its clock already names
            the account, so it shows neither the link badge nor the repeat toggle. */}
        {savingsAccountName && (
          <span
            className="debtLinkBadge"
            aria-label={`Counts as money into ${savingsAccountName}`}
            data-tip={`Counts as money into ${savingsAccountName}`}
          >
            <PiggyBank size={15} />
          </span>
        )}
        {linkedAccountName && !expense.scheduledPayment && (
          <span
            className="debtLinkBadge"
            aria-label={`Counts as a payment towards ${linkedAccountName}`}
            data-tip={`Counts as a payment towards ${linkedAccountName}`}
          >
            <CreditCard size={15} />
          </span>
        )}
        {!expense.scheduledPayment && (
          <RecurringToggle
            recurring={expense.recurring}
            kind="expense"
            onToggle={() => onChange({ recurring: !expense.recurring })}
          />
        )}
        <button className="iconButton rowAction" type="button" onClick={onRemove} aria-label="Remove expense">
          <Trash2 size={17} />
        </button>
      </div>
    </div>
  );
}

function AccountRow({
  account,
  otherColors,
  region,
  taxProfile,
  symbol,
  formatter,
  privacy,
  autoNote,
  onChange,
  onRemove,
}: {
  account: Account;
  // Colours the other accounts use, so the swatch only offers ones that keep dots distinct.
  otherColors: string[];
  region: RegionKey;
  taxProfile: LedgerState["taxProfile"];
  symbol: string;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  autoNote?: string;
  onChange: (patch: Partial<Account>) => void;
  onRemove: () => void;
}) {
  const isDebt = account.accountClass === "debt";
  const hasLimit = isDebt && !isLoanType(account.type);
  const utilization = hasLimit && account.creditLimit > 0 ? clampPercent((account.balance / account.creditLimit) * 100) : 0;
  const typeOptions = accountTypeOptionsFor(region, account.accountClass, account.type);
  const typeInfo = accountTypeOption(region, account.accountClass, account.type);
  const payoff = isDebt ? estimateDebtPayoff(account) : null;
  const hasDetails = isDebt ? isLoanType(account.type) : supportsPlanDetails(account.accountClass, account.type);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const payroll = !isDebt && account.contributionSource === "payroll";

  // A new type brings its own tax treatment and contribution source; the user can still change them.
  function changeType(type: AccountType) {
    onChange({
      type,
      ...(isDebt
        ? {}
        : {
            taxTreatment: defaultTaxTreatment(region, account.accountClass, type),
            contributionSource: defaultContributionSource(region, account.accountClass, type),
          }),
    });
  }

  return (
    <div className={`debtAccountRow ${isDebt ? "isDebt" : "isAsset"} ${detailsOpen ? "detailsOpen" : ""}`} style={{ "--account-color": account.color } as CSSProperties}>
      <button
        className="swatchButton"
        type="button"
        style={{ background: account.color }}
        onClick={() => onChange({ color: nextAccountColor(account.color, otherColors) })}
        aria-label="Cycle account color"
      />
      <div className="debtAccountMain">
        <input value={account.name} onChange={(event) => onChange({ name: capitalizeFirst(event.target.value) })} aria-label="Account name" />
        <div className="typeSelectWrap">
          <select value={account.type} onChange={(event) => changeType(event.target.value as AccountType)} aria-label={`Type for ${account.name}`}>
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {typeInfo.info && <InfoHint label={`What is a ${typeInfo.label}?`} text={typeInfo.info} />}
        </div>
      </div>
      <div className="debtField balanceField">
        <span>Balance</span>
        <MoneyInput
          ariaLabel={`Balance for ${account.name}`}
          value={String(account.balance)}
          symbol={symbol}
          privacy={privacy}
          placeholder="Current balance"
          onChange={(value) => onChange({ balance: Math.max(0, Number(value) || 0) })}
        />
      </div>

      {isDebt && !hasLimit ? (
        <div className="debtField limitField payoffField">
          <span>Paid off</span>
          <strong>{payoffLabel(payoff)}</strong>
        </div>
      ) : isDebt ? (
        <div className="debtField limitField">
          <span>Limit</span>
          <MoneyInput
            ariaLabel={`Credit limit for ${account.name}`}
            value={String(account.creditLimit)}
            symbol={symbol}
            privacy={privacy}
            placeholder="Credit limit"
            onChange={(value) => onChange({ creditLimit: Math.max(0, Number(value) || 0) })}
          />
        </div>
      ) : (
        <div className="debtField limitField">
          <span>{payroll ? "Monthly in (you)" : "Monthly in"}</span>
          <MoneyInput
            ariaLabel={`Monthly contribution for ${account.name}`}
            value={String(account.monthlyContribution)}
            symbol={symbol}
            privacy={privacy}
            placeholder="Monthly contribution"
            readOnly={Number(account.contributionPercent) > 0 && Number(taxProfile.grossAnnualSalary) > 0}
            onChange={(value) => onChange({ monthlyContribution: Math.max(0, Number(value) || 0) })}
          />
        </div>
      )}

      <label className="numberField compact hintField aprField">
        <span className="fieldLabel">{rateLabel(account.accountClass, region)}</span>
        <NumberInput
          value={account.rate}
          min={-50}
          max={1000}
          placeholder={rateLabel(account.accountClass, region)}
          onCommit={(value) => onChange({ rate: value })}
          ariaLabel={`${rateLabel(account.accountClass, region)} for ${account.name}`}
        />
        <InfoHint label={`Rate help for ${account.name}`} text={rateHelp(account.accountClass, region)} />
      </label>
      <label className="numberField compact hintField interestFreeField">
        <span className="fieldLabel">{isDebt ? "Promo months" : "Intro months"}</span>
        <NumberInput
          value={account.promoMonths}
          min={0}
          max={120}
          integer
          placeholder={isDebt ? "Promo months left" : "Intro months left"}
          onCommit={(value) => onChange({ promoMonths: clampWholeNumber(value, 120) })}
          ariaLabel={`Promo months for ${account.name}`}
        />
        <InfoHint
          label={`Promo period help for ${account.name}`}
          text={
            isDebt
              ? "Months left on a 0% or balance-transfer rate before the APR applies. It counts down by itself each month, and the forecast uses the promo rate until then."
              : "Months left on an intro rate before the standard rate takes over. It counts down by itself each month. Leave blank if none."
          }
        />
      </label>

      {isDebt ? (
        <>
          <div className="debtField minimumField">
            <span>Monthly</span>
            <MoneyInput
              ariaLabel={`Monthly payment for ${account.name}`}
              value={String(account.minimumPayment)}
              symbol={symbol}
              privacy={privacy}
              placeholder="Monthly payment"
              onChange={(value) => onChange({ minimumPayment: Math.max(0, Number(value) || 0) })}
            />
          </div>
          <label className="numberField compact hintField debtPromoRateField">
            <span className="fieldLabel">Promo rate %</span>
            <NumberInput value={account.promoRate} min={0} max={1000} placeholder="Promo rate %" onCommit={(value) => onChange({ promoRate: value })} ariaLabel={`Promo rate for ${account.name}`} />
            <InfoHint
              label={`Promo rate help for ${account.name}`}
              text="The rate during the promo months: 0 for an interest-free card, or the deal rate for a balance transfer (e.g. 2.9)."
            />
          </label>
          <label className="numberField compact hintField dueField">
            <span className="fieldLabel">Due day</span>
            <NumberInput value={account.dueDay} min={1} max={31} integer placeholder="Due day (1-31)" onCommit={(value) => onChange({ dueDay: clampDueDay(value) })} ariaLabel={`Due day for ${account.name}`} />
            <InfoHint label={`Payment date help for ${account.name}`} text="Day of the month this account payment is due." />
          </label>
        </>
      ) : (
        <label className="numberField compact hintField introRateField">
          <span className="fieldLabel">Intro rate %</span>
          <NumberInput value={account.promoRate} min={0} max={1000} placeholder="Intro rate %" onCommit={(value) => onChange({ promoRate: value })} ariaLabel={`Intro rate for ${account.name}`} />
          <InfoHint label={`Intro rate help for ${account.name}`} text="The rate that applies during the intro months above, before the standard rate takes over." />
        </label>
      )}

      <div className="debtAccountMeta">
        <span>{typeInfo.label}</span>
        <strong className={privacy ? "masked" : ""}>{formatter.format(account.balance)}</strong>
        <em>{[accountMetaCaption(account, utilization, payoff, hasLimit, formatter, privacy, region), autoNote].filter(Boolean).join(" · ")}</em>
        {hasDetails && (
          <button
            className={`detailsToggle ${detailsOpen ? "open" : ""}`}
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
            aria-label={`${detailsOpen ? "Hide" : "Show"} ${isDebt ? "loan" : "plan"} details for ${account.name}`}
          >
            {detailsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {isDebt ? "Loan details" : "Plan details"}
            {!detailsOpen && !isDebt && (account.employerMonthlyContribution || account.contributionPercent) ? " · set" : ""}
          </button>
        )}
      </div>
      <button className="iconButton rowAction" type="button" onClick={onRemove} aria-label={`Remove ${account.name}`}>
        <Trash2 size={17} />
      </button>

      {hasDetails && detailsOpen && (
        <div className="accountDetails">
          {isDebt ? (
            <LoanDetails account={account} region={region} taxProfile={taxProfile} formatter={formatter} privacy={privacy} onChange={onChange} />
          ) : (
            <AccountPlanDetails account={account} region={region} taxProfile={taxProfile} formatter={formatter} symbol={symbol} privacy={privacy} onChange={onChange} />
          )}
        </div>
      )}
    </div>
  );
}

function AccountEditor({
  draft,
  setDraft,
  region,
  symbol,
  assumedReturn,
  onAdd,
}: {
  draft: AccountDraft;
  setDraft: Dispatch<SetStateAction<AccountDraft>>;
  region: RegionKey;
  symbol: string;
  assumedReturn: number;
  onAdd: () => void;
}) {
  const isDebt = draft.accountClass === "debt";
  const isLoan = isDebt && isLoanType(draft.type);
  const typeInfo = accountTypeOption(region, draft.accountClass, draft.type);
  const payroll = !isDebt && typeInfo.payroll;

  function changeClass(accountClass: AccountClass) {
    setDraft((current) => ({ ...current, accountClass, type: defaultTypeForClass(accountClass) }));
  }

  // Every field sits in the same two-column cell (control + hint slot), so the controls line up
  // whether or not they carry an "i" icon.
  return (
    <article className="miniPanel accountEditorPanel">
      <PanelTitle title="Add account" icon={<Landmark size={16} />} />
      <div className="debtDraftGrid">
        <div className="draftField">
          <select className="accountClassSelect" value={draft.accountClass} onChange={(event) => changeClass(event.target.value as AccountClass)} aria-label="Account kind">
            {accountClassOptions(region).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="hintSlot" />
        </div>
        <div className="draftField">
          <select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as AccountType }))} aria-label="Account type">
            {accountTypeOptions(region, draft.accountClass).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {typeInfo.info ? <InfoHint label={`What is a ${typeInfo.label}?`} text={typeInfo.info} /> : <span className="hintSlot" />}
        </div>
        <div className="draftField">
          <input
            value={draft.name}
            placeholder="Account name"
            onChange={(event) => setDraft((current) => ({ ...current, name: capitalizeFirst(event.target.value) }))}
            onKeyDown={(event) => handleDraftEnter(event, onAdd)}
            aria-label="Account name"
          />
          <span className="hintSlot" />
        </div>
        <div className="draftField">
          <MoneyInput
            ariaLabel="Current balance"
            value={draft.balance}
            symbol={symbol}
            placeholder={isDebt ? "Current balance owed" : "Current balance"}
            onChange={(value) => setDraft((current) => ({ ...current, balance: value }))}
          />
          <span className="hintSlot" />
        </div>

        {!isDebt && (
          <div className="draftField">
            <MoneyInput
              ariaLabel="Monthly contribution"
              value={draft.monthlyContribution}
              symbol={symbol}
              placeholder={payroll ? (region === "US" ? "Your monthly contribution from your paycheck" : "Your monthly contribution from your pay") : "Monthly contribution"}
              onChange={(value) => setDraft((current) => ({ ...current, monthlyContribution: value }))}
            />
            {payroll ? (
              <InfoHint
                label="Contribution help"
                text="Taken from pay before take-home, so it is not subtracted from your surplus. Employer matches, % of pay and limits can be set in the account's plan details once added."
              />
            ) : (
              <span className="hintSlot" />
            )}
          </div>
        )}

        <div className="draftField">
          <input
            value={draft.rate}
            inputMode="decimal"
            placeholder={draft.accountClass === "investment" ? `Expected return % (default ${assumedReturn})` : rateLabel(draft.accountClass, region)}
            onChange={(event) => setDraft((current) => ({ ...current, rate: event.target.value }))}
            aria-label={rateLabel(draft.accountClass, region)}
          />
          <InfoHint label="Rate help" text={rateHelp(draft.accountClass, region)} />
        </div>

        <div className="draftField">
          <input
            value={draft.promoMonths}
            inputMode="numeric"
            placeholder={isDebt ? "Promo months left (0% or balance transfer)" : "Intro rate months (optional)"}
            onChange={(event) => setDraft((current) => ({ ...current, promoMonths: event.target.value }))}
            aria-label="Promo months"
          />
          <InfoHint
            label="Promo period help"
            text={
              isDebt
                ? "Months left before APR starts applying, as of today. It counts down by itself each month, and the forecast delays interest until this period ends."
                : "If this account has an intro rate, how many months it lasts before the standard rate takes over."
            }
          />
        </div>

        {isDebt ? (
          <>
            <div className="draftField">
              <input
                value={draft.promoRate}
                inputMode="decimal"
                placeholder="Promo rate % (0 if interest-free)"
                onChange={(event) => setDraft((current) => ({ ...current, promoRate: event.target.value }))}
                aria-label="Promo rate"
              />
              <InfoHint label="Promo rate help" text="The rate during the promo months: 0 for an interest-free card, or the deal rate for a balance transfer (e.g. 2.9)." />
            </div>
            {!isLoan && (
              <div className="draftField">
                <MoneyInput
                  ariaLabel="Credit limit"
                  value={draft.creditLimit}
                  symbol={symbol}
                  placeholder={draft.type === "overdraft" ? (region === "US" ? "Credit line limit" : "Overdraft limit") : "Credit limit"}
                  onChange={(value) => setDraft((current) => ({ ...current, creditLimit: value }))}
                />
                <span className="hintSlot" />
              </div>
            )}
            <div className="draftField">
              <MoneyInput
                ariaLabel="Monthly payment"
                value={draft.minimumPayment}
                symbol={symbol}
                placeholder="Monthly payment"
                onChange={(value) => setDraft((current) => ({ ...current, minimumPayment: value }))}
              />
              {isLoan ? <InfoHint label="Loan payment help" text="The regular monthly payment. Term, repayment plan and a suggested payment can be set in the loan details once added." /> : <span className="hintSlot" />}
            </div>
            <div className="draftField">
              <input
                value={draft.dueDay}
                inputMode="numeric"
                placeholder="Payment due day (1-31)"
                onChange={(event) => setDraft((current) => ({ ...current, dueDay: event.target.value }))}
                onKeyDown={(event) => handleDraftEnter(event, onAdd)}
                aria-label="Payment due day"
              />
              <InfoHint label="Payment date help" text="Day of the month the payment is due." />
            </div>
          </>
        ) : (
          <div className="draftField">
            <input
              value={draft.promoRate}
              inputMode="decimal"
              placeholder="Intro rate % (optional)"
              onChange={(event) => setDraft((current) => ({ ...current, promoRate: event.target.value }))}
              onKeyDown={(event) => handleDraftEnter(event, onAdd)}
              aria-label="Intro rate"
            />
            <InfoHint label="Intro rate help" text="If the account has a promotional intro rate, enter it here. It applies for the intro months above." />
          </div>
        )}

        <button className="navCta inlineCta" type="button" onClick={onAdd}>
          <Plus size={16} />
          Add account
        </button>
      </div>
    </article>
  );
}

function savingsRateName(region: RegionKey): string {
  return region === "US" ? "APY" : "AER";
}

function rateLabel(accountClass: AccountClass, region: RegionKey): string {
  if (accountClass === "debt") return "Interest rate (APR) %";
  if (accountClass === "investment") return "Expected return %";
  return `Interest rate (${savingsRateName(region)}) %`;
}

function rateHelp(accountClass: AccountClass, region: RegionKey): string {
  if (accountClass === "debt") return "Annual percentage rate charged after any interest-free period ends. Use 0 if the account has no interest.";
  if (accountClass === "investment")
    return "Assumed average annual return — an estimate, not a guarantee. A conservative long-run figure is around 6%. Markets can fall as well as rise.";
  return `The annual interest rate (${savingsRateName(region)}) the account earns after any intro period ends.`;
}

// Caption for a debt account whose displayed balance was rolled forward past its snapshot —
// tells the user the number is auto-tracked, and that editing the balance re-anchors it.
function debtAutoTrackNote(derived: Account, storedAccounts: Account[]): string | undefined {
  const stored = storedAccounts.find((account) => account.id === derived.id);
  if (!stored || stored.balance === derived.balance || !isValidMonthKey(stored.balanceAsOf)) return undefined;
  return `auto-tracked since ${formatMonth(stored.balanceAsOf)}`;
}

function payoffLabel(payoff: ReturnType<typeof estimateDebtPayoff> | null): string {
  if (!payoff) return "—";
  if (payoff.monthsToPayoff === 0) return "Cleared";
  if (payoff.monthsToPayoff === null) return "Set a payment";
  return formatMonth(shiftMonth(getMonthKey(), payoff.monthsToPayoff));
}

function accountMetaCaption(
  account: Account,
  utilization: number,
  payoff: ReturnType<typeof estimateDebtPayoff> | null,
  hasLimit: boolean,
  formatter: Intl.NumberFormat,
  privacy: boolean,
  region: RegionKey,
): string {
  if (account.accountClass === "debt") {
    const parts: string[] = [];
    if (hasLimit && account.creditLimit > 0) parts.push(`${formatDecimal(utilization)}% used`);
    if (account.promoMonths > 0) {
      // A date is easier to plan around than a bare count, and it visibly moves as months pass.
      const promoEnds = formatMonth(shiftMonth(getMonthKey(), account.promoMonths));
      parts.push(`${formatDecimal(account.promoRate)}% until ${promoEnds}`);
      const shortfall = payoff && account.balance > 0 && account.minimumPayment < payoff.paymentToClearInPromo - 0.005;
      if (shortfall && payoff) {
        const needed = privacy ? "•••" : formatter.format(Math.ceil(payoff.paymentToClearInPromo));
        parts.push(`pay ${needed}/mo to clear it before then`);
      }
    } else {
      parts.push(account.rate > 0 ? `${formatDecimal(account.rate)}% APR` : "No interest");
    }
    if (hasLimit && payoff && payoff.monthsToPayoff !== null && payoff.monthsToPayoff > 0) {
      parts.push(`paid off ${payoffLabel(payoff)}`);
    }
    return parts.join(" · ");
  }
  const rateNote = `${formatDecimal(account.rate)}% ${account.accountClass === "investment" ? "est." : savingsRateName(region)}`;
  const employer = Math.max(0, Number(account.employerMonthlyContribution) || 0);
  const contributionNote =
    account.monthlyContribution > 0 || employer > 0
      ? ` · +${Math.round(account.monthlyContribution)}${employer > 0 ? ` +${Math.round(employer)} employer` : ""}/mo${account.contributionSource === "payroll" ? " from pay" : ""}`
      : "";
  return `${rateNote}${contributionNote}`;
}

function AnnualSnapshot({ projection, privacy, formatter }: { projection: Projection; privacy: boolean; formatter: Intl.NumberFormat }) {
  return (
    <article className="miniPanel">
      <PanelTitle title="Annual snapshot" />
      <div className="factList">
        <Fact label="Projected income" value={projection.annualIncome} privacy={privacy} tone="good" formatter={formatter} />
        <Fact label="Projected outputs" value={projection.annualExpenses} privacy={privacy} tone="bad" formatter={formatter} />
        <hr />
        <Fact label={projection.annualSurplus >= 0 ? "Projected surplus" : "Projected shortfall"} value={projection.annualSurplus} privacy={privacy} tone={projection.annualSurplus >= 0 ? "good" : "bad"} formatter={formatter} />
        <Fact label="Savings rate" value={projection.savingsRate} suffix="%" tone={projection.savingsRate >= 0 ? "good" : "bad"} />
      </div>
      <small>
        Recurring items × 12, plus this month&rsquo;s one-offs once
        {projection.oneOffCount > 0
          ? ` · ${projection.oneOffCount} one-off ${projection.oneOffCount === 1 ? "item" : "items"} not projected forward`
          : ""}
      </small>
    </article>
  );
}

function SavingsGauge({
  projection,
  target,
  onTargetChange,
}: {
  projection: Projection;
  target: number;
  onTargetChange: (value: number) => void;
}) {
  const gauge = clampPercent(projection.savingsRate);

  return (
    <article className="miniPanel gaugePanel">
      <PanelTitle title="Savings rate" />
      <div className="gauge" style={{ "--value": `${gauge * 3.6}deg` } as CSSProperties}>
        <div>
          <strong>{formatDecimal(projection.savingsRate)}%</strong>
          <span>of income</span>
        </div>
      </div>
      <label className="targetInput">
        Target {target}%
        <input type="range" min="0" max="80" value={target} onChange={(event) => onTargetChange(Number(event.target.value))} />
      </label>
    </article>
  );
}

function ProjectionDetail({
  view,
  projection,
  categoryRows,
  monthlyBars,
  privacy,
  formatter,
}: {
  view: ProjectionView;
  projection: Projection;
  categoryRows: ReturnType<typeof buildCategoryRows>;
  monthlyBars: ReturnType<typeof buildMonthlyBars>;
  privacy: boolean;
  formatter: Intl.NumberFormat;
}) {
  return (
    <article className="miniPanel detailPanel">
      {view === "overview" && (
        <>
          <PanelTitle title="Monthly cash flow" />
          <div className="surplusHero">
            <strong className={privacy ? "masked" : ""}>
              <AnimatedCurrency value={projection.monthlySurplus} formatter={formatter} />
            </strong>
            <span>Income minus planned outputs</span>
          </div>
          <BarChart bars={monthlyBars} privacy={privacy} formatter={formatter} />
          <div className="inlineFacts">
            <span>
              Categorized <b className={privacy ? "masked" : ""}>{formatter.format(projection.paidTotal)}</b>
            </span>
            <span>
              Ungrouped <b className={privacy ? "masked" : ""}>{formatter.format(projection.unpaidTotal)}</b>
            </span>
          </div>
        </>
      )}

      {view === "category" && (
        <>
          <PanelTitle title="Category breakdown" />
          <div className="categoryList">
            {categoryRows.map((row) => (
              <div className="categoryRow" key={row.name}>
                <span className="swatch small" style={{ background: row.color }} />
                <span>{row.name}</span>
                <strong className={privacy ? "masked" : ""}>{formatter.format(row.annual)}</strong>
                <em>{formatDecimal(row.share)}%</em>
              </div>
            ))}
          </div>
        </>
      )}

      {view === "month" && (
        <>
          <PanelTitle title="Annual rhythm" />
          <div className="monthRail">
            {monthlyBars.map((bar) => (
              <div className="monthRailItem" key={bar.label}>
                <div className="railTrack">
                  <span
                    className={bar.value >= 0 ? "positive" : "negative"}
                    style={{ height: `${Math.max(8, Math.abs(bar.height))}%` }}
                  />
                </div>
                <small>{bar.label}</small>
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

// Under the ledger: every account with its live balance, in the colour its transactions' dots
// use. Balances are read-only here (they change on Accounts, or by moving transactions); clicking
// one offers to open Accounts. Also where new transactions' default account is chosen.
function LedgerAccountsPanel({
  accounts,
  defaultAccountId,
  month,
  formatter,
  privacy,
  t,
  onDefaultChange,
  onGoToAccounts,
  onNoteChange,
  onResetMonth,
}: {
  accounts: Account[];
  defaultAccountId: string | undefined;
  month: MonthBudget;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  t: (text: string) => string;
  onDefaultChange: (accountId: string) => void;
  onGoToAccounts: () => void;
  onNoteChange: (note: string) => void;
  onResetMonth: () => void;
}) {
  const [confirmFor, setConfirmFor] = useState<string | null>(null);

  return (
    <article className="miniPanel goalPanel ledgerAccountsPanel">
      <div className="ledgerAccountsColumn">
        <PanelTitle
          title="Accounts"
          icon={
            <InfoHint
              label={t("What do the coloured dots mean?")}
              text="Each transaction's dot shows the account its money moved through. Click a dot to move it to another account; that account's balance moves with it. Change balances themselves on the Accounts page."
            />
          }
        />
        {accounts.length ? (
          <>
            <ul className="ledgerAccountList">
              {accounts.map((account) => (
                <li key={account.id}>
                  <button
                    className="ledgerAccountItem"
                    type="button"
                    onClick={() => setConfirmFor((current) => (current === account.id ? null : account.id))}
                    aria-expanded={confirmFor === account.id}
                    aria-label={`${account.name}, ${privacy ? "balance hidden" : formatter.format(account.balance)}`}
                  >
                    <span className="accountDot static" style={{ background: account.color }} />
                    <span className="ledgerAccountName">{account.name}</span>
                    <strong className={`${account.accountClass === "debt" ? "negativeText" : ""} ${privacy ? "masked" : ""}`}>
                      {account.accountClass === "debt" && account.balance > 0 ? "−" : ""}
                      {formatter.format(account.balance)}
                    </strong>
                  </button>
                  {confirmFor === account.id && (
                    <div className="ledgerAccountConfirm" role="dialog" aria-label="Go to accounts page?">
                      <span>Go to the Accounts page?</span>
                      <button className="commandButton" type="button" onClick={onGoToAccounts}>
                        Go
                      </button>
                      <button className="quietButton" type="button" onClick={() => setConfirmFor(null)}>
                        Cancel
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <label className="selectField ledgerDefaultAccount">
              <span>New transactions go into</span>
              <select value={defaultAccountId ?? ""} onChange={(event) => onDefaultChange(event.target.value)} aria-label="Default account for new transactions">
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <div className="goalEmptyNudge">
            <button className="commandButton" type="button" onClick={onGoToAccounts}>
              <PiggyBank size={15} />
              Add an account
            </button>
            <p>{t("Add your current account, savings and cards to see transactions move their balances.")}</p>
          </div>
        )}
      </div>

      <div className="ledgerNotesColumn">
        <textarea
          value={month.note}
          placeholder="Add notes for this month..."
          onChange={(event) => onNoteChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.currentTarget.blur();
            }
          }}
          aria-label="Month notes"
        />
        <button className="quietButton" type="button" onClick={onResetMonth}>
          <RotateCcw size={16} />
          Reset selected month
        </button>
      </div>
    </article>
  );
}

function TutorialOverlay({ tutorial, t, onClose }: { tutorial: PageTutorial; t: (text: string) => string; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const total = tutorial.steps.length;
  const current = tutorial.steps[Math.min(step, total - 1)];
  const isLast = step >= total - 1;

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="tutorialBackdrop" role="dialog" aria-modal="true" aria-label={`${tutorial.title} tutorial`}>
      <div className="tutorialCard">
        <span className="tutorialBadge">
          <GraduationCap size={13} />
          {tutorial.badge} · 60-second tour
        </span>
        <h2 className="tutorialTitle">{t(tutorial.title)}</h2>
        {current.heading ? <h3 className="tutorialStepHeading">{t(current.heading)}</h3> : null}
        <ul className="tutorialBullets">
          {current.bullets.map((bullet, index) => (
            <li key={index}>{t(bullet)}</li>
          ))}
        </ul>

        {total > 1 ? (
          <div className="tutorialDots" aria-hidden="true">
            {tutorial.steps.map((_, index) => (
              <span key={index} className={index === step ? "active" : ""} />
            ))}
          </div>
        ) : null}

        <div className="tutorialActions">
          <button className="tutorialSkip" type="button" onClick={onClose}>
            Skip tutorial
          </button>
          <div className="tutorialNav">
            {step > 0 ? (
              <button className="commandButton" type="button" onClick={() => setStep((value) => value - 1)}>
                Back
              </button>
            ) : null}
            <button
              className="tutorialNext"
              type="button"
              onClick={() => (isLast ? onClose() : setStep((value) => value + 1))}
            >
              {isLast ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type ChartTip = { x: number; y: number; title: string; lines: string[] } | null;

function InsightChartToggle({ value, onChange }: { value: InsightChartView; onChange: (value: InsightChartView) => void }) {
  const options: Array<{ value: InsightChartView; label: string; icon: ReactNode }> = [
    { value: "inflow-outflow", label: "Monthly cash flow", icon: <LineChart size={15} /> },
    { value: "cash-flow", label: "Cash flow volatility", icon: <BarChart3 size={15} /> },
    { value: "net-worth", label: "Net worth outlook", icon: <Gauge size={15} /> },
  ];

  return (
    <div className="iconToggle" role="group" aria-label="Insight chart">
      {options.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? "selected" : ""}
          type="button"
          onClick={() => onChange(option.value)}
          aria-label={option.label}
          aria-pressed={value === option.value}
          title={option.label}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

function FinancialSignalCard({ signal, t, onDismiss }: { signal: FinancialSignal; t: (text: string) => string; onDismiss?: () => void }) {
  const title = t(signal.title);
  return (
    <div className={`signalCard ${signal.tone}`}>
      <div className="signalTitle">
        <strong>{title}</strong>
        {onDismiss ? (
          <span className="signalActions">
            <InfoHint label={`${title} context`} text={t(signal.detail)} />
            <button className="iconButton small signalDismiss" type="button" aria-label={`Dismiss ${title}`} onClick={onDismiss}>
              <X size={14} />
            </button>
          </span>
        ) : (
          <InfoHint label={`${title} context`} text={t(signal.detail)} />
        )}
      </div>
      <span>{t(signal.summary)}</span>
    </div>
  );
}

function LayoutEditButton({ page, editing, onToggle, t }: { page: LayoutPage; editing: boolean; onToggle: () => void; t: (text: string) => string }) {
  return (
    <button
      className={editing ? "commandButton layoutEditButton active" : "commandButton layoutEditButton"}
      type="button"
      onClick={onToggle}
      aria-pressed={editing}
      aria-label={editing ? t(`Finish customising the ${page}`) : t(`Customise the ${page} layout`)}
    >
      {editing ? <Check size={15} /> : <SlidersHorizontal size={15} />}
      {editing ? "Done" : t("Customise")}
    </button>
  );
}

function Fact({
  label,
  value,
  suffix,
  tone,
  privacy,
  formatter,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone: "good" | "bad";
  privacy?: boolean;
  formatter?: Intl.NumberFormat;
}) {
  return (
    <div className={`fact ${tone}`}>
      <span>{label}</span>
      <strong className={privacy && !suffix ? "masked" : ""}>{suffix ? `${formatDecimal(value)}${suffix}` : (formatter ?? getCurrencyFormatter("GBP")).format(value)}</strong>
    </div>
  );
}

function BarChart({ bars, privacy, formatter }: { bars: ReturnType<typeof buildMonthlyBars>; privacy: boolean; formatter: Intl.NumberFormat }) {
  return (
    <div className="barChart" aria-label="Monthly surplus bar chart">
      {bars.map((bar) => (
        <div className="barItem" key={bar.label}>
          <span className={bar.value >= 0 ? "bar positive" : "bar negative"} style={{ height: `${Math.max(6, Math.abs(bar.height))}%` }} />
          <small>{bar.label}</small>
          <em className={privacy ? "masked tinyMask" : ""}>{bar.value >= 0 ? "+" : ""}{formatter.format(bar.value)}</em>
        </div>
      ))}
    </div>
  );
}

// Monarch-style monthly cash flow: income rises from the zero line, spending
// mirrors below it, and a net marker per month ties the two together.
function InflowOutflowChart({
  points,
  privacy,
  formatter,
}: {
  points: MonthlyFlowPoint[];
  privacy: boolean;
  formatter: Intl.NumberFormat;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<ChartTip>(null);
  const activePoints = points.filter((point) => point.hasData);

  if (!activePoints.length) {
    return <EmptyState icon={<LineChart size={18} />} title="No monthly flow yet" text="Add income and outflows or import a CSV to build this chart." />;
  }

  const width = 720;
  const height = 280;
  const padTop = 18;
  const padBottom = 30;
  const padX = 26;
  const plotHeight = height - padTop - padBottom;
  const maxUp = Math.max(...points.map((point) => point.income), 1);
  const maxDown = Math.max(...points.map((point) => point.expenses), 1);
  const scale = plotHeight / (maxUp + maxDown);
  const zeroY = padTop + maxUp * scale;
  const slot = (width - padX * 2) / Math.max(points.length, 1);
  const barWidth = Math.max(12, Math.min(30, slot * 0.5));
  const money = (value: number) => (privacy ? "•••" : formatter.format(value));

  let netStarted = false;
  const netPath = points
    .map((point, index) => {
      if (!point.hasData) return "";
      const x = padX + index * slot + slot / 2;
      const y = zeroY - point.surplus * scale;
      const command = netStarted ? "L" : "M";
      netStarted = true;
      return `${command} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");

  const showTip = (event: ReactMouseEvent, point: MonthlyFlowPoint) => {
    const rect = shellRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      title: point.label,
      lines: [`Income ${money(point.income)}`, `Spending ${money(point.expenses)}`, `Net ${point.surplus >= 0 ? "+" : ""}${money(point.surplus)}`],
    });
  };

  return (
    <div className="flowComparisonChart sankeyShell" ref={shellRef} onMouseLeave={() => setTip(null)} aria-label="Monthly cash flow chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly income above the line, spending below, and net cash flow">
        <line className="flowGrid" x1={padX} x2={width - padX} y1={padTop} y2={padTop} />
        <line className="flowGrid" x1={padX} x2={width - padX} y1={height - padBottom} y2={height - padBottom} />
        <line className="netWorthAxis" x1={padX} x2={width - padX} y1={zeroY} y2={zeroY} />
        {points.map((point, index) => {
          const x = padX + index * slot + slot / 2;
          const incomeHeight = point.income * scale;
          const expenseHeight = point.expenses * scale;

          return (
            <g
              key={point.monthKey}
              className={point.hasData ? "flowMonth active" : "flowMonth"}
              onMouseMove={point.hasData ? (event) => showTip(event, point) : undefined}
            >
              <rect className="flowHit" x={x - slot / 2} y={padTop} width={slot} height={plotHeight} />
              <rect
                className="flowBar income"
                x={x - barWidth / 2}
                y={zeroY - Math.max(point.income > 0 ? 3 : 0, incomeHeight)}
                width={barWidth}
                height={Math.max(point.income > 0 ? 3 : 0, incomeHeight)}
                rx="4"
              />
              <rect
                className="flowBar expense"
                x={x - barWidth / 2}
                y={zeroY + 2}
                width={barWidth}
                height={Math.max(point.expenses > 0 ? 3 : 0, expenseHeight)}
                rx="4"
              />
              <text x={x} y={height - 8} textAnchor="middle">
                {point.label}
              </text>
            </g>
          );
        })}
        <path className="flowNetLine" d={netPath} />
        {points.map((point, index) => {
          if (!point.hasData) return null;
          const x = padX + index * slot + slot / 2;
          return <circle className="flowNetDot" key={point.monthKey} cx={x} cy={zeroY - point.surplus * scale} r={3.5} />;
        })}
      </svg>
      <div className="flowLegend">
        <span>
          <i className="income" /> Income
        </span>
        <span>
          <i className="expense" /> Spending
        </span>
        <span>
          <i className="net" /> Net
        </span>
        <strong className={privacy ? "masked" : ""}>
          Latest net {formatter.format(activePoints[activePoints.length - 1]?.surplus ?? 0)}
        </strong>
      </div>
      {tip && (
        <div className="chartTip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
          <strong>{tip.title}</strong>
          {tip.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function LineGraph({ projection }: { projection: Projection }) {
  const income = Math.max(projection.monthlyIncome, 1);
  const expenseRatio = clampPercent((projection.monthlyExpenses / income) * 100);
  const surplusRatio = clampPercent(((projection.monthlySurplus + income) / (income * 2)) * 100);

  return (
    <div className="lineGraph" aria-hidden="true">
      <svg viewBox="0 0 680 240" role="img">
        <defs>
          <linearGradient id="graphFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(0, 223, 193, 0.22)" />
            <stop offset="100%" stopColor="rgba(0, 223, 193, 0)" />
          </linearGradient>
        </defs>
        <path d="M28 194 C132 142 194 156 286 106 C396 46 492 148 652 66 L652 222 L28 222 Z" fill="url(#graphFill)" />
        <path className="drawLine" d="M28 194 C132 142 194 156 286 106 C396 46 492 148 652 66" fill="none" stroke="currentColor" strokeWidth="4" />
        <path className="drawLine mutedLine" d="M28 142 C158 128 236 176 336 160 C454 142 528 188 652 150" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
      <div className="graphLegend">
        <span>Outflow {formatDecimal(expenseRatio)}%</span>
        <span>Surplus signal {formatDecimal(surplusRatio)}%</span>
      </div>
    </div>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}

// Loaded state gets the same scheduled-debt-payment sync as every edit, so a new month opened
// on load already carries this month's planned payments.
function normalizeState(rawState: Partial<LedgerState>): LedgerState {
  return syncLedgerLinks(normalizeStateFields(rawState));
}

// The cross-page sync every change goes through: savings transfers linked, scheduled debt
// payments in the ledger, every transaction on an account, and linked goals following their
// account's live balance (last, so it sees the balances the steps before settled).
function syncLedgerLinks(state: LedgerState): LedgerState {
  return syncLinkedGoals(assignMissingAccounts(syncScheduledDebtPayments(linkSavingsTransfers(syncPlanContributions(state)))));
}

function normalizeStateFields(rawState: Partial<LedgerState>): LedgerState {
  const fallback = createInitialState();

  // ── v6 → v7 migration: single `goal` → `goals[]` ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = rawState as any;
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
    delete state.goal;
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

  return {
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
    // v9 → v10: ledgers saved before the Allocate page existed start on the default plan.
    allocation: normalizeAllocationSettings(state.allocation),
    // The Insights widgets' own data (looks, dismissed warnings, notes, to-dos).
    insights: normalizeInsightsState(state.insights),
    lastSavedAt: state.lastSavedAt ?? new Date().toISOString(),
  };
}

// Analytics label for an import inlet, derived from the review's source name.
function importSourceOf(fileName: string): ImportFormat {
  if (fileName === BANK_FEED_SOURCE_NAME) return "feed";
  if (fileName === "Pasted transactions") return "paste";
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ofx")) return "ofx";
  if (lower.endsWith(".qif")) return "qif";
  if (lower.endsWith(".pdf")) return "pdf";
  return "csv";
}

// Deleting an auto-seeded entry is the user saying "this doesn't repeat" — flip
// the recurring flag off on the origin entry so future months stop seeding it.
function stopSeededRepeat(state: LedgerState, seededFrom: { monthKey: string; entryId: string } | undefined, kind: "income" | "expense"): LedgerState {
  if (!seededFrom) return state;
  const sourceMonth = state.months[seededFrom.monthKey];
  if (!sourceMonth) return state;

  const patched: MonthBudget =
    kind === "income"
      ? {
          ...sourceMonth,
          incomes: sourceMonth.incomes.map((income) => (income.id === seededFrom.entryId ? { ...income, recurring: false } : income)),
        }
      : {
          ...sourceMonth,
          expenses: sourceMonth.expenses.map((expense) => (expense.id === seededFrom.entryId ? { ...expense, recurring: false } : expense)),
        };

  return {
    ...state,
    months: { ...state.months, [seededFrom.monthKey]: patched },
  };
}

// A category correction on an imported entry becomes a saved rule, and the rule is
// swept backwards over entries that no human has sorted yet (Unsorted, or an
// automated guess) — never over a category the user set by hand.
function learnCategoryRule(
  state: LedgerState,
  description: string,
  category: string,
  kind: TransactionKind,
  excludeEntryId?: string,
): { state: LedgerState; retroactivelyApplied: number } {
  const pattern = buildRulePattern(description);
  if (!pattern) return { state, retroactivelyApplied: 0 };

  const timestamp = new Date().toISOString();
  const rules = new Map(state.categoryRules.map((rule) => [rule.pattern, rule]));
  const existing = rules.get(pattern);
  rules.set(pattern, {
    id: existing?.id ?? createId("rule"),
    pattern,
    category,
    kind,
    debtAccountId: existing?.debtAccountId,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });

  let retroactivelyApplied = 0;
  const anchorColor =
    Object.values(state.months)
      .flatMap((month) => month.expenses)
      .find((expense) => expense.category === category)?.color ?? colors[category.length % colors.length];

  const months = Object.fromEntries(
    Object.entries(state.months).map(([monthKey, month]) => [
      monthKey,
      {
        ...month,
        expenses: month.expenses.map((expense) => {
          if (expense.id === excludeEntryId) return expense;
          if (expense.categorySource === "user" || expense.category === category) return expense;
          const humanSorted = !expense.imported && expense.category && expense.category !== "Unsorted" && !expense.categorySource;
          if (humanSorted) return expense;
          const matchText = expense.imported?.originalDescription || expense.name;
          if (!descriptionMatchesPattern(canonicalizeMerchant(matchText), pattern)) return expense;
          retroactivelyApplied += 1;
          return { ...expense, category, color: anchorColor, categorySource: "rule" as const };
        }),
      },
    ]),
  );

  return {
    state: { ...state, categoryRules: Array.from(rules.values()).slice(-120), months },
    retroactivelyApplied,
  };
}

function normalizeMonths(months: LedgerState["months"] | undefined, fallback: LedgerState["months"]): LedgerState["months"] {
  if (!months || !Object.keys(months).length) return fallback;

  return Object.fromEntries(
    Object.entries(months).map(([monthKey, month]) => [
      monthKey,
      {
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
      },
    ]),
  );
}

// Reads the new accounts[] array if present, otherwise migrates the legacy debts[] array
// (schema < 5), mapping apr -> rate and interestFreeMonths -> promoMonths.

function normalizeGoals(raw: unknown): SavingsGoal[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((g, index) => ({
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
    note: typeof g.note === "string" ? g.note : "",
    createdAt: typeof g.createdAt === "string" ? g.createdAt : new Date().toISOString(),
  }));
}

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

    return {
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
    };
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
  return {
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
  };
}

function normalizeHealthPlan(raw: unknown): LedgerState["healthPlan"] {
  const fallback = createInitialState().healthPlan;
  const item = (raw ?? {}) as Record<string, unknown>;
  const number = (value: unknown, defaultValue: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.min(1_000_000_000, parsed) : defaultValue;
  };
  const startMonth = Math.round(Number(item.planYearStartMonth));
  return {
    planType: ["", "hdhp", "ppo", "hmo", "epo", "other"].includes(item.planType as string) ? (item.planType as LedgerState["healthPlan"]["planType"]) : fallback.planType,
    coverage: item.coverage === "family" ? "family" : "self",
    premiumMonthly: number(item.premiumMonthly, fallback.premiumMonthly),
    deductible: number(item.deductible, fallback.deductible),
    outOfPocketMax: number(item.outOfPocketMax, fallback.outOfPocketMax),
    planYearStartMonth: Number.isFinite(startMonth) && startMonth >= 1 && startMonth <= 12 ? startMonth : fallback.planYearStartMonth,
  };
}

function normalizeCategoryRules(rules: CategoryRule[] | undefined): CategoryRule[] {
  if (!Array.isArray(rules)) return [];

  return rules
    .filter((rule) => rule.pattern?.trim() && rule.category?.trim())
    .map((rule) => ({
      id: rule.id || createId("rule"),
      pattern: rule.pattern.trim().toLowerCase(),
      category: rule.category.trim(),
      kind: rule.kind ?? "expense",
      debtAccountId: typeof rule.debtAccountId === "string" ? rule.debtAccountId : undefined,
      createdAt: rule.createdAt ?? new Date().toISOString(),
      updatedAt: rule.updatedAt ?? new Date().toISOString(),
    }));
}

function normalizeImportBatches(batches: ImportBatch[] | undefined): ImportBatch[] {
  if (!Array.isArray(batches)) return [];

  return batches.map((batch) => ({
    id: batch.id || createId("batch"),
    fileName: batch.fileName || "Imported CSV",
    importedAt: batch.importedAt ?? new Date().toISOString(),
    totalRows: finiteNumber(batch.totalRows, 0),
    importedRows: finiteNumber(batch.importedRows, 0),
    skippedRows: finiteNumber(batch.skippedRows, 0),
    transactionRefs: Array.isArray(batch.transactionRefs) ? batch.transactionRefs : [],
  }));
}

// Add or refresh a "transfer between my accounts" rule keyed by its merchant pattern.
function upsertTransferRule(rules: CategoryRule[], pattern: string, timestamp: string): CategoryRule[] {
  const map = new Map(rules.map((rule) => [rule.pattern, rule]));
  const existing = map.get(pattern);
  map.set(pattern, {
    id: existing?.id ?? createId("rule"),
    pattern,
    category: "Transfers",
    kind: "transfer",
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
  return Array.from(map.values());
}

// Remove every ledger entry whose description matches a saved transfer rule. Returns the
// pruned months plus how many entries were swept, so callers can report it.
function sweepTransferEntries(
  months: Record<string, MonthBudget>,
  rules: CategoryRule[],
): { months: Record<string, MonthBudget>; removed: number } {
  const transferRules = rules.filter((rule) => rule.kind === "transfer");
  if (!transferRules.length) return { months, removed: 0 };

  let removed = 0;
  const next: Record<string, MonthBudget> = {};
  for (const [monthKey, month] of Object.entries(months)) {
    const incomes = month.incomes.filter((income) => {
      const hit = isTransferDescription(income.source, transferRules);
      if (hit) removed += 1;
      return !hit;
    });
    const expenses = month.expenses.filter((expense) => {
      const hit = isTransferDescription(expense.name, transferRules);
      if (hit) removed += 1;
      return !hit;
    });
    next[monthKey] =
      incomes.length === month.incomes.length && expenses.length === month.expenses.length
        ? month
        : { ...month, incomes, expenses };
  }
  return { months: next, removed };
}

function mergeCategoryRules(existingRules: CategoryRule[], importedRows: CsvImportRow[], timestamp: string): CategoryRule[] {
  const rules = new Map(existingRules.map((rule) => [rule.pattern, rule]));

  importedRows.forEach((row) => {
    const pattern = buildRulePattern(row.description);
    const category = row.category.trim();
    if (!pattern || !category || category === "Unsorted") return;

    const existing = rules.get(pattern);
    rules.set(pattern, {
      id: existing?.id ?? createId("rule"),
      pattern,
      category,
      kind: row.kind,
      // Remember which debt account this payee pays so future imports auto-link.
      debtAccountId: row.kind === "debt-payment" ? row.debtAccountId ?? existing?.debtAccountId : undefined,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
  });

  return Array.from(rules.values()).slice(-120);
}

function removeImportBatchFromState(state: LedgerState, batchId: string): LedgerState {
  const batch = state.importBatches.find((item) => item.id === batchId);
  if (!batch) return state;

  const refKeys = new Set(batch.transactionRefs.map((ref) => `${ref.monthKey}:${ref.entryId}:${ref.kind}`));
  const months = Object.fromEntries(
    Object.entries(state.months).map(([monthKey, month]) => [
      monthKey,
      {
        ...month,
        incomes: month.incomes.filter(
          (income) => income.imported?.batchId !== batchId && !refKeys.has(`${monthKey}:${income.id}:income`),
        ),
        expenses: month.expenses.filter(
          (expense) => expense.imported?.batchId !== batchId && !refKeys.has(`${monthKey}:${expense.id}:expense`),
        ),
      },
    ]),
  );

  return {
    ...state,
    months,
    importBatches: state.importBatches.filter((item) => item.id !== batchId),
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function nextCategoryName(expenses: ExpenseEntry[]) {
  const names = new Set(expenses.map((expense) => expense.category).filter(Boolean));
  let index = 1;
  let name = "New category";
  while (names.has(name)) {
    index += 1;
    name = `New category ${index}`;
  }
  return name;
}

function randomCategoryColor(expenses: ExpenseEntry[]) {
  const usedColors = new Set(expenses.filter((expense) => expense.category.trim()).map((expense) => expense.color));
  const availableColors = colors.filter((color) => !usedColors.has(color));
  const palette = availableColors.length ? availableColors : colors;
  return palette[Math.floor(Math.random() * palette.length)];
}

function findLastExpenseIndex(expenses: ExpenseEntry[], predicate: (expense: ExpenseEntry) => boolean) {
  for (let index = expenses.length - 1; index >= 0; index -= 1) {
    if (predicate(expenses[index])) return index;
  }
  return -1;
}

export default App;
