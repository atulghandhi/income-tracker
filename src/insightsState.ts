import type { InsightTodoItem, InsightWidgetInstance, InsightWidgetType, InsightsState } from "./types";

// The small amount of data the Insights widgets own — which look a widget uses, dismissed
// warnings, notes and to-dos. Where the widgets sit is the page layout's job (layout.ts); this
// is only what is inside them. It lives in the ledger, so it is saved and synced with it.

const WIDGET_TYPES: InsightWidgetType[] = [
  "summary",
  "moneyFlow",
  "health",
  "monthlyCashFlow",
  "warnings",
  "topCategories",
  "recurring",
  "annualSnapshot",
  "savingsRate",
  "spendingPace",
  "netWorth",
  "debt",
  "goals",
  "monthCompare",
  "upcoming",
  "calendar",
  "accounts",
  "todo",
  "notes",
];

export function isInsightWidgetType(value: unknown): value is InsightWidgetType {
  return typeof value === "string" && (WIDGET_TYPES as string[]).includes(value);
}

export function createDefaultInsightsState(): InsightsState {
  return { version: 1, widgets: [], hiddenWarnings: [], notes: {}, todos: {} };
}

function normalizeTodo(raw: unknown): InsightTodoItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<InsightTodoItem>;
  if (typeof item.id !== "string" || typeof item.text !== "string") return null;
  return { id: item.id, text: item.text, done: Boolean(item.done), createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date(0).toISOString() };
}

export function normalizeInsightsState(raw: unknown): InsightsState {
  const fallback = createDefaultInsightsState();
  if (!raw || typeof raw !== "object") return fallback;
  const state = raw as Partial<InsightsState>;

  const widgets: InsightWidgetInstance[] = Array.isArray(state.widgets)
    ? state.widgets.filter(
        (widget): widget is InsightWidgetInstance =>
          Boolean(widget) && typeof widget.id === "string" && isInsightWidgetType(widget.type) && (widget.variant === undefined || typeof widget.variant === "string"),
      )
    : [];

  const hiddenWarnings = Array.isArray(state.hiddenWarnings) ? state.hiddenWarnings.filter((id): id is string => typeof id === "string") : [];

  const notes: Record<string, string> = {};
  if (state.notes && typeof state.notes === "object") {
    for (const [id, text] of Object.entries(state.notes)) if (typeof text === "string") notes[id] = text;
  }

  const todos: Record<string, InsightTodoItem[]> = {};
  if (state.todos && typeof state.todos === "object") {
    for (const [id, items] of Object.entries(state.todos)) {
      if (Array.isArray(items)) todos[id] = items.map(normalizeTodo).filter((item): item is InsightTodoItem => item !== null);
    }
  }

  return { version: 1, widgets, hiddenWarnings, notes, todos };
}

// The instance a widget renders with: its saved look if it has one, otherwise the default.
export function widgetInstance(state: InsightsState, id: string, type: InsightWidgetType): InsightWidgetInstance {
  return state.widgets.find((widget) => widget.id === id) ?? { id, type };
}

export function setWidgetVariant(state: InsightsState, id: string, type: InsightWidgetType, variant: string): InsightsState {
  const others = state.widgets.filter((widget) => widget.id !== id);
  return { ...state, widgets: [...others, { id, type, variant }] };
}
