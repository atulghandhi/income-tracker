import type { AppView } from "./routes";

// The sidebar starts with the everyday pages only. The specialist pages (Pay & tax, Allocate,
// Goals) are "tools": a new user adds them from the sidebar's "More tools" list, which flags the
// ones their own data says they need (debts → Allocate, money left over → Goals). A tool not in
// the sidebar still opens from a widget, link or the checklist, and offers to add itself. The
// everyday pages can be hidden too (Settings, or right-click → Hide), except the two the app can't
// do without. What's in the sidebar is saved in the ledger, so it syncs with the account, and in
// localStorage; which suggestions have been seen stays per-device.

export type ToolView = Extract<AppView, "pay" | "allocate" | "goals">;

export const TOOL_VIEWS: ToolView[] = ["goals", "pay", "allocate"];

export function isToolView(view: AppView): view is ToolView {
  return (TOOL_VIEWS as AppView[]).includes(view);
}

// Everyday pages someone can hide. Ledger and Settings always stay: without them there is nothing
// to record money in and no way back to these preferences.
export type HideableView = Extract<AppView, "dashboard" | "accounts" | "subscriptions">;

export const HIDEABLE_VIEWS: HideableView[] = ["dashboard", "accounts", "subscriptions"];

export function isHideableView(view: AppView): view is HideableView {
  return (HIDEABLE_VIEWS as AppView[]).includes(view);
}

// Whether a sidebar item offers "Hide": any tool, or a hideable everyday page.
export function canHide(view: AppView): boolean {
  return isToolView(view) || isHideableView(view);
}

export type NavToolsPrefs = {
  // 2: Goals became a tool and Subscriptions an everyday page (2026-10-28).
  version?: 2;
  pinned: ToolView[];
  // Everyday pages taken out of the sidebar.
  hidden?: HideableView[];
  // Suggestions already shown in the open "Add tools" list, so the badge stops counting them.
  seen: ToolView[];
};

// The part of the preferences saved in the ledger.
export type SidebarChoice = { pinned: ToolView[]; hidden: HideableView[] };

const NAV_TOOLS_KEY = "it_nav_tools";

function cleanTools(value: unknown): ToolView[] {
  if (!Array.isArray(value)) return [];
  return TOOL_VIEWS.filter((tool) => value.includes(tool));
}

function cleanHidden(value: unknown): HideableView[] {
  if (!Array.isArray(value)) return [];
  return HIDEABLE_VIEWS.filter((view) => value.includes(view));
}

export function normalizeSidebarChoice(value: unknown): SidebarChoice {
  const raw = (value ?? {}) as Partial<SidebarChoice>;
  return { pinned: cleanTools(raw.pinned), hidden: cleanHidden(raw.hidden) };
}

// null = never decided on this device; the caller picks a starting set (see initialPinned).
export function readNavTools(): NavToolsPrefs | null {
  try {
    const raw = localStorage.getItem(NAV_TOOLS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NavToolsPrefs>;
    const pinned = cleanTools(parsed.pinned);
    // Goals was always in the sidebar before it became a tool, so it stays for anyone who had it.
    if (parsed.version !== 2 && !pinned.includes("goals")) pinned.unshift("goals");
    return { version: 2, pinned, hidden: cleanHidden(parsed.hidden), seen: cleanTools(parsed.seen) };
  } catch {
    return null;
  }
}

export function writeNavTools(prefs: NavToolsPrefs) {
  try {
    localStorage.setItem(NAV_TOOLS_KEY, JSON.stringify({ ...prefs, version: 2 }));
  } catch {
    // localStorage unavailable — the sidebar simply resets next visit.
  }
}

// Someone who already has data has been using the full sidebar, so they keep every tool; only a
// fresh start gets the short one.
export function initialPinned(hasData: boolean): ToolView[] {
  return hasData ? [...TOOL_VIEWS] : [];
}

export type ToolSuggestionInputs = {
  hasIncome: boolean;
  salaryEntered: boolean;
  debtCount: number;
  monthlySurplus: number;
  hasGoals: boolean;
};

// Why a tool fits this user right now, or null when nothing in their data points to it.
export function toolSuggestions(inputs: ToolSuggestionInputs): Partial<Record<ToolView, string>> {
  const out: Partial<Record<ToolView, string>> = {};
  if (inputs.hasIncome && !inputs.salaryEntered) out.pay = "You've added income";
  if (inputs.debtCount > 0) out.allocate = inputs.debtCount === 1 ? "You have a debt" : `You have ${inputs.debtCount} debts`;
  if (inputs.monthlySurplus > 0 && !inputs.hasGoals) out.goals = "You have money left over each month";
  return out;
}

// The same preferences with one page shown in or hidden from the sidebar.
export function withSidebarItem(prefs: NavToolsPrefs, view: AppView, shown: boolean): NavToolsPrefs {
  if (isToolView(view)) {
    return { ...prefs, pinned: shown ? TOOL_VIEWS.filter((tool) => tool === view || prefs.pinned.includes(tool)) : prefs.pinned.filter((tool) => tool !== view) };
  }
  if (isHideableView(view)) {
    const hidden = prefs.hidden ?? [];
    return { ...prefs, hidden: shown ? hidden.filter((item) => item !== view) : HIDEABLE_VIEWS.filter((item) => item === view || hidden.includes(item)) };
  }
  return prefs;
}

// Suggestions for tools not yet in the sidebar that the user hasn't looked at yet.
export function unseenSuggestionCount(prefs: NavToolsPrefs, suggestions: Partial<Record<ToolView, string>>): number {
  return TOOL_VIEWS.filter((tool) => suggestions[tool] && !prefs.pinned.includes(tool) && !prefs.seen.includes(tool)).length;
}
