// TrueLayer implementation of FeedProvider (UK AIS, agency model — the app
// itself needs no FCA authorization; confirm scope in writing with TrueLayer).
//
// Secrets: TRUELAYER_CLIENT_ID, TRUELAYER_CLIENT_SECRET
// Optional: TRUELAYER_ENV=sandbox|live (default sandbox)
//
// API refs: https://docs.truelayer.com/ (Data API v1). Endpoints used:
//   auth:   https://auth[.sandbox].truelayer.com  (/  + /connect/token)
//   data:   https://api[.sandbox].truelayer.com/data/v1
// Cursoring: the Data API is date-windowed; the "cursor" we persist is the
// ISO timestamp of the newest transaction seen, minus a 5-day overlap.

import type { FeedProvider, FeedTokens, FeedTransactionPage } from "./feedProvider.ts";

const OVERLAP_DAYS = 5;

function environment(): "sandbox" | "live" {
  return Deno.env.get("TRUELAYER_ENV") === "live" ? "live" : "sandbox";
}

function authBase(): string {
  return environment() === "live" ? "https://auth.truelayer.com" : "https://auth.truelayer-sandbox.com";
}

function apiBase(): string {
  return environment() === "live" ? "https://api.truelayer.com" : "https://api.truelayer-sandbox.com";
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get("TRUELAYER_CLIENT_ID");
  const clientSecret = Deno.env.get("TRUELAYER_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("TrueLayer credentials are not configured");
  return { clientId, clientSecret };
}

export function isTrueLayerConfigured(): boolean {
  return Boolean(Deno.env.get("TRUELAYER_CLIENT_ID") && Deno.env.get("TRUELAYER_CLIENT_SECRET"));
}

async function tokenRequest(body: Record<string, string>): Promise<FeedTokens> {
  const response = await fetch(`${authBase()}/connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!response.ok) throw new Error(`TrueLayer token exchange failed (${response.status})`);
  const payload = await response.json();
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? "",
    expiresAt: Date.now() + (Number(payload.expires_in) || 3600) * 1000,
  };
}

export const trueLayerProvider: FeedProvider = {
  name: "truelayer",

  buildAuthLink({ redirectUri, state }) {
    const { clientId } = credentials();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: "info accounts balance transactions offline_access",
      redirect_uri: redirectUri,
      state,
      providers: environment() === "live" ? "uk-ob-all uk-oauth-all" : "uk-cs-mock",
    });
    return `${authBase()}/?${params.toString()}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const { clientId, clientSecret } = credentials();
    return tokenRequest({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });
  },

  async refreshTokens(refreshToken) {
    const { clientId, clientSecret } = credentials();
    return tokenRequest({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
  },

  async fetchTransactions({ accessToken, cursor }) {
    const headers = { Authorization: `Bearer ${accessToken}` };

    const accountsResponse = await fetch(`${apiBase()}/data/v1/accounts`, { headers });
    if (!accountsResponse.ok) throw new Error(`TrueLayer accounts fetch failed (${accountsResponse.status})`);
    const accounts: Array<{ account_id: string }> = (await accountsResponse.json()).results ?? [];

    const fromDate = cursor
      ? new Date(Date.parse(cursor) - OVERLAP_DAYS * 86_400_000)
      : new Date(Date.now() - 90 * 86_400_000);
    const from = fromDate.toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);

    const transactions: FeedTransactionPage["transactions"] = [];
    let newest = cursor ? Date.parse(cursor) : 0;

    for (const account of accounts) {
      const url = `${apiBase()}/data/v1/accounts/${account.account_id}/transactions?from=${from}&to=${to}`;
      const response = await fetch(url, { headers });
      if (!response.ok) continue; // one broken account must not kill the sync
      const results: Array<Record<string, unknown>> = (await response.json()).results ?? [];

      for (const item of results) {
        const id = String(item.transaction_id ?? "");
        const timestamp = String(item.timestamp ?? "");
        const amount = Number(item.amount);
        if (!id || !timestamp || !Number.isFinite(amount)) continue;
        newest = Math.max(newest, Date.parse(timestamp) || 0);
        transactions.push({
          providerTransactionId: `${account.account_id}:${id}`,
          postedAt: timestamp.slice(0, 10),
          description: String(item.description ?? "").slice(0, 200),
          // TrueLayer amounts are already signed (negative = debit).
          amount: Number(amount.toFixed(2)),
          currency: String(item.currency ?? "GBP"),
          merchantName: String(item.merchant_name ?? ""),
          bankCategory: String(item.transaction_category ?? "").replaceAll("_", " ").toLowerCase(),
        });
      }
    }

    return {
      transactions,
      nextCursor: newest ? new Date(newest).toISOString() : cursor,
    };
  },

  async fetchDisplayName(accessToken) {
    try {
      const response = await fetch(`${apiBase()}/data/v1/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return "TrueLayer connection";
      const provider = (await response.json()).results?.[0]?.provider?.display_name;
      return provider ? `${provider} (via TrueLayer)` : "TrueLayer connection";
    } catch {
      return "TrueLayer connection";
    }
  },
};
