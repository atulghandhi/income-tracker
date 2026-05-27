import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, Ref } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FolderPlus,
  Gauge,
  Info,
  LayoutDashboard,
  LineChart,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Target,
  Trash2,
  Upload,
  WalletCards,
} from "lucide-react";
import {
  buildCsvExport,
  calculateProjection,
  clampPercent,
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
import { loadLedgerState, saveLedgerState } from "./storage";
import type { CurrencyCode, ExpenseEntry, IncomeEntry, LedgerState, MonthBudget, Projection } from "./types";

type ProjectionView = "overview" | "category" | "month";
type AppView = "dashboard" | "ledger" | "insights" | "settings";
type ExpenseDropPreview =
  | { type: "reorder"; targetId: string; edge: "before" | "after" }
  | { type: "category"; category: string }
  | { type: "combine"; targetId: string }
  | null;
type ExpenseDropState = "before" | "after" | "combine";
type CategoryMenuState = { expenseId: string; x: number; y: number };
type CategoryOption = { name: string; color: string; count: number; total: number };

type IncomeDraft = {
  source: string;
  amount: string;
};

type ExpenseDraft = {
  name: string;
  amount: string;
};

const initialIncomeDraft: IncomeDraft = {
  source: "",
  amount: "",
};

const initialExpenseDraft: ExpenseDraft = {
  name: "",
  amount: "",
};

function App() {
  const [ledger, setLedger] = useState<LedgerState>(() => createInitialState());
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<"loading" | "saved" | "saving" | "offline">("loading");
  const [incomeDraft, setIncomeDraft] = useState<IncomeDraft>(initialIncomeDraft);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>(initialExpenseDraft);
  const [projectionView, setProjectionView] = useState<ProjectionView>("overview");
  const [activeView, setActiveView] = useState<AppView>("ledger");
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("Loading local budget");
  const [draggingExpenseId, setDraggingExpenseId] = useState<string | null>(null);
  const [groupingSourceId, setGroupingSourceId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<ExpenseDropPreview>(null);
  const [categoryMenu, setCategoryMenu] = useState<CategoryMenuState | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const incomeSourceInputRef = useRef<HTMLInputElement | null>(null);
  const incomeAmountInputRef = useRef<HTMLInputElement | null>(null);
  const expenseNameInputRef = useRef<HTMLInputElement | null>(null);
  const expenseAmountInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentMonth = ledger.months[ledger.selectedMonth] ?? seedMonthFromPrevious();
  const moneyFormatter = useMemo(() => getCurrencyFormatter(ledger.currency), [ledger.currency]);
  const currencySymbol = useMemo(() => getCurrencySymbol(ledger.currency), [ledger.currency]);
  const projection = useMemo(() => calculateProjection(currentMonth), [currentMonth]);
  const categoryRows = useMemo(() => buildCategoryRows(currentMonth, projection), [currentMonth, projection]);
  const expenseGroups = useMemo(() => buildExpenseGroups(currentMonth.expenses), [currentMonth.expenses]);
  const categoryOptions: CategoryOption[] = useMemo(
    () =>
      expenseGroups
        .filter((group) => group.category)
        .map((group) => ({ name: group.category, color: group.color, count: group.items.length, total: group.total })),
    [expenseGroups],
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
          setToast("Restored from IndexedDB");
        } else {
          setToast("Blank ledger ready");
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
    if (!hydrated) return;

    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      saveLedgerState(ledger)
        .then(() => {
          setSaveState("saved");
          setToast("Saved locally");
        })
        .catch(() => {
          setSaveState("offline");
          setToast("Browser storage fallback active");
        });
    }, 240);

    return () => window.clearTimeout(timeout);
  }, [ledger, hydrated]);

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

  function resetMonth() {
    updateCurrentMonth(() => ({ incomes: [], expenses: [], note: "" }));
    setToast("Month cleared");
  }

  function openNewTransaction() {
    setActiveView("ledger");
    focusNextFrame(incomeSourceInputRef);
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
    { id: "insights", label: "Insights", icon: <LineChart size={20} /> },
    { id: "settings", label: "Settings", icon: <SettingsIcon size={20} /> },
  ];
  const activeTitle =
    activeView === "dashboard"
      ? "Dashboard"
      : activeView === "ledger"
        ? "Ledger"
        : activeView === "insights"
          ? "Spending Intelligence"
          : "Management Hub";

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

      <aside className="sideNav" aria-label="Primary">
        <div className="brandCluster">
          <div className="logoTile" aria-hidden="true">
            <WalletCards size={20} />
          </div>
          <div>
            <h1>FinanceTracker</h1>
            <p>Local-first Vault</p>
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
          <div className="identityMark">
            <ShieldCheck size={17} />
          </div>
          <div>
            <strong>Local vault</strong>
            <span>Browser only</span>
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
            <button className="iconButton" type="button" onClick={() => setToast("Already saved locally")} aria-label="Sync local data">
              <RotateCcw size={18} />
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
                  <PanelTitle title="Cash flow volatility" icon={<BarChart3 size={16} />} />
                  <BarChart bars={monthlyBars} privacy={ledger.privacyMode} formatter={moneyFormatter} />
                </article>
                <article className="miniPanel ledgerPreview">
                  <PanelTitle title="Master ledger" icon={<ReceiptText size={16} />} />
                  <TransactionHistory month={currentMonth} privacy={ledger.privacyMode} formatter={moneyFormatter} />
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
                  <PanelTitle title="Health score" icon={<Gauge size={16} />} />
                  <div className="scoreNumber">{formatDecimal(Math.max(0, Math.min(10, projection.savingsRate / 5 + 5)))}</div>
                  <span className="scoreCaption">/10</span>
                  <div className="ruleList">
                    <ProgressRule label="Needs" value={projection.monthlyIncome ? (projection.monthlyExpenses / projection.monthlyIncome) * 100 : 0} target={50} tone="neutral" />
                    <ProgressRule label="Savings" value={projection.savingsRate} target={ledger.savingsTarget} tone="good" />
                  </div>
                </article>
                <article className="miniPanel chartPanel">
                  <PanelTitle title="Inflows vs outflows" icon={<LineChart size={16} />} />
                  <LineGraph projection={projection} />
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
                  <PanelTitle title="Detected anomalies" icon={<Info size={16} />} />
                  <div className="anomalyList">
                    <div>
                      <strong>{projection.monthlyExpenses > projection.monthlyIncome ? "Output pressure" : "No major anomaly"}</strong>
                      <span>
                        {projection.monthlyExpenses > projection.monthlyIncome
                          ? "Expenses are above income for the selected month."
                          : "Current entries sit inside a stable monthly flow."}
                      </span>
                    </div>
                    <div>
                      <strong>Grouping coverage</strong>
                      <span>{formatDecimal((projection.paidTotal / Math.max(projection.monthlyExpenses, 1)) * 100)}% of expenses are categorized.</span>
                    </div>
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
                  <p>Configure your local vault and interface preferences.</p>
                </div>
                <span className="privacyBadge">
                  <ShieldCheck size={15} />
                  All data stays on your machine
                </span>
              </div>

              <article className="architectureNote">
                <Info size={21} />
                <div>
                  <h3>Local-first architecture</h3>
                  <p>All your data is stored locally in this browser with IndexedDB. JSON and CSV exports are available for your own backups.</p>
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
                      <h3>Import archive</h3>
                      <p>Restore from a previous JSON backup stored on your machine.</p>
                      <button className="commandButton" type="button" onClick={() => fileInputRef.current?.click()}>
                        <Upload size={16} />
                        Import JSON
                      </button>
                    </div>
                  </div>
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

