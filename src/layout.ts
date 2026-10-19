import type { RegionKey } from "./region";

// Customisable page layouts for the Dashboard and Insights pages. Each page is a list of widgets
// in display order, each with a width; anything not in the list is hidden and can be added back
// from the widget tray. Layouts are a per-device view preference (like the theme), stored in
// localStorage per page and region so a US dashboard and a UK one keep separate arrangements.

export type LayoutPage = "dashboard" | "insights";
export type WidgetSize = "s" | "m" | "l" | "xl";
export type WidgetPlacement = { id: string; size: WidgetSize };
export type PageLayout = { version: 1; widgets: WidgetPlacement[] };

export type WidgetDefinition = {
  id: string;
  // Titles vary by region: the same widget is "Pensions & ISAs" in the UK and "Retirement accounts" in the US.
  title: Record<RegionKey, string>;
  description: Record<RegionKey, string>;
  defaultSize: WidgetSize;
  sizes: WidgetSize[];
  // Only offered in these regions. Absent = everywhere.
  regions?: RegionKey[];
};

export const LAYOUT_VERSION = 1 as const;
export const WIDGET_SIZES: WidgetSize[] = ["s", "m", "l", "xl"];
export const SIZE_LABELS: Record<WidgetSize, string> = { s: "⅓ width", m: "½ width", l: "⅔ width", xl: "Full width" };

// Six-column grid: s = a third, m = a half, l = two thirds, xl = the full row.
export function spanFor(size: WidgetSize): number {
  return size === "s" ? 2 : size === "m" ? 3 : size === "l" ? 4 : 6;
}

const DASHBOARD_WIDGETS: WidgetDefinition[] = [
  {
    id: "snapshot",
    title: { GB: "Monthly snapshot", US: "Monthly snapshot" },
    description: { GB: "Income, spending, surplus and savings rate this month.", US: "Income, spending, surplus and savings rate this month." },
    defaultSize: "xl",
    sizes: ["l", "xl"],
  },
  {
    id: "net-worth",
    title: { GB: "Net worth outlook", US: "Net worth outlook" },
    description: { GB: "Where your net worth is heading over 1, 2 or 5 years.", US: "Where your net worth is heading over 1, 2 or 5 years." },
    defaultSize: "xl",
    sizes: ["m", "l", "xl"],
  },
  {
    id: "accounts-imports",
    title: { GB: "Accounts and imports", US: "Accounts and imports" },
    description: { GB: "Debt totals, card utilisation and quick links to import.", US: "Debt totals, card utilization and quick links to import." },
    defaultSize: "xl",
    sizes: ["m", "l", "xl"],
  },
  {
    id: "retirement",
    title: { GB: "Pensions & ISAs", US: "Retirement & tax-advantaged accounts" },
    description: {
      GB: "Pension and ISA contributions against this year's allowances, with employer contributions.",
      US: "401(k), IRA and HSA contributions against this year's limits, employer match and tax treatment.",
    },
    defaultSize: "l",
    sizes: ["m", "l", "xl"],
  },
  {
    id: "take-home",
    title: { GB: "Take-home estimate", US: "Take-home estimate" },
    description: { GB: "Gross salary to net pay after tax, National Insurance and student loan.", US: "Gross salary to net pay after federal, state and FICA taxes." },
    defaultSize: "s",
    sizes: ["s", "m", "l"],
  },
  {
    id: "medical",
    title: { GB: "Medical spending", US: "Medical spending" },
    description: { GB: "", US: "Spending against your deductible and out-of-pocket maximum, with HSA and FSA balances." },
    defaultSize: "m",
    sizes: ["s", "m", "l"],
    regions: ["US"],
  },
  {
    id: "loans",
    title: { GB: "Loans", US: "Loans & student loans" },
    description: { GB: "Mortgages, car finance and student loans: payments, plans and payoff dates.", US: "Mortgages, auto loans and student loans: payments, repayment plans and payoff dates." },
    defaultSize: "m",
    sizes: ["s", "m", "l", "xl"],
  },
  {
    id: "housing",
    title: { GB: "Housing costs", US: "Housing costs" },
    description: { GB: "Rent or mortgage plus council tax and other home costs this month.", US: "Mortgage or rent plus property tax, HOA dues and insurance this month." },
    defaultSize: "m",
    sizes: ["s", "m", "l"],
  },
  {
    id: "credit",
    title: { GB: "Credit score estimate", US: "Credit score estimate" },
    description: { GB: "Rough estimate on Experian's scale, with what the band means.", US: "Rough estimate with FICO and VantageScore bands." },
    defaultSize: "m",
    sizes: ["s", "m", "l"],
  },
  {
    id: "goals",
    title: { GB: "Goals", US: "Goals" },
    description: { GB: "Progress on your savings goals.", US: "Progress on your savings goals." },
    defaultSize: "m",
    sizes: ["s", "m", "l"],
  },
  {
    id: "payoff",
    title: { GB: "Debt payoff plan", US: "Debt payoff plan" },
    description: {
      GB: "Your chosen payoff strategy: debt-free date, interest saved against minimums, and this month's move.",
      US: "Your chosen payoff strategy: debt-free date, interest saved against minimums, and this month's move.",
    },
    defaultSize: "m",
    sizes: ["s", "m", "l", "xl"],
  },
];

