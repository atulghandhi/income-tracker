import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, Ref } from "react";
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
  Info,
  LayoutDashboard,
  LineChart,
  LogOut,
  Pencil,
  Plus,
  ReceiptText,
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
  calculateHealthScore,
  calculateDebtSummary,
  calculateProjection,
  clampDueDay,
  clampPercent,
  clampWholeNumber,
  colors,
  createId,
  createInitialState,
  CURRENT_SCHEMA_VERSION,
  currencyOptions,
  formatMonth,
  getCurrencyFormatter,
  getCurrencySymbol,
  seedMonthFromPrevious,
  shiftMonth,
} from "./finance";
import { buildRulePattern, parseBankCsv, sortImportRows, type CsvImportRow } from "./importer";
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
  CategoryRule,
  CurrencyCode,
  DebtAccount,
  DebtAccountType,
  ExpenseEntry,
  FinancialSignal,
  HealthScoreBreakdown,
  ImportBatch,
  ImportedTransactionRef,
  IncomeEntry,
  LedgerState,
  MonthBudget,
  MonthlyFlowPoint,
  NetWorthPoint,
  Projection,
  TransactionKind,
} from "./types";

type ProjectionView = "overview" | "category" | "month";
type AppView = "dashboard" | "ledger" | "accounts" | "insights" | "settings";
type SaveState = "loading" | "saved" | "saving" | "offline";
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

type DebtDraft = {
  name: string;
  type: DebtAccountType;
  balance: string;
  creditLimit: string;
  apr: string;
  interestFreeMonths: string;
  minimumPayment: string;
  dueDay: string;
};

const initialIncomeDraft: IncomeDraft = {
  source: "",
  amount: "",
};

const initialExpenseDraft: ExpenseDraft = {
  name: "",
  amount: "",
};

const initialDebtDraft: DebtDraft = {
  name: "",
  type: "credit-card",
  balance: "",
  creditLimit: "",
  apr: "",
  interestFreeMonths: "",
  minimumPayment: "",
  dueDay: "",
};

