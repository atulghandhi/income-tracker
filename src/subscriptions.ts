import { canonicalizeMerchant } from "./importer";
import type { CurrencyCode, ExpenseEntry, LedgerState, SubscriptionPreference } from "./types";

// Subscription tracker — everything the user pays for repeatedly, built locally from the ledger.
//
// Builds on the same idea as recurrence.ts (group by merchant, look for a steady cadence) but goes
// further, because a subscriptions page has to answer harder questions:
//
//   • 4-weekly vs monthly (13 payments a year, not 12) — decided by fitting each candidate cadence
//     as a lattice of expected dates and keeping the one the payments sit closest to, not by the
//     median gap alone.
//   • Annual renewals — two payments a year apart are enough, with the next renewal date predicted.
//   • Price changes — a real increase is a step to a new level that sticks; a subscription billed in
//     another currency wobbles a little every month and must not be flagged.
//   • Separate subscriptions to one payee (three Apple charges on the same descriptor) — payments
//     are clustered by amount before the cadence fit, and clusters that run at the same time stay
//     separate while clusters that follow each other in time merge into one subscription with a
//     price history.
//   • A weekly shop or a salary is not a subscription — incomes are never considered, retailers
//     need an identical amount on a monthly-or-longer cadence, and variable-amount streams only
//     count when they look like a bill.
//   • Working-day drift — a direct debit due on the 1st lands on the 3rd after a bank-holiday
//     weekend, so every cadence has a tolerance window, which the user can widen per subscription.
//   • Cancelled — stops being paid (detected) or flagged by the user; either way it moves to the
//     cancelled list, from which it can be deleted for good. Charges that land after the user
//     cancelled are called out.
//
// Everything is pure and synchronous: detectSubscriptions(state) → SubscriptionReport.

export type SubscriptionCadence = "weekly" | "fortnightly" | "4-weekly" | "monthly" | "quarterly" | "half-yearly" | "annual";

export type SubscriptionKind = "subscription" | "bill";

// active    — paying on schedule
// due       — the expected date (plus tolerance) has passed in the data with no payment yet
// stopped   — no payment for well over a cycle: looks cancelled (detected, not confirmed)
// cancelled — the user flagged it cancelled
// deleted   — the user removed it from the page entirely
export type SubscriptionStatus = "active" | "due" | "stopped" | "cancelled" | "deleted";

// fixed       — the same amount to the penny (Netflix)
// fluctuating — small wobble around a level, typically a foreign-currency charge converted each time
// variable    — a genuinely variable bill (energy, water on a meter)
export type AmountPattern = "fixed" | "fluctuating" | "variable";

export type SubscriptionPayment = {
  date: string; // ISO date; undated manual entries sit on the 1st of their month
  dated: boolean;
  monthKey: string;
  entryId: string;
  amount: number;
  label: string;
};

export type PriceChange = {
  date: string; // first payment at the new price
  from: number;
  to: number;
  percent: number; // signed, e.g. +18.2
  yearlyImpact: number; // signed: (to − from) × cycles per year
  // true once a second payment has landed at the new price (or a later price superseded it);
  // false while only the latest payment shows the new amount.
  confirmed: boolean;
};

export type Subscription = {
  id: string;
  // Id without the per-payee discriminator; preferences saved against either still apply.
  baseId: string;
  key: string; // canonical merchant
  label: string;
  kind: SubscriptionKind;
  kindSource: "auto" | "user";
  category: string;
  color: string;
  cadence: SubscriptionCadence;
  cyclesPerYear: number;
  currentPrice: number;
  yearlyCost: number;
  monthlyEquivalent: number;
  amountPattern: AmountPattern;
  amountRange: { min: number; max: number };
  payments: SubscriptionPayment[]; // ascending by date
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  nextExpected: string | null;
  daysUntilNext: number | null;
  toleranceDays: number;
  toleranceSource: "auto" | "user";
  // "around the 17th", "every 4 weeks on a Friday", "each 14 June"
  scheduleHint: string;
  priceChanges: PriceChange[];
  latestChange: PriceChange | null;
  // The most recent change was an increase inside the last year — the thing to warn about.
  flaggedIncrease: PriceChange | null;
  status: SubscriptionStatus;
  statusDetail: string;
  cancelledAt: string | null;
  chargedAfterCancel: SubscriptionPayment[];
  missedCycles: number;
  confidence: number;
  alreadyRecurring: boolean;
  entryRefs: Array<{ monthKey: string; entryId: string; kind: "expense" }>;
  // Other streams detected for the same payee (separate subscriptions to one merchant).
  siblings: number;
  // Text for the reason a stream was classified as it was; surfaced in the row detail.
  notes: string[];
};

export type SubscriptionReport = {
  today: string;
  // Latest dated transaction in the ledger (never after today): what "no payment since" is judged against.
  dataEnd: string | null;
  dataStale: boolean;
  subscriptions: Subscription[]; // active + due, by yearly cost desc
  bills: Subscription[]; // active + due bills, by yearly cost desc
  cancelled: Subscription[]; // stopped (detected) + cancelled (user); never deleted
  deletedCount: number;
  totals: {
    subscriptionsYearly: number;
    billsYearly: number;
    yearly: number;
    monthly: number;
    activeCount: number;
    increasesCount: number;
    increasesYearlyImpact: number;
    cancelledYearlySaving: number;
    dueCount: number;
    renewalsSoon: Subscription[]; // next payment within 30 days on a quarterly-or-longer cadence
    chargedAfterCancel: Subscription[];
  };
};

export type DetectOptions = {
  today?: string; // ISO date; defaults to the real date
};

export const CYCLES_PER_YEAR: Record<SubscriptionCadence, number> = {
  weekly: 52,
  fortnightly: 26,
  "4-weekly": 13,
  monthly: 12,
  quarterly: 4,
  "half-yearly": 2,
  annual: 1,
};

export const CADENCE_LABEL: Record<SubscriptionCadence, string> = {
  weekly: "Weekly",
  fortnightly: "Every 2 weeks",
  "4-weekly": "Every 4 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  "half-yearly": "Every 6 months",
  annual: "Yearly",
};

// Per-cycle short form for prices: "£9.99/mo", "£95/yr".
export const CADENCE_SHORT: Record<SubscriptionCadence, string> = {
  weekly: "wk",
  fortnightly: "2wk",
  "4-weekly": "4wk",
  monthly: "mo",
  quarterly: "qtr",
  "half-yearly": "6mo",
  annual: "yr",
};

// Days a payment may land early or late and still count as on time. Direct debits move to the
// next working day, so a monthly payment due on the 1st can land on the 4th after Easter.
export const DEFAULT_TOLERANCE_DAYS: Record<SubscriptionCadence, number> = {
  weekly: 1,
  fortnightly: 2,
  "4-weekly": 3,
  monthly: 4,
  quarterly: 5,
  "half-yearly": 7,
  annual: 10,
};

export const TOLERANCE_OPTIONS = [2, 4, 7, 10] as const;

const DAY_MS = 86_400_000;

// ─── Entry point ─────────────────────────────────────────────────────────────