const INSIGHTS_WIDGETS: WidgetDefinition[] = [
  {
    id: "summary",
    title: { GB: "Month summary", US: "Month summary" },
    description: { GB: "Income, expenses, net and savings rate.", US: "Income, expenses, net and savings rate." },
    defaultSize: "xl",
    sizes: ["l", "xl"],
  },
  {
    id: "cash-flow",
    title: { GB: "Cash flow", US: "Cash flow" },
    description: { GB: "Where this month's money came from and went.", US: "Where this month's money came from and went." },
    defaultSize: "xl",
    sizes: ["l", "xl"],
  },
  {
    id: "health",
    title: { GB: "Health score", US: "Health score" },
    description: { GB: "Cash flow, debt, payments, card headroom and savings, scored.", US: "Cash flow, debt, payments, card headroom and savings, scored." },
    defaultSize: "s",
    sizes: ["s", "m"],
  },
  {
    id: "chart",
    title: { GB: "Trends", US: "Trends" },
    description: { GB: "Monthly cash flow, volatility or the net-worth outlook.", US: "Monthly cash flow, volatility or the net-worth outlook." },
    defaultSize: "l",
    sizes: ["m", "l", "xl"],
  },
  {
    id: "categories",
    title: { GB: "Top categories", US: "Top categories" },
    description: { GB: "Your biggest spending categories this month.", US: "Your biggest spending categories this month." },
    defaultSize: "s",
    sizes: ["s", "m"],
  },
  {
    id: "anomalies",
    title: { GB: "Detected anomalies", US: "Detected anomalies" },
    description: { GB: "Pressure points worth a second look.", US: "Pressure points worth a second look." },
    defaultSize: "l",
    sizes: ["m", "l", "xl"],
  },
  {
    id: "paycheck",
    title: { GB: "Where your pay goes", US: "Where your paycheck goes" },
    description: {
      GB: "Gross pay split into income tax, National Insurance, student loan, pension and take-home — from the Pay & tax estimate.",
      US: "Gross pay split into federal and state tax, Social Security, Medicare, deductions and take-home — from the Paycheck & tax estimate.",
    },
    defaultSize: "m",
    sizes: ["s", "m", "l"],
  },
  {
    id: "limits",
    title: { GB: "ISA & pension allowances", US: "Contribution limits" },
    description: { GB: "How much of this tax year's allowances your contributions use.", US: "How much of this year's 401(k), IRA, HSA and FSA limits your contributions use." },
    defaultSize: "l",
    sizes: ["m", "l", "xl"],
  },
  {
    id: "credit",
    title: { GB: "Credit score estimate", US: "Credit score estimate" },
    description: { GB: "Rough estimate on Experian's scale, with what the band means.", US: "Rough estimate with FICO and VantageScore bands." },
    defaultSize: "m",
    sizes: ["s", "m", "l"],
  },
  {
    id: "medical",
    title: { GB: "Medical spending", US: "Medical spending" },
    description: { GB: "", US: "Spending against your deductible and out-of-pocket maximum, with HSA and FSA balances." },
    defaultSize: "m",
    sizes: ["s", "m", "l"],
    regions: ["US"],
  },
  {
    id: "loans",
    title: { GB: "Loans", US: "Loans & student loans" },
    description: { GB: "Mortgages, car finance and student loans: payments, plans and payoff dates.", US: "Mortgages, auto loans and student loans: payments, repayment plans and payoff dates." },
    defaultSize: "m",
    sizes: ["s", "m", "l", "xl"],
  },
  {
    id: "payoff",
    title: { GB: "Debt payoff plan", US: "Debt payoff plan" },
    description: {
      GB: "Payoff strategies compared: interest, debt-free date and monthly payments under each, with your chosen plan's next move.",
      US: "Payoff strategies compared: interest, debt-free date and monthly payments under each, with your chosen plan's next move.",
    },
    defaultSize: "l",
    sizes: ["s", "m", "l", "xl"],
  },
  {
    id: "recurring",
    title: { GB: "Recurring payments", US: "Recurring payments" },
    description: { GB: "Subscriptions and repeating payments found in your ledger.", US: "Subscriptions and repeating payments found in your ledger." },
    defaultSize: "xl",
    sizes: ["l", "xl"],
  },
  {
    id: "annual",
    title: { GB: "Annual projection", US: "Annual projection" },
    description: { GB: "The year ahead from this month's plan.", US: "The year ahead from this month's plan." },
    defaultSize: "xl",
    sizes: ["xl"],
  },
];

