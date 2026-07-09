import { suggestCategory } from "./importer";
import type { MerchantMemory } from "./merchantMemory";
import type { CategorySource, LedgerState, TransactionKind } from "./types";

// One-line entry: "costa 4.35", "salary 2400 recurring", "tesco 42.61 yesterday",
// "rent 950 on 1st", "+refund 20". Deterministic and local — worst case a row lands
// as an Unsorted expense, one tap from correct, and the correction becomes a rule.
export type QuickAddDraft = {
  kind: "income" | "expense";
  description: string;
  amount: number;
  date?: string; // ISO yyyy-mm-dd; omitted when the user gave no date hint
  recurring: boolean;
  category: string;
  color: string | null;
  categorySource: CategorySource;
  note: string;
};

export type QuickAddResult = { ok: true; draft: QuickAddDraft } | { ok: false; error: string };

const RECURRING_WORDS = new Set(["recurring", "monthly", "repeat", "repeats"]);
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const AMOUNT_TOKEN = /^[-+]?[£$€]?\d[\d,]*(?:\.\d{1,2})?$/;

export function parseQuickAdd(
  input: string,
  options: { state: LedgerState; memory: MerchantMemory; monthKey: string; today?: Date },
): QuickAddResult {
  const { state, memory, monthKey } = options;
  const today = options.today ?? new Date();
  const rawTokens = input.trim().split(/\s+/).filter(Boolean);
  if (!rawTokens.length) return { ok: false, error: "Type a description and an amount" };

  let amount: number | null = null;
  let forcedIncome = false;
  let recurringHint: boolean | null = null;
  let date: string | undefined;
  const descriptionTokens: string[] = [];

  for (let index = 0; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    const lower = token.toLowerCase();

    if (amount === null && AMOUNT_TOKEN.test(token)) {
      const numeric = Number(token.replace(/[£$€,+]/g, ""));
      if (Number.isFinite(numeric) && Math.abs(numeric) > 0) {
        amount = Math.abs(numeric);
        if (token.startsWith("+")) forcedIncome = true;
        continue;
      }
    }

    if (RECURRING_WORDS.has(lower)) {
      recurringHint = true;
      continue;
    }
    if (lower === "once" || lower === "one-off" || lower === "oneoff") {
      recurringHint = false;
      continue;
    }
    if (lower === "on" && index + 1 < rawTokens.length) continue; // "on 1st" — the day token handles itself

    if (!date) {
      const parsedDate = parseDateHint(lower, monthKey, today);
      if (parsedDate) {
        date = parsedDate;
        continue;
      }
    }

    descriptionTokens.push(token);
  }

  if (amount === null) return { ok: false, error: "Add an amount, e.g. “costa 4.35”" };
  const description = descriptionTokens.join(" ").trim();
  if (!description) return { ok: false, error: "Add a description, e.g. “costa 4.35”" };

  // Memory first (the user's own history), then the shared rule pipeline.
  const memoryHit = memory.find("expense", description) ?? memory.find("income", description);
  const suggestion = suggestCategory(description, forcedIncome ? amount : -amount, state.categoryRules, "");
  const kind: TransactionKind = forcedIncome ? "income" : memoryHit?.kind ?? (suggestion.kind === "income" ? "income" : "expense");

  const category =
    kind === "income"
      ? ""
      : memoryHit?.kind === "expense" && memoryHit.category
        ? memoryHit.category
        : suggestion.kind === "expense" || suggestion.kind === "debt-payment"
          ? suggestion.category
          : "Unsorted";

  return {
    ok: true,
    draft: {
      kind: kind === "income" ? "income" : "expense",
      description: memoryHit?.label ?? description,
      amount,
      date,
      recurring: recurringHint ?? memoryHit?.recurring ?? false,
      category: category === "Unsorted" && memoryHit?.category ? memoryHit.category : category,
      color: memoryHit?.color ?? null,
      categorySource: memoryHit?.category ? "rule" : suggestion.source,
      note:
        memoryHit && memoryHit.count > 1
          ? `Seen ${memoryHit.count}× before`
          : suggestion.note,
    },
  };
}

function parseDateHint(lower: string, monthKey: string, today: Date): string | undefined {
  if (lower === "today") return isoDate(today);
  if (lower === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return isoDate(yesterday);
  }

  const weekdayIndex = WEEKDAYS.findIndex((day) => day === lower || day.slice(0, 3) === lower);
  if (weekdayIndex >= 0) {
    // Most recent occurrence of that weekday (today counts).
    const candidate = new Date(today);
    const diff = (today.getDay() - weekdayIndex + 7) % 7;
    candidate.setDate(today.getDate() - diff);
    return isoDate(candidate);
  }

  const ordinal = lower.match(/^(\d{1,2})(?:st|nd|rd|th)$/);
  if (ordinal) {
    const day = Number(ordinal[1]);
    if (day >= 1 && day <= 31) {
      const [year, month] = monthKey.split("-").map(Number);
      const clamped = Math.min(day, new Date(year, month, 0).getDate());
      return `${monthKey}-${String(clamped).padStart(2, "0")}`;
    }
  }

  const slash = lower.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = slash[3] ? (Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3])) : Number(monthKey.split("-")[0]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return undefined;
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