function StatusPill({ state, toast }: { state: "loading" | "saved" | "saving" | "offline"; toast: string }) {
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

function MoneyInput({
  ariaLabel,
  inputRef,
  value,
  symbol,
  privacy,
  onEnter,
  onChange,
}: {
  ariaLabel: string;
  inputRef?: Ref<HTMLInputElement>;
  value: string;
  symbol: string;
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

function PanelTitle({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <div className="panelTitle">
      <h3>{title}</h3>
      {icon ?? <Info size={16} />}
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

function normalizeState(state: LedgerState): LedgerState {
  const fallback = createInitialState();
  if (state.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return fallback;
  }
  const selectedMonth = state.selectedMonth || fallback.selectedMonth;

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    currency: state.currency ?? fallback.currency,
    selectedMonth,
    months: Object.keys(state.months ?? {}).length ? state.months : fallback.months,
    goal: state.goal ?? fallback.goal,
    savingsTarget: Number.isFinite(state.savingsTarget) ? state.savingsTarget : fallback.savingsTarget,
    privacyMode: Boolean(state.privacyMode),
    lastSavedAt: state.lastSavedAt ?? new Date().toISOString(),
  };
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

function buildMonthlyBars(ledger: LedgerState, fallbackMonth: MonthBudget) {
  const [year] = ledger.selectedMonth.split("-").map(Number);
  const values = Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
    const month = ledger.months[key] ?? fallbackMonth;
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