export function detectSubscriptions(state: LedgerState, options: DetectOptions = {}): SubscriptionReport {
  const today = options.today ?? isoDate(new Date());
  const prefs = state.subscriptionPrefs ?? [];
  const currency = state.currency;

  const groups = collectPayments(state, today);
  let dataEnd: string | null = null;
  for (const payments of groups.values()) {
    for (const payment of payments) {
      if (payment.dated && (!dataEnd || payment.date > dataEnd)) dataEnd = payment.date;
    }
  }
  // With no dated rows at all, judge against the end of the latest month that has entries.
  if (!dataEnd) {
    const latestMonth = Object.keys(state.months)
      .filter((monthKey) => (state.months[monthKey]?.expenses.length ?? 0) > 0 && monthKey <= today.slice(0, 7))
      .sort()
      .pop();
    if (latestMonth) {
      const monthEnd = `${latestMonth}-${String(daysInMonth(latestMonth)).padStart(2, "0")}`;
      dataEnd = monthEnd < today ? monthEnd : today;
    }
  }
  const dataStale = Boolean(dataEnd && dayDiff(dataEnd, today) > 45);

  let streams: Stream[] = [];
  // What each payee is paid for outside any stream — one-off purchases. A storefront with plenty
  // of those is a place where a twice-seen amount is more likely another purchase than a plan.
  const oneOffs = new Map<string, { count: number; largest: number }>();
  for (const [merchantKey, payments] of groups) {
    const merchantTolerance = userToleranceForMerchant(prefs, merchantKey);
    const found = detectStreamsForMerchant(merchantKey, payments, merchantTolerance);
    streams.push(...found);
    const claimed = new Set(found.flatMap((stream) => stream.payments.map((payment) => payment.entryId)));
    const rest = payments.filter((payment) => !claimed.has(payment.entryId));
    oneOffs.set(merchantKey, { count: rest.length, largest: rest.reduce((max, payment) => Math.max(max, payment.amount), 0) });
  }

  // A payee sometimes changes its own descriptor — a payment processor update, a rebrand — in the
  // same breath as a price change ("Spotify" £11.99 becomes "Spotify P" £10.99). Two merchant keys
  // that look alike, whose evidenced streams run back-to-back with no gap worth mentioning, are
  // folded into one subscription rather than read as a cancellation and a new signup.
  streams = mergeRenamedMerchants(streams);

  // Assign ids (payee discriminators) and resolve user preferences.
  const byBase = new Map<string, Stream[]>();
  for (const stream of streams) {
    const baseId = `${stream.merchantKey}|${stream.cadence}`;
    stream.baseId = baseId;
    const list = byBase.get(baseId) ?? [];
    list.push(stream);
    byBase.set(baseId, list);
  }
  for (const [baseId, list] of byBase) {
    if (list.length === 1) {
      list[0].id = baseId;
      continue;
    }
    for (const stream of list) stream.id = `${baseId}|${stream.payments[0].amount.toFixed(2)}`;
    // Two plans at the same price (two family iCloud accounts) differ by billing day.
    for (const stream of list) {
      if (list.some((other) => other !== stream && other.id === stream.id)) stream.id = `${stream.id}|d${stream.fit.anchorDay}`;
    }
  }
  const siblingCount = new Map<string, number>();
  for (const stream of streams) siblingCount.set(stream.merchantKey, (siblingCount.get(stream.merchantKey) ?? 0) + 1);

  const applied = new Set<SubscriptionPreference>();
  let subscriptions: Subscription[] = streams.map((stream) => {
    const pref = resolvePreference(prefs, stream, byBase);
    if (pref) applied.add(pref);
    return finalizeStream(stream, pref, { today, dataEnd, currency, siblings: (siblingCount.get(stream.merchantKey) ?? 1) - 1 });
  });
  // Drop the bare-minimum streams a storefront throws up by coincidence. Each one dropped is
  // really a handful of one-off purchases, which is evidence against its siblings — so repeat
  // until nothing more gives way.
  const paymentsAtPayee = new Map(Array.from(groups, ([merchantKey, payments]) => [merchantKey, payments.length]));
  for (;;) {
    const weak = subscriptions.filter((subscription) =>
      weaklyEvidenced(subscription, oneOffs.get(subscription.key), (paymentsAtPayee.get(subscription.key) ?? subscription.occurrences) - subscription.occurrences),
    );
    if (!weak.length) break;
    for (const subscription of weak) {
      const offs = oneOffs.get(subscription.key) ?? { count: 0, largest: 0 };
      oneOffs.set(subscription.key, {
        count: offs.count + subscription.occurrences,
        largest: Math.max(offs.largest, ...subscription.payments.map((payment) => payment.amount)),
      });
    }
    subscriptions = subscriptions.filter((subscription) => !weak.includes(subscription));
  }

  // Cancelled items the detector no longer sees (old months deleted, too few payments left) still
  // belong on the cancelled list — the preference remembers what they were.
  for (const pref of prefs) {
    if (pref.status !== "cancelled" || applied.has(pref) || !pref.label || !pref.cadence) continue;
    subscriptions.push(orphanCancelled(pref));
  }

  const visible = subscriptions.filter((subscription) => subscription.status !== "deleted");
  const live = visible.filter((subscription) => subscription.status === "active" || subscription.status === "due");
  const byCost = (a: Subscription, b: Subscription) => b.yearlyCost - a.yearlyCost || a.label.localeCompare(b.label);
  const activeSubscriptions = live.filter((subscription) => subscription.kind === "subscription").sort(byCost);
  const activeBills = live.filter((subscription) => subscription.kind === "bill").sort(byCost);
  const cancelled = visible
    .filter((subscription) => subscription.status === "stopped" || subscription.status === "cancelled")
    .sort((a, b) => (b.cancelledAt ?? b.lastSeen).localeCompare(a.cancelledAt ?? a.lastSeen) || byCost(a, b));

  const yearAgo = shiftIsoDate(today, -365);
  const increases = live.filter((subscription) => subscription.flaggedIncrease && subscription.flaggedIncrease.date >= yearAgo);
  const subscriptionsYearly = round2(activeSubscriptions.reduce((sum, subscription) => sum + subscription.yearlyCost, 0));
  const billsYearly = round2(activeBills.reduce((sum, subscription) => sum + subscription.yearlyCost, 0));

  return {
    today,
    dataEnd,
    dataStale,
    subscriptions: activeSubscriptions,
    bills: activeBills,
    cancelled,
    deletedCount: subscriptions.length - visible.length,
    totals: {
      subscriptionsYearly,
      billsYearly,
      yearly: round2(subscriptionsYearly + billsYearly),
      monthly: round2((subscriptionsYearly + billsYearly) / 12),
      activeCount: live.length,
      increasesCount: increases.length,
      increasesYearlyImpact: round2(increases.reduce((sum, subscription) => sum + (subscription.flaggedIncrease?.yearlyImpact ?? 0), 0)),
      cancelledYearlySaving: round2(cancelled.reduce((sum, subscription) => sum + subscription.yearlyCost, 0)),
      dueCount: live.filter((subscription) => subscription.status === "due").length,
      renewalsSoon: live
        .filter((subscription) => subscription.cyclesPerYear <= 4 && subscription.daysUntilNext !== null && subscription.daysUntilNext <= 30)
        .sort((a, b) => (a.daysUntilNext ?? 0) - (b.daysUntilNext ?? 0)),
      chargedAfterCancel: cancelled.filter((subscription) => subscription.chargedAfterCancel.length > 0),
    },
  };
}

