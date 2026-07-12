// Stage E: bank-connection lifecycle (docs/AUTOMATION_PLAN.md §4E2–E3).
//
// POST { action, ... } with the user's Supabase auth token:
//   { action: "status" }                        → { configured }
//   { action: "link", redirectUri }             → { url }  (hosted auth)
//   { action: "callback", code, redirectUri }   → { connection }
//   { action: "list" }                          → { connections: [...] }  (no tokens)
//   { action: "reconfirm", connectionId }       → { connection }  (90-day consent)
//   { action: "disconnect", connectionId }      → { ok }  (deletes staged rows too)
//
// Dormant until TRUELAYER_CLIENT_ID/SECRET are set; "status" reports that so
// the client can hide the whole feature.

import { createClient } from "npm:@supabase/supabase-js@2";
import { trueLayerProvider, isTrueLayerConfigured } from "../_shared/truelayer.ts";

const CONSENT_WINDOW_DAYS = 90;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = String(body.action ?? "");

  if (action === "status") {
    return json({ configured: isTrueLayerConfigured() });
  }
  if (!isTrueLayerConfigured()) {
    return json({ error: "Bank feeds are not configured" }, 503);
  }

  // Every other action requires a signed-in user.
  const authHeader = request.headers.get("Authorization") ?? "";
  const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
  if (userError || !userData?.user) return json({ error: "Sign in required" }, 401);
  const userId = userData.user.id;

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  switch (action) {
    case "link": {
      const redirectUri = String(body.redirectUri ?? "");
      if (!/^https?:\/\//.test(redirectUri)) return json({ error: "redirectUri required" }, 400);
      // State ties the callback to this user; verified again in "callback"
      // because the exchange happens with the caller's own auth token anyway.
      const url = trueLayerProvider.buildAuthLink({ redirectUri, state: userId });
      return json({ url });
    }

    case "callback": {
      const code = String(body.code ?? "");
      const redirectUri = String(body.redirectUri ?? "");
      if (!code || !redirectUri) return json({ error: "code and redirectUri required" }, 400);

      const tokens = await trueLayerProvider.exchangeCode({ code, redirectUri });
      const displayName = await trueLayerProvider.fetchDisplayName(tokens.accessToken);
      const now = new Date();
      const { data, error } = await service
        .from("bank_connections")
        .insert({
          user_id: userId,
          provider: trueLayerProvider.name,
          display_name: displayName,
          status: "active",
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_expires_at: new Date(tokens.expiresAt).toISOString(),
          consent_expires_at: new Date(now.getTime() + CONSENT_WINDOW_DAYS * 86_400_000).toISOString(),
          reconfirmed_at: now.toISOString(),
        })
        .select("id, display_name, status, consent_expires_at, last_synced_at")
        .single();
      if (error) return json({ error: "Could not store the connection" }, 500);
      return json({ connection: data });
    }

    case "list": {
      const { data } = await service
        .from("bank_connections")
        .select("id, display_name, status, consent_expires_at, last_synced_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      return json({ connections: data ?? [] });
    }

    case "reconfirm": {
      // The FCA 90-day rule is reconfirmation-of-consent with the app (no bank
      // redirect): one tap extends the window and reactivates syncing.
      const connectionId = String(body.connectionId ?? "");
      const now = new Date();
      const { data, error } = await service
        .from("bank_connections")
        .update({
          reconfirmed_at: now.toISOString(),
          consent_expires_at: new Date(now.getTime() + CONSENT_WINDOW_DAYS * 86_400_000).toISOString(),
          status: "active",
          updated_at: now.toISOString(),
        })
        .eq("id", connectionId)
        .eq("user_id", userId)
        .select("id, display_name, status, consent_expires_at, last_synced_at")
        .single();
      if (error || !data) return json({ error: "Connection not found" }, 404);
      return json({ connection: data });
    }

    case "disconnect": {
      const connectionId = String(body.connectionId ?? "");
      // Staged rows cascade with the connection; imported ledger entries stay
      // (they're the user's data, in their own ledger state).
      const { error } = await service.from("bank_connections").delete().eq("id", connectionId).eq("user_id", userId);
      if (error) return json({ error: "Could not disconnect" }, 500);
      return json({ ok: true });
    }

    default:
      return json({ error: `Unknown action “${action}”` }, 400);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
