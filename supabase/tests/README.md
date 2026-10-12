# Database tests

`sync_v2_test.sql` checks the Sync v2 migration (compare-and-swap push, conflicts,
legacy upserts, the schema-downgrade guard, row isolation between users, realtime
topic authorisation, and that a failed broadcast never fails a save).

It runs against a plain local Postgres. `sync_v2_stubs.sql` stands in for the parts of
Supabase the migrations rely on (`auth.uid()`, the `anon`/`authenticated` roles,
`realtime.messages`, `realtime.topic()` and `realtime.send()`).

```bash
createdb ledger_test
psql -d ledger_test -f supabase/tests/sync_v2_stubs.sql
for f in supabase/migrations/*.sql; do psql -q -d ledger_test -f "$f"; done
psql -d ledger_test -f supabase/tests/sync_v2_test.sql   # prints "ok: …" per check, stops on the first FAIL
```

With the Supabase CLI, `supabase start` already provides the real `auth` and
`realtime` schemas, so skip the stubs file. The realtime checks assume
`realtime.topic()` reads the `realtime.topic` setting, as the stub does.
