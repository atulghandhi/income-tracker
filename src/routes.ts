// Each app view has its own URL (/dashboard, /ledger, …) so a refresh or a shared link lands on
// the same page instead of bouncing back to the dashboard.

export type AppView = "dashboard" | "ledger" | "accounts" | "pay" | "goals" | "subscriptions" | "allocate" | "settings";

export const APP_VIEWS: AppView[] = ["dashboard", "ledger", "accounts", "pay", "goals", "subscriptions", "allocate", "settings"];

export const DEFAULT_VIEW: AppView = "dashboard";

// The tab title for each app page, and the description its HTML shell carries. The shells are
// noindex (they hold a person's own data, nothing to rank), but Bing still crawls them, and until
// these existed every one of them served the homepage's title and description.
export const VIEW_META: Record<AppView, { title: string; description: string }> = {
  dashboard: { title: "Dashboard", description: "Your month at a glance: income, spending, surplus and the widgets you choose." },
  ledger: { title: "Ledger", description: "Every transaction for the month, income on one side and spending on the other." },
  accounts: { title: "Accounts", description: "Balances, cards and loans that add up to your net worth." },
  pay: { title: "Pay calculator", description: "Work out take-home pay from a gross salary." },
  goals: { title: "Goals", description: "Savings goals with the date you will reach each one." },
  subscriptions: { title: "Subscriptions", description: "Every recurring payment in one place, with price rises flagged." },
  allocate: { title: "Allocate", description: "Decide where this month's surplus goes." },
  settings: { title: "Settings", description: "Country, currency, sync, reminders and data export." },
};

export const SITE_NAME = "The Income Tracker";

export function titleForView(view: AppView): string {
  return `${VIEW_META[view].title} · ${SITE_NAME}`;
}

export function pathForView(view: AppView): string {
  return `/${view}`;
}

// Pages that no longer exist, and where their old links now land. Insights merged into the
// Dashboard on 2026-10-19; the app then rewrites the address to /dashboard.
const RETIRED_VIEWS: Record<string, AppView> = { insights: "dashboard" };

// The view a path names, or null for "/" and anything that is not an app page.
export function viewFromPath(pathname: string): AppView | null {
  const segment = pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (segment in RETIRED_VIEWS) return RETIRED_VIEWS[segment];
  return (APP_VIEWS as string[]).includes(segment) ? (segment as AppView) : null;
}

export function isAppPath(pathname: string): boolean {
  return viewFromPath(pathname) !== null;
}