// The bare-minimum streams a storefront can produce by coincidence. Two rentals a year apart at
// the same price pass every structural test an annual plan does; what gives them away is the
// company they keep — other one-off purchases at the same payee, priced much the same. And a
// stream that was only ever barely evidenced and then stopped was never a subscription we could
// vouch for, so it is not reported as a cancellation either. A decision the user made (status
// "cancelled") is always kept.
function weaklyEvidenced(subscription: Subscription, oneOffs: { count: number; largest: number } | undefined, othersAtPayee: number): boolean {
  if (subscription.status === "cancelled" || subscription.status === "deleted") return false;
  const ambiguous = isAmbiguousSubscriptionMerchant(subscription.key);
  const offs = oneOffs ?? { count: 0, largest: 0 };
  if (subscription.occurrences <= 2 && ambiguous) {
    // Twice-seen, priced among the payee's one-off purchases: just another purchase.
    if (offs.count >= 1 && offs.largest >= subscription.currentPrice / 2) return true;
    // Two renewals at different prices are believable as a plan that went up when they are all
    // the payee is paid for; beside a membership and other purchases they need a third renewal.
    if (subscription.amountRange.max - subscription.amountRange.min >= 0.005 && othersAtPayee > 0) return true;
  }
  // Stopped before it was ever well evidenced, somewhere one-offs are the norm.
  const wellEvidenced = subscription.cyclesPerYear <= 2 ? 3 : 4;
  if (subscription.status === "stopped" && subscription.occurrences < wellEvidenced && (ambiguous || offs.count >= 2)) return true;
  return false;
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export function upsertSubscriptionPreference(state: LedgerState, subscription: Pick<Subscription, "id" | "label" | "cadence" | "currentPrice" | "kind">, patch: Partial<SubscriptionPreference>): LedgerState {
  const prefs = state.subscriptionPrefs ?? [];
  const existing = prefs.find((pref) => pref.id === subscription.id);
  const now = new Date().toISOString();
  const next: SubscriptionPreference = {
    id: subscription.id,
    label: subscription.label,
    cadence: subscription.cadence,
    price: subscription.currentPrice,
    ...existing,
    ...patch,
    updatedAt: now,
  };
  // Dropping the last override removes the preference altogether.
  const meaningful = next.status || next.kind || typeof next.toleranceDays === "number";
  const others = prefs.filter((pref) => pref.id !== subscription.id);
  return { ...state, subscriptionPrefs: meaningful ? [...others, next] : others };
}

export function markSubscriptionCancelled(state: LedgerState, subscription: Subscription, cancelledAt: string): LedgerState {
  const next = upsertSubscriptionPreference(state, subscription, { status: "cancelled", cancelledAt });
  // A cancelled subscription must not be copied into next month by the recurring auto-seed, so the
  // recurring flag comes off its latest entries (history in earlier months is left alone).
  const latestMonth = subscription.payments[subscription.payments.length - 1]?.monthKey;
  if (!latestMonth) return next;
  const refs = new Set(subscription.entryRefs.filter((ref) => ref.monthKey >= latestMonth).map((ref) => `${ref.monthKey}:${ref.entryId}`));
  return setRecurringFlag(next, refs, false);
}

export function reactivateSubscription(state: LedgerState, subscription: Subscription): LedgerState {
  return upsertSubscriptionPreference(state, subscription, { status: undefined, cancelledAt: undefined });
}

export function deleteSubscription(state: LedgerState, subscription: Subscription): LedgerState {
  return upsertSubscriptionPreference(state, subscription, { status: "deleted" });
}

export function restoreDeletedSubscriptions(state: LedgerState): LedgerState {
  const prefs = (state.subscriptionPrefs ?? []).filter((pref) => pref.status !== "deleted");
  return { ...state, subscriptionPrefs: prefs };
}

export function setSubscriptionKind(state: LedgerState, subscription: Subscription, kind: SubscriptionKind | null): LedgerState {
  return upsertSubscriptionPreference(state, subscription, { kind: kind ?? undefined });
}

export function setSubscriptionTolerance(state: LedgerState, subscription: Subscription, toleranceDays: number | null): LedgerState {
  return upsertSubscriptionPreference(state, subscription, { toleranceDays: toleranceDays ?? undefined });
}

// Flags (or unflags) every ledger entry behind a subscription as recurring, so it feeds the forecast.
export function setSubscriptionRecurring(state: LedgerState, subscription: Subscription, recurring: boolean): LedgerState {
  const refs = new Set(subscription.entryRefs.map((ref) => `${ref.monthKey}:${ref.entryId}`));
  return setRecurringFlag(state, refs, recurring);
}

function setRecurringFlag(state: LedgerState, refs: Set<string>, recurring: boolean): LedgerState {
  if (!refs.size) return state;
  const months = Object.fromEntries(
    Object.entries(state.months).map(([monthKey, month]) => [
      monthKey,
      {
        ...month,
        expenses: month.expenses.map((expense: ExpenseEntry) => (refs.has(`${monthKey}:${expense.id}`) && expense.recurring !== recurring ? { ...expense, recurring } : expense)),
      },
    ]),
  );
  return { ...state, months };
}

export function normalizeSubscriptionPrefs(raw: unknown): SubscriptionPreference[] {
  if (!Array.isArray(raw)) return [];
  const prefs: SubscriptionPreference[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    if (!item || typeof item.id !== "string" || !item.id) continue;
    const status = item.status === "cancelled" || item.status === "deleted" ? item.status : undefined;
    const kind = item.kind === "subscription" || item.kind === "bill" ? item.kind : undefined;
    const toleranceDays = typeof item.toleranceDays === "number" && Number.isFinite(item.toleranceDays) ? Math.max(0, Math.min(14, Math.round(item.toleranceDays))) : undefined;
    if (!status && !kind && toleranceDays === undefined) continue;
    prefs.push({
      id: item.id,
      status,
      cancelledAt: typeof item.cancelledAt === "string" ? item.cancelledAt : undefined,
      kind,
      toleranceDays,
      label: typeof item.label === "string" ? item.label : undefined,
      cadence: typeof item.cadence === "string" && item.cadence in CYCLES_PER_YEAR ? (item.cadence as SubscriptionCadence) : undefined,
      price: typeof item.price === "number" && Number.isFinite(item.price) ? item.price : undefined,
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
    });
  }
  return prefs;
}

function userToleranceForMerchant(prefs: SubscriptionPreference[], merchantKey: string): number | null {
  let best: number | null = null;
  for (const pref of prefs) {
    if (typeof pref.toleranceDays !== "number") continue;
    if (pref.id === merchantKey || pref.id.startsWith(`${merchantKey}|`)) best = Math.max(best ?? 0, pref.toleranceDays);
  }
  return best;
}

// The preference for a stream: by id first; otherwise a preference saved for the same payee and
// cadence whose remembered price names this stream and no other. That keeps a decision attached
// when a second stream appears (or disappears) and the discriminator shifts.
function resolvePreference(prefs: SubscriptionPreference[], stream: Stream, byBase: Map<string, Stream[]>): SubscriptionPreference | null {
  const exact = prefs.find((pref) => pref.id === stream.id);
  if (exact) return exact;
  const siblings = byBase.get(stream.baseId) ?? [stream];
  const related = prefs.filter((pref) => (pref.id === stream.baseId || pref.id.startsWith(`${stream.baseId}|`)) && !siblings.some((other) => other.id === pref.id));
  for (const pref of related) {
    if (pref.price === undefined) {
      if (siblings.length === 1) return pref;
      continue;
    }
    const named = siblings.filter((other) => priceNames(pref.price!, other));
    if (named.length === 1 && named[0] === stream) return pref;
  }
  return null;
}

function priceNames(price: number, stream: Stream): boolean {
  const first = stream.payments[0].amount;
  const last = stream.payments[stream.payments.length - 1].amount;
  return Math.abs(price - first) <= amountTolerance(price) || Math.abs(price - last) <= amountTolerance(price);
}

function orphanCancelled(pref: SubscriptionPreference): Subscription {
  const cadence = pref.cadence ?? "monthly";
  const price = pref.price ?? 0;
  const cancelledAt = pref.cancelledAt ?? pref.updatedAt.slice(0, 10);
  return {
    id: pref.id,
    baseId: pref.id,
    key: pref.id.split("|")[0],
    label: pref.label ?? pref.id,
    kind: pref.kind ?? "subscription",
    kindSource: pref.kind ? "user" : "auto",
    category: "",
    color: "#8e98a9",
    cadence,
    cyclesPerYear: CYCLES_PER_YEAR[cadence],
    currentPrice: price,
    yearlyCost: round2(price * CYCLES_PER_YEAR[cadence]),
    monthlyEquivalent: round2((price * CYCLES_PER_YEAR[cadence]) / 12),
    amountPattern: "fixed",
    amountRange: { min: price, max: price },
    payments: [],
    occurrences: 0,
    firstSeen: cancelledAt,
    lastSeen: cancelledAt,
    nextExpected: null,
    daysUntilNext: null,
    toleranceDays: pref.toleranceDays ?? DEFAULT_TOLERANCE_DAYS[cadence],
    toleranceSource: typeof pref.toleranceDays === "number" ? "user" : "auto",
    scheduleHint: "",
    priceChanges: [],
    latestChange: null,
    flaggedIncrease: null,
    status: "cancelled",
    statusDetail: `Cancelled ${formatDate(cancelledAt)}`,
    cancelledAt,
    chargedAfterCancel: [],
    missedCycles: 0,
    confidence: 0,
    alreadyRecurring: false,
    entryRefs: [],
    siblings: 0,
    notes: ["No longer found in the ledger — kept from when it was cancelled."],
  };
}

// ─── Collecting payments ─────────────────────────────────────────────────────

type RawPayment = SubscriptionPayment & {
  category: string;
  color: string;
  recurring: boolean;
  debtLinked: boolean;
  // Pre-parsed once, so the cadence fits (run many times per payee) do no string work.
  dayNumber: number; // days since the epoch
  monthIdx: number; // year × 12 + month − 1
  dayOfMonth: number;
};

function collectPayments(state: LedgerState, today: string): Map<string, RawPayment[]> {
  const groups = new Map<string, RawPayment[]>();
  for (const [monthKey, month] of Object.entries(state.months)) {
    if (!month || !Array.isArray(month.expenses)) continue;
    for (const expense of month.expenses) {
      if (!(expense.amount > 0)) continue;
      // Money moved to the user's own accounts is not something they are paying for.
      if (expense.toAccountId) continue;
      if (isTransferCategory(expense.category)) continue;
      // Placeholder rows the app adds for scheduled debt payments are plans, not payments.
      if (expense.scheduledPayment) continue;
      const dated = Boolean(expense.date && /^\d{4}-\d{2}-\d{2}$/.test(expense.date));
      const date = dated ? expense.date! : `${monthKey}-01`;
      // Nothing from the future: auto-seeded rows for later this month are expectations.
      if (date > today) continue;
      const key = canonicalizeMerchant(expense.name);
      if (!key) continue;
      const list = groups.get(key) ?? [];
      list.push({
        date,
        dated,
        monthKey,
        entryId: expense.id,
        amount: round2(expense.amount),
        label: expense.name,
        category: expense.category ?? "",
        color: expense.color,
        recurring: Boolean(expense.recurring),
        debtLinked: Boolean(expense.debtAccountId),
        dayNumber: dayNumberOf(date),
        monthIdx: monthIndex(date.slice(0, 7)),
        dayOfMonth: Number(date.slice(8, 10)),
      });
      groups.set(key, list);
    }
  }
  for (const list of groups.values()) list.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
  return groups;
}

function isTransferCategory(category: string): boolean {
  const normalized = category.trim().toLowerCase();
  return normalized === "transfers" || normalized === "transfer" || normalized === "savings";
}

// ─── Streams: amount clusters with a cadence ─────────────────────────────────

type Stream = {
  id: string;
  baseId: string;
  merchantKey: string;
  payments: RawPayment[];
  cadence: SubscriptionCadence;
  fit: CadenceFit;
  amountPattern: AmountPattern;
  toleranceDays: number;
  toleranceSource: "auto" | "user";
  notes: string[];
  confidence: number;
};

type CadenceFit = {
  cadence: SubscriptionCadence;
  meanResidual: number;
  inWindow: number; // fraction of payments within tolerance
  missedCycles: number;
  duplicateCycles: number;
  anchorDay: number; // day of month for calendar cadences; weekday (0–6) for fixed-period ones
  anchorMonth: number; // absolute month index (year*12 + month-1) for quarterly and longer
  periodDays: number | null; // fixed-period cadences
  periodMonths: number | null; // calendar cadences
};

const CALENDAR_PERIODS: Array<[SubscriptionCadence, number]> = [
  ["monthly", 1],
  ["quarterly", 3],
  ["half-yearly", 6],
  ["annual", 12],
];
const FIXED_PERIODS: Array<[SubscriptionCadence, number]> = [
  ["weekly", 7],
  ["fortnightly", 14],
  ["4-weekly", 28],
];

function detectStreamsForMerchant(merchantKey: string, payments: RawPayment[], userTolerance: number | null): Stream[] {
  if (payments.length < 2) return [];
  const retail = isRetailMerchant(merchantKey);
  const streams: Stream[] = [];

  // Pass 1 — tight amount clusters (the same price, give or take conversion noise).
  const leftovers: RawPayment[] = [];
  const fitted: Array<{ payments: RawPayment[]; fit: CadenceFit }> = [];
  const tryPiece = (piece: RawPayment[], splitsLeft: number) => {
    const fit = bestCadence(piece, userTolerance);
    if (fit && acceptStream(piece, fit, retail, merchantKey)) {
      fitted.push({ payments: piece, fit });
      return;
    }
    // A subscription cancelled and taken out again bills on a new day of the month: two runs.
    // Two levels of splitting cover that; deeper would just be carving up noise.
    const halves = splitsLeft > 0 ? splitOnScheduleShift(piece) : null;
    if (halves) {
      for (const half of halves) tryPiece(half, splitsLeft - 1);
      return;
    }
    leftovers.push(...piece);
  };
  for (const cluster of clusterByAmount(payments, "tight")) {
    for (const piece of splitByDayOfMonth(cluster)) tryPiece(piece, 2);
  }

  // Pass 1b — a price that changed between too few payments to cluster (two annual renewals at
  // £95 then £99) only shows up with a looser grouping. Retailers are left out: similar-sized
  // shops a month apart are not a subscription.
  if (!retail && leftovers.length >= 2) {
    const again = leftovers.splice(0, leftovers.length);
    const loose = clusterByAmount(again, "loose");
    for (const cluster of loose) {
      const fit = bestCadence(cluster, userTolerance);
      const pattern = amountPatternOf(cluster.map((payment) => payment.amount));
      // If another payment to the payee sits on this schedule inside the run, the run is only part
      // of a variable bill, not a fixed price that changed.
      const members = new Set(cluster);
      const others = again.filter((payment) => !members.has(payment));
      const complete = fit ? !others.some((payment) => payment.date > cluster[0].date && payment.date < cluster[cluster.length - 1].date && onSchedule(fit, cluster, payment, userTolerance)) : false;
      if (fit && complete && pattern !== "variable" && acceptStream(cluster, fit, retail, merchantKey, true)) fitted.push({ payments: cluster, fit });
      else leftovers.push(...cluster);
    }
  }

  // Pass 2 — merge clusters that follow one another in time on the same cadence: one subscription
  // whose price changed. Clusters that overlap in time are separate subscriptions to the payee.
  const merged = mergeSequential(fitted, userTolerance);
  // A payment at a new price that has only happened once (or twice) never formed a cluster of its
  // own; if it lands where the next payment was expected, it belongs to that subscription.
  const unclaimed = absorbLeftovers(merged, leftovers, userTolerance);
  for (const item of merged) {
    const cadence = item.fit.cadence;
    const tolerance = effectiveTolerance(cadence, userTolerance);
    streams.push({
      id: "",
      baseId: "",
      merchantKey,
      payments: item.payments,
      cadence,
      fit: item.fit,
      amountPattern: amountPatternOf(item.payments.map((payment) => payment.amount)),
      toleranceDays: tolerance,
      toleranceSource: userTolerance !== null ? "user" : "auto",
      notes: [],
      confidence: 0,
    });
  }

  // Pass 3 — a variable bill (energy, water) or a flexible subscription (a meal box ordered in a
  // different size each time) repeats on a cadence but never at the same amount. Only a known
  // subscription payee or a bill-like one qualifies; a supermarket shop never does.
  if (unclaimed.length >= 3 && !retail) {
    const variable = detectVariableStream(merchantKey, unclaimed, userTolerance);
    if (variable) streams.push(variable);
  }

  return streams;
}

// Sorted amounts split wherever neighbours are further apart than conversion noise would put them
// ("tight"), or than a price rise would ("loose").
function clusterByAmount(payments: RawPayment[], mode: "tight" | "loose"): RawPayment[][] {
  const sorted = [...payments].sort((a, b) => a.amount - b.amount);
  const clusters: RawPayment[][] = [];
  let current: RawPayment[] = [];
  for (const payment of sorted) {
    const previous = current[current.length - 1];
    const limit = mode === "tight" ? amountTolerance(previous?.amount ?? 0) : Math.max(1, (previous?.amount ?? 0) * 0.25);
    // A cluster also has a ceiling on its total spread, or a shop's hundreds of random amounts
    // chain into one cluster a few pence at a time.
    const lowest = current[0]?.amount ?? 0;
    const spread = mode === "tight" ? 2.5 * amountTolerance(lowest) : Math.max(1.5, lowest * 0.35);
    if (previous && (payment.amount - previous.amount > limit || payment.amount - lowest > spread)) {
      clusters.push(current);
      current = [];
    }
    current.push(payment);
  }
  if (current.length) clusters.push(current);
  return clusters.map((cluster) => cluster.sort((a, b) => a.date.localeCompare(b.date)));
}

// Conversion noise: a few percent either way. Two plans priced 3% apart would share a cluster,
// but the price-history pass still separates them as a step change.
function amountTolerance(amount: number): number {
  return Math.max(0.3, Math.abs(amount) * 0.04);
}

// Two subscriptions to one payee at the same price (two family iCloud plans) land in one cluster
// with two payments a month. Split on the biggest circular gap in day-of-month when each side
// holds a run of its own.
function splitByDayOfMonth(cluster: RawPayment[]): RawPayment[][] {
  const dated = cluster.filter((payment) => payment.dated);
  // Each side needs three payments to ever be accepted (minimumOccurrences), so six total is the
  // earliest point splitting could possibly pay off.
  if (dated.length < 6 || dated.length !== cluster.length) return [cluster];
  const months = new Set(cluster.map((payment) => payment.monthKey));
  // Only worth trying once there is real overlap evidence — at least one month saw two payments.
  // A strict ~2×-per-month average would miss two plans that started in different months.
  if (cluster.length <= months.size) return [cluster];
  const days = cluster.map((payment) => payment.dayOfMonth);
  const unique = Array.from(new Set(days)).sort((a, b) => a - b);
  if (unique.length < 2) return [cluster];
  let bestGap = 0;
  let splitAfter = -1;
  for (let index = 0; index < unique.length; index += 1) {
    const next = unique[(index + 1) % unique.length];
    const gap = index === unique.length - 1 ? next + 31 - unique[index] : next - unique[index];
    if (gap > bestGap) {
      bestGap = gap;
      splitAfter = index;
    }
  }
  // Second largest gap marks the other boundary.
  let secondGap = 0;
  let secondAfter = -1;
  for (let index = 0; index < unique.length; index += 1) {
    if (index === splitAfter) continue;
    const next = unique[(index + 1) % unique.length];
    const gap = index === unique.length - 1 ? next + 31 - unique[index] : next - unique[index];
    if (gap > secondGap) {
      secondGap = gap;
      secondAfter = index;
    }
  }
  if (bestGap < 7 || secondGap < 7 || secondAfter < 0) return [cluster];
  const boundaryA = unique[Math.min(splitAfter, secondAfter)];
  const boundaryB = unique[Math.max(splitAfter, secondAfter)];
  const groupA: RawPayment[] = [];
  const groupB: RawPayment[] = [];
  for (const payment of cluster) (payment.dayOfMonth > boundaryA && payment.dayOfMonth <= boundaryB ? groupA : groupB).push(payment);
  if (groupA.length < 3 || groupB.length < 3) return [cluster];
  return [groupA, groupB];
}

// Whether a payment falls where the stream's schedule would put one (inside the tolerance).
function onSchedule(fit: CadenceFit, stream: RawPayment[], payment: RawPayment, userTolerance: number | null): boolean {
  const tolerance = effectiveTolerance(fit.cadence, userTolerance);
  if (fit.periodDays) {
    const offset = payment.dayNumber - stream[0].dayNumber;
    const residual = Math.abs(offset - Math.round(offset / fit.periodDays) * fit.periodDays);
    return residual <= tolerance;
  }
  return Math.abs(payment.dayNumber - dayNumberFor(cycleMonth(payment, fit.anchorDay), fit.anchorDay)) <= tolerance;
}

// Where the day of the month jumps by a week or more between consecutive payments, the schedule
// changed; each side is tried on its own.
function splitOnScheduleShift(payments: RawPayment[]): RawPayment[][] | null {
  if (payments.length < 6 || payments.some((payment) => !payment.dated)) return null;
  let bestIndex = -1;
  let bestJump = 0;
  for (let index = 1; index < payments.length; index += 1) {
    const previous = payments[index - 1].dayOfMonth;
    const current = payments[index].dayOfMonth;
    const jump = Math.min(Math.abs(current - previous), 31 - Math.abs(current - previous));
    if (jump > bestJump) {
      bestJump = jump;
      bestIndex = index;
    }
  }
  if (bestJump < 7 || bestIndex < 3 || payments.length - bestIndex < 3) return null;
  return [payments.slice(0, bestIndex), payments.slice(bestIndex)];
}

function effectiveTolerance(cadence: SubscriptionCadence, userTolerance: number | null): number {
  const base = DEFAULT_TOLERANCE_DAYS[cadence];
  if (userTolerance === null) return base;
  // Weekly cadences cannot stretch beyond half a period or every date fits.
  if (cadence === "weekly") return Math.min(userTolerance, 2);
  if (cadence === "fortnightly") return Math.min(userTolerance, 4);
  return Math.max(base, userTolerance);
}

// Try every cadence as a lattice of expected dates and keep the one the payments fit best.
function bestCadence(payments: RawPayment[], userTolerance: number | null): CadenceFit | null {
  if (payments.length < 2) return null;
  const allUndated = payments.every((payment) => !payment.dated);
  const candidates: CadenceFit[] = [];

  if (!allUndated) {
    for (const [cadence, period] of FIXED_PERIODS) {
      if (payments.some((payment) => !payment.dated)) continue;
      const fit = fitFixedPeriod(payments, cadence, period, effectiveTolerance(cadence, userTolerance));
      if (fit) candidates.push(fit);
    }
  }
  for (const [cadence, months] of CALENDAR_PERIODS) {
    if (allUndated && cadence !== "monthly") continue;
    const fit = fitCalendar(payments, cadence, months, effectiveTolerance(cadence, userTolerance));
    if (fit) candidates.push(fit);
  }

  // One duplicate per six payments (a retried charge) is forgiven; more means the cadence is wrong.
  const accepted = candidates.filter(
    (fit) => fit.inWindow >= 0.8 && fit.duplicateCycles <= Math.floor(payments.length / 6) && fit.missedCycles <= Math.max(1, Math.floor(payments.length * 0.5)),
  );
  if (!accepted.length) return null;
  // Closest fit wins; on a tie the cadence that explains every payment without gaps (two payments
  // six months apart are half-yearly, not quarterly with one missing).
  accepted.sort((a, b) => a.meanResidual - b.meanResidual || a.missedCycles - b.missedCycles || b.inWindow - a.inWindow || cadenceRank(a.cadence) - cadenceRank(b.cadence));
  return accepted[0];
}

// Ties go to the cadence people actually mean: monthly before 4-weekly, and so on.
function cadenceRank(cadence: SubscriptionCadence): number {
  return ["monthly", "annual", "quarterly", "4-weekly", "weekly", "fortnightly", "half-yearly"].indexOf(cadence);
}

function fitFixedPeriod(payments: RawPayment[], cadence: SubscriptionCadence, period: number, tolerance: number): CadenceFit | null {
  const first = payments[0].dayNumber;
  let residualSum = 0;
  let inWindowCount = 0;
  const cycles = new Set<number>();
  let duplicates = 0;
  for (const payment of payments) {
    const offset = payment.dayNumber - first;
    const cycle = Math.round(offset / period);
    const residual = Math.abs(offset - cycle * period);
    residualSum += residual;
    if (residual <= tolerance) inWindowCount += 1;
    if (cycles.has(cycle)) duplicates += 1;
    cycles.add(cycle);
  }
  const span = Math.round((payments[payments.length - 1].dayNumber - first) / period);
  const missed = Math.max(0, span + 1 - cycles.size);
  // Weekday the payments mostly fall on (day 0 of the epoch was a Thursday).
  const weekdays = payments.map((payment) => (((payment.dayNumber + 4) % 7) + 7) % 7);
  return {
    cadence,
    meanResidual: residualSum / payments.length,
    inWindow: inWindowCount / payments.length,
    missedCycles: missed,
    duplicateCycles: duplicates,
    anchorDay: mode(weekdays),
    anchorMonth: payments[0].monthIdx,
    periodDays: period,
    periodMonths: null,
  };
}

function fitCalendar(payments: RawPayment[], cadence: SubscriptionCadence, months: number, tolerance: number): CadenceFit | null {
  const dated = payments.filter((payment) => payment.dated);
  const anchorDay = dated.length ? circularMedianDay(dated.map((payment) => payment.dayOfMonth)) : 1;
  const anchorMonth = payments[0].dated ? cycleMonth(payments[0], anchorDay) : payments[0].monthIdx;
  let residualSum = 0;
  let inWindowCount = 0;
  const cycles = new Set<number>();
  let duplicates = 0;
  for (const payment of payments) {
    const month = payment.dated ? cycleMonth(payment, anchorDay) : payment.monthIdx;
    const cycle = Math.round((month - anchorMonth) / months);
    const expectedMonth = anchorMonth + cycle * months;
    const residual = payment.dated ? Math.abs(payment.dayNumber - dayNumberFor(expectedMonth, anchorDay)) : 0;
    residualSum += residual;
    if (residual <= tolerance) inWindowCount += 1;
    if (cycles.has(cycle)) duplicates += 1;
    cycles.add(cycle);
  }
  const lastPayment = payments[payments.length - 1];
  const lastMonth = lastPayment.dated ? cycleMonth(lastPayment, anchorDay) : lastPayment.monthIdx;
  const span = Math.round((lastMonth - anchorMonth) / months);
  const missed = Math.max(0, span + 1 - cycles.size);
  return {
    cadence,
    meanResidual: residualSum / payments.length,
    inWindow: inWindowCount / payments.length,
    missedCycles: missed,
    duplicateCycles: duplicates,
    anchorDay,
    anchorMonth,
    periodDays: null,
    periodMonths: months,
  };
}

// The month a payment belongs to on a same-day-each-month schedule, from its pre-parsed fields.
function cycleMonth(payment: RawPayment, anchorDay: number): number {
  if (anchorDay - payment.dayOfMonth > 15) return payment.monthIdx - 1;
  if (payment.dayOfMonth - anchorDay > 15) return payment.monthIdx + 1;
  return payment.monthIdx;
}

// Two matching payments are enough for a cadence long enough that they already span a year or
// more (half-yearly, annual), or for an unambiguous subscription seller billing an identical
// amount — a two-month-old Netflix is still obviously Netflix. Everything else waits for a third
// payment: two matching amounts a month or a quarter apart are surprisingly easy to hit by
// coincidence (a pair of movie rentals from a storefront that also holds a subscription).
function minimumOccurrences(cadence: SubscriptionCadence, exact: boolean, unambiguousSubscription: boolean): number {
  if (cadence === "weekly" || cadence === "fortnightly") return 4;
  if (cadence === "annual" || cadence === "half-yearly") return 2;
  return exact && unambiguousSubscription ? 2 : 3;
}

function acceptStream(payments: RawPayment[], fit: CadenceFit, retail: boolean, merchantKey: string, loose = false): boolean {
  const amounts = payments.map((payment) => payment.amount);
  const exact = amountPatternOf(amounts) === "fixed";
  const category = latestCategory(payments);
  const known = looksLikeSubscription(merchantKey, category);
  // A storefront that also sells one-off goods or rentals under the very same descriptor (Amazon,
  // Apple, a game store) needs a third payment before two coincidentally-matching purchases count;
  // a merchant that is unambiguously a subscription seller does not.
  const ambiguous = isAmbiguousSubscriptionMerchant(merchantKey);
  let minimum = minimumOccurrences(fit.cadence, exact, known && !ambiguous);
  // Loosely grouped amounts (a price rise between few payments) need more evidence unless the
  // cadence itself is long: two annual renewals at different prices are the whole point.
  if (loose && fit.cadence !== "annual" && fit.cadence !== "half-yearly") minimum = Math.max(minimum, 3);
  if (payments.length < minimum) return false;
  // At a storefront, a history still under six payments cannot have skipped a cycle: three
  // rentals that happen to land on similar days are not a plan with a month off.
  if (ambiguous && payments.length < 6 && fit.missedCycles > 0) return false;
  // A supermarket or coffee shop only counts with an identical amount, monthly or longer — the
  // shape of a Clubcard Plus or a mobile plan, never of a weekly shop.
  if (retail && (!exact || CYCLES_PER_YEAR[fit.cadence] > 13)) return false;
  // Weekly spending at a merchant that is not a known subscription needs an identical amount.
  if ((fit.cadence === "weekly" || fit.cadence === "fortnightly") && !exact && !known) return false;
  return true;
}

function mergeSequential(fitted: Array<{ payments: RawPayment[]; fit: CadenceFit }>, userTolerance: number | null): Array<{ payments: RawPayment[]; fit: CadenceFit }> {
  if (fitted.length < 2) return fitted;
  const items = fitted
    .map((item) => ({ ...item, first: item.payments[0].date, last: item.payments[item.payments.length - 1].date }))
    .sort((a, b) => a.first.localeCompare(b.first));
  const result: Array<{ payments: RawPayment[]; fit: CadenceFit; first: string; last: string }> = [];
  for (const item of items) {
    const previous = result[result.length - 1];
    if (previous && previous.fit.cadence === item.fit.cadence && previous.last < item.first && plausiblePriceStep(previous, item)) {
      const payments = [...previous.payments, ...item.payments].sort((a, b) => a.date.localeCompare(b.date));
      const fit = bestCadence(payments, userTolerance);
      if (fit && fit.cadence === item.fit.cadence) {
        previous.payments = payments;
        previous.fit = fit;
        previous.last = item.last;
        continue;
      }
    }
    result.push(item);
  }
  return result.map(({ payments, fit }) => ({ payments, fit }));
}

// ─── Renamed payees ──────────────────────────────────────────────────────────
// A payee occasionally changes its own descriptor — a card-processor update, a rebrand, a VAT
// registration change — sometimes in the same breath as a price change. Two independently-evidenced
// streams under different (but similar-looking) merchant keys, running back-to-back with no real
// gap, are one subscription that was renamed, not a cancellation followed by a new signup.

// How many days one cycle of a cadence nominally spans, for judging whether a gap between two
// streams looks like an ordinary continuation.
function approxCycleDays(cadence: SubscriptionCadence): number {
  return 365 / CYCLES_PER_YEAR[cadence];
}

// A conservative "this could be the same payee" check: one descriptor is the other with a short
// suffix or prefix added (a processor tag, a single extra word), not just any shared word. "Sky"
// and "Skype" must not match; "Spotify" and "Spotify P" must.
export function merchantKeysSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  const longer = Math.max(a.length, b.length);
  if (shorter < 5 || longer - shorter > 3) return false;
  return a.startsWith(b) || b.startsWith(a);
}

