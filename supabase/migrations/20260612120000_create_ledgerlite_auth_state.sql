create table if not exists public.ledgerlite_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ledgerlite_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  schema_version integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ledgerlite_profiles enable row level security;
alter table public.ledgerlite_states enable row level security;

grant select, insert, update, delete on public.ledgerlite_profiles to authenticated;
grant select, insert, update, delete on public.ledgerlite_states to authenticated;

-- Keep LedgerLite locked to Google-authenticated users even if another provider
-- is accidentally enabled in the Supabase project later.
create or replace function public.ledgerlite_is_google_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
    or (select auth.jwt()) -> 'app_metadata' ->> 'provider' = 'google';
$$;

revoke all on function public.ledgerlite_is_google_user() from public;
grant execute on function public.ledgerlite_is_google_user() to authenticated;

drop policy if exists "Users can read their own LedgerLite profile." on public.ledgerlite_profiles;
create policy "Users can read their own LedgerLite profile."
on public.ledgerlite_profiles
for select
to authenticated
using ((select auth.uid()) = id and public.ledgerlite_is_google_user());

drop policy if exists "Users can insert their own LedgerLite profile." on public.ledgerlite_profiles;
create policy "Users can insert their own LedgerLite profile."
on public.ledgerlite_profiles
for insert
to authenticated
with check ((select auth.uid()) = id and public.ledgerlite_is_google_user());

drop policy if exists "Users can update their own LedgerLite profile." on public.ledgerlite_profiles;
create policy "Users can update their own LedgerLite profile."
on public.ledgerlite_profiles
for update
to authenticated
using ((select auth.uid()) = id and public.ledgerlite_is_google_user())
with check ((select auth.uid()) = id and public.ledgerlite_is_google_user());

drop policy if exists "Users can delete their own LedgerLite profile." on public.ledgerlite_profiles;
create policy "Users can delete their own LedgerLite profile."
on public.ledgerlite_profiles
for delete
to authenticated
using ((select auth.uid()) = id and public.ledgerlite_is_google_user());

drop policy if exists "Users can read their own LedgerLite state." on public.ledgerlite_states;
create policy "Users can read their own LedgerLite state."
on public.ledgerlite_states
for select
to authenticated
using ((select auth.uid()) = user_id and public.ledgerlite_is_google_user());

drop policy if exists "Users can insert their own LedgerLite state." on public.ledgerlite_states;
create policy "Users can insert their own LedgerLite state."
on public.ledgerlite_states
for insert
to authenticated
with check ((select auth.uid()) = user_id and public.ledgerlite_is_google_user());

drop policy if exists "Users can update their own LedgerLite state." on public.ledgerlite_states;
create policy "Users can update their own LedgerLite state."
on public.ledgerlite_states
for update
to authenticated
using ((select auth.uid()) = user_id and public.ledgerlite_is_google_user())
with check ((select auth.uid()) = user_id and public.ledgerlite_is_google_user());

drop policy if exists "Users can delete their own LedgerLite state." on public.ledgerlite_states;
create policy "Users can delete their own LedgerLite state."
on public.ledgerlite_states
for delete
to authenticated
using ((select auth.uid()) = user_id and public.ledgerlite_is_google_user());

create index if not exists ledgerlite_states_updated_at_idx
on public.ledgerlite_states (updated_at desc);
