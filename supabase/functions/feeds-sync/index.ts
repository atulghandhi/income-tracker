// Stage E: transaction sync worker (docs/AUTOMATION_PLAN.md §4E2).
//
// Two invocation modes:
//   • Cron sweep (recommended: every 6h) — refreshes tokens, pulls new
//     transactions for every active connection, stages them.
//       supabase functions deploy feeds-sync
//       + schedule via the dashboard or pg_cron calling this function with
//         the CRON_SECRET header.
//   • User-triggered: POST { action: "sync-now" } with the user's auth token —
//     syncs just that user's connections (the "pull to refresh" path).
//
// Consent guard: connections past consent_expires_at flip to 'expired' and are
// skipped until the user reconfirms (feeds-connect action "reconfirm").

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { trueLayerProvider, isTrueLayerConfigured } from "../_shared/truelayer.ts";
import type { FeedProvider } from "../_shared/feedProvider.ts";

const providers: Record<string, FeedProvider> = {
  [trueLayerProvider.name]: trueLayerProvider,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!isTrueLayerConfigured()) return json({ error: "Bank feeds are not configured" }, 503);

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Cron path: authenticated by shared secret, sweeps all users.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && request.headers.get("x-cron-secret") === cronSecret) {
    const summary = await syncConnections(service, null);
    return json(summary);
  }

  // User path: sync only the caller's connections.
  const authHeader = request.headers.get("Authorization") ?? "";
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
  if (userError || !userData?.user) return json({ error: "Sign in required" }, 401);

  const summary = await syncConnections(service, userData.user.id);
  return json(summary);
});

async function syncConnections(service: SupabaseClient, onlyUserId: string | null) {
  let query = service
    .from("bank_connections")
    .select("id, user_id, provider, status, access_token, refresh_token, token_expires_at, consent_expires_at, sync_cursor")
    .in("status", ["active", "error"]);
  if (onlyUserId) query = query.eq("user_id", onlyUserId);
  const { data: connections } = await query;

  let synced = 0;
  let staged = 0;
  let expired = 0;
  const now = Date.now();

  for (const connection of connections ?? []) {
    const provider = providers[connection.provider as string];
    if (!provider) continue;

    // 90-day consent window: stop pulling until the user reconfirms in-app.
    if (connection.consent_expires_at && Date.parse(connection.consent_expires_at) < now) {
      await service.from("bank_connections").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", connection.id);
      expired += 1;
      continue;
    }

    try {
      let accessToken = connection.access_token as string;
      if (!connection.token_expires_at || Date.parse(connection.token_expires_at) < now + 60_000) {
        const tokens = await provider.refreshTokens(connection.refresh_token as string);
        accessToken = tokens.accessToken;
        await service
          .from("bank_connections")
          .update({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken || connection.refresh_token,
            token_expires_at: new Date(tokens.expiresAt).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", connection.id);
      }

      const page = await provider.fetchTransactions({ accessToken, cursor: (connection.sync_cursor as string) ?? null });

      if (page.transactions.length) {
        const rows = page.transactions.map((transaction) => ({
          user_id: connection.user_id,
          connection_id: connection.id,
          provider_transaction_id: transaction.providerTransactionId,
          posted_at: transaction.postedAt,
          description: transaction.description,
          amount: transaction.amount,
          currency: transaction.currency,
          merchant_name: transaction.merchantName,
          bank_category: transaction.bankCategory,
        }));
        // ignoreDuplicates keeps already-staged/imported rows untouched — the
        // provider transaction ID unique constraint is the dedupe line.
        const { error } = await service
          .from("feed_transactions")
          .upsert(rows, { onConflict: "connection_id,provider_transaction_id", ignoreDuplicates: true });
        if (!error) staged += rows.length;
      }

      await service
        .from("bank_connections")
        .update({
          status: "active",
          sync_cursor: page.nextCursor,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);
      synced += 1;
    } catch {
      await service.from("bank_connections").update({ status: "error", updated_at: new Date().toISOString() }).eq("id", connection.id);
    }
  }

  return { synced, staged, expired };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
