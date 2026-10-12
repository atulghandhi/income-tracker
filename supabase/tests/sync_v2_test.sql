\set ON_ERROR_STOP 1
\set u1 '11111111-1111-1111-1111-111111111111'
\set u2 '22222222-2222-2222-2222-222222222222'
create or replace function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'FAIL: %', label; end if; raise notice 'ok: %', label; end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', :'u1', false);

-- T1 first push with base 0 inserts revision 1
select pg_temp.check((select status = 'ok' and revision = 1 and updated_by = 'devA' from public.ledgerlite_push_state('{"schemaVersion":8,"n":1}', 0, 'devA')), 'first push inserts rev 1 by devA');
-- T2 base 0 again -> conflict returns current
select pg_temp.check((select status = 'conflict' and revision = 1 and state->>'n' = '1' from public.ledgerlite_push_state('{"schemaVersion":8,"n":9}', 0, 'devB')), 'second base-0 push conflicts');
-- T3 CAS with correct base
select pg_temp.check((select status = 'ok' and revision = 2 from public.ledgerlite_push_state('{"schemaVersion":8,"n":2}', 1, 'devB')), 'CAS on rev 1 ok -> rev 2');
-- T4 stale base
select pg_temp.check((select status = 'conflict' and revision = 2 and state->>'n' = '2' and updated_by = 'devB' from public.ledgerlite_push_state('{"schemaVersion":8,"n":3}', 1, 'devA')), 'stale base conflicts with current row');
-- T5 legacy blind upsert bumps revision, updated_by null
insert into public.ledgerlite_states (user_id, state, schema_version, updated_at) values (:'u1', '{"schemaVersion":8,"n":4}', 8, now())
  on conflict (user_id) do update set state = excluded.state, schema_version = excluded.schema_version, updated_at = excluded.updated_at;
select pg_temp.check((select revision = 3 and updated_by is null from public.ledgerlite_states), 'legacy upsert bumps to rev 3, updated_by null');
-- T6 schema newer in cloud -> schema_too_old
select pg_temp.check((select status = 'ok' and revision = 4 from public.ledgerlite_push_state('{"schemaVersion":9,"n":5}', 3, 'devC')), 'newer schema write ok');
select pg_temp.check((select status = 'schema_too_old' and revision = 4 from public.ledgerlite_push_state('{"schemaVersion":8,"n":6}', 4, 'devA')), 'older client gets schema_too_old');
-- T7 legacy downgrade raises
do $$ begin
  begin
    update public.ledgerlite_states set state = '{"schemaVersion":8}', schema_version = 8;
    raise exception 'FAIL: legacy downgrade allowed';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'ok: legacy downgrade refused (%)', sqlerrm;
  end;
end $$;
-- T8 user 2 cannot see or touch user 1
select set_config('request.jwt.claim.sub', :'u2', false);
select pg_temp.check((select count(*) = 0 from public.ledgerlite_states), 'u2 sees no u1 rows');
select pg_temp.check((select status = 'missing' from public.ledgerlite_push_state('{"schemaVersion":8}', 4, 'devX')), 'u2 with base>0 gets missing');
select pg_temp.check((select status = 'ok' and revision = 1 from public.ledgerlite_push_state('{"schemaVersion":8,"mine":true}', 0, 'devX')), 'u2 creates own row');
-- T9 not authenticated
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin perform public.ledgerlite_push_state('{"schemaVersion":8}', 0, 'x'); raise exception 'FAIL: anon push';
  exception when sqlstate '28000' then raise notice 'ok: unauthenticated push refused'; end;
end $$;
-- T10 non-object payload
select set_config('request.jwt.claim.sub', :'u2', false);
do $$ begin
  begin perform public.ledgerlite_push_state('[1]', 1, 'x'); raise exception 'FAIL: array accepted';
  exception when sqlstate '22023' then raise notice 'ok: non-object refused'; end;
end $$;
-- T11 realtime visibility: u2 joins own topic sees only own messages
select set_config('realtime.topic', 'ledger:' || :'u2', false);
select pg_temp.check((select count(*) >= 1 from realtime.messages), 'u2 may join own topic');
select set_config('realtime.topic', 'ledger:' || :'u1', false);
select pg_temp.check((select count(*) = 0 from realtime.messages), 'u2 cannot join u1 topic');
reset role;
select pg_temp.check((select count(*) = 4 from realtime.messages where topic = 'ledger:' || :'u1'), 'one poke per u1 write (4)');
select pg_temp.check((select bool_and(private and event = 'state_changed' and payload ? 'revision' and not payload ? 'state') from realtime.messages), 'pokes are private, tiny, no state');
-- T12 anon cannot execute
set role anon;
do $$ begin
  begin perform public.ledgerlite_push_state('{}', 0, 'x'); raise exception 'FAIL: anon exec';
  exception when insufficient_privilege then raise notice 'ok: anon has no execute'; end;
end $$;
