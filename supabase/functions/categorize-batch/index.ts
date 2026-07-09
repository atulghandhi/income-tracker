// Stage C: AI categorization backstop (docs/AUTOMATION_PLAN.md §4C).
//
// POST { rows: [{ id, description, sign }], categories: string[] }
//  →   { suggestions: [{ id, category, kind, confidence, cleanedMerchant }] }
//
// Privacy contract: the client sends descriptions and a direction sign only —
// never amounts, dates, balances, or identity beyond the Supabase auth token.
// Results are cached in merchant_categories (no user linkage) so a descriptor
// is only ever sent to the model once across the whole user base.
//
// Deploy:  supabase functions deploy categorize-batch
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Dormant until the secret is set — the client treats errors as "no upgrade".

import { createClient } from "npm:@supabase/supabase-js@2";

type InputRow = { id: string; description: string; sign: "in" | "out" };
type Suggestion = {
  id: string;
  category: string;
  kind: "income" | "expense" | "debt-payment" | "transfer";
  confidence: number;
  cleanedMerchant: string;
};

const MAX_ROWS = 50;
const MAX_DESCRIPTION_LENGTH = 200;
const MODEL = Deno.env.get("CATEGORIZE_MODEL") ?? "claude-haiku-4-5-20251001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return json({ error: "AI categorization is not configured" }, 503);
  }

  // Caller must be a signed-in user (Pro gating happens client-side today;
  // move to an entitlements check here once the subscriptions table exists).
  const authHeader = request.headers.get("Authorization") ?? "";
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
  if (userError || !userData?.user) {
    return json({ error: "Sign in required" }, 401);
  }

  let body: { rows?: InputRow[]; categories?: string[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const rows = (Array.isArray(body.rows) ? body.rows : [])
    .filter((row) => row && typeof row.id === "string" && typeof row.description === "string" && row.description.trim())
    .slice(0, MAX_ROWS)
    .map((row) => ({
      id: row.id,
      description: row.description.slice(0, MAX_DESCRIPTION_LENGTH),
      sign: row.sign === "in" ? "in" : "out",
    }));
  if (!rows.length) return json({ suggestions: [] });

  const categories = (Array.isArray(body.categories) ? body.categories : [])
    .filter((category) => typeof category === "string" && category.trim())
    .slice(0, 40);
  if (!categories.length) {
    categories.push("Home", "Food", "Bills", "Travel", "Subscriptions", "Health", "Personal", "Work");
  }

  // Service-role client for the shared cache (RLS blocks everyone else).
  const supabaseService = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const hashes = await Promise.all(rows.map((row) => patternHash(row.description)));
  const hashByRowId = new Map(rows.map((row, index) => [row.id, hashes[index]]));

  const { data: cached } = await supabaseService
    .from("merchant_categories")
    .select("pattern_hash, category, kind, confidence, cleaned_merchant")
    .in("pattern_hash", Array.from(new Set(hashes)));
  const cacheByHash = new Map((cached ?? []).map((row) => [row.pattern_hash as string, row]));

  const suggestions: Suggestion[] = [];
  const uncachedRows: typeof rows = [];
  for (const row of rows) {
    const hit = cacheByHash.get(hashByRowId.get(row.id)!);
    if (hit) {
      suggestions.push({
        id: row.id,
        category: hit.category as string,
        kind: hit.kind as Suggestion["kind"],
        confidence: Number(hit.confidence) || 0.7,
        cleanedMerchant: (hit.cleaned_merchant as string) ?? "",
      });
    } else {
      uncachedRows.push(row);
    }
  }

  if (uncachedRows.length) {
    const modelSuggestions = await categorizeWithModel(uncachedRows, categories, anthropicKey);
    suggestions.push(...modelSuggestions);

    // Write-through cache; hit counts bump lazily on conflict.
    if (modelSuggestions.length) {
      const cacheRows = modelSuggestions.map((suggestion) => ({
        pattern_hash: hashByRowId.get(suggestion.id)!,
        cleaned_merchant: suggestion.cleanedMerchant,
        category: suggestion.category,
        kind: suggestion.kind,
        confidence: suggestion.confidence,
        updated_at: new Date().toISOString(),
      }));
      await supabaseService.from("merchant_categories").upsert(cacheRows, { onConflict: "pattern_hash" });
    }
  }

  return json({ suggestions });
});

async function categorizeWithModel(rows: InputRow[], categories: string[], apiKey: string): Promise<Suggestion[]> {
  const prompt = [
    "Categorize these UK bank transaction descriptions.",
    `Allowed categories: ${categories.join(", ")}. Also allowed kind values: income, expense, debt-payment, transfer.`,
    "A row with sign 'in' is money received; 'out' is money spent.",
    "Rules: use 'Income' + kind income for wages/refunds coming in; kind transfer only for movements between the user's own accounts;",
    "kind debt-payment for credit-card/loan repayments; otherwise kind expense with the best-fitting category.",
    "cleaned_merchant is the human name of the merchant ('TESCO STORES 4261' → 'Tesco').",
    "confidence is 0–1: use < 0.5 when genuinely unsure.",
    "Respond with ONLY a JSON array, one object per input row:",
    '[{"id": "...", "category": "...", "kind": "expense", "confidence": 0.8, "cleaned_merchant": "..."}]',
    "",
    "Rows:",
    JSON.stringify(rows),
  ].join("\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) return [];

  const payload = await response.json();
  const text: string = payload?.content?.[0]?.text ?? "";
  const jsonStart = text.indexOf("[");
  const jsonEnd = text.lastIndexOf("]");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const validKinds = new Set(["income", "expense", "debt-payment", "transfer"]);
  const rowIds = new Set(rows.map((row) => row.id));
  return parsed
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string" && rowIds.has((item as Record<string, unknown>).id as string),
    )
    .map((item) => ({
      id: item.id as string,
      category: String(item.category ?? "Unsorted").slice(0, 40),
      kind: (validKinds.has(String(item.kind)) ? String(item.kind) : "expense") as Suggestion["kind"],
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.5)),
      cleanedMerchant: String(item.cleaned_merchant ?? "").slice(0, 80),
    }));
}

// Mirrors the client's canonicalization loosely: lowercase, strip punctuation
// and payment noise words, collapse whitespace — then SHA-256.
async function patternHash(description: string): Promise<string> {
  const canonical = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(card|payment|purchase|direct debit|dd|pos|online|faster payments?|www|com|net|org)\b/g, " ")
    .replace(/\d{4,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
