import { useEffect, useMemo, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import LandingPage from "./LandingPage";
import type { CSSProperties, Dispatch, DragEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, Ref, SetStateAction } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cloud,
  CreditCard,
  Database,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileJson,
  FolderPlus,
  Gauge,
  GraduationCap,
  Info,
  LayoutDashboard,
  LineChart,
  LogIn,
  LogOut,
  PiggyBank,
  Plus,
  ReceiptText,
  Repeat,
  TrendingUp,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Target,
  Trash2,
  X,
  Upload,
  WalletCards,
} from "lucide-react";
import {
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
  getCurrencySymbol,
  runGoalSequence,
  seedMonthFromPrevious,
  shiftMonth,
} from "./finance";
import { buildRulePattern, isTransferDescription, parseBankCsv, sortImportRows, type CsvImportRow } from "./importer";
import { GoalsView } from "./GoalsView";
import { loadLedgerState, saveLedgerState } from "./storage";
import {
  getCurrentSession,
  isSupabaseConfigured,
  loadCloudLedgerState,
  saveCloudLedgerState,
  signInWithGoogle,
  signOut,
  supabase,
  upsertUserProfile,
  type AuthSession,
} from "./supabase";
import type {
  Account,
  AccountClass,
  AccountType,
  CategoryRule,
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
  LedgerState,
  MonthBudget,
  MonthlyFlowPoint,
  NetWorthPoint,
  Projection,
  SavingsGoal,
  TransactionKind,
} from "./types";

type ProjectionView = "overview" | "category" | "month";
type AppView = "dashboard" | "ledger" | "accounts" | "goals" | "insights" | "settings";

type TutorialStep = { heading: string; bullets: string[] };
type PageTutorial = { title: string; badge: string; steps: TutorialStep[] };

