// Effort-metric instrumentation (docs/AUTOMATION_PLAN.md §1).
//
// Dependency-free PostHog capture over fetch. Entirely dormant unless the
// deployment sets VITE_POSTHOG_KEY (and optionally VITE_POSTHOG_HOST).
//
// Privacy contract: event names and small numeric/categorical properties only.
// Never transaction descriptions, amounts, merchants, categories, or balances.
// Respects Do Not Track, and trackers identify by Supabase user id (or a random
// local id) — nothing else about the person.

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";
const DISTINCT_ID_KEY = "it_analytics_id";

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
  | "recurring_marked" // { cadence }
  | "ai_suggestions_applied" // { count }
  | "feed_connected"
  | "signed_in";

let identifiedUserId: string | null = null;

export function isAnalyticsEnabled(): boolean {
  if (!POSTHOG_KEY) return false;
  if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") return false;
  return true;
}

export function identifyAnalytics(userId: string | null) {
  identifiedUserId = userId;
}

export function track(event: AnalyticsEvent, properties: Record<string, string | number | boolean> = {}) {
  if (!isAnalyticsEnabled()) return;
  try {
    void fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        distinct_id: identifiedUserId ?? anonymousId(),
        properties: { ...properties, app: "income-tracker-web" },
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {
      // Analytics must never break the app.
    });
  } catch {
    // Same: fire-and-forget.
  }
}

function anonymousId(): string {
  try {
    const existing = localStorage.getItem(DISTINCT_ID_KEY);
    if (existing) return existing;
    const generated = `anon-${crypto.randomUUID()}`;
    localStorage.setItem(DISTINCT_ID_KEY, generated);
    return generated;
  } catch {
    return "anon-ephemeral";
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
