// Each app view has its own URL (/dashboard, /ledger, …) so a refresh or a shared link lands on
// the same page instead of bouncing back to the dashboard.

export type AppView = "dashboard" | "ledger" | "accounts" | "pay" | "goals" | "subscriptions" | "allocate" | "settings";

export const APP_VIEWS: AppView[] = ["dashboard", "ledger", "accounts", "pay", "goals", "subscriptions", "allocate", "settings"];

export const DEFAULT_VIEW: AppView = "dashboard";

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
