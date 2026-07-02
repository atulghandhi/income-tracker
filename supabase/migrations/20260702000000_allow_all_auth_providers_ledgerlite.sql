-- LedgerLite previously restricted all row access to Google-authenticated users
-- via public.ledgerlite_is_google_user(). The apps now support Apple and
-- email/password sign-in, so policies only require the row to belong to the
-- authenticated user.

drop policy if exists "Users can read their own LedgerLite profile." on public.ledgerlite_profiles;
create policy "Users can read their own LedgerLite profile."
on public.ledgerlite_profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can insert their own LedgerLite profile." on public.ledgerlite_profiles;
create policy "Users can insert their own LedgerLite profile."
on public.ledgerlite_profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Users can update their own LedgerLite profile." on public.ledgerlite_profiles;
create policy "Users can update their own LedgerLite profile."
on public.ledgerlite_profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can delete their own LedgerLite profile." on public.ledgerlite_profiles;
create policy "Users can delete their own LedgerLite profile."
on public.ledgerlite_profiles
for delete
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can read their own LedgerLite state." on public.ledgerlite_states;
create policy "Users can read their own LedgerLite state."
on public.ledgerlite_states
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own LedgerLite state." on public.ledgerlite_states;
create policy "Users can insert their own LedgerLite state."
on public.ledgerlite_states
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own LedgerLite state." on public.ledgerlite_states;
create policy "Users can update their own LedgerLite state."
on public.ledgerlite_states
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own LedgerLite state." on public.ledgerlite_states;
create policy "Users can delete their own LedgerLite state."
on public.ledgerlite_states
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop function if exists public.ledgerlite_is_google_user();