// Merges pairs of streams under different, similar-looking merchant keys that run back-to-back in
// time (one ends as the other begins, roughly one cycle apart) at a plausible price. Greedy and
// repeated so a chain of renames (A → B → C) collapses in one go; each merge picks the best-scoring
// pair left so an ambiguous middle stream does not get claimed by the wrong neighbour first.
function mergeRenamedMerchants(streams: Stream[]): Stream[] {
  const pool = [...streams];
  for (;;) {
    let best: { i: number; j: number; score: number; fit: CadenceFit; payments: RawPayment[] } | null = null;
    for (let i = 0; i < pool.length; i += 1) {
      for (let j = 0; j < pool.length; j += 1) {
        if (i === j) continue;
        const earlier = pool[i];
        const later = pool[j];
        if (earlier.merchantKey === later.merchantKey) continue;
        if (earlier.cadence !== later.cadence) continue;
        if (!merchantKeysSimilar(earlier.merchantKey, later.merchantKey)) continue;
        const earlierLast = earlier.payments[earlier.payments.length - 1];
        const laterFirst = later.payments[0];
        if (earlierLast.dayNumber >= laterFirst.dayNumber) continue; // must be strictly sequential
        const cycleDays = approxCycleDays(earlier.cadence);
        const gap = laterFirst.dayNumber - earlierLast.dayNumber;
        // Roughly a normal gap to half a cycle late, allowing for one missed payment either side
        // of the rename — not a multi-year coincidence of two otherwise-unrelated payees.
        if (gap < cycleDays * 0.4 || gap > cycleDays * 2.5) continue;
        if (!plausiblePriceStep({ payments: earlier.payments }, { payments: later.payments })) continue;
        const combined = [...earlier.payments, ...later.payments].sort((a, b) => a.dayNumber - b.dayNumber);
        const fit = bestCadence(combined, null);
        if (!fit || fit.cadence !== earlier.cadence) continue;
        const priceDelta = Math.abs(median(later.payments.map((p) => p.amount)) - median(earlier.payments.map((p) => p.amount)));
        const score = Math.abs(gap - cycleDays) + priceDelta;
        if (!best || score < best.score) best = { i, j, score, fit, payments: combined };
      }
    }
    if (!best) break;
    const earlier = pool[best.i];
    const later = pool[best.j];
    const merged: Stream = {
      id: "",
      baseId: "",
      merchantKey: later.merchantKey, // the payee's current descriptor
      payments: best.payments,
      cadence: best.fit.cadence,
      fit: best.fit,
      amountPattern: amountPatternOf(best.payments.map((payment) => payment.amount)),
      toleranceDays: later.toleranceDays,
      toleranceSource: later.toleranceSource,
      notes: [
        ...earlier.notes,
        ...later.notes,
        `Billed as “${displayLabel(earlier.payments)}” until ${formatDate(earlierLastDate(earlier))}, then as “${displayLabel(later.payments)}”.`,
      ],
      confidence: 0,
    };
    const [lo, hi] = best.i < best.j ? [best.i, best.j] : [best.j, best.i];
    pool.splice(hi, 1);
    pool.splice(lo, 1);
    pool.push(merged);
  }
  return pool;
}

