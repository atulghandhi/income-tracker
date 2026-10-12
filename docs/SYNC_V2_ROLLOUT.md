# Sync v2 rollout

Phase 0 of `docs/ANDROID_APP_SPEC.md` (§4). Replaces "whole ledger, last writer wins"
with compare-and-swap writes, a three-way per-transaction merge, and a realtime poke,
on the server, the web app and the iOS app. Android will be built on it from day one.

## What changed

| Layer | Change | Where |
|---|---|---|
| Database | `revision` + `updated_by` on `ledgerlite_states`; every write bumps the revision (old clients' blind upserts included); schema downgrades refused; `ledgerlite_push_state` compare-and-swap RPC; a private realtime poke (`ledger:<user id>`) after every write | `supabase/migrations/20261012000000_ledger_sync_v2.sql` |
| Web | Sync engine (push via RPC, merge on conflict, pull on poke / tab focus / reconnect / 30 s poll when realtime is down); three-way merge; `normalizeState` moved to its own module and now keeps unknown fields; first-sign-in dialog offers **Combine both**; read-only mode when the cloud is on a newer schema; Apple and email/password sign-in, password reset | `src/sync/`, `src/ledgerState.ts`, `src/supabase.ts`, `src/storage.ts`, `src/App.tsx` |
| iOS | Same engine in Swift, JSON-level merge ported line for line, unknown keys carried on every push, realtime client (foreground only), three-choice first-sync sheet | `ios/IncomeTracker/Sync/`, `App/LedgerStore+Persistence.swift`, `App/RootView.swift`, `Models/LedgerStore.swift`, `Features/Settings/MergeConflictSheet.swift` |

Bugs fixed along the way:

- An open web tab overwrote edits made on other devices (it never pulled after load and pushed blind).
- The web dropped a goal's linked account (`goal.accountId`) on every reload.
- First sign-in treated two different ledgers as "the same" whenever each month's
  transaction counts and totals matched (two different £10 coffees), and silently
  replaced local data with the cloud's. It now compares transaction and account ids.
- Web and iOS dropped fields they didn't recognise and re-saved, erasing data written by newer clients.

## Tests

| Suite | Command | What it covers |
|---|---|---|
| SQL | see `supabase/tests/README.md` | CAS, conflicts, legacy upserts, schema guard, RLS isolation, realtime topic authorisation, failed broadcast never fails a save (18 checks) |
| Merge + convergence | `npx playwright test tests/syncMerge.spec.ts --project=chromium` | Merge rules, unknown fields, `goal.accountId`, three devices × 8 random seeds converging with no lost or duplicated transactions |
| Engine | `npx playwright test tests/syncEngine.spec.ts --project=chromium` | Two/three devices on a fake CAS server: live adds, offline edits, edits mid-push, schema gate, first-sync choice, no echo of foreign formatting, no push loop |
| Browser end to end | `npm run test:sync` | Two signed-in browser windows against a fake Supabase: live add, concurrent adds (conflict path asserted), combine on first sign-in, newer-schema cloud never overwritten |
| iOS (Linux or macOS) | `ios/LinuxTests/run.sh` / `xcodebuild test` | Merge parity with the web on 60 generated fixtures, unknown-field carrying, engine scenarios |

Regenerate the merge fixtures after changing `src/sync/merge.ts`:
`GENERATE_MERGE_FIXTURES=1 npx playwright test tests/generateMergeFixtures.spec.ts --project=chromium`.

## Rollout steps

Do these in order. Steps 1–3 are safe with old web and iOS builds still in use.

### 1. Database

1. Apply the migration to a Supabase **branch** (or a local `supabase start`) first.
2. In that branch's SQL editor, check the realtime helper exists and works:
   `select realtime.send('{"ping":1}'::jsonb, 'state_changed', 'ledger:test', true);`
   If the project predates Broadcast from Database, enable it under Realtime settings.
3. Smoke test with the web build pointed at the branch (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`): sign in in two browsers, add in one, see it in the
   other within a few seconds.
4. Apply to production. Old clients keep working: their upserts still succeed and now
   bump the revision, so new clients notice them.
5. Optional, recommended: Realtime settings → turn off "Allow public access" so every
   channel must be private. This app only uses private channels.

### 2. Auth providers (Supabase dashboard → Authentication)

- **Apple** (new for web, needed for Android): create a Services ID and a Sign in with
  Apple key in the Apple Developer account, add the Services ID, Team ID, Key ID and key
  to the Apple provider, and keep the iOS bundle id `com.incometracking.app` in its
  client IDs so native iOS sign-in still works. The generated client secret expires
  after **6 months**: put a calendar reminder to rotate it, or Apple sign-in on the web
  and Android stops working.
- **Email**: already enabled for iOS. Confirm the "Confirm email" setting matches what
  you want; the web handles both (it says "check your inbox" when confirmation is on).
- **URL configuration**: the production origin(s) must be in Redirect URLs (Apple
  OAuth and password-reset links return there), alongside `incometracker://auth-callback`.
- **Google**: nothing new for web/iOS. For Android later, add the web client ID to
  "Authorized Client IDs".

### 3. Web

Deploy as usual. Tabs already open on the old build keep their old behaviour until
reloaded; their writes bump the revision so updated devices merge them.

### 4. iOS

1. `cd ios && xcodegen generate`, build in Xcode. The SwiftUI and networking files
   (`SyncCoordinator`, `RootView`, `MergeConflictSheet`) were written without an Apple
   SDK in reach: expect a small amount of API drift to fix. Everything Foundation-only
   was compiled and tested with Swift 6.1.
2. `xcodebuild test -scheme IncomeTrackerTests -destination 'platform=iOS Simulator,name=iPhone 16'`.
3. On a device signed in to the same account as a web browser: add on each side and
   watch the other update; put the phone in airplane mode, edit on both, reconnect.
   Check the realtime socket joins (Supabase dashboard → Realtime inspector, topic
   `ledger:<user id>`).
4. TestFlight, then release.

Upgrading users: a device whose data has the same transaction ids as the cloud adopts
the cloud silently on first launch; one with genuinely different data sees the
combine / use account / use this device choice once.

### 5. Cutover (later, once most iOS users have updated)

Old iOS builds still write blind (they now bump the revision, so nobody's edits
disappear for good, but a stale build can still overwrite a newer edit). Once
adoption is high, block direct writes so only the RPC can write. `ledgerlite_push_state`
runs as the caller today, so it must switch to definer rights **before** the grant is
revoked, or it would be blocked too. Ship as a new migration:

```sql
-- Only the compare-and-swap RPC may write the ledger from now on.
alter function public.ledgerlite_push_state(jsonb, bigint, text) security definer;
revoke insert, update on public.ledgerlite_states from authenticated;
```

The RPC only ever touches the row where `user_id = auth.uid()`, so definer rights don't
widen access. Old iOS builds will then show "offline" until updated, and keep their
edits locally.

## Known gaps

- iOS doesn't create scheduled debt-payment rows the way the web's `syncLedgerLinks`
  does; it keeps the ones the web made. The merge handles this, but a full iOS port of
  `syncLedgerLinks` would remove the difference.
- The iOS realtime client speaks the Phoenix channel protocol directly. It compiles and
  follows supabase-js's join/heartbeat/broadcast frames, but has not yet run against a
  live Supabase project; if it misbehaves, the foreground refresh and "Sync now" still
  keep devices in step.
- Unknown fields inside import-batch transaction refs aren't carried by iOS (refs have no id to match on).
