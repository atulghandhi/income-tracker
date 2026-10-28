import type { AppView } from "./routes";

// The sidebar starts with the everyday pages only. The specialist pages (Pay & tax, Allocate,
// Subscriptions) are "tools": a new user adds them from the sidebar's "Add tools" list, which
// flags the ones their own data says they need (debts → Allocate, recurring payments →
// Subscriptions). A tool not in the sidebar still opens from a widget, link or the checklist,
// and offers to add itself. Which tools are pinned is a per-device view preference, like the
// theme and dashboard layout, so it lives in localStorage.

export type ToolView = Extract<AppView, "pay" | "allocate" | "subscriptions">;

export const TOOL_VIEWS: ToolView[] = ["pay", "allocate", "subscriptions"];

export function isToolView(view: AppView): view is ToolView {
  return (TOOL_VIEWS as AppView[]).includes(view);
}

export type NavToolsPrefs = {
  pinned: ToolView[];
  // Suggestions already shown in the open "Add tools" list, so the badge stops counting them.
  seen: ToolView[];
};

const NAV_TOOLS_KEY = "it_nav_tools";

function cleanTools(value: unknown): ToolView[] {
  if (!Array.isArray(value)) return [];
  return TOOL_VIEWS.filter((tool) => value.includes(tool));
}

// null = never decided on this device; the caller picks a starting set (see initialPinned).
export function readNavTools(): NavToolsPrefs | null {
  try {
    const raw = localStorage.getItem(NAV_TOOLS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NavToolsPrefs>;
    return { pinned: cleanTools(parsed.pinned), seen: cleanTools(parsed.seen) };
  } catch {
    return null;
  }
}

export function writeNavTools(prefs: NavToolsPrefs) {
  try {
    localStorage.setItem(NAV_TOOLS_KEY, JSON.stringify(prefs));
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
  recurringCount: number;
};

// Why a tool fits this user right now, or null when nothing in their data points to it.
export function toolSuggestions(inputs: ToolSuggestionInputs): Partial<Record<ToolView, string>> {
  const out: Partial<Record<ToolView, string>> = {};
  if (inputs.hasIncome && !inputs.salaryEntered) out.pay = "You've added income";
  if (inputs.debtCount > 0) out.allocate = inputs.debtCount === 1 ? "You have a debt" : `You have ${inputs.debtCount} debts`;
  if (inputs.recurringCount > 0) {
    out.subscriptions = inputs.recurringCount === 1 ? "1 recurring payment found" : `${inputs.recurringCount} recurring payments found`;
  }
  return out;
}

// Suggestions for tools not yet in the sidebar that the user hasn't looked at yet.
export function unseenSuggestionCount(prefs: NavToolsPrefs, suggestions: Partial<Record<ToolView, string>>): number {
  return TOOL_VIEWS.filter((tool) => suggestions[tool] && !prefs.pinned.includes(tool) && !prefs.seen.includes(tool)).length;
}