function earlierLastDate(stream: Stream): string {
  return stream.payments[stream.payments.length - 1].date;
}

// Leftover payments that sit exactly where a stream expected its next (or previous) payment, at a
// plausible price, extend that stream. Returns what is still unclaimed, in date order.
function absorbLeftovers(streams: Array<{ payments: RawPayment[]; fit: CadenceFit }>, leftovers: RawPayment[], userTolerance: number | null): RawPayment[] {
  let remaining = [...leftovers].sort((a, b) => a.dayNumber - b.dayNumber);
  if (!streams.length) return remaining;
  // Each pass walks the leftovers once; a stream that grew may reach further on the next pass.
  for (let pass = 0; pass < 6 && remaining.length; pass += 1) {
    const unclaimed: RawPayment[] = [];
    for (const payment of remaining) {
      let taken = false;
      for (const stream of streams) {
        const cadence = stream.fit.cadence;
        const tolerance = effectiveTolerance(cadence, userTolerance);
        const first = stream.payments[0];
        const last = stream.payments[stream.payments.length - 1];
        let expected: number;
        let neighbour: RawPayment;
        if (payment.dayNumber > last.dayNumber) {
          expected = predictNextDayNumber(stream.fit, last, 1);
          neighbour = last;
        } else if (payment.dayNumber < first.dayNumber) {
          expected = predictNextDayNumber(stream.fit, first, -1);
          neighbour = first;
        } else continue;
        if (Math.abs(expected - payment.dayNumber) > tolerance) continue;
        // A single unmatched payment is weaker evidence than two clusters that each independently
        // earned their place (plausiblePriceStep, used below for those) — a movie rental at a
        // quarter of Prime's monthly price should not read as Prime's price dropping 75%. Extending
        // a stream on one payment alone needs a much more modest move.
        if (!plausibleSingleStep(neighbour.amount, payment.amount)) continue;
        const payments = [...stream.payments, payment].sort((a, b) => a.dayNumber - b.dayNumber);
        const fit = bestCadence(payments, userTolerance);
        if (!fit || fit.cadence !== cadence) continue;
        stream.payments = payments;
        stream.fit = fit;
        taken = true;
        break;
      }
      if (!taken) unclaimed.push(payment);
    }
    if (unclaimed.length === remaining.length) break;
    remaining = unclaimed;
  }
  return remaining;
}

