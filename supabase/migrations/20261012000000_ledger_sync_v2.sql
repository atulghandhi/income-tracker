-- Sync v2 (docs/ANDROID_APP_SPEC.md §4): revisioned compare-and-swap writes and a
-- realtime poke so web, iOS and Android stop overwriting each other's edits.
--
-- Backwards compatible: the blind upserts older web/iOS builds send still succeed
-- (and still bump the revision, so newer clients notice them). Only a write that
-- would lower schema_version is refused.

-- 1. Revision + writer columns ------------------------------------------------

alter table public.ledgerlite_states
  add column if not exists revision bigint not null default 1,
  add column if not exists updated_by text;

-- 2. Every insert/update bumps the revision and records the writer -------------
--
-- updated_by comes from a transaction-local setting that ledgerlite_push_state
-- sets, so a legacy blind upsert is recorded with updated_by = null (no device
-- will mistake it for its own echo).

create or replace function public.ledgerlite_states_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.schema_version < old.schema_version then
      raise exception 'schema downgrade refused (% < %)', new.schema_version, old.schema_version
        using errcode = 'P0001', hint = 'schema_too_old';
    end if;
    new.revision := old.revision + 1;
  else
    new.revision := 1;
  end if;
  new.updated_by := nullif(current_setting('ledgerlite.device_id', true), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ledgerlite_states_before_write on public.ledgerlite_states;
create trigger ledgerlite_states_before_write
  before insert or update on public.ledgerlite_states
  for each row execute function public.ledgerlite_states_before_write();

-- 3. Compare-and-swap push ------------------------------------------------------
--
-- status:
--   ok              written; revision is the new revision
--   conflict        someone else wrote first; state/revision are the current row
--   schema_too_old  the cloud holds a newer schema than the caller understands
--   missing         p_base_revision > 0 but there is no row (retry with 0)
--
-- SECURITY INVOKER, so the existing row-level security still applies.

create or replace function public.ledgerlite_push_state(
  p_state jsonb,
  p_base_revision bigint,
  p_device_id text
)
returns table (status text, revision bigint, state jsonb, updated_by text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_version integer := coalesce((p_state ->> 'schemaVersion')::integer, 0);
  v_written public.ledgerlite_states;
  v_current public.ledgerlite_states;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'state must be a JSON object' using errcode = '22023';
  end if;

  perform set_config('ledgerlite.device_id', coalesce(p_device_id, ''), true);

  if p_base_revision = 0 then
    insert into public.ledgerlite_states as s (user_id, state, schema_version)
    values (v_uid, p_state, v_version)
    on conflict (user_id) do nothing
    returning s.* into v_written;
  else
    update public.ledgerlite_states as s
       set state = p_state,
           schema_version = v_version
     where s.user_id = v_uid
       and s.revision = p_base_revision
       and s.schema_version <= v_version
    returning s.* into v_written;
  end if;

  if v_written.user_id is not null then
    return query select 'ok'::text, v_written.revision, null::jsonb, v_written.updated_by;
    return;
  end if;

  select * into v_current from public.ledgerlite_states as s where s.user_id = v_uid;

  if v_current.user_id is null then
    return query select 'missing'::text, 0::bigint, null::jsonb, null::text;
    return;
  end if;

  return query
    select case when v_current.schema_version > v_version then 'schema_too_old' else 'conflict' end,
           v_current.revision,
           v_current.state,
           v_current.updated_by;
end;
$$;

revoke all on function public.ledgerlite_push_state(jsonb, bigint, text) from public;
revoke all on function public.ledgerlite_push_state(jsonb, bigint, text) from anon;
grant execute on function public.ledgerlite_push_state(jsonb, bigint, text) to authenticated;

-- 4. Realtime poke to the owner's private topic ---------------------------------
--
-- The payload is deliberately tiny; devices fetch the row themselves. Ledgers with
-- years of imports run to megabytes and must never ride the socket.

create or replace function public.ledgerlite_states_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'revision', new.revision,
      'updated_by', new.updated_by,
      'schema_version', new.schema_version
    ),
    'state_changed',
    'ledger:' || new.user_id::text,
    true
  );
  return null;
exception when others then
  -- A realtime hiccup must never fail the user's save.
  raise warning 'ledgerlite broadcast failed: %', sqlerrm;
  return null;
end;
$$;

revoke all on function public.ledgerlite_states_broadcast() from public;

drop trigger if exists ledgerlite_states_broadcast on public.ledgerlite_states;
create trigger ledgerlite_states_broadcast
  after insert or update on public.ledgerlite_states
  for each row execute function public.ledgerlite_states_broadcast();

-- 5. Only the owner may join their private topic --------------------------------
--
-- No INSERT policy, so clients cannot send on the topic; only the trigger above can.

drop policy if exists "Users receive their own ledger broadcasts" on realtime.messages;
create policy "Users receive their own ledger broadcasts"
on realtime.messages
for select
to authenticated
using (
  (select realtime.topic()) = 'ledger:' || (select auth.uid())::text
  and realtime.messages.extension = 'broadcast'
);
