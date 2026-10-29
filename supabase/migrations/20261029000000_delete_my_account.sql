-- Lets a signed-in user delete their Income Tracker account from inside the app,
-- as App Store guideline 5.1.1(v) requires.
--
-- This Supabase project's logins (auth.users) are shared with other apps:
-- Glassnote, Secret Santa and site comments. So the function always deletes the
-- Income Tracker data (ledger, profile, bank feeds) and then deletes the login
-- itself only when nothing in those other apps belongs to it. Feedback the user
-- sent is kept but unlinked (ledgerlite_feedback.user_id is on delete set null).
--
-- Returns true when the login was deleted too, false when it was kept for
-- another app.

create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  used_elsewhere boolean := false;
  other_app_table text;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  delete from public.ledgerlite_states where user_id = uid;
  delete from public.ledgerlite_profiles where id = uid;
  if to_regclass('public.feed_transactions') is not null then
    execute 'delete from public.feed_transactions where user_id = $1' using uid;
  end if;
  if to_regclass('public.bank_connections') is not null then
    execute 'delete from public.bank_connections where user_id = $1' using uid;
  end if;

  -- Rows in another app that belong to this login. Tables that don't exist are skipped.
  foreach other_app_table in array array[
    'glassnote.users:id',
    'glassnote.subscriptions:user_id',
    'glassnote.api_keys:user_id',
    'glassnote.usage_daily:user_id',
    'public.secret_santa_lists:user_id',
    'public.comments:user_id'
  ] loop
    if to_regclass(split_part(other_app_table, ':', 1)) is not null then
      execute format(
        'select exists (select 1 from %s where %I = $1)',
        split_part(other_app_table, ':', 1),
        split_part(other_app_table, ':', 2)
      ) into used_elsewhere using uid;
      exit when used_elsewhere;
    end if;
  end loop;

  if used_elsewhere then
    return false;
  end if;

  delete from auth.users where id = uid;
  return true;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
