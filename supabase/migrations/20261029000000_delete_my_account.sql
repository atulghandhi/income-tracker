-- Lets a signed-in user delete their own account from inside the app, as App
-- Store guideline 5.1.1(v) requires. Deleting the auth.users row removes the
-- ledger, profile and bank-feed rows through their on-delete-cascade foreign
-- keys; feedback the user sent is kept but unlinked (on delete set null).

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