// The next (or previous) lattice point from a payment, as a day number.
function predictNextDayNumber(fit: CadenceFit, from: RawPayment, direction: 1 | -1): number {
  if (fit.periodDays) return from.dayNumber + fit.periodDays * direction;
  const months = fit.periodMonths ?? 1;
  return dayNumberFor(cycleMonth(from, fit.anchorDay) + months * direction, fit.anchorDay);
}

// A price change keeps the same order of magnitude; iCloud 0.99 followed by Apple Music 10.99 is
// a different subscription, not a 1,000% increase. Used to merge two clusters that have each
// already independently earned a place as a stream (several payments apiece), so a fairly generous
// band is safe.
function plausiblePriceStep(previous: { payments: RawPayment[] }, next: { payments: RawPayment[] }): boolean {
  const from = median(previous.payments.map((payment) => payment.amount));
  const to = median(next.payments.map((payment) => payment.amount));
  if (from <= 0 || to <= 0) return false;
  const ratio = Math.max(from, to) / Math.min(from, to);
  return ratio <= 3 || Math.abs(to - from) <= 5;
}

// A single leftover payment extending a stream is much weaker evidence than two independently
// accepted clusters — it has not earned its place yet, so the price move it implies has to look
// like an ordinary rise or fall, not a coincidence. A £8.99 subscription does not drop to £4.99
// for one month and go back; that is a separate, unrelated purchase landing near the due date.
function plausibleSingleStep(from: number, to: number): boolean {
  if (from <= 0 || to <= 0) return false;
  const ratio = Math.max(from, to) / Math.min(from, to);
  return ratio <= 1.6 || Math.abs(to - from) <= 2;
}

