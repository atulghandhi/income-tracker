// Effort-metric instrumentation (docs/AUTOMATION_PLAN.md §1).
//
// Dependency-free PostHog capture over fetch. Entirely dormant unless the
// deployment sets VITE_POSTHOG_KEY (and optionally VITE_POSTHOG_HOST).
//
// Privacy contract: event names and small numeric/categorical properties only.
// Never transaction descriptions, amounts, merchants, categories, or balances.
// Respects Do Not Track, and trackers identify by Supabase user id (or a random
// local id) — nothing else about the person. Each event also carries the standard
// web context PostHog needs to tell people from bots and pages from each other: the
// browser user agent, the page path, the referring site's domain and any utm_* tags.

import { UI_VERSION } from "./uiVersion.mjs";
import { scrubErrorMessage } from "./errorScrub";

export { UI_VERSION };

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
  | "handoff_import" // { format, found } — a bank guide's drop zone handed a statement file to the app
  | "bank_selected" // { bank }
  | "reminder_added" // { method: "ics"|"google" }
  | "new_month_nudge" // { action: "shown"|"import"|"guide"|"dismiss" }
  | "install_prompt" // { action: "shown"|"accepted"|"dismissed"|"ios_hint" }
  | "app_installed"
  | "pdf_notice" // { action: "dismiss"|"import" } — the one-off PDF import announcement
  | "country_changed" // { country }
  | "layout_changed" // { page, action: "move"|"resize"|"remove"|"add"|"reset" }
  | "allocation_changed" // { field: "priority"|"savings_priority"|"lump_sum"|"horizon"|..., value? }
  | "nav_tool" // { tool, action: "add"|"remove" } — a specialist page added to or removed from the sidebar
  | "undo_used" // {} — a reversible change was undone from its toast or Cmd/Ctrl+Z
  | "palette_opened" // {}
  | "palette_action" // { group } — which kind of command bar result was used; never what was typed
  | "peek_opened" // { kind }
  | "peek_promoted" // { kind }
  | "statement_dropped" // {} — a statement file dropped anywhere on the app
  | "income_grouped" // { action: "create"|"join" } — incomes grouped by drag and drop
  // Homepage conversion (the static pages send static_pageview and cta_click themselves):
  | "landing_view" // { region } — the homepage was shown
  | "landing_cta" // { cta: "hero"|"nav"|"skip"|"closing", region } — a button that opens the app
  | "landing_link" // { area: "nav"|"banks"|"resources"|"faq"|"privacy"|"footer"|..., dest } — a link to a static page
  | "landing_section_seen" // { section, region } — how far down the homepage people get, once per section per visit
  | "client_error" // { kind: "error"|"rejection", message, file, line } — an uncaught error in the browser (scrubbed)


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
        properties: { ...contextProperties(), ...properties, app: "income-tracker-web", ui: UI_VERSION },
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {
      // Analytics must never break the app.
    });
  } catch {
    // Same: fire-and-forget.
  }
}

// What PostHog needs to count a visit as a person rather than a script, and to split traffic
// by page and source: the browser's user agent (without it every event was classed as
// automation and dropped from bot-filtered views), the path (never the query or the fragment)
// and where the visit came from (the referring site's domain only, plus utm_* tags).
const UTM_KEY = "it_utm";
function contextProperties(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    out.$raw_user_agent = navigator.userAgent;
    out.$current_url = `${location.origin}${location.pathname}`;
    out.$pathname = location.pathname;
    out.$host = location.host;
    if (document.referrer) {
      const ref = new URL(document.referrer);
      if (ref.host !== location.host) out.$referring_domain = ref.host;
    }
    // First touch in this tab wins: the app rewrites its URL, so tags are kept for the visit.
    let utm: Record<string, string> = {};
    try {
      utm = JSON.parse(sessionStorage.getItem(UTM_KEY) || "{}");
    } catch {
      utm = {};
    }
    const params = new URLSearchParams(location.search);
    let found = false;
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
      const value = params.get(key);
      if (value && !utm[key]) {
        utm[key] = value.slice(0, 80);
        found = true;
      }
    }
    if (found) {
      try {
        sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
      } catch {
        // Kept for this event only.
      }
    }
    Object.assign(out, utm);
  } catch {
    // Context is a nice-to-have; the event still goes.
  }
  return out;
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

// Uncaught errors in the browser. The app runs entirely client-side, so without this a crash
// on someone's device leaves no trace anywhere (Vercel only logs server functions). Messages
// are scrubbed before sending: digits, emails and anything quoted are masked, so a value
// from someone's ledger can never ride along. At most five reports per page load, each
// distinct message once.
let errorTrackingInstalled = false;
export function installErrorTracking() {
  if (errorTrackingInstalled || typeof window === "undefined") return;
  errorTrackingInstalled = true;
  const seen = new Set<string>();
  const report = (kind: "error" | "rejection", raw: unknown, filename?: string, line?: number) => {
    const text = raw instanceof Error ? `${raw.name}: ${raw.message}` : String(raw ?? "");
    // Browser extensions, cross-origin scripts and a benign layout warning are not ours.
    if (!text || text === "Script error." || /ResizeObserver loop/.test(text)) return;
    if (filename && !filename.startsWith(location.origin)) return;
    const message = scrubErrorMessage(text);
    if (seen.has(message) || seen.size >= 5) return;
    seen.add(message);
    const file = filename ? filename.split("/").pop()?.split("?")[0] ?? "" : "";
    track("client_error", { kind, message, file, line: line ?? 0 });
  };
  window.addEventListener("error", (event) => report("error", event.error ?? event.message, event.filename, event.lineno));
  window.addEventListener("unhandledrejection", (event) => report("rejection", event.reason));
}

// Bucket helper so row counts stay coarse (no exact financial footprints).
export function bucketCount(count: number): string {
  if (count <= 0) return "0";
  if (count <= 5) return "1-5";
  if (count <= 20) return "6-20";
  if (count <= 100) return "21-100";
  return "100+";
}
