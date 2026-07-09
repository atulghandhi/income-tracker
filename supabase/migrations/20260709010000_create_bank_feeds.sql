-- Stage E (open banking feeds): connections + staged transactions.
--
-- bank_connections holds provider tokens, so the CLIENT HAS NO ACCESS AT ALL —
-- every read/write goes through the feeds-connect / feeds-sync edge functions
-- (service role). feed_transactions is the staging area the client reads to
-- build import-review rows, and may only flip status on its own rows.

create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'truelayer',
  provider_connection_id text,
  display_name text not null default 'Bank connection',
  status text not null default 'pending' check (status in ('pending', 'active', 'expired', 'revoked', 'error')),
  -- Encrypted at rest by Postgres storage; never exposed to the client role.
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  -- UK 90-day reconfirmation-of-consent clock (FCA Article 10A): the app
  -- reconfirms in-app, no bank redirect. feeds-sync stops pulling when passed.
  consent_expires_at timestamptz,
  reconfirmed_at timestamptz,
  last_synced_at timestamptz,
  sync_cursor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bank_connections enable row level security;
revoke all on public.bank_connections from anon;
revoke all on public.bank_connections from authenticated;

create table if not exists public.feed_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.bank_connections(id) on delete cascade,
  provider_transaction_id text not null,
  posted_at date not null,
  description text not null,
  -- Signed: positive = money in, negative = money out (import-row convention).
  amount numeric(12, 2) not null,
  currency text not null default 'GBP',
  merchant_name text not null default '',
  bank_category text not null default '',
  status text not null default 'staged' check (status in ('staged', 'imported', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (connection_id, provider_transaction_id)
);

create index if not exists feed_transactions_user_status_idx
  on public.feed_transactions (user_id, status);

alter table public.feed_transactions enable row level security;

grant select, update (status) on public.feed_transactions to authenticated;

drop policy if exists "Users read their own staged transactions." on public.feed_transactions;
create policy "Users read their own staged transactions."
on public.feed_transactions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users update status on their own rows." on public.feed_transactions;
create policy "Users update status on their own rows."
on public.feed_transactions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
