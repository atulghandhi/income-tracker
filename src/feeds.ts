import { buildImportRow, collectExistingTransactionHashes, type CsvImportRow } from "./importer";
import { supabase } from "./supabase";
import type { LedgerState } from "./types";

// Stage E client: open-banking feed plumbing (docs/AUTOMATION_PLAN.md §4E).
// Staged transactions arrive server-side (feeds-sync worker) and are pulled
// here into the exact same review pipeline as CSV/paste/OFX — a bank feed is
// just another inlet. Everything is dormant unless the deployment sets
// VITE_FEEDS_ENABLED=1 AND the edge functions report provider credentials.

export const BANK_FEED_SOURCE_NAME = "Bank feed";

export type BankConnection = {
  id: string;
  display_name: string;
  status: "pending" | "active" | "expired" | "revoked" | "error";
  consent_expires_at: string | null;
  last_synced_at: string | null;
};

export function isFeedsEnabled(): boolean {
  return Boolean(supabase) && import.meta.env.VITE_FEEDS_ENABLED === "1";
}

// Days until the 90-day consent window closes; ≤10 triggers the reconfirm nudge.
export function daysUntilConsentExpiry(connection: BankConnection): number | null {
  if (!connection.consent_expires_at) return null;
  return Math.floor((Date.parse(connection.consent_expires_at) - Date.now()) / 86_400_000);
}

async function invokeConnect<T>(body: Record<string, unknown>): Promise<T | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke("feeds-connect", { body });
  if (error) return null;
  return data as T;
}

export async function isFeedBackendConfigured(): Promise<boolean> {
  const data = await invokeConnect<{ configured: boolean }>({ action: "status" });
  return Boolean(data?.configured);
}

export async function listBankConnections(): Promise<BankConnection[]> {
  const data = await invokeConnect<{ connections: BankConnection[] }>({ action: "list" });
  return data?.connections ?? [];
}

// Sends the user to the provider's hosted auth; they come back to the app with
// ?feeds=callback&code=... which completeBankConnection consumes.
export async function startBankConnection(): Promise<string | null> {
  const data = await invokeConnect<{ url: string }>({ action: "link", redirectUri: feedRedirectUri() });
  return data?.url ?? null;
}

export async function completeBankConnection(code: string): Promise<BankConnection | null> {
  const data = await invokeConnect<{ connection: BankConnection }>({
    action: "callback",
    code,
    redirectUri: feedRedirectUri(),
  });
  return data?.connection ?? null;
}

export async function reconfirmBankConnection(connectionId: string): Promise<BankConnection | null> {
  const data = await invokeConnect<{ connection: BankConnection }>({ action: "reconfirm", connectionId });
  return data?.connection ?? null;
}

export async function disconnectBankConnection(connectionId: string): Promise<boolean> {
  const data = await invokeConnect<{ ok: boolean }>({ action: "disconnect", connectionId });
  return Boolean(data?.ok);
}

export async function syncFeedsNow(): Promise<{ synced: number; staged: number } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke("feeds-sync", { body: { action: "sync-now" } });
  if (error) return null;
  return data as { synced: number; staged: number };
}

// Reads the OAuth code out of the current URL after the provider redirect and
// strips the params so a refresh doesn't replay it.
export function consumeFeedCallbackCode(): string | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get("feeds") !== "callback") return null;
  const code = params.get("code");
  params.delete("feeds");
  params.delete("code");
  params.delete("scope");
  params.delete("state");
  const query = params.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  return code;
}

function feedRedirectUri(): string {
  return `${window.location.origin}/?feeds=callback`;
}

type StagedFeedRow = {
  id: string;
  posted_at: string;
  description: string;
  amount: number;
  merchant_name: string;
  bank_category: string;
};

export type StagedFeedReview = {
  rows: CsvImportRow[];
  // review-row id → feed_transactions.id, for resolving status after import.
  feedIdByRowId: Map<string, string>;
  total: number;
};

export async function countStagedFeedRows(): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("feed_transactions")
    .select("id", { count: "exact", head: true })
    .eq("status", "staged");
  return error ? 0 : count ?? 0;
}

// Staged rows → reviewable import rows through the shared suggestion/dedupe
// pipeline. The provider transaction ID is the dedupe key (like OFX FITID).
export async function fetchStagedFeedReview(state: LedgerState): Promise<StagedFeedReview> {
  if (!supabase) return { rows: [], feedIdByRowId: new Map(), total: 0 };

  const { data, error } = await supabase
    .from("feed_transactions")
    .select("id, posted_at, description, amount, merchant_name, bank_category")
    .eq("status", "staged")
    .order("posted_at", { ascending: false })
    .limit(500);
  if (error || !data) return { rows: [], feedIdByRowId: new Map(), total: 0 };

  const existingHashes = collectExistingTransactionHashes(state);
  const feedIdByRowId = new Map<string, string>();
  const rows = (data as StagedFeedRow[]).map((staged, index) => {
    const description = staged.merchant_name?.trim() || staged.description;
    const row = buildImportRow({
      rowNumber: index + 1,
      date: staged.posted_at,
      description,
      amount: Number(staged.amount),
      bankCategory: staged.bank_category ?? "",
      state,
      existingHashes,
      externalId: `feed-${staged.id}`,
    });
    feedIdByRowId.set(row.id, staged.id);
    return row;
  });

  return { rows, feedIdByRowId, total: rows.length };
}

export async function resolveFeedRows(feedIds: string[], status: "imported" | "dismissed"): Promise<void> {
  if (!supabase || !feedIds.length) return;
  await supabase.from("feed_transactions").update({ status }).in("id", feedIds);
}