const DEFAULT_IDS: Record<LayoutPage, Record<RegionKey, string[]>> = {
  dashboard: {
    // The UK dashboard keeps its original three panels; the rest wait in the tray.
    GB: ["snapshot", "net-worth", "accounts-imports"],
    US: ["snapshot", "net-worth", "retirement", "take-home", "medical", "loans", "accounts-imports"],
  },
  insights: {
    GB: ["summary", "cash-flow", "health", "chart", "categories", "anomalies", "payoff", "recurring", "annual"],
    US: ["summary", "cash-flow", "health", "chart", "categories", "anomalies", "paycheck", "credit", "limits", "payoff", "medical", "loans", "recurring", "annual"],
  },
};

export function widgetDefinitions(page: LayoutPage): WidgetDefinition[] {
  return page === "dashboard" ? DASHBOARD_WIDGETS : INSIGHTS_WIDGETS;
}

export function availableWidgets(page: LayoutPage, region: RegionKey): WidgetDefinition[] {
  return widgetDefinitions(page).filter((widget) => !widget.regions || widget.regions.includes(region));
}

export function widgetDefinition(page: LayoutPage, id: string): WidgetDefinition | undefined {
  return widgetDefinitions(page).find((widget) => widget.id === id);
}

export function defaultLayout(page: LayoutPage, region: RegionKey): PageLayout {
  const available = availableWidgets(page, region);
  return {
    version: LAYOUT_VERSION,
    widgets: DEFAULT_IDS[page][region]
      .map((id) => available.find((widget) => widget.id === id))
      .filter((widget): widget is WidgetDefinition => Boolean(widget))
      .map((widget) => ({ id: widget.id, size: widget.defaultSize })),
  };
}

function isSize(value: unknown): value is WidgetSize {
  return typeof value === "string" && (WIDGET_SIZES as string[]).includes(value);
}

// Anything stored is treated with suspicion: unknown widgets, widgets from another region, repeats
// and bad sizes are dropped; an empty result falls back to the default.
export function normalizeLayout(raw: unknown, page: LayoutPage, region: RegionKey): PageLayout {
  const available = availableWidgets(page, region);
  const candidate = raw as { widgets?: unknown } | null;
  if (!candidate || !Array.isArray(candidate.widgets)) return defaultLayout(page, region);
  const seen = new Set<string>();
  const widgets: WidgetPlacement[] = [];
  for (const item of candidate.widgets as Array<{ id?: unknown; size?: unknown }>) {
    const definition = available.find((widget) => widget.id === item?.id);
    if (!definition || seen.has(definition.id)) continue;
    seen.add(definition.id);
    const size = isSize(item.size) && definition.sizes.includes(item.size) ? item.size : definition.defaultSize;
    widgets.push({ id: definition.id, size });
  }
  return widgets.length ? { version: LAYOUT_VERSION, widgets } : defaultLayout(page, region);
}

