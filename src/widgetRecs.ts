// Dashboard widgets worth suggesting, from what is in the ledger. A new user starts with a few basic
// widgets (see starterLayout); as accounts, debts, goals and months of data arrive, the widgets that
// now have something to show are offered on the dashboard, each with Add and dismiss. Dismissals are
// a per-device view preference, like the layout itself, so they live in localStorage.

export type WidgetRecInputs = {
  hasIncomeAndSpending: boolean;
  debtCount: number;
  goalCount: number;
  recurringCount: number;
  accountCount: number;
  monthsWithData: number;
  salaryEntered: boolean;
  hasRetirementAccount: boolean;
  signalCount: number;
};

export type WidgetRec = { id: string; reason: string };

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many.replace("#", String(count)));

// Every widget the data now supports, most useful first. The caller drops ones already on the page,
// not available in the region, or dismissed.
export function recommendWidgets(inputs: WidgetRecInputs): WidgetRec[] {
  const recs: WidgetRec[] = [];
  if (inputs.debtCount > 0) {
    recs.push({ id: "debt-overview", reason: plural(inputs.debtCount, "You've added a debt", "You've added # debts") });
    recs.push({ id: "payoff", reason: "See when each debt will be paid off" });
  }
  if (inputs.recurringCount > 0) recs.push({ id: "subscriptions", reason: plural(inputs.recurringCount, "1 recurring payment found", "# recurring payments found") });
  if (inputs.goalCount > 0) recs.push({ id: "goals", reason: plural(inputs.goalCount, "Track your goal", "Track your # goals") });
  if (inputs.hasIncomeAndSpending) {
    recs.push({ id: "health", reason: "Score your cash flow, debt and savings" });
    recs.push({ id: "savings-rate", reason: "How much of your income you keep" });
  }
  if (inputs.accountCount > 0) recs.push({ id: "net-worth", reason: "You've added accounts" });
  if (inputs.monthsWithData >= 2) {
    recs.push({ id: "month-compare", reason: "You have more than one month of data" });
    recs.push({ id: "chart", reason: "See your months side by side" });
  }
  if (inputs.salaryEntered) recs.push({ id: "paycheck", reason: "You've entered your salary" });
  if (inputs.hasRetirementAccount) recs.push({ id: "retirement", reason: "You've added a pension or retirement account" });
  if (inputs.signalCount > 0) recs.push({ id: "anomalies", reason: plural(inputs.signalCount, "1 thing worth a look", "# things worth a look") });
  return recs;
}

const DISMISSED_KEY = "it_widget_recs_dismissed";

export function readDismissedRecs(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function writeDismissedRecs(ids: string[]) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    // localStorage unavailable — a dismissed suggestion may come back next visit.
  }
}

export function clearDismissedRecs() {
  try {
    localStorage.removeItem(DISMISSED_KEY);
  } catch {
    // Nothing to clear.
  }
}
