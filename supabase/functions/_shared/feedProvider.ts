// Stage E: provider abstraction (docs/AUTOMATION_PLAN.md §4E1).
// The aggregator must be swappable — TrueLayer today, Yapily/Tink tomorrow —
// so the sync worker and connect flow only ever talk to this interface.
// The iOS FinanceKit service conforms to a client-side subset of the same
// shape, which is what proves the abstraction.

export type FeedTokens = {
  accessToken: string;
  refreshToken: string;
  // Epoch millis when accessToken expires.
  expiresAt: number;
};

export type FeedTransaction = {
  // Provider's stable transaction ID — the dedupe key.
  providerTransactionId: string;
  // ISO date (yyyy-mm-dd) the transaction posted.
  postedAt: string;
  description: string;
  // Signed: positive = money in, negative = money out.
  amount: number;
  currency: string;
  merchantName: string;
  bankCategory: string;
};

export type FeedTransactionPage = {
  transactions: FeedTransaction[];
  // Opaque cursor to persist and pass back on the next sync; null when the
  // provider is date-windowed rather than cursor-based.
  nextCursor: string | null;
};

export interface FeedProvider {
  readonly name: string;

  // Hosted-auth URL the user is sent to (bank selection + SCA happen on the
  // provider's side; we never see credentials). `state` round-trips intact.
  buildAuthLink(options: { redirectUri: string; state: string }): string;

  // OAuth code → tokens, after the provider redirects back.
  exchangeCode(options: { code: string; redirectUri: string }): Promise<FeedTokens>;

  refreshTokens(refreshToken: string): Promise<FeedTokens>;

  // Transactions since the cursor (or a provider-default window on first sync).
  fetchTransactions(options: { accessToken: string; cursor: string | null }): Promise<FeedTransactionPage>;

  // Human label for the connection ("TrueLayer · Monzo") when derivable.
  fetchDisplayName(accessToken: string): Promise<string>;
}