function App() {
  const [ledger, setLedger] = useState<LedgerState>(() => createInitialState());
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authWorking, setAuthWorking] = useState(false);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [incomeDraft, setIncomeDraft] = useState<IncomeDraft>(initialIncomeDraft);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>(initialExpenseDraft);
  const [debtDraft, setDebtDraft] = useState<DebtDraft>(initialDebtDraft);
  const [projectionView, setProjectionView] = useState<ProjectionView>("overview");
  const [insightChartView, setInsightChartView] = useState<InsightChartView>("inflow-outflow");
  const [netWorthHorizon, setNetWorthHorizon] = useState<NetWorthHorizon>(24);
  const [activeView, setActiveView] = useState<AppView>("ledger");
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("Loading secure vault");
  const [draggingExpenseId, setDraggingExpenseId] = useState<string | null>(null);
  const [groupingSourceId, setGroupingSourceId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<ExpenseDropPreview>(null);
  const [categoryMenu, setCategoryMenu] = useState<CategoryMenuState | null>(null);
  const [importReview, setImportReview] = useState<ImportReviewState | null>(null);
  const [lastImportAction, setLastImportAction] = useState<LastImportAction | null>(null);
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
  const debtSummary = useMemo(() => calculateDebtSummary(ledger.debts), [ledger.debts]);
  const netWorthOutlook = useMemo(
    () =>
      buildNetWorthOutlook({
        debts: ledger.debts,
        projection,
        startingCash: ledger.goal.saved,
        months: netWorthHorizon,
      }),
    [ledger.debts, ledger.goal.saved, netWorthHorizon, projection],
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
    () => calculateHealthScore({ projection, debtSummary, debts: ledger.debts, savingsTarget: ledger.savingsTarget }),
    [debtSummary, ledger.debts, ledger.savingsTarget, projection],
  );
  const financialSignals = useMemo(
    () => buildFinancialSignals({ projection, debtSummary, debts: ledger.debts, month: currentMonth, savingsTarget: ledger.savingsTarget }),
    [currentMonth, debtSummary, ledger.debts, ledger.savingsTarget, projection],
  );
  const goalPercent = clampPercent((ledger.goal.saved / Math.max(ledger.goal.target, 1)) * 100);
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
        if (alive) setSession(currentSession);
      } catch {
        if (alive) setToast("Auth check failed");
      } finally {
        if (alive) setAuthLoading(false);
      }
    }

    void loadSession();
    const subscription = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCloudHydrated(false);
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
      setToast("Opening cloud vault");

      try {
        await upsertUserProfile(user);
        const cloudState = await loadCloudLedgerState();
        if (!alive) return;

        if (cloudState) {
          setLedger(normalizeState(cloudState));
          setToast("Cloud vault restored");
        } else {
          await saveCloudLedgerState(user.id, ledger);
          if (!alive) return;
          setToast("Local ledger secured in cloud");
        }

        setCloudHydrated(true);
        setSaveState("saved");
      } catch {
        if (!alive) return;
        setCloudHydrated(true);
        setSaveState("offline");
        setToast("Cloud unavailable; local cache active");
      }
    }

    void hydrateCloudLedger();

    return () => {
      alive = false;
    };
  }, [hydrated, user?.id]);

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

  function addDebtAccount() {
    const name = debtDraft.name.trim();
    if (!name) {
      setToast("Add an account name");
      return;
    }

    updateLedger((current) => ({
      ...current,
      debts: [
        ...current.debts,
        {
          id: createId("debt"),
          name,
          type: debtDraft.type,
          balance: Math.max(0, Number(debtDraft.balance) || 0),
          creditLimit: Math.max(0, Number(debtDraft.creditLimit) || 0),
          apr: Math.max(0, Number(debtDraft.apr) || 0),
          interestFreeMonths: clampWholeNumber(Number(debtDraft.interestFreeMonths) || 0, 120),
          minimumPayment: Math.max(0, Number(debtDraft.minimumPayment) || 0),
          dueDay: clampDueDay(Number(debtDraft.dueDay) || 1),
          includeInNetWorth: true,
          color: colors[current.debts.length % colors.length],
          note: "",
        },
      ],
    }));
    setDebtDraft(initialDebtDraft);
    setToast("Account added");
  }

  function updateDebtAccount(id: string, patch: Partial<DebtAccount>) {
    updateLedger((current) => ({
      ...current,
      debts: current.debts.map((debt) => (debt.id === id ? { ...debt, ...patch } : debt)),
    }));
  }

  function removeDebtAccount(id: string) {
    updateLedger((current) => ({
      ...current,
      debts: current.debts.filter((debt) => debt.id !== id),
    }));
    setToast("Account removed");
  }

  function changeCurrency(currency: CurrencyCode) {
    updateLedger((current) => ({ ...current, currency }));
    setToast(`Currency set to ${currency}`);
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

    updateCurrentMonth((month) => {
      const source = month.expenses.find((expense) => expense.id === sourceId);
      if (!source || !month.expenses.some((expense) => expense.id === targetId)) return month;

      const remaining = month.expenses.filter((expense) => expense.id !== sourceId);
      const targetIndex = remaining.findIndex((expense) => expense.id === targetId);
      if (targetIndex === -1) return month;

      const insertIndex = edge === "before" ? targetIndex : targetIndex + 1;
      return {
        ...month,
        expenses: [...remaining.slice(0, insertIndex), source, ...remaining.slice(insertIndex)],
      };
    });
    setToast("Expense reordered");
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

  function confirmCsvImport() {
    if (!importReview) return;
    const rowsToImport = importReview.rows.filter((row) => row.include && row.kind !== "transfer");
    if (!rowsToImport.length) {
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
          date: row.date,
          imported,
        };
        months[row.monthKey] = {
          ...month,
          expenses: [...month.expenses, entry],
        };
        transactionRefs.push({ monthKey: row.monthKey, entryId: entry.id, kind: "expense" });
      });

      const batch: ImportBatch = {
        id: batchId,
        fileName: importReview.fileName,
        importedAt,
        totalRows: importReview.totalRows,
        importedRows: transactionRefs.length,
        skippedRows: Math.max(0, importReview.totalRows - transactionRefs.length),
        transactionRefs,
      };

      return {
        ...current,
        months,
        categoryRules: mergeCategoryRules(current.categoryRules, rowsToImport, importedAt),
        importBatches: [batch, ...current.importBatches].slice(0, 25),
      };
    });

    setImportReview(null);
    setLastImportAction({ batchId, fileName: importReview.fileName, importedRows: rowsToImport.length });
    setActiveView("ledger");
    setToast(`Imported ${rowsToImport.length} transactions`);
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
      setToast("Signed out");
    } catch {
      setToast("Sign out failed");
    } finally {
      setAuthWorking(false);
    }
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

  if (authLoading || !hydrated) {
    return <AuthGate mode="loading" onSignIn={handleSignIn} working={authWorking} configured={isSupabaseConfigured()} />;
  }

  if (!user) {
    return <AuthGate mode="signin" onSignIn={handleSignIn} working={authWorking} configured={isSupabaseConfigured()} />;
  }

  if (!cloudHydrated) {
    return <AuthGate mode="opening" onSignIn={handleSignIn} working configured={isSupabaseConfigured()} />;
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
          <div className="logoTile" aria-hidden="true">
            <WalletCards size={20} />
          </div>
          <div>
            <h1>FinanceTracker</h1>
            <p>Supabase Vault</p>
          </div>
        </div>

        <button className="navCta" type="button" onClick={openNewTransaction} aria-keyshortcuts="N C Meta+N Control+N">
          <Plus size={18} />
          New Transaction
        </button>

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

        <div className="localIdentity">
          {userAvatar ? <img className="identityAvatar" src={userAvatar} alt="" referrerPolicy="no-referrer" /> : (
            <div className="identityMark">
              <ShieldCheck size={17} />
            </div>
          )}
          <div>
            <strong>{userName}</strong>
            <span>{user.email}</span>
          </div>
        </div>
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
              title={ledger.privacyMode ? "Show amounts" : "Hide amounts"}
            >
              {ledger.privacyMode ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
            <button className="iconButton" type="button" onClick={() => setToast("Already synced to Supabase")} aria-label="Sync cloud data">
              <RotateCcw size={18} />
            </button>
            <button className="iconButton" type="button" onClick={handleSignOut} aria-label="Sign out" title="Sign out" disabled={authWorking}>
              <LogOut size={18} />
            </button>
            <button className="iconButton" type="button" onClick={() => setActiveView("settings")} aria-label="Help">
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
                  <p className="panelSubcopy">Projects monthly cash flow, debt payments, and interest after any 0% period ends.</p>
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
                      <EmptyState icon={<Plus size={18} />} title="Start with income" text="Add salary, invoices, side work, or any money coming in this month." />
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
                      placeholder="Add income source"
                      onChange={(event) => setIncomeDraft((draft) => ({ ...draft, source: event.target.value }))}
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
                      placeholder="Expense name"
                      onChange={(event) => setExpenseDraft((draft) => ({ ...draft, name: event.target.value }))}
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
                  goalPercent={goalPercent}
                  projection={projection}
                  onGoalChange={(patch) => updateLedger((current) => ({ ...current, goal: { ...current.goal, ...patch } }))}
                  onNoteChange={(note) => updateCurrentMonth((month) => ({ ...month, note }))}
                  onResetMonth={resetMonth}
                  privacy={ledger.privacyMode}
                  symbol={currencySymbol}
                />
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

          {activeView === "accounts" && (
            <section className="viewStack" aria-label="Accounts">
              <div className="pageHeader compactHeader">
                <div>
                  <h2>Accounts</h2>
                  <p>Debt, credit limits, monthly payments, interest-free periods, and due dates alongside the monthly ledger.</p>
                </div>
                <div className="netBlock">
                  <span>Total Debt</span>
                  <strong className={ledger.privacyMode ? "negativeText masked" : "negativeText"}>
                    <AnimatedCurrency value={debtSummary.totalDebt} formatter={moneyFormatter} />
                  </strong>
                </div>
              </div>

              <section className="summaryStrip" aria-label="Debt snapshot">
                <MetricCard label="Debt balance" value={debtSummary.totalDebt} tone="red" privacy={ledger.privacyMode} formatter={moneyFormatter} />
                <MetricCard label="Available credit" value={debtSummary.availableCredit} tone="green" privacy={ledger.privacyMode} formatter={moneyFormatter} />
                <MetricCard label="Monthly payments" value={debtSummary.monthlyMinimums} tone="amber" privacy={ledger.privacyMode} formatter={moneyFormatter} />
                <MetricCard label="Utilization" value={debtSummary.utilization} suffix="%" tone={debtSummary.utilization < 30 ? "green" : "amber"} />
              </section>

              <section className="accountsGrid">
                <article className="miniPanel accountsPanel">
                  <PanelTitle title="Debt accounts" icon={<CreditCard size={16} />} />
                  <div className="debtAccountList">
                    {ledger.debts.length ? (
                      ledger.debts.map((debt) => (
                        <DebtAccountRow
                          key={debt.id}
                          debt={debt}
                          symbol={currencySymbol}
                          formatter={moneyFormatter}
                          privacy={ledger.privacyMode}
                          onChange={(patch) => updateDebtAccount(debt.id, patch)}
                          onRemove={() => removeDebtAccount(debt.id)}
                        />
                      ))
                    ) : (
                      <EmptyState icon={<CreditCard size={18} />} title="No debt accounts" text="Add a credit card, loan, overdraft, or other balance to track it here." />
                    )}
                  </div>
                </article>

                <article className="miniPanel accountEditorPanel">
                  <PanelTitle title="Add account" icon={<Plus size={16} />} />
                  <div className="debtDraftGrid">
                    <input
                      value={debtDraft.name}
                      placeholder="Account name"
                      onChange={(event) => setDebtDraft((draft) => ({ ...draft, name: event.target.value }))}
                      onKeyDown={(event) => handleDraftEnter(event, addDebtAccount)}
                      aria-label="Debt account name"
                    />
                    <select
                      value={debtDraft.type}
                      onChange={(event) => setDebtDraft((draft) => ({ ...draft, type: event.target.value as DebtAccountType }))}
                      aria-label="Debt account type"
                    >
                      <option value="credit-card">Credit card</option>
                      <option value="loan">Loan</option>
                      <option value="overdraft">Overdraft</option>
                      <option value="other">Other</option>
                    </select>
                    <MoneyInput
                      ariaLabel="Debt balance"
                      value={debtDraft.balance}
                      symbol={currencySymbol}
                      placeholder="Current balance"
                      onChange={(value) => setDebtDraft((draft) => ({ ...draft, balance: value }))}
                    />
                    <MoneyInput
                      ariaLabel="Credit limit"
                      value={debtDraft.creditLimit}
                      symbol={currencySymbol}
                      placeholder="Credit limit"
                      onChange={(value) => setDebtDraft((draft) => ({ ...draft, creditLimit: value }))}
                    />
                    <label className="numberField hintField">
                      <input
                        value={debtDraft.apr}
                        inputMode="decimal"
                        placeholder="Interest rate %"
                        onChange={(event) => setDebtDraft((draft) => ({ ...draft, apr: event.target.value }))}
                        aria-label="Debt APR"
                      />
                      <InfoHint
                        label="Interest rate help"
                        text="Enter the annual percentage rate charged after any interest-free period ends. Use 0 if the account has no interest."
                      />
                    </label>
                    <label className="numberField hintField">
                      <input
                        value={debtDraft.interestFreeMonths}
                        inputMode="numeric"
                        placeholder="Interest-free months left"
                        onChange={(event) => setDebtDraft((draft) => ({ ...draft, interestFreeMonths: event.target.value }))}
                        aria-label="Interest-free months"
                      />
                      <InfoHint
                        label="Promotional period help"
                        text="Enter how many months remain before APR starts applying. The net-worth forecast delays interest until this period ends."
                      />
                    </label>
                    <MoneyInput
                      ariaLabel="Monthly payment"
                      value={debtDraft.minimumPayment}
                      symbol={currencySymbol}
                      placeholder="Monthly payment"
                      onChange={(value) => setDebtDraft((draft) => ({ ...draft, minimumPayment: value }))}
                    />
                    <label className="numberField hintField">
                      <input
                        value={debtDraft.dueDay}
                        inputMode="numeric"
                        placeholder="Payment due day (1-31)"
                        onChange={(event) => setDebtDraft((draft) => ({ ...draft, dueDay: event.target.value }))}
                        onKeyDown={(event) => handleDraftEnter(event, addDebtAccount)}
                        aria-label="Payment due day"
                      />
                      <InfoHint
                        label="Payment date help"
                        text="Enter the day of the month the payment is due. This keeps upcoming payment reminders and account context clear."
                      />
                    </label>
                    <button className="navCta inlineCta" type="button" onClick={addDebtAccount}>
                      Add account
                    </button>
                  </div>
                </article>
              </section>

            </section>
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
                  <div className="scoreNumber">{formatDecimal(healthScore.score)}</div>
                  <span className="scoreCaption">/10 · {healthScore.summary}</span>
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
  const title = mode === "signin" ? "Sign in to FinanceTracker" : mode === "opening" ? "Opening your vault" : "Preparing secure access";
  const detail =
    mode === "signin"
      ? "Use your Google account to unlock a private Supabase-backed ledger. Your data is isolated with row-level security."
      : mode === "opening"
        ? "Checking your account and restoring the latest ledger snapshot."
        : "Loading the local cache and checking the Supabase session.";

  return (
    <main className="authShell" aria-label="Authentication">
      <section className="authPanel">
        <div className="authBrand">
          <div className="logoTile" aria-hidden="true">
            <WalletCards size={22} />
          </div>
          <div>
            <h1>FinanceTracker</h1>
            <p>Supabase Vault</p>
          </div>
        </div>
        <div className="authCopy">
          <span className="privacyBadge">
            <ShieldCheck size={15} />
            Google sign-in only
          </span>
          <h2>{title}</h2>
          <p>{detail}</p>
        </div>
        {configured ? (
          <button className="googleButton" type="button" onClick={onSignIn} disabled={working || mode !== "signin"}>
            <span aria-hidden="true">G</span>
            {working || mode !== "signin" ? "Please wait" : "Continue with Google"}
          </button>
        ) : (
          <div className="authWarning" role="alert">
            <AlertCircle size={18} />
            Add `VITE_SUPABASE_PUBLISHABLE_KEY` to enable Google sign-in.
          </div>
        )}
      </section>
    </main>
  );
}

function StatusPill({ state, toast }: { state: SaveState; toast: string }) {
  return (
    <div className={`statusPill ${state}`}>
      <span />
      <div>
        <strong>{state === "saved" ? "Local data" : state === "saving" ? "Saving" : state === "offline" ? "Local mode" : "Loading"}</strong>
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
          <option value="transfer">Transfer</option>
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
      note: row.suggestedKind === kind ? row.note : "Edited",
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

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="emptyState">
      <div className="emptyIcon">{icon}</div>
      <strong>{title}</strong>
      <p>{text}</p>
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
      <input value={income.source} onChange={(event) => onChange({ source: event.target.value })} onKeyDown={blurOnEnter} aria-label="Income source" />
      <MoneyInput
        ariaLabel="Income amount"
        value={String(income.amount)}
        symbol={symbol}
        privacy={privacy}
        onEnter={({ currentTarget }) => currentTarget.blur()}
        onChange={(value) => onChange({ amount: Number(value) })}
      />
      <button className="iconButton rowAction" type="button" onClick={onRemove} aria-label="Remove income">
        <Trash2 size={17} />
      </button>
    </div>
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
        title="Drag onto another expense, or tap two handles to group"
      >
        ::
      </button>
      <input value={expense.name} onChange={(event) => onChange({ name: event.target.value })} onKeyDown={blurOnEnter} aria-label="Expense name" />
      <MoneyInput
        ariaLabel="Expense amount"
        value={String(expense.amount)}
        symbol={symbol}
        privacy={privacy}
        onEnter={({ currentTarget }) => currentTarget.blur()}
        onChange={(value) => onChange({ amount: Number(value) })}
      />
      <span className={privacy ? "rowTotal masked" : "rowTotal"}>{formatter.format(expense.amount)}</span>
      <button className="iconButton rowAction" type="button" onClick={onRemove} aria-label="Remove expense">
        <Trash2 size={17} />
      </button>
    </div>
  );
}

function DebtAccountRow({
  debt,
  symbol,
  formatter,
  privacy,
  onChange,
  onRemove,
}: {
  debt: DebtAccount;
  symbol: string;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  onChange: (patch: Partial<DebtAccount>) => void;
  onRemove: () => void;
}) {
  const utilization = debt.creditLimit > 0 ? clampPercent((debt.balance / debt.creditLimit) * 100) : 0;

  return (
    <div className="debtAccountRow" style={{ "--account-color": debt.color } as CSSProperties}>
      <button
        className="swatchButton"
        type="button"
        style={{ background: debt.color }}
        onClick={() => onChange({ color: nextColor(debt.color) })}
        aria-label="Cycle debt account color"
      />
      <div className="debtAccountMain">
        <input value={debt.name} onChange={(event) => onChange({ name: event.target.value })} aria-label="Debt account name" />
        <select value={debt.type} onChange={(event) => onChange({ type: event.target.value as DebtAccountType })} aria-label={`Type for ${debt.name}`}>
          <option value="credit-card">Credit card</option>
          <option value="loan">Loan</option>
          <option value="overdraft">Overdraft</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="debtField balanceField">
        <span>Balance</span>
        <MoneyInput
          ariaLabel={`Balance for ${debt.name}`}
          value={String(debt.balance)}
          symbol={symbol}
          privacy={privacy}
          placeholder="Current balance"
          onChange={(value) => onChange({ balance: Math.max(0, Number(value) || 0) })}
        />
      </div>
      <div className="debtField limitField">
        <span>Limit</span>
        <MoneyInput
          ariaLabel={`Credit limit for ${debt.name}`}
          value={String(debt.creditLimit)}
          symbol={symbol}
          privacy={privacy}
          placeholder="Credit limit"
          onChange={(value) => onChange({ creditLimit: Math.max(0, Number(value) || 0) })}
        />
      </div>
      <label className="numberField compact hintField aprField">
        <input value={String(debt.apr)} inputMode="decimal" placeholder="Interest rate %" onChange={(event) => onChange({ apr: Math.max(0, Number(event.target.value) || 0) })} aria-label={`APR for ${debt.name}`} />
        <InfoHint label={`Interest rate help for ${debt.name}`} text="Annual percentage rate charged after any interest-free period ends." />
      </label>
      <label className="numberField compact hintField interestFreeField">
        <input
          value={String(debt.interestFreeMonths)}
          inputMode="numeric"
          placeholder="Interest-free months left"
          onChange={(event) => onChange({ interestFreeMonths: clampWholeNumber(Number(event.target.value) || 0, 120) })}
          aria-label={`Interest-free months for ${debt.name}`}
        />
        <InfoHint label={`Promotional period help for ${debt.name}`} text="Months left before APR starts applying in the net-worth forecast." />
      </label>
      <div className="debtField minimumField">
        <span>Monthly</span>
        <MoneyInput
          ariaLabel={`Monthly payment for ${debt.name}`}
          value={String(debt.minimumPayment)}
          symbol={symbol}
          privacy={privacy}
          placeholder="Monthly payment"
          onChange={(value) => onChange({ minimumPayment: Math.max(0, Number(value) || 0) })}
        />
      </div>
      <label className="numberField compact hintField dueField">
        <input value={String(debt.dueDay)} inputMode="numeric" placeholder="Payment due day (1-31)" onChange={(event) => onChange({ dueDay: clampDueDay(Number(event.target.value) || 1) })} aria-label={`Due day for ${debt.name}`} />
        <InfoHint label={`Payment date help for ${debt.name}`} text="Day of the month this account payment is due." />
      </label>
      <div className="debtAccountMeta">
        <span>{debtTypeLabel(debt.type)}</span>
        <strong className={privacy ? "masked" : ""}>{formatter.format(debt.balance)}</strong>
        <em>{formatDecimal(utilization)}% used · {debt.interestFreeMonths > 0 ? `${debt.interestFreeMonths} mo 0%` : "APR active"}</em>
      </div>
      <button className="iconButton rowAction" type="button" onClick={onRemove} aria-label={`Remove ${debt.name}`}>
        <Trash2 size={17} />
      </button>
    </div>
  );
}

function debtTypeLabel(type: DebtAccountType): string {
  if (type === "credit-card") return "Credit card";
  if (type === "loan") return "Loan";
  if (type === "overdraft") return "Overdraft";
  return "Other";
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
      <small>Based on this month repeated 12 times</small>
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
  goalPercent,
  projection,
  onGoalChange,
  onNoteChange,
  onResetMonth,
  privacy,
  symbol,
}: {
  ledger: LedgerState;
  month: MonthBudget;
  goalPercent: number;
  projection: Projection;
  onGoalChange: (patch: Partial<LedgerState["goal"]>) => void;
  onNoteChange: (note: string) => void;
  onResetMonth: () => void;
  privacy: boolean;
  symbol: string;
}) {
  const runway = projection.monthlyExpenses > 0 ? ledger.goal.saved / projection.monthlyExpenses : 0;

  return (
    <article className="miniPanel goalPanel">
      <PanelTitle title="Notes and goals" icon={<Pencil size={16} />} />
      <label className="goalName">
        <Target size={16} />
        <input
          value={ledger.goal.name}
          placeholder="Emergency fund goal"
          onChange={(event) => onGoalChange({ name: event.target.value })}
          onKeyDown={blurOnEnter}
          aria-label="Goal name"
        />
      </label>
      <div className="goalAmounts">
        <label className="goalAmountField">
          <span>Saved</span>
          <MoneyInput ariaLabel="Goal saved" value={String(ledger.goal.saved)} symbol={symbol} privacy={privacy} onChange={(value) => onGoalChange({ saved: Number(value) })} />
        </label>
        <label className="goalAmountField">
          <span>Target</span>
          <MoneyInput ariaLabel="Goal target" value={String(ledger.goal.target)} symbol={symbol} privacy={privacy} onChange={(value) => onGoalChange({ target: Number(value) })} />
        </label>
      </div>
      <div className="progressLine">
        <span style={{ width: `${goalPercent}%` }} />
      </div>
      <div className="goalMeta">
        <b className={privacy ? "masked" : ""}>{formatDecimal(goalPercent)}%</b>
        <span>{formatDecimal(runway)} month runway</span>
      </div>
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

function InfoHint({ text, label = "More information" }: { text: string; label?: string }) {
  return (
    <span className="infoHint" tabIndex={0} role="button" aria-label={label} title={text}>
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
          <span>Remaining debt</span>
          <strong className={privacy ? "masked" : ""}>{formatter.format(lastPoint?.debtBalance ?? 0)}</strong>
        </div>
        <div>
          <span>Interest in period</span>
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

function normalizeState(state: Partial<LedgerState>): LedgerState {
  const fallback = createInitialState();
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
    goal: {
      id: state.goal?.id || fallback.goal.id,
      name: state.goal?.name ?? fallback.goal.name,
      saved: finiteNumber(state.goal?.saved, fallback.goal.saved),
      target: finiteNumber(state.goal?.target, fallback.goal.target),
    },
    savingsTarget: Number.isFinite(state.savingsTarget) ? state.savingsTarget : fallback.savingsTarget,
    debts: normalizeDebts(state.debts),
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
            }))
          : [],
        note: month?.note ?? "",
      },
    ]),
  );
}

function normalizeDebts(debts: DebtAccount[] | undefined): DebtAccount[] {
  if (!Array.isArray(debts)) return [];

  return debts.map((debt, index) => ({
    id: debt.id || createId("debt"),
    name: debt.name || "Debt account",
    type: debt.type ?? "other",
    balance: finiteNumber(debt.balance, 0),
    creditLimit: finiteNumber(debt.creditLimit, 0),
    apr: finiteNumber(debt.apr, 0),
    interestFreeMonths: clampWholeNumber(finiteNumber(debt.interestFreeMonths, 0), 120),
    minimumPayment: finiteNumber(debt.minimumPayment, 0),
    dueDay: clampDueDay(debt.dueDay),
    includeInNetWorth: debt.includeInNetWorth !== false,
    color: debt.color || colors[(index + 3) % colors.length],
    note: debt.note ?? "",
  }));
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
