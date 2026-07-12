import { supabase } from "./supabase";
import type { CsvImportRow } from "./importer";

// Stage C: AI categorization backstop. Only rows the local pipeline scored below
// AI_UPGRADE_THRESHOLD are sent, and only when the user opted in and is signed in.
// Privacy contract (enforced here, not just promised): descriptions + sign only —
// no amounts, no dates, no balances, no identity beyond the auth token.
// AI output is capped at 0.8 confidence so a user's own rules (0.96/0.85) always win.

export const AI_UPGRADE_THRESHOLD = 0.6;
const AI_CONFIDENCE_CAP = 0.8;
const MAX_BATCH = 50;

export type AiSuggestion = {
  id: string;
  category: string;
  kind: "income" | "expense" | "debt-payment" | "transfer";
  confidence: number;
  cleanedMerchant?: string;
};

export function isAiCategorizationAvailable(signedIn: boolean, optedIn: boolean): boolean {
  return Boolean(supabase && signedIn && optedIn);
}

export async function aiCategorizeRows(rows: CsvImportRow[], userCategories: string[]): Promise<AiSuggestion[]> {
  if (!supabase) return [];

  const eligible = rows
    .filter((row) => !row.duplicate && row.confidence < AI_UPGRADE_THRESHOLD && row.categorySource !== "user")
    .slice(0, MAX_BATCH);
  if (!eligible.length) return [];

  const { data, error } = await supabase.functions.invoke("categorize-batch", {
    body: {
      rows: eligible.map((row) => ({
        id: row.id,
        description: row.description,
        sign: row.amount >= 0 ? "in" : "out",
      })),
      categories: userCategories,
    },
  });

  if (error || !data || !Array.isArray(data.suggestions)) return [];

  return (data.suggestions as AiSuggestion[])
    .filter((suggestion) => suggestion && typeof suggestion.id === "string" && typeof suggestion.category === "string")
    .map((suggestion) => ({
      ...suggestion,
      confidence: Math.min(AI_CONFIDENCE_CAP, Number(suggestion.confidence) || 0),
    }));
}

// Merge AI suggestions back into review rows. Never touches rows the user already
// edited, rows a rule matched, or rows where the AI is less sure than local logic.
export function applyAiSuggestions(rows: CsvImportRow[], suggestions: AiSuggestion[]): CsvImportRow[] {
  const byId = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]));
  return rows.map((row) => {
    const suggestion = byId.get(row.id);
    if (!suggestion) return row;
    if (row.categorySource === "user" || row.confidence >= suggestion.confidence) return row;
    return {
      ...row,
      category: suggestion.category,
      suggestedCategory: suggestion.category,
      kind: suggestion.kind,
      suggestedKind: suggestion.kind,
      confidence: suggestion.confidence,
      categorySource: "ai" as const,
      note: "AI suggestion — check before importing",
    };
  });
}
