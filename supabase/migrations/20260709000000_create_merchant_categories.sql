-- Stage C (AI categorization backstop): shared merchant→category cache.
-- Keyed by a hash of the canonicalized description, so the same UK bank
-- descriptor is only ever sent to the LLM once across the whole user base.
-- Deliberately stores NO user linkage: no user_id, no amounts, no dates.
create table if not exists public.merchant_categories (
  pattern_hash text primary key,
  cleaned_merchant text not null default '',
  category text not null,
  kind text not null default 'expense' check (kind in ('income', 'expense', 'debt-payment', 'transfer')),
  confidence numeric not null default 0.7 check (confidence >= 0 and confidence <= 1),
  hit_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.merchant_categories enable row level security;

-- No client access at all: only the categorize-batch edge function (service
-- role, which bypasses RLS) may read or write the cache. No grants, no
-- policies — anon/authenticated cannot touch it.
revoke all on public.merchant_categories from anon;
revoke all on public.merchant_categories from authenticated;