export function hiddenWidgets(layout: PageLayout, page: LayoutPage, region: RegionKey): WidgetDefinition[] {
  const present = new Set(layout.widgets.map((widget) => widget.id));
  return availableWidgets(page, region).filter((widget) => !present.has(widget.id));
}

export function moveWidget(layout: PageLayout, id: string, delta: number): PageLayout {
  const index = layout.widgets.findIndex((widget) => widget.id === id);
  if (index < 0) return layout;
  const target = Math.max(0, Math.min(layout.widgets.length - 1, index + delta));
  if (target === index) return layout;
  const widgets = [...layout.widgets];
  const [moved] = widgets.splice(index, 1);
  widgets.splice(target, 0, moved);
  return { ...layout, widgets };
}

// Drop `id` before (or after) `targetId`.
export function moveWidgetBefore(layout: PageLayout, id: string, targetId: string, edge: "before" | "after" = "before"): PageLayout {
  if (id === targetId) return layout;
  const source = layout.widgets.find((widget) => widget.id === id);
  if (!source) return layout;
  const remaining = layout.widgets.filter((widget) => widget.id !== id);
  const targetIndex = remaining.findIndex((widget) => widget.id === targetId);
  if (targetIndex < 0) return layout;
  const insertAt = edge === "before" ? targetIndex : targetIndex + 1;
  return { ...layout, widgets: [...remaining.slice(0, insertAt), source, ...remaining.slice(insertAt)] };
}

export function resizeWidget(layout: PageLayout, page: LayoutPage, id: string, size: WidgetSize): PageLayout {
  const definition = widgetDefinition(page, id);
  const placement = layout.widgets.find((widget) => widget.id === id);
  if (!definition || !placement || placement.size === size || !definition.sizes.includes(size)) return layout;
  return { ...layout, widgets: layout.widgets.map((widget) => (widget.id === id ? { ...widget, size } : widget)) };
}

// Next allowed size up or down for the widget; stays put at either end.
export function cycleWidgetSize(layout: PageLayout, page: LayoutPage, id: string, direction: 1 | -1): PageLayout {
  const definition = widgetDefinition(page, id);
  const placement = layout.widgets.find((widget) => widget.id === id);
  if (!definition || !placement) return layout;
  const index = definition.sizes.indexOf(placement.size);
  const next = definition.sizes[Math.max(0, Math.min(definition.sizes.length - 1, index + direction))];
  return resizeWidget(layout, page, id, next);
}

export function removeWidget(layout: PageLayout, id: string): PageLayout {
  if (!layout.widgets.some((widget) => widget.id === id)) return layout;
  return { ...layout, widgets: layout.widgets.filter((widget) => widget.id !== id) };
}

export function addWidget(layout: PageLayout, page: LayoutPage, region: RegionKey, id: string): PageLayout {
  if (layout.widgets.some((widget) => widget.id === id)) return layout;
  const definition = availableWidgets(page, region).find((widget) => widget.id === id);
  if (!definition) return layout;
  return { ...layout, widgets: [...layout.widgets, { id, size: definition.defaultSize }] };
}

export function layoutStorageKey(page: LayoutPage, region: RegionKey): string {
  return `it_layout_${page}_${region.toLowerCase()}`;
}

export function loadLayout(page: LayoutPage, region: RegionKey): PageLayout {
  try {
    const raw = localStorage.getItem(layoutStorageKey(page, region));
    return raw ? normalizeLayout(JSON.parse(raw), page, region) : defaultLayout(page, region);
  } catch {
    return defaultLayout(page, region);
  }
}

export function saveLayout(page: LayoutPage, region: RegionKey, layout: PageLayout): void {
  try {
    localStorage.setItem(layoutStorageKey(page, region), JSON.stringify(layout));
  } catch {
    // localStorage unavailable — the arrangement simply won't persist.
  }
}

export function clearLayout(page: LayoutPage, region: RegionKey): void {
  try {
    localStorage.removeItem(layoutStorageKey(page, region));
  } catch {
    // Nothing to clear.
  }
}

export function layoutsEqual(a: PageLayout, b: PageLayout): boolean {
  return a.widgets.length === b.widgets.length && a.widgets.every((widget, index) => widget.id === b.widgets[index].id && widget.size === b.widgets[index].size);
}
