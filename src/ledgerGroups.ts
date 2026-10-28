import { calculateProjection, colors } from "./finance";
import type { ExpenseEntry, LedgerState, MonthBudget, Projection } from "./types";

// Pure grouping helpers shared by the ledger, the dashboard and the insights
// widgets. They used to live in App.tsx; nothing here touches the DOM.

export type ExpenseGroup = { id: string; category: string; color: string; total: number; items: ExpenseEntry[] };

export type CategoryRow = { name: string; annual: number; monthly: number; share: number; color: string; count: number };

export function categoryColor(category: string, fallbackIndex: number) {
  const normalized = category.trim().toLowerCase();
  const defaultCategories = ["home", "food", "bills", "travel", "health", "personal", "work", "subscriptions", "savings", "other"];
  const knownIndex = defaultCategories.findIndex((item) => item === normalized);
  return colors[(knownIndex >= 0 ? knownIndex : fallbackIndex + 2) % colors.length];
}

// A friendly emoji for a category name. Categories are free text, so this matches on keywords;
// the more specific words are listed first ("eating out" before "food"). Unknown names get none.
const CATEGORY_EMOJI: Array<[RegExp, string]> = [
  [/\b(eat(ing)? out|restaurant|dining|takeaway|take-away|fast food|bars?|pubs?)\b/, "🍔"],
  [/\b(coffee|caf[eé])\b/, "☕"],
  [/\b(groceries|grocery|supermarket|food)\b/, "🛒"],
  [/\b(rent|mortgage|housing|home|house|council tax)\b/, "🏠"],
  [/\b(debt|loan|credit card|card payments?|repayments?)\b/, "💳"],
  [/\b(phone|mobile|internet|broadband|wifi)\b/, "📱"],
  [/\b(bills?|utilit(y|ies)|energy|electric(ity)?|gas|water)\b/, "💡"],
  [/\b(holidays?|flights?|vacation|hotels?)\b/, "✈️"],
  [/\b(travel|transport|commute|fuel|petrol|car|auto|train|bus|taxi|uber)\b/, "🚗"],
  [/\b(gym|fitness|sport)\b/, "🏋️"],
  [/\b(health|medical|doctor|dental|pharmacy|prescriptions?)\b/, "🩺"],
  [/\b(subscriptions?|streaming|netflix|spotify)\b/, "📺"],
  [/\b(entertainment|fun|hobbies|games?|going out)\b/, "🎉"],
  [/\b(clothes|clothing|fashion|shopping|amazon)\b/, "🛍️"],
  [/\b(personal|beauty|hair|self care)\b/, "💅"],
  [/\b(kids|children|childcare|baby|school)\b/, "🧸"],
  [/\b(pets?|dog|cat|vet)\b/, "🐾"],
  [/\b(insurance)\b/, "☂️"],
  [/\b(education|courses?|books?|tuition)\b/, "🎓"],
  [/\b(gifts?|charity|donations?)\b/, "🎁"],
  [/\b(tax|taxes)\b/, "🧾"],
  [/\b(savings?|investments?|invest|pension|isa|401k)\b/, "🐷"],
  [/\b(work|business|office)\b/, "💼"],
];

export function categoryEmoji(category: string): string {
  const name = category.trim().toLowerCase();
  if (!name) return "";
  return CATEGORY_EMOJI.find(([pattern]) => pattern.test(name))?.[1] ?? "";
}

// Expenses grouped by category (largest group first, items largest first),
// followed by every ungrouped expense as its own single-item group.
export function buildExpenseGroups(expenses: ExpenseEntry[]): ExpenseGroup[] {
  type WorkingGroup = ExpenseGroup & { order: number };
  const positions = new Map(expenses.map((expense, index) => [expense.id, index]));
  const groups = new Map<string, WorkingGroup>();
  const ungrouped: WorkingGroup[] = [];

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
      groups.set(category, {
        id: `category-${category}`,
        category,
        color: expense.color || categoryColor(category, index),
        total: expense.amount,
        items: [expense],
        order: index,
      });
    }
  });

  const categoryGroups = Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => b.amount - a.amount || (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0)),
    }))
    .sort((a, b) => b.total - a.total || a.order - b.order);

  return [...categoryGroups, ...ungrouped].map(({ order: _order, ...group }) => group);
}

// Category share of the month's spend. `annual` is the month's figure × 12,
// which is what the projection panel always showed; `monthly` is the raw figure.
export function buildCategoryRows(month: MonthBudget, projection: Projection): CategoryRow[] {
  const total = Math.max(projection.monthlyExpenses, 1);
  return buildExpenseGroups(month.expenses)
    .filter((group) => group.category)
    .map((group) => ({
      name: group.category,
      annual: group.total * 12,
      monthly: group.total,
      share: (group.total / total) * 100,
      color: group.color,
      count: group.items.length,
    }))
    .sort((a, b) => b.annual - a.annual);
}

export type MonthlyBar = { label: string; value: number; height: number };

// Surplus per calendar month of the selected year, scaled to the largest.
export function buildMonthlyBars(ledger: Pick<LedgerState, "selectedMonth" | "months">): MonthlyBar[] {
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
