// Effort-metric instrumentation (docs/AUTOMATION_PLAN.md §1), on the PostHog SDK.
//
// Entirely dormant unless the deployment sets VITE_POSTHOG_KEY. Events go to
// PostHog EU Cloud through our own domain (/ingest, rewritten in vercel.json),
// so ad blockers that block posthog.com don't drop them.
//
// Privacy contract: event names and small numeric/categorical properties only.
// Never transaction descriptions, amounts, merchants, categories, or balances.
// The SDK adds page views and clicks, but with every piece of on-screen text and
// every element attribute masked, so a click on a merchant row records that a row
// was clicked and nothing about the row. No session replay, no exception capture
// (error messages can quote a CSV line). Respects Do Not Track, and identifies by
// Supabase user id only.

import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
// Always our own domain. VITE_POSTHOG_HOST is ignored on purpose: production has it set
// to eu.i.posthog.com, which ad blockers block.
const POSTHOG_HOST = "/ingest";
// The id the old fetch-based tracker kept, so visitors seen before the switch stay one person.
const LEGACY_ID_KEY = "it_analytics_id";

// The §1 effort metrics are derived from these events:
//   touches per transaction → entry_added.method (manual ≈ 4–6, quick_add ≈ 1,
//     autocomplete ≈ 2, seeded/feed = 0)
//   zero-touch rate → month_seeded.count + import_committed.auto vs entry_added
//   review rate → import_reviewed.(check+needs)/rows
//   monthly ledger time → session duration between first/last entry event per day
export type AnalyticsEvent =
  | "entry_added" // { method: "manual"|"quick_add", kind, category_prefilled }
  | "month_seeded" // { count }
  | "import_reviewed" // { source, rows, auto, check, needs }
  | "import_row_corrected" // { source }
  | "import_committed" // { source, imported, transfers }
  | "rule_learned" // { retro_applied }
  | "rename_all" // { renamed: bucket }
  | "recurring_marked" // { cadence }
  | "subscription_cancelled" // { cadence, detected } — detected = it had already stopped being paid
  | "subscription_deleted" // { status }
  | "ai_suggestions_applied" // { count }
  | "feed_connected"
  | "signed_in"
  | "onboarding_completed" // { added: bucket, skipped_steps }
  | "onboarding_skipped" // { added: bucket, skipped_steps }
  | "landing_ref" // { ref } — which static page or CTA sent the visitor to the app
  | "bank_selected" // { bank }
  | "reminder_added" // { method: "ics"|"google" }
  | "new_month_nudge" // { action: "shown"|"import"|"guide"|"dismiss" }
  | "install_prompt" // { action: "shown"|"accepted"|"dismissed"|"ios_hint" }
  | "app_installed"
  | "pdf_notice" // { action: "dismiss"|"import" } — the one-off PDF import announcement
  | "country_changed" // { country }
  | "layout_changed" // { page, action: "move"|"resize"|"remove"|"add"|"reset" }
  | "allocation_changed" // { field: "priority"|"savings_priority"|"lump_sum"|"horizon"|..., value? }
  | "nav_tool"; // { tool, action: "add"|"remove" } — a specialist page added to or removed from the sidebar

let identifiedUserId: string | null = null;
let started = false;

export function isAnalyticsEnabled(): boolean {
  if (!POSTHOG_KEY) return false;
  if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") return false;
  return true;
}

/** Start the SDK once, before the app renders. Records the first page view. */
export function initAnalytics() {
  if (started || !isAnalyticsEnabled()) return;
  started = true;
  posthog.init(POSTHOG_KEY!, {
    api_host: POSTHOG_HOST,
    ui_host: "https://eu.posthog.com",
    defaults: "2026-08-30",
    person_profiles: "identified_only",
    respect_dnt: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    disable_session_recording: true,
    capture_exceptions: false,
    bootstrap: legacyId() ? { distinctID: legacyId()! } : undefined,
  });
  posthog.register({ app: "income-tracker-web" });
}

export function identifyAnalytics(userId: string | null) {
  const previous = identifiedUserId;
  identifiedUserId = userId;
  if (!started) return;
  if (userId) {
    if (userId !== previous) posthog.identify(userId);
  } else if (previous) {
    // Signed out: stop linking this browser's next events to that account.
    posthog.reset();
  }
}

export function track(event: AnalyticsEvent, properties: Record<string, string | number | boolean> = {}) {
  if (!started) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Analytics must never break the app.
  }
}

function legacyId(): string | null {
  try {
    return localStorage.getItem(LEGACY_ID_KEY);
  } catch {
    return null;
  }
}

// Bucket helper so row counts stay coarse (no exact financial footprints).
export function bucketCount(count: number): string {
  if (count <= 0) return "0";
  if (count <= 5) return "1-5";
  if (count <= 20) return "6-20";
  if (count <= 100) return "21-100";
  return "100+";
}