// A recurring payment that never settles on one amount: a utility bill on a meter, or a
// subscription where each order can differ (a meal box picked in a different size each week). The
// two are told apart only by the payee: a known subscription word allows any cadence including
// weekly, since that is how those are billed; an ordinary bill only makes sense monthly or longer.
// A merchant that is neither — and any discretionary spending, a takeaway, a shop — is left alone.
function detectVariableStream(merchantKey: string, payments: RawPayment[], userTolerance: number | null): Stream | null {
  if (payments.length < 3) return null;
  const category = latestCategory(payments);
  const knownSubscription = looksLikeSubscription(merchantKey, category);
  const billLike = !knownSubscription && (looksLikeBill(merchantKey, category) || isBillCategory(category));
  if (!knownSubscription && !billLike) return null;
  if (billLike && isDiscretionaryCategory(category)) return null;
  const amounts = payments.map((payment) => payment.amount);
  // Only amounts that genuinely vary belong here. Identical or stepping amounts already had their
  // chance as a fixed-price stream and were turned down for their cadence; this pass must not
  // give them a second, laxer hearing.
  if (amountPatternOf(amounts) !== "variable") return null;
  const sorted = [...amounts].sort((a, b) => a - b);
  if (sorted[0] <= 0) return null;
  // A meal box's smallest and largest order can differ more than a utility bill's readings do.
  if (sorted[sorted.length - 1] > sorted[0] * (knownSubscription ? 6 : 3)) return null;
  const periods = knownSubscription ? [...FIXED_PERIODS, ...CALENDAR_PERIODS] : CALENDAR_PERIODS;
  const candidates: CadenceFit[] = [];
  const fixedCadences = new Set(FIXED_PERIODS.map(([cadence]) => cadence));
  const allDated = payments.every((payment) => payment.dated);
  for (const [cadence, period] of periods) {
    if (fixedCadences.has(cadence) && !allDated) continue;
    const tolerance = effectiveTolerance(cadence, userTolerance);
    const computed = fixedCadences.has(cadence) ? fitFixedPeriod(payments, cadence, period, tolerance) : fitCalendar(payments, cadence, period, tolerance);
    if (computed && computed.inWindow >= 0.8 && computed.duplicateCycles === 0 && computed.missedCycles <= Math.max(1, Math.floor(payments.length * 0.34))) {
      candidates.push(computed);
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.meanResidual - b.meanResidual || cadenceRank(a.cadence) - cadenceRank(b.cadence));
  const fit = candidates[0];
  // The same storefront rule as for fixed prices: a short history there cannot have skipped a cycle.
  if (isAmbiguousSubscriptionMerchant(merchantKey) && payments.length < 6 && fit.missedCycles > 0) return null;
  // A variable amount is, by definition, never "exact" — this always asks for the cadence's full
  // (3-occurrence, for anything monthly-ish) evidence, annual/half-yearly aside.
  if (payments.length < minimumOccurrences(fit.cadence, false, false)) return null;
  return {
    id: "",
    baseId: "",
    merchantKey,
    payments,
    cadence: fit.cadence,
    fit,
    amountPattern: "variable",
    toleranceDays: effectiveTolerance(fit.cadence, userTolerance),
    toleranceSource: userTolerance !== null ? "user" : "auto",
    notes: [
      knownSubscription
        ? "The amount changes each time (different order, usage or plan) — tracked as a variable subscription, so price changes are not flagged."
        : "Amount changes every time — tracked as a variable bill, so price changes are not flagged.",
    ],
    confidence: 0,
  };
}

// ─── Price history ───────────────────────────────────────────────────────────

export function amountPatternOf(amounts: number[]): AmountPattern {
  if (amounts.length < 2) return "fixed";
  // A fixed price shows as a handful of distinct values (the price, and each price it changed to)
  // — but only if it moves through them in order. A flexible meal box ordered in three sizes shows
  // the same handful of amounts too, just revisited in no particular order; that is read below as
  // "variable", not as a price that keeps bouncing up and down.
  const distinct = new Set(amounts.map((amount) => amount.toFixed(2))).size;
  if (distinct <= Math.max(2, Math.ceil(amounts.length / 3)) && !oscillatesBetweenValues(amounts, distinct)) return "fixed";
  // Conversion noise wobbles a few percent around a level; the level may still step (a real price
  // change billed in another currency). Anything that never settles is a variable bill.
  const plateaus = plateausOf(amounts, "fluctuating");
  const settled = plateaus.every((plateau, index) => plateau.length >= 2 || index === plateaus.length - 1);
  // Within a run the typical deviation from the level must be small, or it is not a level at all.
  const tight = plateaus.every((plateau) => {
    const run = amounts.slice(plateau.start, plateau.start + plateau.length);
    return plateau.level > 0 && median(run.map((amount) => Math.abs(amount - plateau.level))) / plateau.level <= 0.06;
  });
  if (settled && tight && plateaus.length <= Math.max(2, Math.ceil(amounts.length / 3))) return "fluctuating";
  return "variable";
}

// A one-way price change visits each distinct value about once (A, then B, then maybe C) — at
// most one extra block for a promotion that came and went and reverted. Hopping between the same
// few values over and over is a different shape: an order that varies each time, not a price that
// changed. Counts contiguous runs of (near-)equal amounts; more runs than distinct values would
// allow for a single round trip means it is oscillating, not stepping.
function oscillatesBetweenValues(amounts: number[], distinct: number): boolean {
  if (distinct <= 1) return false;
  let blocks = 1;
  for (let index = 1; index < amounts.length; index += 1) {
    if (Math.abs(amounts[index] - amounts[index - 1]) >= 0.005) blocks += 1;
  }
  return blocks > distinct + 1;
}

type Plateau = { start: number; length: number; level: number };

// Runs of payments at "the same" price. For a fixed-price subscription that is to the penny; for a
// fluctuating one a band around the running median, where a single excursion does not start a new
// run unless the next payment stays out of band on the same side.
function plateausOf(amounts: number[], pattern: AmountPattern): Plateau[] {
  const plateaus: Plateau[] = [];
  let current: number[] = [];
  let start = 0;
  const band = (level: number) => (pattern === "fixed" ? 0.005 : Math.max(0.15, level * 0.06));
  // The run's level: for a fixed price every member is the same; for a wobbling one the median of
  // the most recent few is enough and keeps this linear (it is called inside recursive splits).
  const levelOf = (run: number[]) => (pattern === "fixed" ? run[0] : median(run.length > 8 ? run.slice(-8) : run));
  for (let index = 0; index < amounts.length; index += 1) {
    const amount = amounts[index];
    if (!current.length) {
      current = [amount];
      start = index;
      continue;
    }
    const level = levelOf(current);
    const outside = Math.abs(amount - level) > band(level);
    if (!outside) {
      current.push(amount);
      continue;
    }
    if (pattern !== "fixed") {
      // Noise or a step? A step is confirmed by the following payment sitting on the same side.
      const next = amounts[index + 1];
      const sameSide = next !== undefined && Math.sign(next - level) === Math.sign(amount - level) && Math.abs(next - level) > band(level);
      const isLast = next === undefined;
      if (!sameSide && !isLast) {
        current.push(amount);
        continue;
      }
    }
    plateaus.push({ start, length: current.length, level: median(current) });
    current = [amount];
    start = index;
  }
  if (current.length) plateaus.push({ start, length: current.length, level: median(current) });
  return plateaus;
}

function priceHistory(payments: SubscriptionPayment[], pattern: AmountPattern, cyclesPerYear: number): { changes: PriceChange[]; currentPrice: number } {
  const amounts = payments.map((payment) => payment.amount);
  if (pattern === "variable") {
    // The going rate: average of the last year's payments.
    const recent = payments.slice(-Math.max(1, Math.min(payments.length, cyclesPerYear)));
    return { changes: [], currentPrice: round2(recent.reduce((sum, payment) => sum + payment.amount, 0) / recent.length) };
  }
  const raw = plateausOf(amounts, pattern);
  // A single odd payment between two runs at the same price is a one-off (a pro-rata or a refund),
  // not a price change; fold it away.
  const plateaus: Plateau[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const plateau = raw[index];
    const previous = plateaus[plateaus.length - 1];
    const next = raw[index + 1];
    if (plateau.length === 1 && previous && next && Math.abs(previous.level - next.level) <= (pattern === "fixed" ? 0.005 : Math.max(0.15, previous.level * 0.06))) {
      continue;
    }
    if (previous && Math.abs(previous.level - plateau.level) <= (pattern === "fixed" ? 0.005 : Math.max(0.15, previous.level * 0.06))) {
      previous.length += plateau.length;
      continue;
    }
    plateaus.push({ ...plateau });
  }
  // Stable runs: two or more payments, the opening price, or the latest run (which may be one
  // payment so far).
  const stable = plateaus.filter((plateau, index) => plateau.length >= 2 || index === 0 || index === plateaus.length - 1);
  const changes: PriceChange[] = [];
  for (let index = 1; index < stable.length; index += 1) {
    const from = stable[index - 1].level;
    const to = stable[index].level;
    const percent = from > 0 ? ((to - from) / from) * 100 : 0;
    // Conversion noise never makes a sustained move of 8%; below that, a fluctuating charge is just drifting.
    if (pattern === "fluctuating" && Math.abs(percent) < 8) continue;
    if (Math.abs(to - from) < 0.005) continue;
    changes.push({
      date: payments[stable[index].start].date,
      from: round2(from),
      to: round2(to),
      percent: Number(percent.toFixed(1)),
      yearlyImpact: round2((to - from) * cyclesPerYear),
      confirmed: stable[index].length >= 2 || index < stable.length - 1,
    });
  }
  const last = stable[stable.length - 1] ?? plateaus[plateaus.length - 1];
  return { changes, currentPrice: round2(last ? last.level : amounts[amounts.length - 1]) };
}

// ─── Final shaping ───────────────────────────────────────────────────────────

function finalizeStream(
  stream: Stream,
  pref: SubscriptionPreference | null,
  context: { today: string; dataEnd: string | null; currency: CurrencyCode; siblings: number },
): Subscription {
  const { today, dataEnd, currency, siblings } = context;
  const payments: SubscriptionPayment[] = stream.payments.map(({ date, dated, monthKey, entryId, amount, label }) => ({ date, dated, monthKey, entryId, amount, label }));
  const cadence = stream.cadence;
  const cyclesPerYear = CYCLES_PER_YEAR[cadence];
  const toleranceDays = typeof pref?.toleranceDays === "number" ? effectiveTolerance(cadence, pref.toleranceDays) : stream.toleranceDays;
  const { changes, currentPrice } = priceHistory(payments, stream.amountPattern, cyclesPerYear);
  const yearlyCost = round2(currentPrice * cyclesPerYear);
  const amounts = payments.map((payment) => payment.amount);
  const last = stream.payments[stream.payments.length - 1];
  const category = latestCategory(stream.payments);
  const autoKind = classifyKind(stream.merchantKey, category, currentPrice, currency, stream.payments.some((payment) => payment.debtLinked), stream.amountPattern);
  const kind = pref?.kind ?? autoKind;

  const nextExpected = predictNext(stream.fit, last.date, cadence);
  const daysUntilNext = nextExpected ? dayDiff(today, nextExpected) : null;
  const latestChange = changes[changes.length - 1] ?? null;
  const flaggedIncrease = latestChange && latestChange.to > latestChange.from ? latestChange : null;

  const cancelledAt = pref?.status === "cancelled" ? (pref.cancelledAt ?? pref.updatedAt.slice(0, 10)) : null;
  const chargedAfterCancel = cancelledAt ? payments.filter((payment) => payment.date > cancelledAt) : [];

  let status: SubscriptionStatus;
  let statusDetail: string;
  // When nothing has been imported for a while, "not seen" means nothing; judge against the last
  // transaction instead of today.
  const judgeAgainst = dataEnd && dayDiff(dataEnd, today) > 45 ? dataEnd : today;
  const cycleDays = 365 / cyclesPerYear;
  const stoppedAfter = cyclesPerYear >= 12 ? Math.round(2 * cycleDays) + toleranceDays : Math.round(cycleDays) + Math.max(45, toleranceDays * 3);
  if (pref?.status === "deleted") {
    status = "deleted";
    statusDetail = "Removed";
  } else if (cancelledAt) {
    status = "cancelled";
    statusDetail = chargedAfterCancel.length
      ? `Cancelled ${formatDate(cancelledAt)} — charged ${chargedAfterCancel.length === 1 ? "again" : `${chargedAfterCancel.length} times`} since`
      : `Cancelled ${formatDate(cancelledAt)}`;
  } else if (dayDiff(last.date, judgeAgainst) > stoppedAfter) {
    status = "stopped";
    statusDetail = `No payment since ${formatDate(last.date)} — looks cancelled`;
  } else if (nextExpected && dayDiff(nextExpected, judgeAgainst) > toleranceDays) {
    status = "due";
    statusDetail = `Expected around ${formatDate(nextExpected)} — not seen yet`;
  } else {
    status = "active";
    statusDetail = nextExpected ? (daysUntilNext !== null && daysUntilNext <= 0 ? `Due now (${formatDate(nextExpected)})` : `Next ${formatDate(nextExpected)}`) : "Active";
  }

  const notes = [...stream.notes];
  if (stream.amountPattern === "fluctuating") notes.push("Amount wobbles slightly each time — likely billed in another currency, so small moves are not treated as price changes.");
  if (siblings > 0) notes.push(`One of ${siblings + 1} separate regular payments to this payee.`);
  if (stream.fit.missedCycles > 0) notes.push(`${stream.fit.missedCycles} expected ${stream.fit.missedCycles === 1 ? "payment" : "payments"} not found in the ledger.`);

  const confidence = Math.min(
    0.97,
    0.5 + 0.06 * Math.min(payments.length, 6) + 0.2 * stream.fit.inWindow - 0.05 * stream.fit.missedCycles + (stream.amountPattern === "fixed" ? 0.05 : 0),
  );

  return {
    id: stream.id,
    baseId: stream.baseId,
    key: stream.merchantKey,
    label: displayLabel(stream.payments),
    kind,
    kindSource: pref?.kind ? "user" : "auto",
    category,
    color: last.color,
    cadence,
    cyclesPerYear,
    currentPrice,
    yearlyCost,
    monthlyEquivalent: round2(yearlyCost / 12),
    amountPattern: stream.amountPattern,
    amountRange: { min: Math.min(...amounts), max: Math.max(...amounts) },
    payments,
    occurrences: payments.length,
    firstSeen: payments[0].date,
    lastSeen: last.date,
    nextExpected,
    daysUntilNext,
    toleranceDays,
    toleranceSource: typeof pref?.toleranceDays === "number" ? "user" : stream.toleranceSource,
    scheduleHint: scheduleHint(stream.fit, cadence, last.date),
    priceChanges: changes,
    latestChange,
    flaggedIncrease,
    status,
    statusDetail,
    cancelledAt,
    chargedAfterCancel,
    missedCycles: stream.fit.missedCycles,
    confidence: Number(confidence.toFixed(2)),
    alreadyRecurring: stream.payments.every((payment) => payment.recurring),
    entryRefs: payments.map((payment) => ({ monthKey: payment.monthKey, entryId: payment.entryId, kind: "expense" as const })),
    siblings,
    notes,
  };
}

function predictNext(fit: CadenceFit, fromDate: string, cadence: SubscriptionCadence, direction: 1 | -1 = 1): string | null {
  if (fit.periodDays) return shiftIsoDate(fromDate, fit.periodDays * direction);
  const months = fit.periodMonths ?? (cadence === "monthly" ? 1 : 12);
  // Next lattice point after (or before) the payment, on the anchor day.
  return isoFromMonthIndex(cycleMonthOf(fromDate, fit.anchorDay) + months * direction, fit.anchorDay);
}

// The month a payment belongs to on a same-day-each-month schedule: a payment on the 2nd for a
// 30th-of-month schedule belongs to the previous month.
function cycleMonthOf(iso: string, anchorDay: number): number {
  const day = Number(iso.slice(8, 10));
  let month = monthIndex(iso.slice(0, 7));
  if (anchorDay - day > 15) month -= 1;
  else if (day - anchorDay > 15) month += 1;
  return month;
}

function scheduleHint(fit: CadenceFit, cadence: SubscriptionCadence, lastDate: string): string {
  if (fit.periodDays) {
    const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][fit.anchorDay];
    return cadence === "weekly" ? `every ${weekday}` : `every ${fit.periodDays === 14 ? "2 weeks" : "4 weeks"}, on a ${weekday}`;
  }
  if (cadence === "monthly") return `around the ${ordinal(fit.anchorDay)}`;
  if (cadence === "quarterly") return `every 3 months around the ${ordinal(fit.anchorDay)}`;
  if (cadence === "half-yearly") return `every 6 months around the ${ordinal(fit.anchorDay)}`;
  const monthName = new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(`${lastDate}T00:00:00`));
  return `each ${fit.anchorDay} ${monthName}`;
}

function displayLabel(payments: RawPayment[]): string {
  // The most common spelling, latest wins ties.
  const counts = new Map<string, number>();
  for (const payment of payments) counts.set(payment.label, (counts.get(payment.label) ?? 0) + 1);
  let best = payments[payments.length - 1].label;
  let bestCount = 0;
  for (let index = payments.length - 1; index >= 0; index -= 1) {
    const count = counts.get(payments[index].label) ?? 0;
    if (count > bestCount) {
      best = payments[index].label;
      bestCount = count;
    }
  }
  return best;
}

function latestCategory(payments: RawPayment[]): string {
  for (let index = payments.length - 1; index >= 0; index -= 1) {
    if (payments[index].category && payments[index].category !== "Unsorted") return payments[index].category;
  }
  return "";
}

// ─── Merchant knowledge ──────────────────────────────────────────────────────