function capitalizeFirst(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Short, skimmable per-page walkthroughs. Auto-shown the first time each page is
// opened (ledger first), and replayable anytime from the sidebar "Tutorial" button.
const TUTORIALS: Record<AppView, PageTutorial> = {
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
          "The net-worth outlook projects where your finances are heading.",
          "The ledger summary shows this month's income vs spending.",
          "Quick links jump you straight to accounts and imports.",
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
  insights: {
    title: "Spot the trends",
    badge: "Insights",
    steps: [
      {
        heading: "",
        bullets: [
          "Your health score rates cash flow, debt and savings.",
          "Charts show monthly cash flow and your category breakdown.",
          "Anomalies flag unusual spending worth a second look.",
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
          "Privacy mode hides amounts; switch currency or animations anytime.",
        ],
      },
    ],
  },
};

const TUTORIAL_SEEN_KEY = "tutorialSeenPages";

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
type NetWorthHorizon = 12 | 24 | 60;
type InsightChartView = "inflow-outflow" | "cash-flow" | "net-worth";
type ExpenseDropPreview =
  | { type: "reorder"; targetId: string; edge: "before" | "after" }
  | { type: "category"; category: string }
  | { type: "combine"; targetId: string }
  | null;
type ExpenseDropState = "before" | "after" | "combine";
type CategoryMenuState = { expenseId: string; x: number; y: number };
type CategoryOption = { name: string; color: string; count: number; total: number };
type ImportReviewState = {
  fileName: string;
  rows: CsvImportRow[];
  errors: string[];
  totalRows: number;
};
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

// Default sub-type for each account class, so switching the class picks a sensible type.
const DEFAULT_TYPE_BY_CLASS: Record<AccountClass, AccountType> = {
  debt: "credit-card",
  cash: "current",
  savings: "savings",
  investment: "investment",
};

const ACCOUNT_TYPE_OPTIONS: Record<AccountClass, Array<{ value: AccountType; label: string }>> = {
  debt: [
    { value: "credit-card", label: "Credit card" },
    { value: "loan", label: "Loan" },
    { value: "overdraft", label: "Overdraft" },
    { value: "other", label: "Other" },
  ],
  cash: [
    { value: "current", label: "Current" },
    { value: "other-asset", label: "Other cash" },
  ],
  savings: [
    { value: "savings", label: "Savings" },
    { value: "isa", label: "Cash ISA" },
    { value: "other-asset", label: "Other" },
  ],
  investment: [
    { value: "investment", label: "Investment / stocks" },
    { value: "isa", label: "Stocks & shares ISA" },
    { value: "pension", label: "Pension" },
    { value: "other-asset", label: "Other" },
  ],
};

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
  const [showLanding, setShowLanding] = useState(() => !localStorage.getItem("hasSeenLanding"));
  const [ledger, setLedger] = useState<LedgerState>(() => createInitialState());
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authWorking, setAuthWorking] = useState(false);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const authUserIdRef = useRef<string | null>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);
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
  const [activeView, setActiveView] = useState<AppView>("ledger");
  const [tutorialView, setTutorialView] = useState<AppView | null>(null);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("Loading secure vault");
  const [draggingExpenseId, setDraggingExpenseId] = useState<string | null>(null);
  const [groupingSourceId, setGroupingSourceId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<ExpenseDropPreview>(null);
  const [categoryMenu, setCategoryMenu] = useState<CategoryMenuState | null>(null);
  const [importReview, setImportReview] = useState<ImportReviewState | null>(null);
  const [lastImportAction, setLastImportAction] = useState<LastImportAction | null>(null);
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

  const currentMonth = ledger.months[ledger.selectedMonth] ?? seedMonthFromPrevious();
  const moneyFormatter = useMemo(() => getCurrencyFormatter(ledger.currency), [ledger.currency]);
  const currencySymbol = useMemo(() => getCurrencySymbol(ledger.currency), [ledger.currency]);
  const projection = useMemo(() => calculateProjection(currentMonth), [currentMonth]);
  const debtSummary = useMemo(() => calculateDebtSummary(ledger.accounts), [ledger.accounts]);
  const assetSummary = useMemo(() => calculateAssetSummary(ledger.accounts), [ledger.accounts]);
  const netWorthSummary = useMemo(() => calculateNetWorthSummary(ledger.accounts), [ledger.accounts]);
  const netWorthOutlook = useMemo(
    () =>
      buildNetWorthOutlook({
        accounts: ledger.accounts,
        projection,
        months: netWorthHorizon,
      }),
    [ledger.accounts, netWorthHorizon, projection],
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
    const names = new Set([
      "Unsorted",
      "Income",
      "Home",
      "Food",
      "Bills",
      "Travel",
      "Subscriptions",
      "Health",
      "Tax",
      "Debt payments",
      "Transfers",
    ]);
    categoryOptions.forEach((option) => names.add(option.name));
    importReview?.rows.forEach((row) => {
      if (row.category) names.add(row.category);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [categoryOptions, importReview?.rows]);
  const transferRules = useMemo(
    () => ledger.categoryRules.filter((rule) => rule.kind === "transfer"),
    [ledger.categoryRules],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleIncomes = useMemo(() => {
    if (!normalizedQuery) return currentMonth.incomes;
    return currentMonth.incomes.filter((income) => income.source.toLowerCase().includes(normalizedQuery));
  }, [currentMonth.incomes, normalizedQuery]);
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
  const monthlyBars = useMemo(() => buildMonthlyBars(ledger, currentMonth), [ledger, currentMonth]);
  const monthlyFlowPoints = useMemo(() => buildMonthlyFlowPoints(ledger), [ledger]);
  const healthScore = useMemo(
    () => calculateHealthScore({ projection, debtSummary, accounts: ledger.accounts, savingsTarget: ledger.savingsTarget }),
    [debtSummary, ledger.accounts, ledger.savingsTarget, projection],
  );
  const financialSignals = useMemo(
    () => buildFinancialSignals({ projection, debtSummary, accounts: ledger.accounts, assetSummary, month: currentMonth, savingsTarget: ledger.savingsTarget }),
    [currentMonth, debtSummary, assetSummary, ledger.accounts, ledger.savingsTarget, projection],
  );
  const goalPlannerSurplus = ledger.goalPlannerSurplus ?? projection.recurringMonthlySurplus;
  const goalSequence = useMemo(
    () => runGoalSequence({ goals: ledger.goals, monthlySurplus: goalPlannerSurplus, horizonMonths: ledger.goalsHorizonMonths }),
    [ledger.goals, goalPlannerSurplus, ledger.goalsHorizonMonths],
  );
  const ledgerGoal = ledger.goals.find((g) => g.id === ledger.ledgerGoalId) ?? ledger.goals[0] ?? null;
  const ledgerGoalOutcome = ledgerGoal ? goalSequence.goals.find((o) => o.goalId === ledgerGoal.id) ?? null : null;
  const ledgerGoalPercent = ledgerGoal ? clampPercent((ledgerGoal.saved / Math.max(ledgerGoal.target, 1)) * 100) : 0;
  const selectedYear = ledger.selectedMonth.split("-")[0];
  const menuExpense = categoryMenu ? currentMonth.expenses.find((expense) => expense.id === categoryMenu.expenseId) : undefined;

  useEffect(() => {
    let alive = true;

    async function hydrate() {
      try {
        const stored = await loadLedgerState();
        if (!alive) return;
        if (stored) {
          setLedger(normalizeState(stored));
          setToast("Local cache ready");
        } else {
          setToast("Secure vault ready");
        }
      } catch {
        setToast("Using this browser only");
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
      }
    }).data.subscription;

    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !user) return;
    let alive = true;

    async function hydrateCloudLedger() {
      setSaveState("loading");
      try {
        await upsertUserProfile(user);
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
          await saveCloudLedgerState(user.id, ledger);
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

  // Nudge unsigned-in users after 60 s
  useEffect(() => {
    if (user || !hydrated) return;
    const timer = window.setTimeout(() => {
      if (!nudgeDismissedRef.current) setShowSyncNudge(true);
    }, 60_000);
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
          setToast(user ? "Saved to Supabase" : "Saved locally");
        })
        .catch(() => {
          setSaveState("offline");
          setToast(user ? "Cloud sync paused" : "Browser storage fallback active");
        });
    }, 240);

    return () => window.clearTimeout(timeout);
  }, [ledger, hydrated, authLoading, cloudHydrated, user?.id]);

  // Auto-show a page's tutorial the first time it's opened (ledger first, since it's
  // the default view). Once dismissed it won't reappear; the sidebar button replays it.
  useEffect(() => {
    if (showLanding || !hydrated) return;
    if (readSeenTutorials().has(activeView)) return;
    setTutorialView((current) => current ?? activeView);
  }, [activeView, showLanding, hydrated]);

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

  useEffect(() => {
    if (!categoryMenu) return;

    function closeMenu() {
      setCategoryMenu(null);
    }

    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [categoryMenu]);

  function updateLedger(updater: (current: LedgerState) => LedgerState) {
    setLedger((current) => ({
      ...updater(current),
      lastSavedAt: new Date().toISOString(),
    }));
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
    updateLedger((current) => {
      const nextKey = shiftMonth(current.selectedMonth, offset);
      const months = current.months[nextKey]
        ? current.months
        : {
            ...current.months,
            [nextKey]: seedMonthFromPrevious(current.months[current.selectedMonth]),
          };

      return {
        ...current,
        selectedMonth: nextKey,
        months,
      };
    });
    setToast("Month switched");
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
        },
      ],
    }));
    setIncomeDraft(initialIncomeDraft);
    setToast("Income added");
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

    updateCurrentMonth((month) => ({
      ...month,
      expenses: [
        ...month.expenses,
        {
          id: createId("expense"),
          name: expenseDraft.name.trim(),
          amount,
          category: "",
          color: colors[(month.expenses.length + 2) % colors.length],
          recurring: true,
        },
      ],
    }));
    setExpenseDraft(initialExpenseDraft);
    setToast("Expense added");
    focusNextFrame(expenseNameInputRef);
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
      expenses: month.expenses.map((expense) => (expense.id === id ? { ...expense, ...patch } : expense)),
    }));
  }

  function removeIncome(id: string) {
    updateCurrentMonth((month) => ({
      ...month,
      incomes: month.incomes.filter((income) => income.id !== id),
    }));
    setToast("Income removed");
  }

  function removeExpense(id: string) {
    updateCurrentMonth((month) => ({
      ...month,
      expenses: month.expenses.filter((expense) => expense.id !== id),
    }));
    setToast("Expense removed");
  }

  function addAccount() {
    const name = accountDraft.name.trim();
    if (!name) {
      setToast("Add an account name");
      return;
    }

    const cls = accountDraft.accountClass;
    const isDebt = cls === "debt";
    // Investment accounts default their rate to the global assumed return when left blank.
    const fallbackRate = cls === "investment" ? ledger.assumedInvestmentReturn : 0;
    const rate = accountDraft.rate.trim() === "" ? fallbackRate : Math.max(-50, Number(accountDraft.rate) || 0);

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
          creditLimit: isDebt ? Math.max(0, Number(accountDraft.creditLimit) || 0) : 0,
          minimumPayment: isDebt ? Math.max(0, Number(accountDraft.minimumPayment) || 0) : 0,
          dueDay: isDebt ? clampDueDay(Number(accountDraft.dueDay) || 1) : 1,
          includeInNetWorth: true,
          color: colors[current.accounts.length % colors.length],
          note: "",
        },
      ],
    }));
    setAccountDraft({ ...initialAccountDraft, accountClass: cls, type: accountDraft.type });
    setToast(isDebt ? "Debt account added" : "Account added");
  }

  function updateAccount(id: string, patch: Partial<Account>) {
    updateLedger((current) => ({
      ...current,
      accounts: current.accounts.map((account) => (account.id === id ? { ...account, ...patch } : account)),
    }));
  }

  function removeAccount(id: string) {
    updateLedger((current) => ({
      ...current,
      accounts: current.accounts.filter((account) => account.id !== id),
    }));
    setToast("Account removed");
  }

  function changeCurrency(currency: CurrencyCode) {
    updateLedger((current) => ({ ...current, currency }));
    setToast(`Currency set to ${currency}`);
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
    updateCurrentMonth((month) => {
      const source = month.expenses.find((expense) => expense.id === sourceId);
      const remaining = month.expenses.filter((expense) => expense.id !== sourceId);
      const categoryAnchor = remaining.find((expense) => expense.category === category) ?? (source?.category === category ? source : undefined);
      if (!source || !categoryAnchor) return month;

      const movedExpense = { ...source, category, color: categoryAnchor.color };
      const lastCategoryIndex = findLastExpenseIndex(remaining, (expense) => expense.category === category);
      const insertIndex = lastCategoryIndex >= 0 ? lastCategoryIndex + 1 : remaining.length;
      return {
        ...month,
        expenses: [...remaining.slice(0, insertIndex), movedExpense, ...remaining.slice(insertIndex)],
      };
    });
    setToast("Moved into category");
    setGroupingSourceId(null);
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

  async function importCsv(file: File) {
    try {
      const text = await file.text();
      const result = parseBankCsv({ text, fileName: file.name, state: ledger, fallbackMonthKey: ledger.selectedMonth });
      setImportReview({
        fileName: file.name,
        rows: result.rows,
        errors: result.errors,
        totalRows: result.totalRows,
      });
      setToast(result.rows.length ? "CSV ready for review" : "CSV needs review");
    } catch {
      setToast("CSV import failed");
    } finally {
      if (csvInputRef.current) {
        csvInputRef.current.value = "";
      }
    }
  }

  function updateImportReviewRow(id: string, patch: Partial<CsvImportRow>) {
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
            source: row.description,
            amount: Math.abs(row.amount),
            color: row.color || colors[index % colors.length],
            // Imported bank rows are historical actuals — one-off by default, not run-rate.
            recurring: false,
            date: row.date,
            imported,
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
          name: row.description,
          amount: Math.abs(row.amount),
          category: row.category.trim() || (row.kind === "debt-payment" ? "Debt payments" : "Unsorted"),
          color: row.color || colors[(index + 2) % colors.length],
          // Imported bank rows are historical actuals — one-off by default, not run-rate.
          recurring: false,
          date: row.date,
          imported,
        };
        months[row.monthKey] = {
          ...month,
          expenses: [...month.expenses, entry],
        };
        transactionRefs.push({ monthKey: row.monthKey, entryId: entry.id, kind: "expense" });
      });

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

    setImportReview(null);
    if (rowsToImport.length) {
      setLastImportAction({ batchId, fileName: importReview.fileName, importedRows: rowsToImport.length });
    }
    setActiveView("ledger");

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
      const fresh = createInitialState();
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
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
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

  const navItems: Array<{ id: AppView; label: string; icon: ReactNode }> = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { id: "ledger", label: "Ledger", icon: <ReceiptText size={20} /> },
    { id: "accounts", label: "Accounts", icon: <CreditCard size={20} /> },
    { id: "goals", label: "Goals", icon: <Target size={20} /> },
    { id: "insights", label: "Insights", icon: <LineChart size={20} /> },
    { id: "settings", label: "Settings", icon: <SettingsIcon size={20} /> },
  ];
  const activeTitle =
    activeView === "dashboard"
      ? "Dashboard"
      : activeView === "ledger"
        ? "Ledger"
        : activeView === "accounts"
          ? "Accounts"
          : activeView === "goals"
            ? "Goals"
            : activeView === "insights"
              ? "Spending Intelligence"
              : "Management Hub";
  const insightChartTitle =
    insightChartView === "cash-flow"
      ? "Cash flow volatility"
      : insightChartView === "net-worth"
        ? "Net worth outlook"
        : "Inflows vs outflows";
  const userName =
    (typeof user?.user_metadata.name === "string" && user.user_metadata.name) ||
    user?.email?.split("@")[0] ||
    "Secure user";
  const userAvatar = typeof user?.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : "";

  if (showLanding) {
    return <LandingPage onEnter={() => setShowLanding(false)} />;
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
        accept="text/csv,.csv"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importCsv(file);
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
              className={activeView === item.id ? "navItem active" : "navItem"}
              type="button"
              onClick={() => setActiveView(item.id)}
              aria-pressed={activeView === item.id}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <button
          className="sideTutorialBtn"
          type="button"
          onClick={() => setTutorialView(activeView)}
          data-tip={`Replay the ${TUTORIALS[activeView].badge} tutorial`}
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
          <div className="appBarTitle">
            {activeView === "ledger" ? (
              <div className="monthSwitch" aria-label="Selected month">
                <button className="iconButton" type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" aria-keyshortcuts="Alt+ArrowLeft">
                  <ChevronLeft size={19} />
                </button>
                <div className="monthLabel">
                  <CalendarDays size={17} />
                  <strong>{formatMonth(ledger.selectedMonth)}</strong>
                </div>
                <button className="iconButton" type="button" onClick={() => changeMonth(1)} aria-label="Next month" aria-keyshortcuts="Alt+ArrowRight">
                  <ChevronRight size={19} />
                </button>
              </div>
            ) : (
              <h2>{activeTitle}</h2>
            )}
          </div>

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

          <div className="topActions">
            <StatusPill state={saveState} toast={toast} />
            <label className="currencyControl">
              <span>{currencySymbol}</span>
              <select value={ledger.currency} onChange={(event) => changeCurrency(event.target.value as CurrencyCode)} aria-label="Currency">
                {currencyOptions.map((option) => (
                  <option value={option.code} key={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className={ledger.privacyMode ? "iconButton active" : "iconButton"}
              type="button"
              onClick={() => updateLedger((current) => ({ ...current, privacyMode: !current.privacyMode }))}
              aria-label={ledger.privacyMode ? "Show amounts" : "Hide amounts"}
              data-tip={ledger.privacyMode ? "Show amounts" : "Hide amounts"}
            >
              {ledger.privacyMode ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
            {user ? (
              <button className="iconButton" type="button" onClick={handleSignOut} aria-label="Sign out" data-tip="Sign out" disabled={authWorking}>
                <LogOut size={18} />
              </button>
            ) : (
              <button className="iconButton" type="button" onClick={() => setShowSignInModal(true)} aria-label="Sign in" data-tip="Sign in to sync">
                <LogIn size={18} />
              </button>
            )}
            <button className="iconButton" type="button" onClick={() => setActiveView("settings")} aria-label="Help" data-tip="Help">
              <CircleHelp size={18} />
            </button>
          </div>
        </header>

        <main className="contentCanvas">
          {activeView === "dashboard" && (
            <section className="viewStack" aria-label="Dashboard">
              <div className="pageHeader compactHeader">
                <div>
                  <h2>Dashboard</h2>
                  <p>Monthly flow, annual run rate, and local vault health.</p>
                </div>
                <div className="netBlock">
                  <span>Net Flow</span>
                  <strong className={projection.monthlySurplus >= 0 ? "positiveText sensitive" : "negativeText sensitive"}>
                    <AnimatedCurrency value={projection.monthlySurplus} formatter={moneyFormatter} />
                  </strong>
                </div>
              </div>

              <section className="summaryStrip" aria-label="Monthly snapshot">
                <MetricCard label="Income" value={projection.monthlyIncome} tone="green" privacy={ledger.privacyMode} formatter={moneyFormatter} />
                <MetricCard label="Outputs" value={projection.monthlyExpenses} tone="red" privacy={ledger.privacyMode} formatter={moneyFormatter} />
                <MetricCard label="Surplus" value={projection.monthlySurplus} tone={projection.monthlySurplus >= 0 ? "green" : "red"} privacy={ledger.privacyMode} formatter={moneyFormatter} />
                <MetricCard label="Savings rate" value={projection.savingsRate} suffix="%" tone={projection.savingsRate >= ledger.savingsTarget ? "green" : "amber"} />
              </section>

              <section className="dashboardGrid">
                <article className="miniPanel flowPanel">
                  <PanelTitle
                    title="Net worth outlook"
                    icon={<LineChart size={16} />}
                    action={<NetWorthHorizonTabs horizon={netWorthHorizon} onChange={setNetWorthHorizon} compact />}
                  />
                  <p className="panelSubcopy">Projects your recurring monthly surplus, debt payments, and interest after any 0% period ends. One-off items are not extrapolated.</p>
                  <NetWorthChart points={netWorthOutlook} formatter={moneyFormatter} privacy={ledger.privacyMode} compact />
                </article>
                <article className="miniPanel ledgerPreview">
                  <PanelTitle title="Master ledger" icon={<ReceiptText size={16} />} />
                  <TransactionHistory month={currentMonth} privacy={ledger.privacyMode} formatter={moneyFormatter} />
                </article>
                <article className="miniPanel debtPanel">
                  <PanelTitle title="Accounts and imports" icon={<CreditCard size={16} />} />
                  <div className="debtMiniGrid">
                    <div>
                      <span>Total debt</span>
                      <strong className={ledger.privacyMode ? "masked" : ""}>{moneyFormatter.format(debtSummary.totalDebt)}</strong>
                    </div>
                    <div>
                      <span>Monthly payments</span>
                      <strong className={ledger.privacyMode ? "masked" : ""}>{moneyFormatter.format(debtSummary.monthlyMinimums)}</strong>
                    </div>
                    <div>
                      <span>Utilization</span>
                      <strong>{formatDecimal(debtSummary.utilization)}%</strong>
                    </div>
                    <div>
                      <span>Last import</span>
                      <strong>{ledger.importBatches[0]?.importedRows ?? 0} rows</strong>
                    </div>
                  </div>
                  <div className="buttonRow dashboardActions">
                    <button className="commandButton" type="button" onClick={() => setActiveView("accounts")}>
                      <CreditCard size={16} />
                      Manage accounts
                    </button>
                    <button className="commandButton" type="button" onClick={() => csvInputRef.current?.click()}>
                      <FileSpreadsheet size={16} />
                      Import CSV
                    </button>
                  </div>
                </article>
              </section>
            </section>
          )}

          {activeView === "ledger" && (
            <section className="viewStack" aria-label="Ledger">
              <div className="pageHeader">
                <div>
                  <h2>Ledger</h2>
                  <p>Reconcile inputs and outputs for the current period.</p>
                </div>
                <div className="netBlock">
                  <span>Net Flow</span>
                  <strong className={projection.monthlySurplus >= 0 ? "positiveText sensitive" : "negativeText sensitive"}>
                    {projection.monthlySurplus >= 0 ? "+ " : "- "}
                    <AnimatedCurrency value={Math.abs(projection.monthlySurplus)} formatter={moneyFormatter} />
                  </strong>
                </div>
              </div>

              <section className="monthlyGrid" aria-label="Monthly inputs and outputs">
                <Panel
                  title="Income"
                  total={projection.monthlyIncome}
                  tone="income"
                  count={currentMonth.incomes.length}
                  privacy={ledger.privacyMode}
                  formatter={moneyFormatter}
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
                          privacy={ledger.privacyMode}
                          symbol={currencySymbol}
                          onChange={(patch) => updateIncome(income.id, patch)}
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
                      placeholder="Income source, e.g. Salary"
                      onChange={(event) => setIncomeDraft((draft) => ({ ...draft, source: capitalizeFirst(event.target.value) }))}
                      onKeyDown={(event) => handleDraftEnter(event, addIncome)}
                    />
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
                                <span className="swatch small" style={{ background: group.color }} />
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
                                  privacy={ledger.privacyMode}
                                  formatter={moneyFormatter}
                                  symbol={currencySymbol}
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
                      placeholder="What did you spend on?"
                      onChange={(event) => setExpenseDraft((draft) => ({ ...draft, name: capitalizeFirst(event.target.value) }))}
                      onKeyDown={(event) => handleDraftEnter(event, addExpense)}
                    />
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
                <GoalsPanel
                  ledger={ledger}
                  month={currentMonth}
                  goal={ledgerGoal}
                  goalPercent={ledgerGoalPercent}
                  goalOutcome={ledgerGoalOutcome}
                  allGoals={ledger.goals}
                  ledgerGoalId={ledger.ledgerGoalId}
                  projection={projection}
                  onSelectGoal={(id) => updateLedger((c) => ({ ...c, ledgerGoalId: id }))}
                  onGoToGoals={() => setActiveView("goals")}
                  onGoalChange={(patch) => ledgerGoal && updateGoal(ledgerGoal.id, patch)}
                  onNoteChange={(note) => updateCurrentMonth((month) => ({ ...month, note }))}
                  onResetMonth={resetMonth}
                  privacy={ledger.privacyMode}
                  symbol={currencySymbol}
                />
              </section>

              <div className="annualInsightsCta">
                <button className="commandButton" type="button" onClick={() => setActiveView("insights")}>
                  <LineChart size={16} />
                  See annual insights
                </button>
              </div>
            </section>
          )}

          {activeView === "accounts" && (
            <section className="viewStack" aria-label="Accounts">
              <div className="pageHeader compactHeader">
                <div>
                  <h2>Net Worth</h2>
                  <p>Track savings, current accounts, and investments alongside debt to see your whole financial picture.</p>
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
                  <PanelTitle title="Savings, cash & investments" icon={<PiggyBank size={16} />} />
                  <div className="debtAccountList">
                    {ledger.accounts.filter((a) => a.accountClass !== "debt").length ? (
                      ledger.accounts
                        .filter((a) => a.accountClass !== "debt")
                        .map((account) => (
                          <AccountRow
                            key={account.id}
                            account={account}
                            symbol={currencySymbol}
                            formatter={moneyFormatter}
                            privacy={ledger.privacyMode}
                            onChange={(patch) => updateAccount(account.id, patch)}
                            onRemove={() => removeAccount(account.id)}
                          />
                        ))
                    ) : (
                      <EmptyState icon={<PiggyBank size={18} />} title="No asset accounts" text="Add a savings, current, or investment account below to start tracking net worth." />
                    )}
                  </div>
                </article>

                <article className="miniPanel accountsPanel">
                  <PanelTitle title="Debt accounts" icon={<CreditCard size={16} />} />
                  <div className="debtAccountList">
                    {ledger.accounts.filter((a) => a.accountClass === "debt").length ? (
                      ledger.accounts
                        .filter((a) => a.accountClass === "debt")
                        .map((account) => (
                          <AccountRow
                            key={account.id}
                            account={account}
                            symbol={currencySymbol}
                            formatter={moneyFormatter}
                            privacy={ledger.privacyMode}
                            onChange={(patch) => updateAccount(account.id, patch)}
                            onRemove={() => removeAccount(account.id)}
                          />
                        ))
                    ) : (
                      <EmptyState icon={<CreditCard size={18} />} title="No debt accounts" text="Add a credit card, loan, overdraft, or other balance to track it here." />
                    )}
                  </div>
                </article>

                <AccountEditor
                  draft={accountDraft}
                  setDraft={setAccountDraft}
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

          {activeView === "goals" && (
            <GoalsView
              goals={ledger.goals}
              goalSequence={goalSequence}
              goalPlannerSurplus={goalPlannerSurplus}
              surplexOverridden={ledger.goalPlannerSurplus !== null}
              goalsHorizonMonths={ledger.goalsHorizonMonths}
              currency={ledger.currency}
              symbol={currencySymbol}
              formatter={moneyFormatter}
              privacy={ledger.privacyMode}
              onAddGoal={addGoal}
              onUpdateGoal={updateGoal}
              onRemoveGoal={removeGoal}
              onReorderGoal={reorderGoal}
              onSurplusOverride={(v) => updateLedger((c) => ({ ...c, goalPlannerSurplus: v }))}
              onHorizonChange={(h) => updateLedger((c) => ({ ...c, goalsHorizonMonths: h }))}
            />
          )}

          {activeView === "insights" && (
            <section className="viewStack" aria-label="Insights">
              <div className="pageHeader compactHeader">
                <div>
                  <h2>Spending Intelligence</h2>
                  <p>A calm read on cash flow, category concentration, and unusual run rate.</p>
                </div>
              </div>

              <section className="insightsGrid">
                <article className="miniPanel healthPanel">
                  <PanelTitle
                    title="Health score"
                    icon={<Gauge size={16} />}
                    action={<InfoHint label="How health score is calculated" text={healthScore.detail} />}
                  />
                  <div className="scoreNumber">{healthScore.noData ? "N/A" : formatDecimal(healthScore.score)}</div>
                  <span className="scoreCaption">
                    {healthScore.noData ? "Add data to generate a score" : `/10 · ${healthScore.summary}`}
                  </span>
                  {!healthScore.noData && (
                    <>
                      <div className="creditEstimate">
                        <span>Estimated credit score</span>
                        <strong>{healthScore.estimatedCreditScore}</strong>
                      </div>
                      <div className="ruleList">
                        <ProgressRule label="Cash flow" value={healthScore.cashFlowScore} target={75} tone="good" />
                        <ProgressRule label="Debt load" value={healthScore.debtLoadScore} target={75} tone="neutral" />
                        <ProgressRule label="Payments" value={healthScore.paymentPressureScore} target={75} tone="neutral" />
                        <ProgressRule label="Card headroom" value={healthScore.utilizationScore} target={75} tone="neutral" />
                        <ProgressRule label="Savings" value={healthScore.savingsScore} target={75} tone="good" />
                      </div>
                    </>
                  )}
                </article>
                <article className="miniPanel chartPanel">
                  <PanelTitle
                    title={insightChartTitle}
                    icon={insightChartView === "cash-flow" ? <BarChart3 size={16} /> : <LineChart size={16} />}
                    action={<InsightChartToggle value={insightChartView} onChange={setInsightChartView} />}
                  />
                  {insightChartView === "inflow-outflow" && (
                    <InflowOutflowChart points={monthlyFlowPoints} privacy={ledger.privacyMode} formatter={moneyFormatter} />
                  )}
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
                <article className="miniPanel anomalyPanel">
                  <PanelTitle
                    title="Detected anomalies"
                    icon={<InfoHint label="About detected anomalies" text="Flags are generated only from local income, outflow, debt, card limit, APR, payment, and categorisation data. They are not financial advice, but they point to pressure worth checking." />}
                  />
                  <div className="anomalyList">
                    {financialSignals.map((signal) => (
                      <FinancialSignalCard key={signal.id} signal={signal} />
                    ))}
                  </div>
                </article>
              </section>

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
            </section>
          )}

          {activeView === "settings" && (
            <section className="viewStack" aria-label="Settings">
              <div className="pageHeader settingsHeader">
                <div>
                  <h2>Management Hub</h2>
                  <p>Configure your cloud vault, exports, and interface preferences.</p>
                </div>
                <span className="privacyBadge">
                  <ShieldCheck size={15} />
                  Protected by Supabase RLS
                </span>
              </div>

              <article className="architectureNote">
                <Cloud size={21} />
                <div>
                  <h3>Cloud vault architecture</h3>
                  <p>Your ledger syncs to a private Supabase row tied to your Google account. This browser keeps an IndexedDB cache for resilience.</p>
                </div>
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
                      <p>Review bank transactions or restore a previous JSON backup.</p>
                      <div className="buttonRow">
                        <button className="commandButton" type="button" onClick={() => csvInputRef.current?.click()}>
                          <FileSpreadsheet size={16} />
                          Import CSV
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
                    <PanelTitle title="Currency" icon={<WalletCards size={17} />} />
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

                  <article className="settingsPanel compactSetting">
                    <PanelTitle title="Privacy mode" icon={ledger.privacyMode ? <EyeOff size={17} /> : <Eye size={17} />} />
                    <p>Obfuscates exact numerical values while you work in public spaces.</p>
                    <button
                      className={ledger.privacyMode ? "switch on" : "switch"}
                      type="button"
                      aria-label="Toggle privacy mode"
                      onClick={() => updateLedger((current) => ({ ...current, privacyMode: !current.privacyMode }))}
                    >
                      <span />
                    </button>
                  </article>

                  <article className="settingsPanel compactSetting">
                    <PanelTitle title="Animations" icon={<LineChart size={17} />} />
                    <p>Enable interface motion and animated totals.</p>
                    <button
                      className={animationsEnabled ? "switch on" : "switch"}
                      type="button"
                      aria-label="Toggle animations"
                      onClick={() => setAnimationsEnabled((enabled) => !enabled)}
                    >
                      <span />
                    </button>
                  </article>
                </aside>
              </section>

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

              <article className="dangerPanel">
                <div>
                  <h3>Danger Zone</h3>
                  <p>Clear the currently selected month. Your other saved months and settings remain intact.</p>
                </div>
                <button className="dangerButton" type="button" onClick={resetMonth}>
                  Clear selected month
                </button>
              </article>
            </section>
          )}
        </main>

        <footer className="bottomRail" aria-label="Annual summary">
          <span>Annual Summary {selectedYear}</span>
          <span>
            Total Balance <b className={ledger.privacyMode ? "masked" : ""}>{moneyFormatter.format(projection.annualSurplus)}</b>
          </span>
          <span>
            Monthly Average <b className={ledger.privacyMode ? "masked" : ""}>{moneyFormatter.format(projection.monthlySurplus)}</b>
          </span>
          <span>
            Projected Savings <b className={projection.annualSurplus >= 0 ? "positiveText sensitive" : "negativeText sensitive"}>{moneyFormatter.format(projection.annualSurplus)}</b>
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
          </div>
        )}

        {tutorialView && <TutorialOverlay tutorial={TUTORIALS[tutorialView]} onClose={closeTutorial} />}

        {importReview && (
          <ImportReviewModal
            review={importReview}
            categoryOptions={importCategoryOptions}
            formatter={moneyFormatter}
            onClose={() => setImportReview(null)}
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
            formatter={moneyFormatter}
            privacy={ledger.privacyMode}
            x={categoryMenu.x}
            y={categoryMenu.y}
            onMove={(category) => moveExpenseFromMenu(menuExpense.id, category)}
            onUngroup={() => ungroupExpense(menuExpense.id)}
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

function StatusPill({ state, toast }: { state: SaveState; toast: string }) {
  return (
    <div className={`statusPill ${state}`}>
      <span />
      <div>
        <strong>{state === "saved" ? "Synced" : state === "saving" ? "Saving" : state === "offline" ? "Local mode" : "Loading"}</strong>
        <small>{toast}</small>
      </div>
    </div>
  );
}

function ImportReviewModal({
  review,
  categoryOptions,
  formatter,
  onClose,
  onRowChange,
  onToggleAll,
  onSkipDuplicates,
  onBulkCategory,
  onConfirm,
}: {
  review: ImportReviewState;
  categoryOptions: string[];
  formatter: Intl.NumberFormat;
  onClose: () => void;
  onRowChange: (id: string, patch: Partial<CsvImportRow>) => void;
  onToggleAll: (include: boolean) => void;
  onSkipDuplicates: () => void;
  onBulkCategory: (category: string) => void;
  onConfirm: () => void;
}) {
  const [bulkCategory, setBulkCategory] = useState("");
  const selectedCount = review.rows.filter((row) => row.include).length;
  const duplicateCount = review.rows.filter((row) => row.duplicate).length;
  const totalAmount = review.rows.filter((row) => row.include).reduce((sum, row) => sum + row.amount, 0);
  const hasErrors = review.errors.length > 0 && review.rows.length === 0;

  function applyBulkCategory() {
    onBulkCategory(bulkCategory);
    setBulkCategory("");
  }

  return (
    <div className="modalBackdrop">
      <section className="importModal" role="dialog" aria-modal="true" aria-labelledby="import-review-title">
        <header className="importModalHeader">
          <div>
            <span className="eyebrow">CSV Review</span>
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
              </div>
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
                  {review.rows.map((row) => (
                    <ImportReviewTableRow
                      key={row.id}
                      row={row}
                      formatter={formatter}
                      categoryOptions={categoryOptions}
                      onChange={(patch) => onRowChange(row.id, patch)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <footer className="importModalFooter">
          <button className="commandButton" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="navCta inlineCta" type="button" disabled={selectedCount === 0 || hasErrors} onClick={onConfirm}>
            Import selected
          </button>
        </footer>
      </section>
    </div>
  );
}

function ImportReviewTableRow({
  row,
  formatter,
  categoryOptions,
  onChange,
}: {
  row: CsvImportRow;
  formatter: Intl.NumberFormat;
  categoryOptions: string[];
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
        <strong>{row.description}</strong>
        <span>Row {row.rowNumber}</span>
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
    };
  }

  if (kind === "transfer") {
    return {
      kind,
      category: "Transfers",
      include: false,
      note: "Won’t import — saved as transfer",
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
  };
}

function formatShortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function MetricCard({
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
  tone: "green" | "red" | "amber";
  privacy?: boolean;
  formatter?: Intl.NumberFormat;
}) {
  return (
    <article className={`metricCard ${tone}`}>
      <span>{label}</span>
      <strong className={privacy && !suffix ? "masked" : ""}>
        {suffix ? `${formatDecimal(value)}${suffix}` : <AnimatedCurrency value={value} formatter={formatter ?? getCurrencyFormatter("GBP")} />}
      </strong>
    </article>
  );
}

function EmptyState({ icon, title, text, onAction }: { icon: ReactNode; title: string; text: string; onAction?: () => void }) {
  return (
    <div
      className={`emptyState${onAction ? " emptyState--clickable" : ""}`}
      onClick={onAction}
      role={onAction ? "button" : undefined}
      tabIndex={onAction ? 0 : undefined}
      onKeyDown={onAction ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAction(); } } : undefined}
    >
      <div className="emptyIcon">{icon}</div>
      <strong>{title}</strong>
      <p>{text}</p>
      {onAction && <span className="emptyStateHint">Click to start adding</span>}
    </div>
  );
}

function CategoryContextMenu({
  expense,
  options,
  formatter,
  privacy,
  x,
  y,
  onMove,
  onUngroup,
}: {
  expense: ExpenseEntry;
  options: CategoryOption[];
  formatter: Intl.NumberFormat;
  privacy: boolean;
  x: number;
  y: number;
  onMove: (category: string) => void;
  onUngroup: () => void;
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
  children,
}: {
  title: string;
  total: number;
  tone: "income" | "expense";
  count: number;
  privacy: boolean;
  formatter: Intl.NumberFormat;
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
          <span>{count} {count === 1 ? "item" : "items"}</span>
        </div>
        <strong className={privacy ? "masked" : ""}>
          <AnimatedCurrency value={total} formatter={formatter} />
        </strong>
      </div>
      {children}
    </article>
  );
}

function IncomeRow({
  income,
  privacy,
  symbol,
  onChange,
  onRemove,
}: {
  income: IncomeEntry;
  privacy: boolean;
  symbol: string;
  onChange: (patch: Partial<IncomeEntry>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="financeRow incomeRow">
      <span className="dragDots" aria-hidden="true">
        ::
      </span>
      <button
        className="swatch"
        type="button"
        style={{ background: income.color }}
        onClick={() => onChange({ color: nextColor(income.color) })}
        aria-label="Cycle income color"
      />
      <input value={income.source} onChange={(event) => onChange({ source: capitalizeFirst(event.target.value) })} onKeyDown={blurOnEnter} aria-label="Income source" />
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
  privacy,
  formatter,
  symbol,
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
  onRemove,
}: {
  expense: ExpenseEntry;
  privacy: boolean;
  formatter: Intl.NumberFormat;
  symbol: string;
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
  onRemove: () => void;
}) {
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
      className={`financeRow expenseRow ${dragging ? "dragging" : ""} ${grouping ? "groupingSource" : ""} ${dropClass}`}
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
      <input value={expense.name} onChange={(event) => onChange({ name: capitalizeFirst(event.target.value) })} onKeyDown={blurOnEnter} aria-label="Expense name" />
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
        <RecurringToggle
          recurring={expense.recurring}
          kind="expense"
          onToggle={() => onChange({ recurring: !expense.recurring })}
        />
        <button className="iconButton rowAction" type="button" onClick={onRemove} aria-label="Remove expense">
          <Trash2 size={17} />
        </button>
      </div>
    </div>
  );
}

function AccountRow({
  account,
  symbol,
  formatter,
  privacy,
  onChange,
  onRemove,
}: {
  account: Account;
  symbol: string;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  onChange: (patch: Partial<Account>) => void;
  onRemove: () => void;
}) {
  const isDebt = account.accountClass === "debt";
  const utilization = isDebt && account.creditLimit > 0 ? clampPercent((account.balance / account.creditLimit) * 100) : 0;
  const typeOptions = ACCOUNT_TYPE_OPTIONS[account.accountClass];

  return (
    <div className={`debtAccountRow ${isDebt ? "isDebt" : "isAsset"}`} style={{ "--account-color": account.color } as CSSProperties}>
      <button
        className="swatchButton"
        type="button"
        style={{ background: account.color }}
        onClick={() => onChange({ color: nextColor(account.color) })}
        aria-label="Cycle account color"
      />
      <div className="debtAccountMain">
        <input value={account.name} onChange={(event) => onChange({ name: event.target.value })} aria-label="Account name" />
        <select
          value={account.type}
          onChange={(event) => onChange({ type: event.target.value as AccountType })}
          aria-label={`Type for ${account.name}`}
        >
          {typeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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

      {isDebt ? (
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
          <span>Monthly in</span>
          <MoneyInput
            ariaLabel={`Monthly contribution for ${account.name}`}
            value={String(account.monthlyContribution)}
            symbol={symbol}
            privacy={privacy}
            placeholder="Monthly contribution"
            onChange={(value) => onChange({ monthlyContribution: Math.max(0, Number(value) || 0) })}
          />
        </div>
      )}

      <label className="numberField compact hintField aprField">
        <span className="fieldLabel">{rateLabel(account.accountClass)}</span>
        <input
          value={String(account.rate)}
          inputMode="decimal"
          placeholder={rateLabel(account.accountClass)}
          onChange={(event) => onChange({ rate: Math.max(-50, Number(event.target.value) || 0) })}
          aria-label={`${rateLabel(account.accountClass)} for ${account.name}`}
        />
        <InfoHint label={`Rate help for ${account.name}`} text={rateHelp(account.accountClass)} />
      </label>
      <label className="numberField compact hintField interestFreeField">
        <span className="fieldLabel">{isDebt ? "0% months" : "Intro months"}</span>
        <input
          value={String(account.promoMonths)}
          inputMode="numeric"
          placeholder={isDebt ? "0% months left" : "Intro months left"}
          onChange={(event) => onChange({ promoMonths: clampWholeNumber(Number(event.target.value) || 0, 120) })}
          aria-label={`Promo months for ${account.name}`}
        />
        <InfoHint
          label={`Promo period help for ${account.name}`}
          text={
            isDebt
              ? "Months left before APR starts applying. The forecast delays interest until then."
              : "Months an intro rate applies before the standard rate takes over. Leave blank if none."
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
          <label className="numberField compact hintField dueField">
            <span className="fieldLabel">Due day</span>
            <input value={String(account.dueDay)} inputMode="numeric" placeholder="Due day (1-31)" onChange={(event) => onChange({ dueDay: clampDueDay(Number(event.target.value) || 1) })} aria-label={`Due day for ${account.name}`} />
            <InfoHint label={`Payment date help for ${account.name}`} text="Day of the month this account payment is due." />
          </label>
        </>
      ) : (
        <label className="numberField compact hintField introRateField">
          <span className="fieldLabel">Intro rate %</span>
          <input
            value={String(account.promoRate)}
            inputMode="decimal"
            placeholder="Intro rate %"
            onChange={(event) => onChange({ promoRate: Math.max(0, Number(event.target.value) || 0) })}
            aria-label={`Intro rate for ${account.name}`}
          />
          <InfoHint label={`Intro rate help for ${account.name}`} text="The rate that applies during the intro months above, before the standard rate takes over." />
        </label>
      )}

      <div className="debtAccountMeta">
        <span>{accountTypeLabel(account)}</span>
        <strong className={privacy ? "masked" : ""}>{formatter.format(account.balance)}</strong>
        <em>{accountMetaCaption(account, utilization)}</em>
      </div>
      <button className="iconButton rowAction" type="button" onClick={onRemove} aria-label={`Remove ${account.name}`}>
        <Trash2 size={17} />
      </button>
    </div>
  );
}

function AccountEditor({
  draft,
  setDraft,
  symbol,
  assumedReturn,
  onAdd,
}: {
  draft: AccountDraft;
  setDraft: Dispatch<SetStateAction<AccountDraft>>;
  symbol: string;
  assumedReturn: number;
  onAdd: () => void;
}) {
  const isDebt = draft.accountClass === "debt";

  function changeClass(accountClass: AccountClass) {
    setDraft((current) => ({ ...current, accountClass, type: DEFAULT_TYPE_BY_CLASS[accountClass] }));
  }

  return (
    <article className="miniPanel accountEditorPanel">
      <PanelTitle title="Add account" icon={<Plus size={16} />} />
      <div className="debtDraftGrid">
        <select
          className="accountClassSelect"
          value={draft.accountClass}
          onChange={(event) => changeClass(event.target.value as AccountClass)}
          aria-label="Account kind"
        >
          <option value="savings">Savings account</option>
          <option value="cash">Current account</option>
          <option value="investment">Investment / stocks</option>
          <option value="debt">Debt account</option>
        </select>
        <select
          value={draft.type}
          onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as AccountType }))}
          aria-label="Account type"
        >
          {ACCOUNT_TYPE_OPTIONS[draft.accountClass].map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          value={draft.name}
          placeholder="Account name"
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          onKeyDown={(event) => handleDraftEnter(event, onAdd)}
          aria-label="Account name"
        />
        <MoneyInput
          ariaLabel="Current balance"
          value={draft.balance}
          symbol={symbol}
          placeholder={isDebt ? "Current balance owed" : "Current balance"}
          onChange={(value) => setDraft((current) => ({ ...current, balance: value }))}
        />

        {!isDebt && (
          <MoneyInput
            ariaLabel="Monthly contribution"
            value={draft.monthlyContribution}
            symbol={symbol}
            placeholder="Monthly contribution"
            onChange={(value) => setDraft((current) => ({ ...current, monthlyContribution: value }))}
          />
        )}

        <label className="numberField hintField">
          <input
            value={draft.rate}
            inputMode="decimal"
            placeholder={draft.accountClass === "investment" ? `Expected return % (default ${assumedReturn})` : rateLabel(draft.accountClass)}
            onChange={(event) => setDraft((current) => ({ ...current, rate: event.target.value }))}
            aria-label={rateLabel(draft.accountClass)}
          />
          <InfoHint label="Rate help" text={rateHelp(draft.accountClass)} />
        </label>

        <label className="numberField hintField">
          <input
            value={draft.promoMonths}
            inputMode="numeric"
            placeholder={isDebt ? "Interest-free months left" : "Intro rate months (optional)"}
            onChange={(event) => setDraft((current) => ({ ...current, promoMonths: event.target.value }))}
            aria-label="Promo months"
          />
          <InfoHint
            label="Promo period help"
            text={
              isDebt
                ? "Months before APR starts applying. The forecast delays interest until this period ends."
                : "If this account has an intro rate, how many months it lasts before the standard rate takes over."
            }
          />
        </label>

        {isDebt ? (
          <>
            <MoneyInput
              ariaLabel="Credit limit"
              value={draft.creditLimit}
              symbol={symbol}
              placeholder="Credit limit"
              onChange={(value) => setDraft((current) => ({ ...current, creditLimit: value }))}
            />
            <MoneyInput
              ariaLabel="Monthly payment"
              value={draft.minimumPayment}
              symbol={symbol}
              placeholder="Monthly payment"
              onChange={(value) => setDraft((current) => ({ ...current, minimumPayment: value }))}
            />
            <label className="numberField hintField">
              <input
                value={draft.dueDay}
                inputMode="numeric"
                placeholder="Payment due day (1-31)"
                onChange={(event) => setDraft((current) => ({ ...current, dueDay: event.target.value }))}
                onKeyDown={(event) => handleDraftEnter(event, onAdd)}
                aria-label="Payment due day"
              />
              <InfoHint label="Payment date help" text="Day of the month the payment is due." />
            </label>
          </>
        ) : (
          <label className="numberField hintField">
            <input
              value={draft.promoRate}
              inputMode="decimal"
              placeholder="Intro rate % (optional)"
              onChange={(event) => setDraft((current) => ({ ...current, promoRate: event.target.value }))}
              onKeyDown={(event) => handleDraftEnter(event, onAdd)}
              aria-label="Intro rate"
            />
            <InfoHint label="Intro rate help" text="If the account has a promotional intro rate, enter it here. It applies for the intro months above." />
          </label>
        )}

        <button className="navCta inlineCta" type="button" onClick={onAdd}>
          Add account
        </button>
      </div>
    </article>
  );
}

function rateLabel(accountClass: AccountClass): string {
  if (accountClass === "debt") return "Interest rate (APR) %";
  if (accountClass === "investment") return "Expected return %";
  return "Interest rate (AER) %";
}

function rateHelp(accountClass: AccountClass): string {
  if (accountClass === "debt") return "Annual percentage rate charged after any interest-free period ends. Use 0 if the account has no interest.";
  if (accountClass === "investment")
    return "Assumed average annual return — an estimate, not a guarantee. A conservative long-run figure is around 6%. Markets can fall as well as rise.";
  return "The annual interest rate (AER) the account earns after any intro period ends.";
}

function accountTypeLabel(account: Account): string {
  const option = ACCOUNT_TYPE_OPTIONS[account.accountClass].find((o) => o.value === account.type);
  return option?.label ?? "Account";
}

function accountMetaCaption(account: Account, utilization: number): string {
  if (account.accountClass === "debt") {
    const limitNote = account.creditLimit > 0 ? `${formatDecimal(utilization)}% used · ` : "";
    return `${limitNote}${account.promoMonths > 0 ? `${account.promoMonths} mo 0%` : "APR active"}`;
  }
  const rateNote = `${formatDecimal(account.rate)}% ${account.accountClass === "investment" ? "est." : "AER"}`;
  const contributionNote = account.monthlyContribution > 0 ? ` · +${Math.round(account.monthlyContribution)}/mo` : "";
  return `${rateNote}${contributionNote}`;
}

function MoneyInput({
  ariaLabel,
  inputRef,
  value,
  symbol,
  placeholder,
  privacy,
  onEnter,
  onChange,
}: {
  ariaLabel: string;
  inputRef?: Ref<HTMLInputElement>;
  value: string;
  symbol: string;
  placeholder?: string;
  privacy?: boolean;
  onEnter?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onChange: (value: string) => void;
}) {
  return (
    <label className={privacy ? "moneyInput maskedInput" : "moneyInput"}>
      <span>{symbol}</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter?.(event);
          }
        }}
        aria-label={ariaLabel}
      />
    </label>
  );
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

function GoalsPanel({
  ledger,
  month,
  goal,
  goalPercent,
  goalOutcome,
  allGoals,
  ledgerGoalId,
  projection,
  onSelectGoal,
  onGoToGoals,
  onGoalChange,
  onNoteChange,
  onResetMonth,
  privacy,
  symbol,
}: {
  ledger: LedgerState;
  month: MonthBudget;
  goal: SavingsGoal | null;
  goalPercent: number;
  goalOutcome: GoalOutcome | null;
  allGoals: SavingsGoal[];
  ledgerGoalId: string | null;
  projection: Projection;
  onSelectGoal: (id: string) => void;
  onGoToGoals: () => void;
  onGoalChange: (patch: Partial<SavingsGoal>) => void;
  onNoteChange: (note: string) => void;
  onResetMonth: () => void;
  privacy: boolean;
  symbol: string;
}) {
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const runway = goal && projection.monthlyExpenses > 0 ? goal.saved / projection.monthlyExpenses : 0;

  return (
    <article className="miniPanel goalPanel">
      <PanelTitle
        title="Notes and goals"
        icon={
          <InfoHint
            label="What is Notes and goals for?"
            text="Track a savings goal — emergency fund, holiday, house deposit — and see how close you are. The runway shows how many months your saved amount would cover expenses. Use notes to log anything worth remembering about this month."
          />
        }
      />
      <p className="panelSubcopy">Track goal progress and jot down notes for this month.</p>

      {goal ? (
        <>
          <div className="goalSwitcherRow">
            <button
              className="goalSwitcherTrigger"
              type="button"
              onClick={() => setShowGoalPicker((v) => !v)}
              aria-expanded={showGoalPicker}
            >
              <Target size={13} />
              {goal.name || "Unnamed goal"}
              <ChevronDown size={13} />
            </button>
            <button className="goalSwitcherLink" type="button" onClick={onGoToGoals}>
              Manage goals
            </button>
            {showGoalPicker && (
              <div className="goalPickerPopover">
                {allGoals.map((g) => (
                  <button
                    key={g.id}
                    className={`goalPickerOption${g.id === (ledgerGoalId ?? allGoals[0]?.id) ? " selected" : ""}`}
                    type="button"
                    onClick={() => { onSelectGoal(g.id); setShowGoalPicker(false); }}
                  >
                    <span className="goalPickerDot" style={{ background: g.color }} />
                    {g.name || "Unnamed goal"}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="goalName">
            <input
              value={goal.name}
              placeholder="Goal name, e.g. Emergency fund"
              onChange={(event) => onGoalChange({ name: event.target.value })}
              onKeyDown={blurOnEnter}
              aria-label="Goal name"
            />
          </label>
          <div className="goalAmounts">
            <label className="goalAmountField">
              <span>Saved</span>
              <MoneyInput ariaLabel="Goal saved" value={String(goal.saved)} symbol={symbol} privacy={privacy} onChange={(value) => onGoalChange({ saved: Number(value) })} />
            </label>
            <label className="goalAmountField">
              <span>Target</span>
              <MoneyInput ariaLabel="Goal target" value={String(goal.target)} symbol={symbol} privacy={privacy} onChange={(value) => onGoalChange({ target: Number(value) })} />
            </label>
          </div>
          <div className="progressLine">
            <span style={{ width: `${goalPercent}%`, background: goal.color }} />
          </div>
          <div className="goalMeta">
            <b className={privacy ? "masked" : ""}>{formatDecimal(goalPercent)}%</b>
            {goalOutcome?.completionDate ? (
              <span>Completes {goalOutcome.completionDate}</span>
            ) : (
              <span>{formatDecimal(runway)} month runway</span>
            )}
          </div>
        </>
      ) : (
        <div className="goalEmptyNudge">
          <button className="commandButton" type="button" onClick={onGoToGoals}>
            <Target size={15} />
            Set up goals
          </button>
          <p>Track savings targets in the Goals view.</p>
        </div>
      )}

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
    </article>
  );
}

function PanelTitle({ title, icon, action }: { title: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="panelTitle">
      <h3>{title}</h3>
      <div className="panelTitleActions">
        {action}
        {icon ?? <Info size={16} />}
      </div>
    </div>
  );
}

function TutorialOverlay({ tutorial, onClose }: { tutorial: PageTutorial; onClose: () => void }) {
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
        <h2 className="tutorialTitle">{tutorial.title}</h2>
        {current.heading ? <h3 className="tutorialStepHeading">{current.heading}</h3> : null}
        <ul className="tutorialBullets">
          {current.bullets.map((bullet, index) => (
            <li key={index}>{bullet}</li>
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

function InfoHint({ text, label = "More information" }: { text: string; label?: string }) {
  return (
    <span className="infoHint" tabIndex={0} role="button" aria-label={label}>
      <Info size={15} aria-hidden="true" />
      <span role="tooltip">{text}</span>
    </span>
  );
}

function NetWorthHorizonTabs({
  horizon,
  onChange,
  compact,
}: {
  horizon: NetWorthHorizon;
  onChange: (horizon: NetWorthHorizon) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "tabs compactTabs" : "tabs"} role="tablist" aria-label="Net worth horizon">
      <button className={horizon === 12 ? "selected" : ""} type="button" onClick={() => onChange(12)}>
        1 year
      </button>
      <button className={horizon === 24 ? "selected" : ""} type="button" onClick={() => onChange(24)}>
        2 years
      </button>
      <button className={horizon === 60 ? "selected" : ""} type="button" onClick={() => onChange(60)}>
        5 years
      </button>
    </div>
  );
}

function InsightChartToggle({ value, onChange }: { value: InsightChartView; onChange: (value: InsightChartView) => void }) {
  const options: Array<{ value: InsightChartView; label: string; icon: ReactNode }> = [
    { value: "inflow-outflow", label: "Inflows vs outflows", icon: <LineChart size={15} /> },
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

function FinancialSignalCard({ signal }: { signal: FinancialSignal }) {
  return (
    <div className={`signalCard ${signal.tone}`}>
      <div className="signalTitle">
        <strong>{signal.title}</strong>
        <InfoHint label={`${signal.title} context`} text={signal.detail} />
      </div>
      <span>{signal.summary}</span>
    </div>
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

function InflowOutflowChart({
  points,
  privacy,
  formatter,
}: {
  points: MonthlyFlowPoint[];
  privacy: boolean;
  formatter: Intl.NumberFormat;
}) {
  const width = 720;
  const height = 260;
  const padding = 28;
  const plotHeight = height - padding * 2;
  const maxValue = Math.max(...points.map((point) => Math.max(point.income, point.expenses)), 1);
  const slot = (width - padding * 2) / Math.max(points.length, 1);
  const barWidth = Math.max(10, Math.min(20, slot * 0.24));
  const activePoints = points.filter((point) => point.hasData);

  if (!activePoints.length) {
    return <EmptyState icon={<LineChart size={18} />} title="No monthly flow yet" text="Add income and outflows or import a CSV to build this chart." />;
  }

  return (
    <div className="flowComparisonChart" aria-label="Monthly inflows and outflows chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Actual monthly inflows compared with outflows">
        <line className="netWorthAxis" x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
        {points.map((point, index) => {
          const x = padding + index * slot + slot / 2;
          const incomeHeight = (point.income / maxValue) * plotHeight;
          const expenseHeight = (point.expenses / maxValue) * plotHeight;
          const incomeY = height - padding - incomeHeight;
          const expenseY = height - padding - expenseHeight;

          return (
            <g key={point.monthKey} className={point.hasData ? "flowMonth active" : "flowMonth"}>
              <rect
                className="flowBar income"
                x={x - barWidth - 2}
                y={incomeY}
                width={barWidth}
                height={Math.max(point.income > 0 ? 3 : 0, incomeHeight)}
                rx="3"
              />
              <rect
                className="flowBar expense"
                x={x + 2}
                y={expenseY}
                width={barWidth}
                height={Math.max(point.expenses > 0 ? 3 : 0, expenseHeight)}
                rx="3"
              />
              <text x={x} y={height - 8} textAnchor="middle">
                {point.label}
              </text>
              {point.hasData && (
                <title>
                  {point.label}: income {formatter.format(point.income)}, outflow {formatter.format(point.expenses)}, net{" "}
                  {formatter.format(point.surplus)}
                </title>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flowLegend">
        <span>
          <i className="income" /> Inflow
        </span>
        <span>
          <i className="expense" /> Outflow
        </span>
        <strong className={privacy ? "masked" : ""}>
          Latest net {formatter.format(activePoints[activePoints.length - 1]?.surplus ?? 0)}
        </strong>
      </div>
    </div>
  );
}

function NetWorthChart({
  points,
  formatter,
  privacy,
  compact = false,
}: {
  points: NetWorthPoint[];
  formatter: Intl.NumberFormat;
  privacy: boolean;
  compact?: boolean;
}) {
  const width = 720;
  const height = 260;
  const padding = 28;
  const values = points.map((point) => point.netWorth);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const range = Math.max(1, maxValue - minValue);
  const lastPoint = points[points.length - 1] ?? points[0];
  const totalInterest = points.reduce((sum, point) => sum + point.interestCharged, 0);
  const totalGrowth = points.reduce((sum, point) => sum + point.growthEarned, 0);
  const path = points
    .map((point, index) => {
      const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
      const y = padding + ((maxValue - point.netWorth) / range) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `${path} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;
  const markerPoints = points.filter((point) => point.monthIndex % 12 === 0 || point.monthIndex === points.length - 1);

  return (
    <div className={compact ? "netWorthChart compact" : "netWorthChart"}>
      <div className="netWorthStats">
        <div>
          <span>Ending net worth</span>
          <strong className={privacy ? "masked" : ""}>{formatter.format(lastPoint?.netWorth ?? 0)}</strong>
        </div>
        <div>
          <span>Ending assets</span>
          <strong className={privacy ? "masked" : ""}>{formatter.format(lastPoint?.assetBalance ?? 0)}</strong>
        </div>
        <div>
          <span>Growth earned</span>
          <strong className={`positiveText ${privacy ? "masked" : ""}`}>{formatter.format(totalGrowth)}</strong>
        </div>
        <div>
          <span>Interest paid</span>
          <strong className={privacy ? "masked" : ""}>{formatter.format(totalInterest)}</strong>
        </div>
      </div>
      <div className="netWorthSvgWrap">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Projected net worth over selected horizon">
          <defs>
            <linearGradient id="netWorthFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(0, 223, 193, 0.24)" />
              <stop offset="100%" stopColor="rgba(0, 223, 193, 0.02)" />
            </linearGradient>
          </defs>
          <line className="netWorthAxis" x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
          <path d={areaPath} fill="url(#netWorthFill)" />
          <path className="netWorthLine" d={path} />
          {markerPoints.map((point) => {
            const x = padding + (point.monthIndex / Math.max(points.length - 1, 1)) * (width - padding * 2);
            const y = padding + ((maxValue - point.netWorth) / range) * (height - padding * 2);
            return <circle key={point.monthIndex} className="netWorthDot" cx={x} cy={y} r="4" />;
          })}
        </svg>
        <div className="netWorthLabels">
          {markerPoints.map((point) => (
            <span key={point.monthIndex}>{point.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TransactionHistory({ month, privacy, formatter }: { month: MonthBudget; privacy: boolean; formatter: Intl.NumberFormat }) {
  const rows = [
    ...month.incomes.map((income) => ({
      id: income.id,
      type: "Income",
      name: income.source,
      category: "Input",
      amount: income.amount,
    })),
    ...month.expenses.map((expense) => ({
      id: expense.id,
      type: "Expense",
      name: expense.name,
      category: expense.category || "Ungrouped",
      amount: -expense.amount,
    })),
  ];

  if (!rows.length) {
    return <EmptyState icon={<ReceiptText size={18} />} title="No records yet" text="Add income and expenses in the Ledger view to populate history." />;
  }

  return (
    <div className="historyTable">
      <div className="historyHead">
        <span>Source / Name</span>
        <span>Category</span>
        <span>Amount</span>
      </div>
      {rows.slice(0, 7).map((row) => (
        <div className="historyRow" key={row.id}>
          <div>
            <strong>{row.name}</strong>
            <small>{row.type}</small>
          </div>
          <span>{row.category}</span>
          <b className={`${row.amount >= 0 ? "positiveText" : "negativeText"} ${privacy ? "masked" : ""}`}>
            {row.amount >= 0 ? "+" : ""}
            {formatter.format(row.amount)}
          </b>
        </div>
      ))}
    </div>
  );
}

function ProgressRule({ label, value, target, tone }: { label: string; value: number; target: number; tone: "good" | "neutral" }) {
  const width = clampPercent(value);
  const targetPosition = clampPercent(target);

  return (
    <div className={`progressRule ${tone}`}>
      <div>
        <span>{label}</span>
        <b>{formatDecimal(value)}%</b>
      </div>
      <div className="ruleTrack">
        <i style={{ left: `${targetPosition}%` }} />
        <strong style={{ width: `${width}%` }} />
      </div>
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

function handleDraftEnter(event: KeyboardEvent<HTMLInputElement>, action: () => void) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  action();
}

function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.blur();
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}

function focusNextFrame(ref: { current: HTMLInputElement | null }) {
  window.requestAnimationFrame(() => {
    ref.current?.focus();
    ref.current?.select();
  });
}

function AnimatedCurrency({ value, formatter }: { value: number; formatter: Intl.NumberFormat }) {
  const displayValue = useAnimatedNumber(value);
  return <>{formatter.format(displayValue)}</>;
}

function useAnimatedNumber(value: number) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const difference = value - from;
    const start = performance.now();
    const duration = 420;
    let frame = 0;

    function tick(now: number) {
      const progress = clampPercent(((now - start) / duration) * 100) / 100;
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + difference * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return display;
}

function normalizeState(rawState: Partial<LedgerState>): LedgerState {
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

  const selectedMonth = typeof state.selectedMonth === "string" && state.selectedMonth ? state.selectedMonth : fallback.selectedMonth;
  const months = normalizeMonths(state.months, fallback.months);
  const normalizedMonths = months[selectedMonth]
    ? months
    : {
        ...months,
        [selectedMonth]: seedMonthFromPrevious(),
      };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    currency: currencyOptions.some((option) => option.code === state.currency) ? state.currency! : fallback.currency,
    selectedMonth,
    months: normalizedMonths,
    goals: normalizeGoals(state.goals),
    goalPlannerSurplus: Number.isFinite(state.goalPlannerSurplus) ? state.goalPlannerSurplus : null,
    goalsHorizonMonths: Number.isFinite(state.goalsHorizonMonths) && state.goalsHorizonMonths > 0 ? state.goalsHorizonMonths : 60,
    ledgerGoalId: typeof state.ledgerGoalId === "string" ? state.ledgerGoalId : null,
    savingsTarget: Number.isFinite(state.savingsTarget) ? state.savingsTarget : fallback.savingsTarget,
    accounts: normalizeAccounts(state),
    assumedInvestmentReturn: Number.isFinite(state.assumedInvestmentReturn)
      ? Math.max(-50, Math.min(50, state.assumedInvestmentReturn as number))
      : fallback.assumedInvestmentReturn,
    categoryRules: normalizeCategoryRules(state.categoryRules),
    importBatches: normalizeImportBatches(state.importBatches),
    privacyMode: Boolean(state.privacyMode),
    lastSavedAt: state.lastSavedAt ?? new Date().toISOString(),
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

    const validTypes = ACCOUNT_TYPE_OPTIONS[accountClass].map((option) => option.value) as string[];
    const type: AccountType = validTypes.includes(item?.type) ? item.type : DEFAULT_TYPE_BY_CLASS[accountClass];

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
      includeInNetWorth: item?.includeInNetWorth !== false,
      color: item?.color || colors[index % colors.length],
      note: item?.note ?? "",
    };
  });
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

function buildCategoryRows(month: MonthBudget, projection: Projection) {
  const total = Math.max(projection.monthlyExpenses, 1);
  return buildExpenseGroups(month.expenses)
    .filter((group) => group.category)
    .map((group) => ({
      name: group.category,
      annual: group.total * 12,
      share: (group.total / total) * 100,
      color: group.color,
    }))
    .sort((a, b) => b.annual - a.annual);
}

function buildExpenseGroups(expenses: ExpenseEntry[]) {
  type ExpenseGroup = { id: string; category: string; color: string; total: number; items: ExpenseEntry[]; order: number };
  const positions = new Map(expenses.map((expense, index) => [expense.id, index]));
  const groups = new Map<string, ExpenseGroup>();
  const ungrouped: ExpenseGroup[] = [];

  expenses.forEach((expense, index) => {
    const category = expense.category.trim();
    if (!category) {
      ungrouped.push({
        id: `expense-${expense.id}`,
        category: "",
        color: expense.color,
        total: expense.amount,
        items: [expense],
        order: index,
      });
      return;
    }

    const existing = groups.get(category);
    if (existing) {
      existing.items.push(expense);
      existing.total += expense.amount;
    } else {
      const group = {
        id: `category-${category}`,
        category,
        color: expense.color || categoryColor(category, index),
        total: expense.amount,
        items: [expense],
        order: index,
      };
      groups.set(category, group);
    }
  });

  const categoryGroups = Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => b.amount - a.amount || (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0)),
    }))
    .sort((a, b) => b.total - a.total || a.order - b.order);

  return [...categoryGroups, ...ungrouped].map(({ order, ...group }) => group);
}

function buildMonthlyBars(ledger: LedgerState, _fallbackMonth: MonthBudget) {
  const [year] = ledger.selectedMonth.split("-").map(Number);
  const values = Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
    const month = ledger.months[key] ?? { incomes: [], expenses: [], note: "" };
    const projection = calculateProjection(month);
    return {
      label: new Date(year, index, 1).toLocaleString("en", { month: "short" }),
      value: projection.monthlySurplus,
    };
  });
  const max = Math.max(...values.map((item) => Math.abs(item.value)), 1);
  return values.map((item) => ({
    ...item,
    height: (Math.abs(item.value) / max) * 100,
  }));
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

function nextColor(color: string) {
  const index = colors.indexOf(color);
  return colors[(index + 1 + colors.length) % colors.length];
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

function categoryColor(category: string, fallbackIndex: number) {
  const normalized = category.trim().toLowerCase();
  const defaultCategories = ["home", "food", "bills", "travel", "health", "personal", "work", "subscriptions", "savings", "other"];
  const knownIndex = defaultCategories.findIndex((item) => item === normalized);
  return colors[(knownIndex >= 0 ? knownIndex : fallbackIndex + 2) % colors.length];
}

function findLastExpenseIndex(expenses: ExpenseEntry[], predicate: (expense: ExpenseEntry) => boolean) {
  for (let index = expenses.length - 1; index >= 0; index -= 1) {
    if (predicate(expenses[index])) return index;
  }
  return -1;
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

export default App;