const SUBSCRIPTION_WORDS = [
  "netflix", "spotify", "disney", "prime", "apple", "icloud", "itunes", "youtube", "google one", "google storage", "google play",
  "now tv", "nowtv", "sky", "hbo", "hulu", "paramount", "peacock", "crunchyroll", "audible", "kindle", "xbox", "playstation", "nintendo",
  "steam", "twitch", "patreon", "substack", "medium", "nytimes", "new york times", "the times", "guardian", "telegraph", "economist",
  "financial times", "adobe", "microsoft", "office 365", "dropbox", "notion", "chatgpt", "openai", "anthropic", "claude", "github",
  "canva", "figma", "zoom", "slack", "linkedin", "duolingo", "headspace", "calm", "strava", "peloton", "gym", "fitness", "puregym",
  "david lloyd", "virgin active", "nuffield", "anytime fitness", "planet fitness", "hellofresh", "gousto", "mindful chef", "graze",
  "dollar shave", "harrys", "birchbox", "glossybox", "tinder", "bumble", "hinge", "nordvpn", "expressvpn", "surfshark", "1password",
  "lastpass", "bitwarden", "clubcard plus", "deliveroo plus", "uber one", "nest aware", "ring", "dashlane", "setapp", "evernote",
  "todoist", "deezer", "tidal", "soundcloud", "membership", "subscription", "plus", "premium", "pass", "club", "magazine", "news",
  "storage", "cloud", "vpn", "app", "games", "playstation plus", "ea play", "ubisoft", "discord", "nitro", "tv", "mubi", "britbox",
  "itv", "channel 4", "dazn", "wwe", "formula 1", "f1 tv", "masterclass", "skillshare", "coursera", "udemy", "babbel", "ancestry",
  "grammarly", "icloud", "onedrive", "google workspace", "squarespace", "wix", "shopify", "godaddy", "namecheap", "domain", "hosting",
  "mailchimp", "spotify premium", "amazon music", "amazon prime", "kindle unlimited", "apple music", "apple tv", "apple one", "apple arcade",
  "fitbit", "whoop", "oura", "garmin", "zwift", "beer52", "craft gin club", "pact coffee", "who gives a crap", "smol", "wild",
  "readly", "ko fi", "onlyfans", "fubo", "sling", "lovefilm", "cineworld", "odeon", "vue", "everyman", "limitless", "unlimited",
];

const BILL_WORDS = [
  "rent", "mortgage", "council tax", "council", "water", "gas", "electric", "energy", "edf", "octopus", "british gas", "ovo", "e on",
  "eon", "scottish power", "sse", "bulb", "shell energy", "thames water", "severn trent", "anglian", "united utilities", "yorkshire water",
  "broadband", "bt group", "bt ", "virgin media", "talktalk", "plusnet", "vodafone", "ee ", "o2", "three", "giffgaff", "tesco mobile",
  "smarty", "lebara", "lyca", "voxi", "id mobile", "sky mobile", "insurance", "admiral", "aviva", "direct line", "churchill", "hastings",
  "axa", "lv ", "bupa", "vitality", "tv licence", "tv license", "loan", "finance", "car finance", "lease", "nursery", "childcare",
  "school", "tuition", "hoa", "property tax", "life insurance", "home insurance", "pet insurance", "petplan", "rac", "the aa", "aa ",
  "breakdown", "season ticket", "parking permit", "service charge", "ground rent", "phone", "mobile", "internet", "utility", "utilities",
  "tax", "hmrc", "irs", "premium bond", "credit card", "barclaycard", "amex", "american express", "capital one", "klarna", "clearpay",
  "student loan", "child support", "alimony", "comcast", "xfinity", "verizon", "at t", "t mobile", "spectrum", "con edison", "pg e",
  "duke energy", "national grid", "geico", "state farm", "progressive", "allstate", "usaa", "health insurance", "dental", "medicare",
];

const RETAIL_WORDS = [
  "tesco", "sainsbury", "asda", "aldi", "lidl", "morrisons", "waitrose", "co op", "coop", "iceland", "marks and spencer", "ocado",
  "costco", "walmart", "target", "kroger", "whole foods", "trader joe", "safeway", "publix", "wegmans", "aldi", "ebay", "argos", "ikea",
  "b and q", "boots", "superdrug", "primark", "next", "h m", "zara", "uber", "bolt", "lyft", "deliveroo", "just eat", "uber eats", "doordash",
  "grubhub", "mcdonalds", "greggs", "costa", "starbucks", "pret", "shell", "bp", "esso", "texaco", "tfl", "trainline", "national rail",
  "amazon", "etsy", "wilko", "home bargains", "poundland", "b m", "the range", "dunelm", "screwfix", "halfords", "currys", "john lewis",
  "selfridges", "harrods", "nandos", "wagamama", "pizza express", "dominos", "papa johns", "kfc", "burger king", "subway", "five guys",
  "wetherspoon", "cafe", "coffee", "restaurant", "bar", "pub", "petrol", "fuel", "parking", "taxi",
];

const BILL_CATEGORIES = ["bills", "utilities", "home", "housing", "tax", "taxes", "insurance", "debt payments", "medical", "transport", "transportation", "travel", "childcare", "education", "rent", "mortgage"];
const DISCRETIONARY_CATEGORIES = ["food", "groceries", "dining", "eating out", "restaurants", "shopping", "personal", "entertainment", "fun", "clothes", "clothing", "gifts", "holidays", "unsorted", ""];

function wordIn(haystack: string, words: string[]): boolean {
  const padded = ` ${haystack} `;
  return words.some((word) => padded.includes(` ${word.trim()} `));
}

function looksLikeSubscription(merchantKey: string, category: string): boolean {
  const normalizedCategory = category.trim().toLowerCase();
  if (["subscriptions", "subscription", "entertainment", "streaming", "software", "apps", "memberships"].includes(normalizedCategory)) return true;
  // "amazon prime" is a subscription even though "amazon" is a retailer.
  return wordIn(merchantKey, SUBSCRIPTION_WORDS);
}

function looksLikeBill(merchantKey: string, category: string): boolean {
  return wordIn(merchantKey, BILL_WORDS) || isBillCategory(category);
}

// Storefronts that sell subscriptions but also one-off goods, rentals or purchases under the very
// same descriptor ("Amazon Prime" covers both the membership and a one-off video rental; "Apple"
// covers iCloud as well as a single App Store purchase). Two coincidentally-matching payments here
// are cheap; a third is asked for before calling it a subscription. A merchant that is unambiguous
// — Netflix, Spotify, a gym — is not on this list, so a brand-new one still shows up after two.
const AMBIGUOUS_SUBSCRIPTION_WORDS = [
  "amazon", "amazon prime", "amazon video", "amzn", "apple", "itunes", "app store", "google play", "google",
  "playstation", "playstation store", "xbox", "microsoft", "microsoft store", "steam", "kindle", "nintendo", "ebay",
];

function isAmbiguousSubscriptionMerchant(merchantKey: string): boolean {
  return wordIn(merchantKey, AMBIGUOUS_SUBSCRIPTION_WORDS);
}

function isBillCategory(category: string): boolean {
  return BILL_CATEGORIES.includes(category.trim().toLowerCase());
}

function isDiscretionaryCategory(category: string): boolean {
  return DISCRETIONARY_CATEGORIES.includes(category.trim().toLowerCase());
}

export function isRetailMerchant(merchantKey: string): boolean {
  // A retailer's own subscription ("tesco mobile", "amazon prime", "clubcard plus") is not retail.
  if (wordIn(merchantKey, ["mobile", "prime", "plus", "club", "clubcard", "music", "video", "unlimited", "pass", "membership", "subscription", "delivery", "bank", "insurance"])) return false;
  return wordIn(merchantKey, RETAIL_WORDS);
}

function classifyKind(merchantKey: string, category: string, price: number, currency: CurrencyCode, debtLinked: boolean, pattern: AmountPattern): SubscriptionKind {
  if (debtLinked) return "bill";
  const normalizedCategory = category.trim().toLowerCase();
  if (normalizedCategory === "subscriptions" || normalizedCategory === "subscription") return "subscription";
  if (wordIn(merchantKey, SUBSCRIPTION_WORDS)) return "subscription";
  if (wordIn(merchantKey, BILL_WORDS)) return "bill";
  if (["entertainment", "streaming", "software", "apps", "memberships", "health", "fitness", "personal"].includes(normalizedCategory)) return "subscription";
  if (isBillCategory(normalizedCategory)) return "bill";
  if (pattern === "variable") return "bill";
  // Unknown: small and steady reads as a subscription, anything larger as a bill.
  const threshold = currency === "INR" ? 5_000 : currency === "JPY" ? 9_000 : 60;
  return price <= threshold ? "subscription" : "bill";
}

// ─── Dates & maths ───────────────────────────────────────────────────────────

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function utcOf(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function dayDiff(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / DAY_MS);
}

export function shiftIsoDate(iso: string, days: number): string {
  const date = new Date(utcOf(iso) + days * DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function dayNumberOf(iso: string): number {
  return utcOf(iso) / DAY_MS;
}

// Day number of the anchor day in a month (clamped to the month's length). Memoised: the fits ask
// for the same few months over and over.
const dayNumberCache = new Map<number, number>();
function dayNumberFor(monthIdx: number, day: number): number {
  const key = monthIdx * 32 + day;
  const cached = dayNumberCache.get(key);
  if (cached !== undefined) return cached;
  const year = Math.floor(monthIdx / 12);
  const month = monthIdx % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const value = Date.UTC(year, month, Math.min(day, lastDay)) / DAY_MS;
  dayNumberCache.set(key, value);
  return value;
}

function monthIndex(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  return year * 12 + (month - 1);
}

function daysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoFromMonthIndex(index: number, day: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  return `${monthKey}-${String(Math.min(day, daysInMonth(monthKey))).padStart(2, "0")}`;
}

// Median day-of-month that respects the wrap (a 1st-of-month payment landing on the 30th before).
function circularMedianDay(days: number[]): number {
  if (days.length === 1) return days[0];
  const sorted = [...days].sort((a, b) => a - b);
  // If the days straddle the month boundary (some ≤ 3, some ≥ 28), shift the small ones up.
  const straddles = sorted[0] <= 4 && sorted[sorted.length - 1] >= 27;
  const adjusted = straddles ? sorted.map((day) => (day <= 4 ? day + 31 : day)) : sorted;
  const middle = median(adjusted);
  const rounded = Math.round(middle);
  return rounded > 31 ? rounded - 31 : rounded;
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  let best = values[0];
  let bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ordinal(day: number): string {
  const remainder = day % 100;
  if (remainder >= 11 && remainder <= 13) return `${day}th`;
  const last = day % 10;
  return `${day}${last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th"}`;
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

export function formatShortDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(year, month - 1, day));
}
