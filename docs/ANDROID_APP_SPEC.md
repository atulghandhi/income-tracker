# Income Tracker: Android App Specification

> **Status:** Implementation-ready plan. No Android code exists yet.
> **Date:** 12 October 2026.
> **Target:** A native Android app (phones, foldables, tablets, desktop windowing) that shares one
> account and one live dataset with the existing web app (`src/`) and iOS app (`ios/`).
> **Companion docs:** `docs/IOS_APP_SPEC.md` (screen behaviour reference), `docs/AUTOMATION_PLAN.md`,
> `docs/MONETIZATION_PLAN.md`.

---

## 0. Read this first

### 0.1 The one thing that must happen before Android

The headline requirement is: *a transaction added on web, iOS or Android shows up on the other two.*
The current sync design cannot deliver that, and it already loses data between web and iOS today:

| Fact (verified in code) | Where | Consequence |
|---|---|---|
| The whole ledger is one JSON blob per user in `ledgerlite_states.state`. | `supabase/migrations/20260612120000_*`, `src/supabase.ts` | Any write replaces everything. |
| Web pushes the full blob 240ms after any edit, with no check of what is in the cloud. | `src/App.tsx` (save effect, ~line 862) | Last writer wins, silently. |
| Web only reads the cloud on page load or sign-in. | `src/App.tsx` `hydrateCloudLedger` | An open tab never sees other devices' changes. Its next edit erases them. |
| iOS reads the cloud on launch and on foreground, and only when it has no unsaved edits. | `ios/.../LedgerStore+Persistence.swift` `refreshFromCloudIfIdle` | Better, but two devices editing in the same minute still clobber each other or raise the all-or-nothing merge sheet. |
| No revision number, no realtime channel, no per-entity merge. | schema, all clients | No way to detect or reconcile concurrent edits. |
| Web and iOS rebuild the state object field by field and drop unknown keys. iOS has no schema gate on cloud loads. | `normalizeStateFields` in `src/App.tsx`, `ios/.../LenientDecoding.swift` | An older client re-saves and wipes fields a newer client added. |

**Concrete failure today:** open the web app on a laptop, add a coffee on the iPhone, then rename a
category on the laptop. The coffee is gone from every device.

Shipping Android on top of this makes it worse (three writers instead of two). So this spec has a
**Phase 0: Sync v2**, a cross-platform change to the server, web and iOS, which Android then
implements natively. Do not skip or defer it. It is the feature the user actually asked for.

### 0.2 How to use this document (for the implementing agent)

1. Read `src/types.ts`, `src/finance.ts`, `src/App.tsx` (`normalizeState`, `syncLedgerLinks`,
   `updateLedger`) and this document's §4 before writing any Kotlin.
2. Build in the phase order in §20. Each phase has exit criteria; do not start the next phase until
   they pass.
3. Where this document and the TypeScript source disagree on **data or calculations**, the
   TypeScript source wins. Where they disagree on **Android UI, layout, input or platform
   behaviour**, this document wins.
4. Every screen in §13 lists layouts per window class (§11.2) and keyboard behaviour (§11.6).
   Implement all of them; "phone only for now" is not an acceptable intermediate state past Phase 3.
5. Pin exact library versions in `gradle/libs.versions.toml` at project start (latest stable on that
   day). This document names libraries, not versions, on purpose.

### 0.3 Definition of done (whole project)

- Same account on web, iOS and Android shows identical ledgers, accounts, goals and numbers.
- An edit on any foregrounded client appears on the other foregrounded clients within **3 seconds
  p95** without a manual refresh.
- Offline edits on any client survive and merge on reconnect, with **no lost and no duplicated
  transactions** (acceptance suite §18.4).
- The app is comfortable to use on every target in §11.1, including typing on the closed
  Galaxy Z Fold 8 cover screen in landscape, without the keyboard hiding the field being typed into.
- Engine parity tests (Kotlin vs TypeScript fixtures) pass at `1e-6`.
- Passes the accessibility, performance and device-matrix gates in §15, §16 and §18.

---

## 1. Product summary

Income Tracker is a local-first personal finance app: monthly income and expenses, accounts (cash,
savings, investments, debt), savings goals with a priority waterfall, bank-statement imports
(CSV/OFX/QIF/paste/screenshot), recurring detection, and computed insights (net-worth outlook,
health score, signals). Data lives on the device and syncs through Supabase when signed in. The app
is fully usable signed out.

### 1.1 Feature parity targets

| Area | Web | iOS | Android v1 | Priority |
|---|---|---|---|---|
| Ledger with quick-log ("costa 4.35") | yes | yes (home tab) | yes (home destination) | P0 |
| Dashboard | yes | yes | yes | P0 |
| Accounts (balances flow from transactions, debt roll-forward) | yes | yes | yes | P0 |
| Goals (waterfall, linked accounts) | yes | yes | yes | P1 |
| Insights (health score, signals, charts) | yes | yes | yes | P1 |
| Import: CSV / OFX / QIF / paste | yes | yes | yes | P1 |
| Import: screenshot OCR | no | Vision | ML Kit on-device | P2 |
| Import review, rule learning, name rules, transfer sweep, undo batch | yes | yes | yes | P1 |
| Recurring suggestions, subscriptions, missed payments | yes | yes | yes | P1 |
| AI categorisation (opt-in, edge function) | yes | partial | yes | P2 |
| Open banking feeds (TrueLayer, flag-gated) | flag | no | flag-gated, same edge functions | P3 |
| Sign in: Google | yes | yes | yes (Credential Manager) | P0 |
| Sign in: Apple | **no** | yes | yes (web OAuth flow) | P0 |
| Sign in: email + password | **no** | yes | yes | P0 |
| Live cross-device sync (Sync v2) | **to build** | **to build** | yes | P0 |
| Privacy mode + biometric lock | privacy only | Face ID | BiometricPrompt | P1 |
| Widgets | n/a | WidgetKit | Glance | P2 |
| Bill / log / import reminders | ICS export | local notifications | notifications | P2 |
| Shortcuts / voice | n/a | App Intents | App shortcuts + Quick Settings tile | P2 |
| Feedback | yes | yes | yes | P2 |
| Export JSON / CSV, import JSON backup | yes | yes | yes | P1 |

### 1.2 Android-only value (why native and not a wrapped PWA)

The web app is already an installable PWA. A Trusted Web Activity would ship in days, but it cannot
deliver what was asked: control over the soft keyboard on short windows, fold/unfold continuity,
posture-aware layouts, Glance widgets, share targets for statement files, biometric lock and
on-device OCR. The iOS app already set the precedent of a native port with parity tests; Android
follows the same pattern.

Android-native additions:

- **Adaptive layouts** that use every screen: list-detail on inner fold and tablets, posture-aware
  split around the hinge, a dedicated short-window mode for cover screens and split-screen.
- **Share target**: share a CSV/OFX/QIF file, a block of text, or a screenshot from any banking app
  straight into import review.
- **Glance widgets** (surplus, net worth, next bill, one-tap "Log expense").
- **App shortcuts** and a **Quick Settings tile** to jump straight into quick-log.
- **Desktop-class input**: hardware keyboard shortcuts, mouse hover and right-click menus, drag and
  drop of statement files (Samsung DeX, Android desktop windowing, Chromebooks).

---

## 2. Goals and non-goals

### Goals
1. One account, one live dataset across three clients (Phase 0 + §4).
2. A first-class adaptive Android UI (§11) with keyboard handling that never hides the active field.
3. Calculation parity with the TypeScript engine, enforced by shared fixtures (§8, §18.1).
4. Offline-first: nothing requires a network except sign-in and sync.

### Non-goals for v1
- Wear OS, Android TV, Android Auto, XR.
- Replacing the JSON-blob storage with normalised Postgres tables (see §4.12 for when to revisit).
- Payments / Play Billing (hooks only, per `MONETIZATION_PLAN.md`; build when Pro launches).
- Notification-listener auto-capture of bank push notifications (listed as an option in §21).

---

## 3. Current system audit (what Android must interoperate with)

### 3.1 Backend (Supabase project `hgzacqveqrccnvjwumkz`)

| Table / function | Purpose | Client access |
|---|---|---|
| `ledgerlite_profiles` | id, email, name, avatar | own row, RLS |
| `ledgerlite_states` | `user_id` PK, `state jsonb`, `schema_version`, timestamps | own row, RLS |
| `ledgerlite_feedback` | feedback inbox | insert only (anon + authenticated) |
| `merchant_categories` | shared AI category cache | none (edge function only) |
| `bank_connections` | provider tokens | none (edge functions only) |
| `feed_transactions` | staged bank-feed rows | select own, update `status` |
| Edge: `categorize-batch`, `feeds-connect`, `feeds-sync` | AI categorisation, open banking | authenticated |

Auth providers in use: Google (web and iOS), Apple (iOS native id_token), email/password (iOS).
Redirect scheme used by iOS: `incometracker://auth-callback`.

### 3.2 The ledger blob

`LedgerState` in `src/types.ts`; `CURRENT_SCHEMA_VERSION = 8` in `src/finance.ts:26` (note: the iOS
spec still says 7; the code says 8). Every write goes through `updateLedger`, which runs
`syncLedgerLinks` (`linkSavingsTransfers → syncScheduledDebtPayments → assignMissingAccounts →
syncLinkedGoals`) and stamps `lastSavedAt`. Loads go through `normalizeState`, which also seeds the
current month from the last-used month (`seedMonthFromPrevious`) and resets `selectedMonth` to today.

IDs are `prefix-<uuid v4>` (`createId`). Entities with stable ids: income/expense entries, goals,
accounts, category rules, name rules, import batches. Months are keyed `YYYY-MM`.

### 3.3 iOS reference implementation

`ios/` is a working SwiftUI app with a Foundation-only engine port verified against TS-generated
fixtures (`ios/IncomeTrackerTests/Fixtures/gen/generate-fixtures.ts`). Android reuses that fixture
generator (moved to a shared location, §18.1) and mirrors iOS behaviour where this spec is silent:
Ledger is the home destination, quick-log bar docked above the keyboard, Return adds and keeps focus.

---

## 4. Phase 0: Sync v2 (server, web, iOS, then Android)

> **Status (12 Oct 2026):** implemented for the server, web and iOS, and tested; not yet
> deployed. What shipped, how it was tested, and the dashboard and release steps are in
> `docs/SYNC_V2_ROLLOUT.md`. Where the code refined this section: "unsaved changes"
> means the ledger differs from both the server copy as stored and as this client
> normalises it (otherwise clients that format JSON differently re-push each other);
> first-sign-in "same data" means the same transaction and account ids, not equal
> totals; and iOS merges at the JSON level and carries unknown keys from the server
> copy instead of storing an extras bag per type.

### 4.1 Requirements

| # | Requirement |
|---|---|
| S1 | Writes are **compare-and-swap** on a server revision. A client can never overwrite a revision it has not seen. |
| S2 | When a CAS write fails, the client **three-way merges** (base, local, remote) per entity and retries. No user prompt in the normal case. |
| S3 | Every write emits a small **realtime notification** to the user's other devices. Payload carries the revision only; devices fetch the state themselves. |
| S4 | Foreground clients apply remote changes within 3s p95; backgrounded clients catch up on resume (and Android widgets via periodic work). |
| S5 | Convergence: after all devices are online and idle, every device holds content-identical state, with no ping-pong of pushes. |
| S6 | A client never pushes a state with a lower `schemaVersion` than the cloud, and never drops fields it does not understand. |
| S7 | Old clients that still use blind upsert keep working during rollout, then are cut over (§4.9). |
| S8 | The same human signing in with the same identity on any client reaches the same `auth.users` row (§4.10). |

### 4.2 Server migration

New migration `supabase/migrations/2026MMDD000000_ledger_sync_v2.sql`:

```sql
-- 1. Revision + writer columns
alter table public.ledgerlite_states
  add column if not exists revision bigint not null default 1,
  add column if not exists updated_by text;

-- 2. Every insert/update bumps the revision, including legacy blind upserts,
--    so old clients still notify new ones. Also refuses schema downgrades.
create or replace function public.ledgerlite_states_before_write()
returns trigger language plpgsql set search_path = '' as $$
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
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists ledgerlite_states_before_write on public.ledgerlite_states;
create trigger ledgerlite_states_before_write
  before insert or update on public.ledgerlite_states
  for each row execute function public.ledgerlite_states_before_write();

-- 3. Compare-and-swap push. SECURITY INVOKER: RLS still applies.
create or replace function public.ledgerlite_push_state(
  p_state jsonb, p_base_revision bigint, p_device_id text)
returns table (status text, revision bigint, state jsonb, updated_by text)
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_version int := coalesce((p_state->>'schemaVersion')::int, 0);
  v_row public.ledgerlite_states;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_base_revision = 0 then
    insert into public.ledgerlite_states (user_id, state, schema_version, updated_by)
    values (v_uid, p_state, v_version, p_device_id)
    on conflict (user_id) do nothing
    returning * into v_row;
  else
    update public.ledgerlite_states s
       set state = p_state, schema_version = v_version, updated_by = p_device_id
     where s.user_id = v_uid and s.revision = p_base_revision
       and s.schema_version <= v_version
    returning * into v_row;
  end if;

  if v_row.user_id is not null then
    return query select 'ok'::text, v_row.revision, null::jsonb, v_row.updated_by;
    return;
  end if;

  -- Lost the race, or the cloud is on a newer schema: hand back the current row.
  return query
    select case when s.schema_version > v_version then 'schema_too_old' else 'conflict' end,
           s.revision, s.state, s.updated_by
      from public.ledgerlite_states s where s.user_id = v_uid;
end $$;

revoke all on function public.ledgerlite_push_state(jsonb, bigint, text) from public, anon;
grant execute on function public.ledgerlite_push_state(jsonb, bigint, text) to authenticated;

-- 4. Realtime poke to the user's private topic. Tiny payload: devices fetch the row.
create or replace function public.ledgerlite_states_broadcast()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('revision', new.revision, 'updated_by', new.updated_by,
                       'schema_version', new.schema_version),
    'state_changed',
    'ledger:' || new.user_id::text,
    true);
  return null;
end $$;

drop trigger if exists ledgerlite_states_broadcast on public.ledgerlite_states;
create trigger ledgerlite_states_broadcast
  after insert or update on public.ledgerlite_states
  for each row execute function public.ledgerlite_states_broadcast();

-- 5. Only the owner may join their private topic. No INSERT policy: clients cannot send.
drop policy if exists "Users receive their own ledger broadcasts" on realtime.messages;
create policy "Users receive their own ledger broadcasts"
on realtime.messages for select to authenticated
using (
  (select realtime.topic()) = 'ledger:' || (select auth.uid())::text
  and realtime.messages.extension = 'broadcast'
);
```

Notes for the implementer:
- `realtime.send(payload, event, topic, private)` and private-channel authorisation via RLS on
  `realtime.messages` with `realtime.topic()` are documented Supabase features (see Sources). The
  private flag on send must match the channel's `private: true` on the client.
- Do not broadcast the full state. Ledgers with years of imports can be megabytes.
- Add a cheap read path: `select revision from ledgerlite_states` (one bigint) for polling.
- Before shipping, measure blob sizes in production with an aggregate only
  (`percentile_cont` over `pg_column_size(state)`), never reading contents. Record p50/p95/max in this
  doc; it informs §4.12.
- Test the migration against a Supabase branch first (`supabase db reset` locally, then a preview
  branch), including a legacy upsert from the current web build to confirm it still succeeds and
  bumps `revision`.

### 4.3 Client sync engine (identical design on web, iOS, Android)

Per device, persist:

| Key | Meaning |
|---|---|
| `deviceId` | Random UUID created on first launch, never synced. |
| `local` | The current ledger state the UI shows. |
| `base` | The last state this device knows is on the server (after a successful push or an adopt). Stored as a separate file/record. |
| `baseRevision` | Server revision of `base`. `0` = never synced with this account. |
| `pending` | `contentHash(local) != contentHash(base)`. Derived, but cached for fast checks. |

`contentHash` = stable hash of the canonical JSON **excluding** `lastSavedAt` and `selectedMonth`,
computed over parsed values (never raw bytes: Kotlin writes `2400.0`, JS writes `2400`).

**State machine**

```
            ┌─────────── edit (debounce 300ms) ──────────┐
            ▼                                             │
 IDLE ──► PUSHING ──ok──► IDLE (base = pushed, baseRev = r)
            │
            ├─conflict(remote, r)─► MERGING ─► local = normalize(merge(base, local, remote))
            │                                   base = remote, baseRev = r ─► PUSHING (max 5 loops)
            ├─schema_too_old─────► READ_ONLY (banner: "Update the app to keep syncing")
            └─network error──────► OFFLINE (retry with backoff 2s→60s; Android: WorkManager when backgrounded)

 Realtime 'state_changed' (rev > baseRev, updated_by != deviceId)  or  resume  or  poll tick
            ▼
        FETCH row ─► if !pending: local = normalize(remote); base = remote; baseRev = r
                     else:        MERGING (as above) then PUSHING
```

Rules:
1. **Push is the only write path.** All clients call `ledgerlite_push_state`. Direct table upsert is
   removed from web and iOS in Phase 0.
2. **Debounce** local persistence and push at 300ms after the last edit (web currently 240ms; align
   all three at 300ms). Flush immediately on background / tab hide / app stop.
3. **Fetch triggers:** realtime event; app/tab returns to foreground; network reconnect; realtime
   channel (re)joined (to cover missed events); a 30s poll of `revision` while foregrounded **only
   if** the channel is not joined.
4. **Ignore own echoes:** if `updated_by == deviceId && revision == baseRevision`, do nothing.
5. **Never interrupt typing.** Remote changes apply to `local`; open editors hold their own draft
   (not part of `local`) and are not reset. If the entry being edited was deleted remotely, the
   editor shows "This transaction was deleted on another device" with *Restore* / *Discard*.
6. **Normalise after adopt/merge** (`normalizeState` equivalent). If normalisation changes content,
   that change is a local edit and gets pushed (once). §4.5 guarantees this converges.
7. **Signed out:** the engine is idle; `local` persists on device only.
8. **Sign-out** clears `local`, `base`, `baseRevision` (web and iOS already reset to a blank ledger).

### 4.4 Three-way merge: `mergeLedgerStates(base, local, remote) → LedgerState`

Implemented first in TypeScript (`src/sync/merge.ts`), then ported to Swift and Kotlin, with shared
fixtures (§18.1). Pure, deterministic, no clock reads except as noted.

**4.4.1 Flatten to entities.** Build maps `id → entity` for each side:

| Collection | Entity key | Extra merged attributes |
|---|---|---|
| Transactions (all `months[*].incomes` and `months[*].expenses`) | entry `id` | `monthKey`, `kind` (income/expense) travel with the entity, so a date edit that moves an entry to another month merges as a field change |
| `goals` | `id` | |
| `accounts` | `id` | |
| `categoryRules` | `id` | |
| `nameRules` | `id` | |
| `importBatches` | `id` | |
| Month notes | `monthKey` | `note` |

**4.4.2 Per-entity rule** for each id in `base ∪ local ∪ remote`:

| base | local | remote | Result |
|---|---|---|---|
| – | L | – | L (added locally) |
| – | – | R | R (added remotely) |
| – | L | R | field merge with empty base (same-id adds are rare; treat as both added) |
| B | L | R | field merge (4.4.3) |
| B | – | R, R == B | deleted (local delete, remote untouched) |
| B | L, L == B | – | deleted (remote delete) |
| B | – | R, R != B | **R kept** (edit beats delete; losing money data is worse than a resurrected row) |
| B | L, L != B | – | **L kept** (same reason) |
| B | – | – | deleted |

**4.4.3 Field merge.** For each field, compare by deep equality:
- `local == base` → take remote. `remote == base` → take local. Both equal → either.
- Both changed to different values → **local wins**. Rationale: the merge only runs on the device
  whose push lost the race, and that device's user has just acted. Deterministic because only one
  device merges a given (base, remote) pair.

**Atomic field groups** (merged as one unit, never mixed between sides, because mixing produces wrong
balances):
- Account: `{balance, balanceAsOf, balanceSetOn, ledgerOffset}`
- Account: `{rate, promoRate, promoMonths, promoAsOf}`
- Account: `{accountClass, type}`
- Transaction: `{date, monthKey}`
- Transaction: `{amount, scheduledPayment}` (editing the amount confirms a scheduled payment)
- Goal: `{fundingMode, monthlyAmount}`

**Set-valued fields** (3-way set merge: `(L ∪ R) − (removed on either side relative to base)`):
`Account.skippedPaymentMonths`, `ImportBatch.transactionRefs` (then dropped if the referenced entry
no longer exists).

**4.4.4 Top-level scalars.** 3-way per field: `currency`, `goalPlannerSurplus`,
`goalsHorizonMonths`, `ledgerGoalId`, `savingsTarget`, `defaultAccountId`,
`assumedInvestmentReturn`, `privacyMode`, `aiCategorizationEnabled`.
Special: `selectedMonth` = local always (device UI state). `schemaVersion` = max. `lastSavedAt` =
now (the merge is a new write).

**4.4.5 Order.** Order is meaningful for incomes (manual reorder, `ledgerOrder.ts`), expenses within a
month, accounts, and rules. Result order = local order of surviving items; then each remote-only item
is inserted directly after its nearest preceding surviving item in remote order (or at the start).
Goals are ordered by their `priority` field, which merges as a normal field; renumber `1..n` stably
afterwards.

**4.4.6 Unknown fields.** Every entity and the root keep a bag of unrecognised JSON keys (§7.3). The
bag merges as one opaque field per key using the 4.4.3 rule.

**4.4.7 Months.** Result month set = every month that has entries or a note after merging, plus the
current month. Entries are regrouped into `months[monthKey]` from the flattened map.

### 4.5 Post-merge normalisation and convergence

After every merge or adopt, run the platform's `normalizeState` equivalent plus these dedupe passes
(added to the TypeScript source and ported):

| Duplicate | Cause | Keep |
|---|---|---|
| Two entries in the same month with the same `seededFrom {monthKey, entryId}` | Two devices seeded the new month independently on the 1st | the copy present in `remote`; else lowest `id` |
| Two `scheduledPayment` rows for the same `debtAccountId` in the same month | Same, for debt payments | as above (verify `syncScheduledDebtPayments` already enforces one per month; add a test either way) |
| Two imported entries in the same month with the same `imported.hash` | Same statement imported on two devices before syncing | as above; fix `importBatches[*].transactionRefs` to point at the survivor |
| `importBatches` longer than 25 | Union of both sides | newest 25 by `importedAt` (existing cap) |

**No ping-pong:** normalisation must be idempotent (`normalize(normalize(x)) == normalize(x)`) and
deterministic across platforms (same seeding, same dedupe winner). Parity fixtures cover both. A
device only pushes when `contentHash(local) != contentHash(base)`, so a device that receives an
already-normal state pushes nothing.

Known limitation (documented, acceptable): "rename every transaction called X" on device A while
device B adds a new X offline leaves B's new entry with the old name. The synced `NameRule` still
renames future imports.

### 4.6 Schema versioning and forward compatibility

1. **Unknown-field preservation** on all three clients (Phase 0 fixes web and iOS too). Decoders keep
   unrecognised keys at the root and on every entity and write them back unchanged.
2. **Schema gate:** if a fetched cloud state has `schemaVersion > supported`, the client enters
   READ_ONLY for sync: it shows the cloud data it can read, keeps local edits queued, and shows a
   persistent banner. Android uses the Play In-App Updates API (immediate flow) from that banner.
   Web shows "Reload to update" (service worker update).
3. The server trigger in §4.2 refuses schema downgrades as a second line of defence.
4. Any future schema bump must ship to all three clients before any client writes the new version.
   Add this to the PR checklist for `CURRENT_SCHEMA_VERSION` changes.

### 4.7 Device-local vs synced data

Synced (in the blob): everything in `LedgerState` except `selectedMonth` (kept for compatibility but
treated as local by the merge).

Device-local (never in the blob): theme, animations toggle, biometric-lock toggle, reminder
settings, income sort mode, onboarding completed, sync-nudge dismissed, deviceId, base/baseRevision,
widget configuration, last-used import source.

Open question for the owner (§22): should `privacyMode` be device-local? Today it syncs; hiding
amounts on a shared tablet but not on your phone is a plausible want.

### 4.8 First sign-in on a device that already has local data

Today: a two-way choice ("Keep this device" / "Use cloud"). With merge available, offer three cards:

1. **Combine both (recommended)**: `merge(base = empty, local, cloud)`, then the dedupe passes. Shows
   counts: "+12 transactions from this device, 340 from your account".
2. **Use account data**: discard this device's data (with a one-tap JSON export offered first).
3. **Use this device's data**: overwrite the account (requires a confirm, shows what is lost).

Accounts are not auto-merged by name (two "Monzo" accounts may be real). After combining, if two
accounts share a name and class, show a one-time "Possible duplicate accounts" card in Accounts with
a merge action.

### 4.9 Rollout order

1. Server migration (backwards compatible: legacy upserts still work and bump `revision`).
2. Web (deploys instantly): CAS push, realtime, fetch triggers, merge, unknown-field preservation,
   schema gate, Apple + email sign-in (§4.10).
3. iOS release with the same.
4. Android v1 (built on Sync v2 from day one).
5. **Cutover** (owner decision, suggested 4 weeks after the iOS release reaches most users): revoke
   direct `insert`/`update` on `ledgerlite_states` from `authenticated` so only the RPC can write. Old
   iOS builds then fail loudly ("Sync paused") instead of overwriting. Before cutover, consider a
   `min_supported_build` value served from a tiny `ledgerlite_config` table so old iOS builds can be
   told to update (needs one iOS release that reads it; ship it in step 3).

### 4.10 Account parity across platforms (prerequisite for "same account")

| Provider | Web today | iOS today | Phase 0 / Android |
|---|---|---|---|
| Google | OAuth redirect | ASWebAuthenticationSession + PKCE | Android: Credential Manager ID token → `signInWithIdToken`. Use the **web** OAuth client ID as `serverClientId` and add it to Supabase's Google "Authorized Client IDs", so the Google `sub` maps to the same Supabase identity as web and iOS. |
| Apple | **missing** | native id_token | Web + Android: Supabase Apple OAuth (redirect). Needs an Apple **Services ID**, return URL, and a client-secret JWT that Apple caps at 6 months: put a calendar reminder and a runbook in `docs/` to rotate it. |
| Email + password | **missing** | yes | Web + Android: add sign-in, sign-up, reset password, with the same Supabase settings iOS uses. |

Identity linking: Supabase links identities with the same verified email automatically, but Apple
"Hide My Email" relay addresses never match. Settings shows "Signed in with Apple (relay address)"
and, as a P2 follow-up, a "Link another sign-in method" action using Supabase `linkIdentity`.

Supabase dashboard checklist: add redirect URLs `incometracker://auth-callback` (Android uses the same
scheme as iOS) and the web origins; enable Apple OAuth; confirm Google authorised client IDs include
the Android/web client.

### 4.11 Phase 0 change lists

**Web (`src/`)**
- `src/sync/merge.ts` (+ `merge.spec.ts`), `src/sync/engine.ts` (state machine, base storage in
  IndexedDB store `ledger` keys `base` and `meta`), `src/sync/contentHash.ts`.
- `src/supabase.ts`: `pushLedgerState(state, baseRevision, deviceId)` via `rpc`,
  `fetchLedgerRow()` returning `{state, revision, updated_by}`, `subscribeLedger(userId, onPoke)`
  using `supabase.channel('ledger:'+uid, { config: { private: true } })` after `realtime.setAuth()`.
- `App.tsx`: replace the save effect's `saveCloudLedgerState` with the engine; add
  `visibilitychange`/`online` triggers; keep open editors' drafts out of `ledger`; replace
  `MergeConflictModal` content with the three-card version (§4.8); schema-gate banner.
- `normalizeStateFields`: preserve unknown keys; add the §4.5 dedupe passes.
- Sign in with Apple and email/password UI on the auth gate and settings.
- Playwright: two browser contexts on one test account converge (§18.4).

**iOS (`ios/`)**
- `Sync/SyncCoordinator.swift`: RPC push, row fetch with revision, Realtime V2 subscription
  (supabase-swift is already a package dependency) while foregrounded.
- `App/LedgerStore+Persistence.swift`: replace the three-way stamp check with base/baseRevision; port
  merge + dedupe; keep `refreshFromCloudIfIdle` as a resume trigger but merge instead of raising the
  sheet.
- `Models/LenientDecoding.swift` / `Types.swift`: unknown-field preservation; schema gate on cloud loads.
- `MergeConflictSheet.swift`: three-card first-sign-in flow.

### 4.12 When to move off the blob

The blob is fine while p95 size is under roughly 1 MB and edits are human-paced. Revisit (normalised
`transactions`, `accounts`, `goals` tables with per-row `updated_at`, or an op-log) if any of these hold:
p95 blob over 1 MB, push p95 over 1.5 s on 4G, or a feature needs server-side queries over
transactions (shared household ledgers, server-side reports). Not in scope now; the merge function and
entity keys above are designed so that migration can reuse them.

---

## 5. Android tech stack

| Concern | Choice | Notes |
|---|---|---|
| Language | Kotlin (K2) | Coroutines + Flow. |
| UI | Jetpack Compose, Material 3 | Compose BOM pinned. |
| Adaptive | `material3-adaptive` (`NavigationSuiteScaffold`, `ListDetailPaneScaffold`, `SupportingPaneScaffold`, `currentWindowAdaptiveInfo()`), `androidx.window` (`FoldingFeature`, postures) | |
| Navigation | Navigation 3 with list-detail scene strategy | If any adaptive Nav3 API is still non-stable at project start, use Navigation Compose with the adaptive scaffolds instead. Decide on day 1, record in `android/README.md`. |
| DI | Hilt | |
| Serialization | kotlinx.serialization (JsonElement-backed models, §7) | |
| Immutable state | kotlinx.collections.immutable | Stable Compose params. |
| Supabase | supabase-kt: Auth, Postgrest, Realtime, Functions; Ktor OkHttp engine | Pin latest stable 3.x. |
| Google sign-in | Credential Manager + Google ID library | |
| Apple sign-in, OAuth | Custom Tabs (`androidx.browser`) + PKCE via supabase-kt | |
| Local storage | Files (atomic) for ledger/base; DataStore for settings | §9. |
| Secrets at rest | Tink AEAD with an Android Keystore master key | `EncryptedSharedPreferences` is deprecated; do not use it. |
| Background | WorkManager | Sync flush, widget refresh, reminders. |
| Widgets | Jetpack Glance | |
| Charts | Vico (Compose) for line/bar/area; custom `Canvas` for sparkline, gauge, surplus bar | |
| OCR | ML Kit Text Recognition v2 (on-device) | Screenshot import. |
| Biometrics | `androidx.biometric` | `BIOMETRIC_STRONG or DEVICE_CREDENTIAL`. |
| In-app updates | Play In-App Updates | Schema gate (§4.6). |
| Analytics | PostHog Android SDK, opt-in only | Mirror web events in `src/analytics.ts`. |
| Testing | JUnit, Robolectric, Compose UI test, Roborazzi screenshots, Espresso Device (fold/unfold), Macrobenchmark + Baseline Profiles | §18. |
| Static checks | Android Lint (warnings as errors on CI), ktlint, detekt | |

**SDK levels**
- `targetSdk 36`: required by Google Play for new apps and updates from 31 August 2026 (extension
  possible to 1 November 2026). Android 16 enforces edge-to-edge with no opt-out at this target.
- `compileSdk` latest stable (37 if available). Android 17 (API 37) ignores orientation and
  resizability restrictions on displays with smallest width ≥ 600dp; we never lock orientation, so
  this is free compliance.
- `minSdk 29` (Android 10). Smooth IME inset animation needs API 30+; on 29 the keyboard jumps
  instead of animating, which is acceptable. Open decision (§22) if wider reach is wanted.
- Native libraries (ML Kit) must be 16 KB page-size compatible; keep them current and check with the
  APK Analyzer before each release.

---

## 6. Architecture and modules

Repository layout: new top-level `android/` beside `ios/`.

```
android/
├── app/                     Activity, NavigationSuite shell, DI graph, deep links, share target
├── core/
│   ├── model/               Pure Kotlin. LedgerState and entities, JSON codec, unknown-field bags
│   ├── engine/              Pure Kotlin. Ports of finance, importer, quickAdd, recurrence,
│   │                        merchantMemory, nameRules, accountFlow, accountLinks, debtSync,
│   │                        ledgerOrder, normalizeState, syncLedgerLinks, merge, contentHash
│   ├── data/                LedgerRepository (StateFlow), persistence, undo stack, SyncEngine
│   ├── supabase/            Auth, RPC, row fetch, realtime channel, feedback, edge functions
│   ├── designsystem/        Tokens, theme, typography, MoneyText, Card, Pill, haptics, motion
│   └── ui/                  Adaptive primitives: WindowProfile, InputSpace, KeyboardAwareScaffold,
│                            EditorHost, ResponsiveGrid, HingeAwareRow, shortcuts
├── feature/
│   ├── ledger/  dashboard/  accounts/  goals/  insights/
│   ├── settings/  importer/  onboarding/  auth/  feedback/
├── widget/                  Glance widgets + their worker
├── baselineprofile/
└── gradle/libs.versions.toml
shared/fixtures/             Moved from ios/IncomeTrackerTests/Fixtures (TS generator + JSON), used by iOS and Android
```

`core/model` and `core/engine` are plain JVM modules (no Android dependency) so parity tests run in
seconds on CI.

**Data flow**

```
Compose screens ──intents──► ViewModels ──► LedgerRepository.update { state -> newState }
       ▲                                         │  (runs syncLedgerLinks, stamps lastSavedAt,
       │ StateFlow<UiState>                      │   pushes undo snapshot)
       │                                         ▼
  derived values (engine on Dispatchers.Default,  local StateFlow<LedgerState>
  memoised per input identity)                    │ debounce 300ms
                                                  ├──► LocalStore (atomic file write)
                                                  └──► SyncEngine (§4.3) ◄── Realtime / resume / WorkManager
```

- One `LedgerRepository` (singleton) is the only writer, mirroring `updateLedger` on web and
  `LedgerStore.update` on iOS.
- Derived values (`calculateProjection`, outlooks, goal sequence, health score) are computed off the
  main thread and cached by input identity; screens collect them as `StateFlow`.
- Undo: bounded stack of 30 state snapshots (structural sharing makes this cheap). Snackbar undo on
  deletes and import commits; `Ctrl+Z` on hardware keyboards.

---

## 7. Domain model and JSON

### 7.1 Types

Port every type in `src/types.ts` as Kotlin `@Serializable data class` / `enum class` with
`@SerialName` matching the TS string literals exactly (`"debt-payment"`, `"credit-card"`,
`"other-asset"`, `"on-track"`, `"at-risk"`, `"no-deadline"`). Optional TS fields are nullable with
`null` default and are **omitted** when null (`explicitNulls = false`), matching JSON written by the web.

### 7.2 Lenient decoding

Mirror `normalizeStateFields` and iOS `LenientDecoding.swift`: numbers may arrive as ints, doubles or
numeric strings; non-finite becomes the default; unknown enum values fall back to the web default;
legacy keys (`goal`, `debts`, `apr`, `interestFreeMonths`) migrate. Implement as a decode step from
`JsonElement` rather than generated serializers alone, so one bad row never fails the whole ledger
(skip the bad element, log a non-PII counter).

### 7.3 Unknown-field preservation (mandatory)

Each entity and the root carry `extras: Map<String, JsonElement>` holding keys the client does not
know. Encoding writes known fields, then `extras`. Round-trip test: a fixture with injected unknown
keys at every level re-encodes with those keys intact.

### 7.4 Encoding rules

- camelCase keys, no renaming strategy.
- Doubles: write integral values without a trailing `.0` where Kotlin would add one (custom
  serializer), so blobs written by Android look like blobs written by web. Not required for
  correctness (hashing uses parsed values) but keeps diffs and support debugging sane.
- Dates stay as strings (`YYYY-MM-DD`, `YYYY-MM`, ISO timestamps with milliseconds and `Z`, same as
  `new Date().toISOString()`).

---

## 8. Engine port (Kotlin)

Port, file for file, with the same function names in camelCase:

| TS source | Kotlin file | Notes |
|---|---|---|
| `finance.ts` | `Finance.kt`, `NetWorth.kt`, `Goals.kt`, `Health.kt`, `Signals.kt`, `CsvExport.kt` | Constants: schema 8, default return 6, palettes `colors` and `ACCOUNT_COLORS` verbatim |
| `importer.ts` | `importer/*.kt` | CSV (CRLF safe), OFX, QIF, loose lines, sign inversion, transfer pairs, hashes, Windows-1252 fallback |
| `accountFlow.ts`, `accountLinks.ts`, `debtSync.ts` | `links/*.kt` | Part of `syncLedgerLinks` |
| `recurrence.ts`, `merchantMemory.ts`, `quickAdd.ts`, `nameRules.ts`, `ledgerOrder.ts` | `assist/*.kt` | |
| `App.tsx` `normalizeState`, `syncLedgerLinks`, `stopSeededRepeat`, `learnCategoryRule` | `Normalize.kt`, `Edits.kt` | Lift these into a TS module first (`src/ledgerOps.ts`) so they can be fixture-tested on all platforms |
| new `src/sync/merge.ts` | `Merge.kt` | §4.4 |

**JavaScript semantics to reproduce exactly** (each one has bitten a port before):

| JS behaviour | Kotlin trap | Do this |
|---|---|---|
| `Math.round(x)` rounds .5 toward +∞ | `kotlin.math.round` is half-even | `floor(x + 0.5)` |
| `toFixed(2)` | `String.format` locale-dependent | `BigDecimal(x).setScale(2, HALF_UP)` only for display; never in engine maths unless TS does it |
| `Number` is IEEE double | `Float`/`BigDecimal` drift | `Double` everywhere in the engine |
| `new Date(y, m, 1)` local time, month overflow normalises | `LocalDate.of` throws | `YearMonth.of(y,1).plusMonths(m)` helpers mirroring `shiftMonth` |
| `getMonthKey()` uses device local time | UTC by accident | `ZoneId.systemDefault()` |
| `localeCompare` sorting | `compareTo` is code-point | `Collator.getInstance(Locale.ROOT)` where TS uses `localeCompare` |
| `Intl.NumberFormat` currency | `NumberFormat` differs per Android version | Use `currencyOptions` locales; snapshot-test formatting per currency (JPY has 0 decimals) |
| JS regexes in importer | Java regex flavour differences (`\s`, Unicode classes) | Port each regex with a fixture line that exercises it |
| `crypto.randomUUID()` ids | | `"$prefix-${UUID.randomUUID()}"` |
| Hash in `createTransactionHash` | String/char encoding | Reuse iOS's JS-compatible port notes; fixture-test |

Parity is enforced by §18.1. A failing parity test blocks merge.

---

## 9. Persistence on device

- `filesDir/ledger/local.json` and `filesDir/ledger/base.json`, written with `AtomicFile`
  (write temp, fsync, rename). Corrupt file → fall back to the other file, then to the last good
  backup `local.prev.json` kept on every successful write.
- `DataStore<Preferences>` for device-local settings (§4.7) and sync meta (`deviceId`,
  `baseRevision`).
- **Editor drafts** (half-typed transactions) live in `SavedStateHandle` and are mirrored to
  `filesDir/drafts/*.json` 500ms after the last keystroke, so fold, rotation, process death and
  low-memory kills never lose typing.
- Session tokens: supabase-kt `SessionManager` backed by a Tink-encrypted DataStore.
- **Auto Backup:** include `ledger/local.json` only when signed out (the cloud is the backup when
  signed in); always exclude session files, drafts and `base.json` via `dataExtractionRules`
  (restored Keystore-encrypted files are undecryptable on a new device).
- Writes happen off the main thread; the in-memory `StateFlow` is the UI's source of truth.

---

## 10. Authentication on Android

Screens: Sign-in sheet reachable from Settings, onboarding, and the sync nudge. Buttons in this order:
**Continue with Google**, **Continue with Apple**, **Continue with email**.

| Flow | Implementation |
|---|---|
| Google | Credential Manager `GetGoogleIdOption` (authorised accounts first, then all accounts) with a hashed nonce; pass the ID token and raw nonce to `auth.signInWith(IDToken)`. Falls back to `GetSignInWithGoogleOption` button flow. |
| Apple | `auth.signInWith(Apple)` OAuth via Custom Tab, PKCE, redirect `incometracker://auth-callback` handled by the Activity intent filter. |
| Email | Email + password with `KeyboardType.Email`/`Password`, autofill hints, show/hide password, "Forgot password" sends Supabase recovery. Confirmation-required sign-up shows "Check your inbox". |
| Session restore | On launch, restore from encrypted storage; offline keeps the cached user (iOS parity); 400–403 on refresh signs out. |
| Profile | Upsert `ledgerlite_profiles` after sign-in (web parity). |
| Sign-out | Revoke server-side (best effort), clear local + base + drafts, return to blank ledger. |

Acceptance: the same Google account and the same Apple ID produce the same `auth.users.id` on web,
iOS and Android (manual test logged in §18.4).

---

## 11. Adaptive UI system

This is where the brief's emphasis lies. The rules below are mechanical so an agent can implement and
test them.

### 11.1 Device targets

Sizes in dp depend on the user's display-size setting. Values below assume the default setting; the
Fold 8 rows give two densities because Samsung's default for that panel is not yet confirmed. **First
task of Phase 1:** record real `adb shell wm size` / `wm density` on a Fold 8 (cover and inner) and
replace the estimates.

| Target | Panel | Approx. window (dp) | Width class | Height class | Why it matters |
|---|---|---|---|---|---|
| Galaxy Z Fold 8 cover, portrait | 5.5", 10:16, ~1248×1972 px | ~416–444 × 657–701 | Compact | Medium | New wide/short cover. Keyboard takes ~40% of height |
| Galaxy Z Fold 8 cover, landscape | same | ~657–701 × 416–444 | Medium | **Compact** | The hardest case: ~180–220dp left above the keyboard |
| Galaxy Z Fold 8 inner | 7.6", 4:3, ~2448×1848 px | ~870–930 × 657–700 (landscape) | Expanded | Medium | List-detail, hinge |
| Galaxy Z Fold 8 inner, rotated | same | ~657–700 × 870–930 | Medium | Medium/Expanded | Two panes, narrower |
| Fold 5–7 cover (21:9) | e.g. 6.5", 1080×2520 | ~384 × 896 | Compact | Medium | Tall and narrow: the opposite shape |
| Pixel Fold / Pixel 9 Pro Fold | | inner ~840 × 700 class | Expanded | Medium | Second foldable family, emulator available |
| Galaxy Z Flip cover (Flex Window) | ~4", near square | ~330 × 330 | Compact | **Compact** | Only if the user enables apps on the cover; must not crash, quick-log must work |
| Typical phone | 1080×2400 | ~384–412 × 840–915 | Compact | Medium | Baseline |
| Small phone | | 360 × 640 | Compact | Medium | Smallest supported full-screen |
| Phone landscape | | ~840 × 384 | Expanded | **Compact** | Short window again |
| Tablet portrait / landscape (Pixel Tablet, Tab S) | | 800×1280 / 1280×800 | Medium / Expanded–Large | Expanded / Medium | Two or three panes |
| Desktop windowing, DeX, Chromebook | free-form | anything ≥ 220 × 220 | any | any | Live resize, mouse, hardware keyboard |
| Split-screen on a phone | | ~384 × 300–450 | Compact | Compact | Short window plus keyboard |

### 11.2 Window profile: what decides layout

Do not branch on device names. Compute a `WindowProfile` from `currentWindowAdaptiveInfo()`,
`FoldingFeature`, insets and input devices:

```kotlin
data class WindowProfile(
    val widthClass: WidthClass,          // Compact <600, Medium 600–839, Expanded 840–1199, Large 1200–1599, XL ≥1600
    val heightClass: HeightClass,        // Compact <480, Medium 480–899, Expanded ≥900
    val posture: Posture,                // Flat, Book(hingeBoundsDp), Tabletop(hingeBoundsDp)
    val separatingHinge: Rect?,          // only when FoldingFeature.isSeparating
    val hasHardwareKeyboard: Boolean,    // Configuration.keyboard == KEYBOARD_QWERTY && hardKeyboardHidden == NO
    val hasFinePointer: Boolean,         // mouse/trackpad present
)
```

Plus a live **`InputSpace`**, recomputed every frame the IME animates:

```
contentHeight = windowHeight − statusBar − (navigation bar or taskbar) − imeHeight(when visible) − cutouts(top/bottom)
InputSpace = Roomy (≥ 480dp) | Tight (300–479dp) | Cramped (140–299dp) | Minimal (< 140dp)
```

Layout decisions:

| Decision | Rule |
|---|---|
| Navigation chrome | Width Compact and height not Compact → bottom navigation bar. Width ≥ Medium, or height Compact → navigation rail. Width ≥ Large → expanded rail with labels (or permanent drawer). Implemented with `NavigationSuiteScaffold` and a custom `layoutType` that applies the height rule. |
| Hide navigation while typing | When the IME is visible and `InputSpace ≤ Tight`, hide the bottom bar (rail stays; it costs width, not height). |
| Panes | Width Compact → one pane. Medium → two panes when the screen supports list-detail (Ledger, Accounts, Goals, Settings), else one centred column max 640dp. Expanded+ → two panes; Large+ → Ledger may show three (list, detail, insights side panel). |
| Content width | Single-column content never exceeds 720dp; centre it. Cards in grids use `ResponsiveGrid(minCell = 280dp)`. |
| Top app bar | Roomy → medium/large collapsing bar. Tight → small bar (64dp). Cramped → 48dp compact bar with title truncated. Minimal → hidden; essential actions move into the input row. |
| Editors | Width Compact, or any width with height Compact → full-screen editor route. Otherwise → the detail pane (two-pane layouts) or a dialog max 560 × (window − IME − 48)dp. **Never** a bottom sheet containing text fields when height is Compact. |
| Hinge | If `separatingHinge` exists: Book posture splits panes exactly at the hinge (no content under it); Tabletop posture puts reading content in the top half and input (quick-log, editor fields, keyboard) in the bottom half. Never place a text field or button across the hinge. |

`WindowProfile` and `InputSpace` are provided via `CompositionLocal`, and every screen's layout is a
pure function of them, which makes the screenshot matrix (§18.3) straightforward.

### 11.3 Navigation shell

Destinations: **Ledger** (home), **Dashboard**, **Accounts**, **Goals**, **Insights**. Settings is an
action in the top bar (and a rail footer item on Medium+). Matches iOS.

- Each destination keeps its own back stack and scroll position across switches.
- Predictive back is enabled (`android:enableOnBackInvokedCallback="true"`). Back order: close IME →
  close menus/dialogs → close editor (confirm if dirty, §11.6 K10) → collapse detail pane to list →
  return to Ledger → exit.
- Deep links: `incometracker://ledger|dashboard|accounts|goals|insights|log` (same as iOS) plus
  `incometracker://auth-callback`. Verified https App Links on `www.theincometracker.com/app/*` are a
  P3 nice-to-have (needs `/.well-known/assetlinks.json` in `public/`).

### 11.4 Continuity: fold, unfold, rotate, resize, multi-window

| Event | Required behaviour |
|---|---|
| Fold / unfold / rotate / resize / enter or leave multi-window | Activity **is not recreated** for size changes: declare `android:configChanges="screenSize\|smallestScreenSize\|screenLayout\|orientation\|density\|keyboard\|keyboardHidden\|navigation\|uiMode"`. Compose re-lays out from `WindowProfile`. Focus, cursor position, selection, scroll position, open editor, open dialog, and IME visibility are preserved. |
| IME was visible before a fold/unfold | After the transition, re-request focus on the same field and show the IME (`SoftwareKeyboardController.show()` after the first frame). Samsung sometimes hides the IME on display switch; this restores it. |
| Editor open on inner screen (detail pane) → fold | Same draft moves into the full-screen editor route on the cover. Unfold reverses it. Draft identity is the ViewModel; the container changes, not the state. |
| Process death | Restore destination, selected month, open editor and draft from `SavedStateHandle` + draft file. Do not auto-show the IME on cold restore. |
| Samsung "continue apps on cover screen" off | App goes to background on fold; drafts already persisted. |
| `resizeableActivity` | `true` (default). No `screenOrientation`, no `maxAspectRatio`. Android 16/17 ignore those on large screens anyway. |
| Live resize in desktop windowing | Layout updates continuously without jank; no layout depends on "initial" size. Minimum usable window: 220 × 220dp (Minimal mode). |

### 11.5 Insets and edge-to-edge

- `enableEdgeToEdge()` in `onCreate`; transparent system bars; light/dark icons follow theme.
- `android:windowSoftInputMode="adjustResize"` on the Activity, with all IME handling done through
  Compose `WindowInsets.ime` (the window itself is not panned).
- Every scaffold consumes `WindowInsets.safeDrawing` (status, navigation, taskbar, display cutout).
  Lists draw behind the navigation bar with matching bottom content padding, so the last row is
  reachable above gesture handles and the Samsung taskbar on the inner screen.
- Respect rounded corners on the Fold 8 cover (Samsung notes the viewable area is smaller than the
  nominal 5.5") using `WindowInsets.safeContent` for anything touching screen edges, and keep 16dp
  minimum horizontal padding.
- FABs and the quick-log bar sit above `navigationBars` and above the IME, never under a taskbar.

### 11.6 Keyboard and text input (rules)

The brief calls out keyboard failures on short wide screens. These rules apply to **every** text field
in the app. Each has a test in §18.5.

| # | Rule |
|---|---|
| K1 | **The focused field is always fully visible** with at least 16dp clearance above the IME top edge (or above the bottom of the window when no IME inset is reported). All forms are scrollable containers padded by `WindowInsets.ime.union(navigationBars)`; on focus, call `BringIntoViewRequester` with the field bounds plus 16dp, and repeat when the IME inset animation ends. |
| K2 | **Primary actions never live only at the bottom of a form.** Save/Add sits in the top bar (or the quick-log row) and on the IME action key (`ImeAction.Done` on the last field, `Next` before it). A bottom button bar, where used on Roomy screens, is duplicated in the top bar when `InputSpace ≤ Tight`. |
| K3 | **The keyboard is always easy to dismiss**, regardless of keyboard app or navigation mode: system back; IME action on the last field; dragging the content down (nested-scroll that hides the IME, like iOS interactive dismiss); tapping empty content; and, in Cramped/Minimal, an explicit "hide keyboard" icon button in the input row. |
| K4 | **Hiding the keyboard never loses input** and never closes the editor. |
| K5 | **Cramped mode** (`InputSpace` 140–299dp, e.g. Fold 8 cover landscape): top bar collapses to 48dp; month summary header and section headers collapse to a single line; the navigation bar is hidden; editors show the focused field and its label, with neighbours reachable by scroll and `Next`; suggestion chips shrink to a single horizontally scrolling row; non-essential helper text hides. |
| K6 | **Minimal mode** (< 140dp, e.g. split-screen with keyboard): only the active input row and its action are shown, pinned above the IME, with a small context line ("Expense · £4.35 · Today"). Everything else is scrolled out. No dialogs open in this mode; pickers wait until the IME closes or show as full-screen. |
| K7 | **No dropdown or popup anchored near the keyboard.** Category, account and date pickers open as full-screen pickers (Compact widths or Compact heights) or anchored menus only when there is ≥ 240dp of space in the opening direction. Opening a picker hides the IME first. |
| K8 | **Floating, split or one-handed keyboards** (Samsung Keyboard floating mode, Gboard floating): when the IME is visible but reports no bottom inset, keep the focused field in the top 40% of the content area (scroll it there) because the floating keyboard can sit anywhere. |
| K9 | **IME height changes** (emoji panel, clipboard, voice, switching keyboards, toolbar rows appearing) animate the layout with `WindowInsetsAnimation` (API 30+) and re-run K1. No frame where the focused field is covered for more than the animation duration. |
| K10 | **Dirty editors:** back with unsaved changes shows "Discard this transaction?" (Discard / Keep editing). Drafts are also persisted (§9), so a crash or fold never loses them. |
| K11 | **Quick-log keeps the keyboard open.** Pressing the IME action adds the entry, clears the field, keeps focus and keeps the IME up for the next entry (iOS parity). Implemented in `keyboardActions` without clearing focus. Suggestion chips and the "+" form button are non-focusable (`focusProperties { canFocus = false }`) so tapping them never dismisses the IME. |
| K12 | **Numbers:** amount fields use `KeyboardType.Decimal`. Parsing accepts `.` or `,` as the decimal separator, ignores currency symbols, spaces and thousands separators, rejects letters with an inline error (some keyboards ignore the type hint), and respects currency precision (JPY: integers). There is no minus key dependency: direction comes from the kind selector. |
| K13 | **Text options:** merchant/source names use `KeyboardCapitalization.Sentences`, autocorrect **off** (merchant names get "corrected" into words), suggestions on. Notes use autocorrect on. Search uses `ImeAction.Search`. |
| K14 | **Hardware keyboards** (Book Cover keyboard, Bluetooth, DeX, Chromebook): no IME inset, so layouts stay Roomy; Tab / Shift+Tab move focus in visual order; Enter submits single-line inputs; Esc closes editors and menus; shortcuts in §11.7. Focus indicators are visible. |
| K15 | **Snackbars and toasts** appear above the IME and the quick-log bar, never behind them. |
| K16 | **Autofill:** sign-in fields set `ContentType` hints (email, password, new password) so password managers and inline IME autofill work. Financial fields opt out of autofill. |
| K17 | **Stylus handwriting** (Android 14+ and S Pen) is allowed in all text fields; no custom input that blocks it. |
| K18 | **Tabletop posture:** the IME naturally occupies the bottom half; the input row sits just above it and reading content stays in the top half. Nothing straddles the hinge. |
| K19 | **After adding via quick-log**, the new row scrolls into view in the list above (animated, briefly highlighted) without moving the input row. |
| K20 | **No auto-showing the IME** on screen entry except: quick-log when launched from the "Log" shortcut, tile, widget or `incometracker://log`; and editors opened via "Add". Opening an existing transaction to view it does not pop the keyboard. |

### 11.7 Pointer, keyboard shortcuts and drag and drop

- Hover states on rows, cards and buttons (`Modifier.hoverable`), and a pointer-hand cursor on links.
- Right-click / long-press on a transaction row opens the same context menu (Move to category ▸,
  Change account ▸, Mark recurring / one-off, Duplicate, Delete). Web parity for the right-click
  category menu.
- Drag and drop of `.csv/.ofx/.qif` files onto the app window starts import review (desktop
  windowing, DeX, Chromebook, split-screen with Files).
- Shortcuts (listed in the system shortcuts helper via `onProvideKeyboardShortcuts`):

| Shortcut | Action |
|---|---|
| Ctrl+N | New transaction (focus quick-log) |
| Ctrl+Shift+N | Full add form |
| Ctrl+F | Search this month |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Alt+← / Alt+→ (or PgUp/PgDn on Ledger) | Previous / next month |
| Ctrl+1…5 | Switch destination |
| Ctrl+, | Settings |
| Ctrl+I | Import statement |
| Delete | Delete selected row (with undo) |
| Esc | Close editor / menu / search |

---

## 12. Design system

Mirror the brand, render it the Android way.

### 12.1 Colour

Use the token table from `docs/IOS_APP_SPEC.md` §8.1 (dark authoritative, derived light), mapped to a
Material 3 `ColorScheme` (`background=bg`, `surface=surface`, `surfaceContainer*` from
`surfaceHigh/surfaceHigher`, `primary=blue`, `tertiary=mint`, `error=red`, custom `warning=amber`
extension). Re-check the CSS variables at the top of `src/styles.css` when implementing, since the web
now also has a light theme (`data-theme`).

- Theme options: System / Light / Dark (device-local), default System.
- Dynamic colour (Material You wallpaper colours): **off by default** to keep the brand; an opt-in
  toggle is P3.
- Transaction, category and account colours render from the stored hex on each entity, so they match
  the web exactly.
- Contrast: all text meets WCAG AA in both themes; verify `muted`/`faint` on `bg`.

### 12.2 Typography

Roboto Flex (system default family) for UI; tabular figures (`fontFeatureSettings = "tnum"`) on every
money value so digits don't jitter during count-up. Scale: Material 3 type scale; money metrics use
`displaySmall`/`headlineMedium` with tabular figures. All text in `sp`; layouts tested at 200% font
scale (Android 14 nonlinear scaling).

### 12.3 Shape, spacing, elevation

Spacing 4/8/12/16/24/32dp. Corner radius: chips 8dp, cards 16dp, dialogs 28dp (M3 default), full-screen
editors none. Tonal elevation rather than shadows in dark theme.

### 12.4 Motion

Material 3 motion (expressive springs where the library provides them). Tokens mirror iOS `Motion`:
standard spring for state changes, snappy for collapses, page transition for month change, bouncy only
for success moments. Money values count up/down with an animated number composable. Shared-element
transitions between a row and its detail pane/editor. All motion respects the system "Remove
animations" setting (`ANIMATOR_DURATION_SCALE = 0`) and the in-app Animations toggle: springs become
instant or ≤120ms fades; confetti is disabled.

### 12.5 Haptics

`HapticFeedbackConstants` via `LocalView.current.performHapticFeedback`:

| Event | Constant |
|---|---|
| Add / save success | `CONFIRM` |
| Validation failure | `REJECT` |
| Segmented control / picker / chart scrub tick | `SEGMENT_TICK` (fallback `CLOCK_TICK`) |
| Drag pickup | `GESTURE_START`, drop `GESTURE_END` |
| Swipe action threshold crossed | `GESTURE_THRESHOLD_ACTIVATE` |
| Long-press menu | `LONG_PRESS` |

Never on every keystroke. Respect the system touch-feedback setting (use view haptics, not raw
vibrator).

### 12.6 Iconography

Material Symbols (rounded). Map from the iOS SF Symbol table: Ledger `receipt_long`, Dashboard
`dashboard`, Accounts `account_balance_wallet`, Goals `flag`/`target`, Insights `insights`, Settings
`settings`, recurring `autorenew`, privacy `visibility`/`visibility_off`, import `upload_file`, sync
`cloud_done`/`cloud_off`/`sync`.

### 12.7 Core components (build first, in `core/designsystem` and `core/ui`)

`MoneyText` (currency, tabular, privacy mask, TalkBack "amount hidden"), `AnimatedMoney`, `MetricCard`,
`AppCard`, `StatusPill` (sync state), `TonePill`, `MonthSwitcher`, `SurplusBar`, `ResponsiveGrid`,
`KeyboardAwareScaffold` (implements K1–K6), `EditorHost` (full-screen route vs pane vs dialog by
`WindowProfile`), `FullScreenPicker`, `HingeAwareRow`, `EmptyState`, `ShimmerPlaceholder`.

---

## 13. Screens

Behaviour (data, calculations, gestures, empty states) follows `docs/IOS_APP_SPEC.md` §10 and the
current iOS screens unless stated. This section defines the Android layouts per window profile and
any Android-specific behaviour.

### 13.1 Ledger (home)

**Content:** month switcher; month overview (income, outgoings, surplus, surplus bar); recurring
suggestions; Income section; Expenses grouped by category (collapsible, subtotal, colour dot); month
note; quick-log bar. Search filters the month.

**Quick-log bar:** one field, placeholder "costa 4.35 · salary 2400 recurring · tesco 42.61
yesterday", parsed live by `parseQuickAdd` with a preview line ("Expense · Costa · £4.35 · Today ·
Monzo") and merchant suggestions (`merchantMemory`). Trailing buttons: Add (enabled when parse is
valid), "+" (open the full form pre-filled from the current text). In Cramped/Minimal mode a
hide-keyboard button appears.

| Profile | Layout |
|---|---|
| Compact width, Roomy | Single pane. Collapsing top bar with month switcher. Overview card scrolls away; a slim sticky surplus line remains. Quick-log bar docked above the bottom navigation; when focused, navigation hides and the bar rides the IME. |
| Fold 8 cover portrait (Compact width, Medium height) | As above. With IME up, InputSpace is Tight (~300dp): small top bar, sticky surplus line, list, quick-log bar. Suggestions as one chip row. |
| Height Compact (cover landscape, phone landscape) | Navigation rail on the left (thin). Two columns when width ≥ 600dp: left = overview + month switcher (compact), right = list + quick-log at its bottom. With IME up (Cramped): overview column collapses to the rail, list shows the last rows, quick-log pinned above IME, preview line inline with the field. |
| Medium width | List-detail: list (with quick-log at the bottom of the list pane) + detail pane showing the selected transaction editor, or when nothing is selected, the month summary with category breakdown. |
| Expanded | List-detail as Medium. With width ≥ 1200dp the list pane shows Income and Expenses as two columns (web parity). |
| Large / XL | Three panes: list, detail/editor, and a supporting pane with month insights (category bars, upcoming bills). |
| Book posture | Pane boundary on the hinge: list left, detail right. |
| Tabletop posture | Top half: overview + list. Bottom half: quick-log bar and the IME. |
| Minimal | Quick-log row only, with context line (K6). |

**Gestures:** swipe row end-to-start → Delete (with snackbar undo); start-to-end → toggle recurring.
Long-press / right-click → context menu (§11.7). Drag a row onto a category header to recategorise
(long-press then drag; on pointer devices, drag directly). Horizontal swipe on the month header (not
the list, to avoid fighting row swipes and the system back gesture) changes month. Pull to refresh
triggers a sync fetch.

**Add / edit transaction editor** (`EditorHost`): fields in order Kind (segmented: Expense, Income,
Debt payment, Transfer), Name, Amount, Category (expense), Date (chips Today / Yesterday / Pick…),
Account, Recurring toggle, debt account (debt payment), destination account (transfer). Save in the
top bar and on IME Done of the Amount field. "Save & add another" as a secondary action keeps the
editor open with Name focused (iOS parity). Date picker opens in **input mode** when height is Compact
(the calendar grid needs ~460dp).

### 13.2 Dashboard

Net-worth hero (animated value, outlook sparkline, horizon 12/24/60), metric cards (income, outgoings,
surplus, savings rate), recent transactions, accounts/debt strip, quick actions (Log, Import, Accounts).

| Profile | Layout |
|---|---|
| Compact | Single column. |
| Height Compact | Two columns: hero left, metrics grid right. |
| Medium | Hero full width, metrics 2×2, recent + accounts side by side. |
| Expanded+ | `ResponsiveGrid` 3–4 columns; hero spans 2. |
| Book | Hero and metrics on one side, lists on the other. |

Chart scrub with haptic ticks; tap a metric → Insights.

### 13.3 Accounts

Summary (net worth, assets vs debt stacked bar), filter chips (All, Cash, Savings, Investment, Debt),
sections per class with reorder, possible-duplicate card (§4.8). Account editor fields as iOS
§10.3 (fields appear by class; promo fields expand when promo months > 0).

List-detail on Medium+; full-screen editor on Compact or Compact height. Utilisation warning haptic
(`REJECT`-weight) when an edit crosses 80%.

### 13.4 Goals

Goal cards ordered by priority (drag to reorder, waterfall re-simulates live), planner surplus control,
timeline chart across `goalsHorizonMonths`. List-detail on Medium+ (detail = goal editor + that goal's
month-by-month allocation). Expanded+: timeline chart spans the full width above the panes.

### 13.5 Insights

Health score gauge with breakdown, signals list (expandable), chart switcher (inflow/outflow history,
volatility, net-worth outlook), category breakdown, monthly flow. Compact: single column with a
segmented chart switcher. Expanded+: grid with two charts visible at once. Charts expose TalkBack
summaries and a "View as table" toggle.

### 13.6 Settings

Single column on Compact; list-detail (categories left, page right) on Medium+. Sections: Account
(sign-in method, email, sign out, link sign-in method P2), Sync (status, last synced, revision for
support, "Sync now"), Data (export JSON/CSV via `CreateDocument` + share; import JSON/CSV/OFX/QIF; import
history with per-batch undo), Currency, Privacy (hide amounts, biometric lock, hide in recents),
Appearance (theme, animations), Reminders, Learned rules (category rules, name rules, transfer rules),
AI categorisation opt-in, Bank connections (flag), Feedback, About (version, privacy policy, terms,
open-source licences), Danger zone (clear selected month).

### 13.7 Import

Sources: file picker (`OpenDocument` for `text/csv`, `text/comma-separated-values`,
`application/x-ofx`, `application/vnd.intu.qfx`, `application/qif`, `text/plain`, `*/*` fallback with
extension check), share target, paste, screenshot (ML Kit OCR → `parseLooseLines`), drag and drop,
bank feed (flag). All go through one review screen.

Review screen: rows with include toggle, kind, category, account, date, duplicate flag, transfer and
debt-payment matches; bulk actions (apply category to selected, skip duplicates, select all). Compact:
full-screen list with a bottom summary + Import button (also in top bar, K2). Medium+: list-detail
(row list + row editor). Commit runs the existing import commit (rule learning, name rules, transfer
sweep, 25-batch cap) and shows a snackbar with Undo.

### 13.8 Onboarding

First run with an empty ledger: currency, add main account (optional), first income (optional), offer
sign-in ("Sync with your other devices"). Max 4 steps, skippable, adaptive (two-column on Expanded).

### 13.9 Sync UI

- `StatusPill` in the top bar: Saving… / Synced / Offline (changes kept) / Update needed. Tapping
  shows last synced time and a Sync now action.
- Remote change applied while viewing: no full-screen flash; changed rows animate in; a subtle
  "Updated from another device" snackbar at most once per minute.
- First-sign-in combine flow (§4.8) as a full-screen dialog on Compact, dialog on Medium+.
- Sync nudge for signed-out users after 5 minutes of use (parity), dismissible and remembered.

### 13.10 Feedback

Type (Bug / Feature / General), subject, description, optional email; inserts into
`ledgerlite_feedback` with `user_agent` = `IncomeTracker-Android/<version> (<model>; Android <sdk>)`.
Never attaches ledger data.

---

## 14. Android platform integrations

| Feature | Spec | Priority |
|---|---|---|
| Share target | `ACTION_SEND` / `ACTION_SEND_MULTIPLE` for `text/*`, CSV/OFX/QIF types, `image/*` → import review. `ACTION_VIEW` for statement files from file managers. | P1 |
| App shortcuts | Static: "Log expense" (`incometracker://log`), "Import statement". Dynamic: most-used merchant ("Log Costa"). | P2 |
| Quick Settings tile | "Log expense" opens quick-log with IME up. | P2 |
| Widgets (Glance, `SizeMode.Responsive`) | Small: month surplus + savings rate. Medium: net worth + outlook sparkline + next bill. Large: last 5 transactions + Log button. Privacy mode masks values. Data from a snapshot file written on every persist; `GlanceAppWidget.updateAll` after persist; periodic WorkManager refresh (60 min) pulls the cloud when signed in so widgets reflect other devices. | P2 |
| Notifications | Channels: Bill reminders, Monthly import reminder, Daily log reminder, Sync problems. `POST_NOTIFICATIONS` requested in context (when the user turns a reminder on), never at launch. Scheduling via WorkManager with inexact timing; no exact-alarm permission. Reschedule on boot and on data change (fingerprint like iOS). | P2 |
| Biometric lock | Optional lock on launch/resume after 1 minute in background, `BiometricPrompt` strong biometrics or device credential. While locked, the app shows a branded lock screen; recents thumbnail hidden. | P1 |
| Hide in recents / screenshots | When privacy mode is on: `setRecentsScreenshotEnabled(false)` (API 33+). `FLAG_SECURE` (blocks screenshots too) only via an explicit toggle, because users screenshot their own budgets. | P1 |
| Background sync | WorkManager unique work: flush pending pushes when connectivity returns (expedited), periodic fetch for widgets. Realtime channel only while the app is in the foreground (`ProcessLifecycleOwner`). | P0 |
| In-app updates | Flexible prompt for normal updates, immediate for the schema gate. | P1 |
| In-app review | Ask once after 3 months of use with ≥ 2 imports. | P3 |
| Per-app language | `locales_config.xml` (English only in v1, scaffolding ready). | P3 |

---

## 15. Accessibility (gate, not polish)

- TalkBack: every control labelled; rows expose custom actions (Delete, Toggle recurring, Edit, Move to
  category) so swipe and long-press have equivalents; merged semantics for metric cards ("Surplus,
  £412"); headings marked; pane traversal order list → detail.
- Charts: content description summary plus "View as table".
- Privacy mode: TalkBack says "amount hidden", never the number.
- Touch targets ≥ 48dp, including row actions and chips.
- Font scale up to 200% with no clipped text; Cramped mode plus 200% still shows the input text line.
- Contrast WCAG AA; focus indicators visible for keyboard users.
- Remove-animations respected (§12.4).
- Switch Access and hardware-keyboard-only navigation can reach every action.
- Automated: Compose `AccessibilityChecks` enabled in UI tests; Play pre-launch accessibility report
  clean before release.

---

## 16. Performance budgets

| Metric | Budget (Pixel 7a-class device) |
|---|---|
| Cold start to first frame of Ledger with local data | ≤ 1.0s (Baseline Profile + startup profile) |
| Decode + normalise a 2 MB ledger | ≤ 150ms, off main thread |
| Quick-log add to row visible | ≤ 100ms |
| Scrolling Ledger, 500 entries in a month | no janky frames in Macrobenchmark at 90/120Hz |
| Fold/unfold relayout | ≤ 1 frame of blank content; no activity recreation |
| Remote change → UI | ≤ 3s p95 end to end (§0.3) |
| APK download size | ≤ 15 MB (ML Kit unbundled model via Play services) |

Use stable/immutable UI models, `key`s on lazy lists, `derivedStateOf` for scroll-dependent chrome, and
memoised engine outputs.

---

## 17. Security and privacy

- Publishable (anon) key embedded, as on web and iOS; all access enforced by RLS.
- Session tokens encrypted with Tink + Keystore; excluded from backups.
- No amounts, names or descriptions in logs, crash reports or analytics. Analytics opt-in only.
- `networkSecurityConfig`: cleartext disabled.
- OAuth: PKCE for Apple; nonce for Google ID tokens; redirect scheme verified (`auth-callback` host).
- Exported components: only the launcher Activity (deep links, share target) and the widget receiver.
- Play Data safety: Financial info (user-entered), collected only when signed in, for app
  functionality, encrypted in transit, deletable (account deletion must exist: add "Delete account"
  in Settings, backed by an edge function that deletes the user's rows and the auth user; Play
  requires an in-app path and a web URL for deletion).
- Complete Play's financial features declaration honestly (budgeting/personal finance tool, no lending).

---

## 18. Testing plan

### 18.1 Engine and merge parity

- Move `ios/IncomeTrackerTests/Fixtures/gen` to `shared/fixtures/gen`; extend it to emit cases for
  `normalizeState`, `syncLedgerLinks`, `parseQuickAdd`, recurrence, merchant memory, name rules, the
  import commit, `mergeLedgerStates`, the dedupe passes, and `contentHash`.
- Kotlin tests (JVM, `core/engine`) decode `shared/fixtures/data/*.json` and assert every numeric field
  within `1e-6` and every string/enum/id exactly. iOS keeps running the same fixtures.
- Merge fixtures must include: concurrent adds on three sides; delete vs edit; date edit moving months;
  account balance group conflict; reorder vs add; month rollover double-seeding; same CSV imported on
  two devices; unknown fields at every level; schema version max.
- Property tests (Kotlin, `kotest-property` or hand-rolled): random edit scripts applied on 3 simulated
  devices with random interleavings converge to the same `contentHash`; no transaction present in any
  device's final local edit set is lost unless deleted.

### 18.2 Unit tests

Repository update path, undo stack, debounce, SyncEngine state machine (fake RPC: ok, conflict loops,
schema_too_old, network failures, echo suppression), JSON round-trip with unknown fields, amount
parsing per locale and currency, quick-log parsing, persistence corruption fallback.

### 18.3 Screenshot matrix (Roborazzi, every screen)

Window sizes (dp): 360×640, 412×915, 444×701 (Fold 8 cover portrait est.), 701×444 (cover landscape),
384×896 (21:9 cover), 330×330 (Flip cover), 915×412 (phone landscape), 700×870, 870×700 (Fold inner),
1280×800, 1600×1000. Each in light and dark, font scale 1.0 and 2.0, privacy on/off, and for input
screens: IME hidden, IME 45% of height, IME floating (no inset). Use `DeviceConfigurationOverride`
(`ForcedSize`, `FontScale`) plus a fake IME inset provider in `core/ui`.

### 18.4 Cross-platform sync acceptance (manual + automated)

Automated (CI nightly against a Supabase preview branch): a Node script acts as "device W" and
"device I" through the RPC while an Android emulator test acts as "device A".

| # | Scenario | Pass condition |
|---|---|---|
| A1 | A adds a transaction while W and I are foregrounded | Visible on W and I within 3s |
| A2 | W adds while A is backgrounded; A resumes | Visible on A within 2s of resume |
| A3 | All three offline; each adds 5 transactions and edits a different shared one; reconnect in random order | All 15 adds present everywhere, all 3 edits applied, no duplicates |
| A4 | A deletes X while I (offline) edits X's amount | X exists with I's amount everywhere |
| A5 | Month rolls over while all three are open | Exactly one seeded copy of each recurring entry and one scheduled debt payment per debt |
| A6 | Same CSV imported on A and W before they sync | One copy of each row; import batches reference survivors |
| A7 | Cloud at schema 9, A supports 8 | A shows Update banner, does not push, local edits retained |
| A8 | Legacy blind upsert (pre-v2 web build) during rollout | Revision bumps; A fetches and merges |
| A9 | First sign-in on A with local data; choose Combine | Union with dedupe; counts shown match |
| A10 | Same Google account / same Apple ID on all three | Same `auth.users.id` (manual) |

Manual: the same matrix on real devices (Fold 8, a Pixel, an iPhone, Chrome on desktop) before each
release.

### 18.5 Keyboard and fold test suite (instrumented, emulator + device lab)

One test per rule K1–K20 plus these named edge cases. Instrumented tests assert the focused field's
bounds against `WindowInsets.ime` top; device-lab runs use real Samsung Keyboard and Gboard.

| # | Case | Expected |
|---|---|---|
| E1 | Fold 8 cover landscape, quick-log focused | Cramped mode; input row and last 2–3 rows visible; nav hidden; add keeps IME open |
| E2 | Fold 8 cover landscape, full editor, tab through all fields | Each focused field fully visible above IME; Save always reachable in top bar |
| E3 | Typing in quick-log on cover → unfold | Same text, cursor, focus; IME visible on inner screen |
| E4 | Editor open in detail pane on inner → fold | Full-screen editor on cover with identical draft |
| E5 | Samsung Keyboard floating mode on inner screen | Focused field kept in top 40% |
| E6 | Bluetooth keyboard connected mid-edit | Layout returns to Roomy; Enter saves; Esc closes |
| E7 | Switch to emoji/clipboard/voice panel while typing amount | Field remains visible through the height change |
| E8 | Back once with IME up in dirty editor, then back again | First back hides IME; second shows discard dialog |
| E9 | 3-button navigation and gesture navigation, both keyboards | IME dismissable by K3 means in every combination |
| E10 | Split-screen, app in the bottom 40% on a phone, quick-log focused | Minimal mode; input row visible and usable |
| E11 | Font scale 200% on cover landscape | Input text line visible; preview hidden; no clipping |
| E12 | Category picker from editor on cover landscape | IME hides; full-screen searchable picker; returns focus to next field |
| E13 | Rotate with date picker open | Picker survives with the same selection |
| E14 | Process death while editing (Don't keep activities) | Draft restored; IME not auto-shown |
| E15 | Amount typed as "1.234,56", "£12", "12,5", "abc" (GBP and JPY) | Parsed / rejected per K12 |
| E16 | Tabletop posture on inner screen, quick-log | Input in bottom half above IME; nothing on the hinge |
| E17 | Galaxy Z Flip cover screen (if enabled) | App opens; quick-log usable; no crash |
| E18 | Desktop window resized continuously while typing | No focus loss, no crash, layout tracks size |
| E19 | Snackbar after quick-log add with IME up | Snackbar above input row |
| E20 | Remote sync change arrives while editing that entry | Draft untouched; conflict notice only if the entry was deleted |

### 18.6 Device lab

Physical: Galaxy Z Fold 8 (must have), one 21:9-cover Fold (Fold 5–7), a Pixel phone, a Samsung
tablet (DeX), a small/low-end phone (Android 10–11). Emulators: Pixel Fold, Pixel Tablet, resizable
emulator, desktop emulator, a custom Fold 8 cover profile built from the measured values (§11.1).
Firebase Test Lab / Play pre-launch report for breadth.

### 18.7 CI (GitHub Actions)

On PR: build, lint, detekt, JVM unit + parity tests, Roborazzi verify. Nightly: emulator instrumented
suite (API 30, 34, 36; phone, foldable, tablet profiles) and the §18.4 sync suite against a Supabase
preview branch. Release: Macrobenchmark + baseline profile regeneration.

---

## 19. Release and Play Store

1. Package name `com.incometracking.app` (matches the iOS bundle id). Permanent once published.
2. Play App Signing; upload key in a secure store; `android/keystore` never committed.
3. Store listing: phone, 7" and 10" tablet, and foldable screenshots; Data safety; financial features
   declaration; privacy policy URL (`/privacy.html`); account deletion URL.
4. If the Play developer account is a personal account created after November 2023, Google requires a
   closed test with at least 12 testers opted in for 14 continuous days before production access.
   Recruit testers in Phase 3, not at the end.
5. Tracks: internal (every main build) → closed (weekly) → production staged rollout 10% → 50% → 100%
   with crash-free sessions ≥ 99.5% as the gate.
6. `targetSdk 36` at submission (§5); 16 KB page-size check passes.
7. Versioning: `versionName` follows the web changelog cadence; `versionCode` monotonic from CI.

---

## 20. Phased build plan

Estimates assume one developer working with a coding agent. They are ranges, not promises; the
keyboard/fold work in particular needs device time.

| Phase | Scope | Exit criteria | Estimate |
|---|---|---|---|
| **0. Sync v2 (cross-platform)** | §4: migration on a preview branch, TS merge + dedupe + fixtures, web engine + realtime + Apple/email sign-in + unknown-field preservation + schema gate, iOS engine + realtime + decoding fixes, Supabase auth configuration | §18.4 A1–A9 pass between two browsers and iOS; production migration applied; web and iOS released | 3–4 weeks |
| **1. Android foundations** | Project, modules, CI, design system, `WindowProfile`/`InputSpace`, `KeyboardAwareScaffold`, `EditorHost`, navigation shell for all profiles, **a keyboard test-harness screen** (every field type in every container), screenshot matrix | Harness passes E1–E19 on emulator + Fold 8; shell screenshots green for all sizes | 2–3 weeks |
| **2. Model + engine port** | §7, §8, shared fixtures moved, merge port | All parity + merge + property tests green | 2–3 weeks |
| **3. Local app: Ledger + Dashboard** | Repository, persistence, undo, Ledger (quick-log, editor, gestures, context menu, search, month switch), Dashboard, Settings shell (currency, theme, export/import JSON) | Fully usable offline; §18.5 suite green for these screens; closed testing track opened | 3–4 weeks |
| **4. Auth + sync** | §10, SyncEngine, realtime, WorkManager flush, first-sign-in combine flow, status pill | §18.4 A1–A10 green with Android as device A | 2 weeks |
| **5. Accounts, Goals, Insights** | §13.3–13.5 with all profiles | Screen tests + screenshots green; numbers match web on the same account | 3 weeks |
| **6. Import + settings complete** | §13.6–13.7: files, share target, paste, OCR, drag and drop, review, rules, history/undo, AI opt-in, feedback, onboarding, delete account | Import fixtures from `tests/importer.spec.ts` produce identical rows; e2e import on device | 2–3 weeks |
| **7. Platform extras** | Widgets, shortcuts, tile, notifications, biometric lock, recents privacy, in-app updates | Each feature has an instrumented test; privacy masking verified | 2 weeks |
| **8. Hardening + launch** | Accessibility audit, performance budgets, baseline profiles, device lab pass, store listing, staged rollout | §15/§16 gates met; pre-launch report clean; production 100% | 2 weeks |

Total: roughly 21–26 weeks including Phase 0. Phase 0 delivers value on its own (it fixes data loss for
current web and iOS users) and should ship first regardless of Android timing.

---

## 21. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Merge rules produce surprising results (e.g. a deleted row comes back) | Medium | Edit-beats-delete is deliberate; "Updated from another device" notice; property tests; undo available |
| Three engine implementations drift | Medium | Shared fixtures gate every PR on all three platforms; lift App.tsx logic into tested TS modules first |
| Old iOS builds keep blind-upserting after Android ships | High until cutover | Revision bump trigger keeps them visible; downgrade guard; cutover plan §4.9 |
| Apple OAuth secret expires (6-month limit) and Apple sign-in breaks on web/Android | Medium | Runbook + calendar reminder; monitor auth errors |
| Fold 8 real dp/density differs from estimates | Certain to differ a little | Measure on day 1 of Phase 1; layouts depend on classes and InputSpace, not exact sizes |
| Samsung keyboard behaviours (floating, split, hide-on-display-switch) | Medium | K8, E3–E5 device tests with Samsung Keyboard specifically |
| Blob grows past ~1 MB for heavy importers | Low now | Measure (§4.2); §4.12 trigger for normalised tables |
| Supabase Realtime private-channel limits or outages | Low | Polling fallback (§4.3 rule 3); resume fetch |
| Play closed-testing requirement delays launch | Medium | Start recruiting testers in Phase 3 |
| Navigation 3 / adaptive library API churn | Low–Medium | Day-1 decision recorded; adaptive logic isolated in `core/ui` |

---

## 22. Open decisions for the product owner

1. **Cutover date** for blocking legacy direct writes (§4.9). Suggested: 4 weeks after the iOS Sync v2
   release.
2. **Conflict tie-break**: local-wins on true same-field conflicts (recommended) vs cloud-wins.
3. **`privacyMode` device-local or synced** (§4.7).
4. **minSdk 29** (recommended) vs 26 for wider reach at the cost of more inset workarounds.
5. **Package name** `com.incometracking.app` (matches iOS) vs `com.theincometracker.app` (matches the
   domain). Irreversible after first publish.
6. **Dynamic colour** off by default (recommended, keeps the brand).
7. **Notification-listener capture** (read bank app notifications such as "You spent £4.35 at Costa"
   into review): the one Android-only automation with no Apple equivalent besides FinanceKit. Powerful
   but sensitive, and Play reviews notification-listener use closely. Recommend a later, opt-in
   experiment after v1, not in v1.
8. **Account deletion**: Play requires it; confirm the behaviour (delete cloud data and auth user, keep
   nothing) and add the same to web and iOS.

---

## Appendix A: Files to read in this repo

- `src/types.ts`, `src/finance.ts`: model and engine (port verbatim).
- `src/App.tsx`: `normalizeState`, `normalizeStateFields`, `syncLedgerLinks`, `updateLedger`,
  `statesAreEquivalent`, `hasLocalData`, `MergeConflictModal`, cloud hydrate and save effects.
- `src/supabase.ts`, `src/storage.ts`: current sync and local storage.
- `src/importer.ts`, `src/quickAdd.ts`, `src/recurrence.ts`, `src/merchantMemory.ts`,
  `src/nameRules.ts`, `src/accountFlow.ts`, `src/accountLinks.ts`, `src/debtSync.ts`,
  `src/ledgerOrder.ts`: engine pieces.
- `ios/IncomeTracker/Sync/SyncCoordinator.swift`, `ios/IncomeTracker/App/LedgerStore+Persistence.swift`,
  `ios/IncomeTracker/Models/LenientDecoding.swift`: iOS sync and decoding.
- `ios/IncomeTracker/Features/Ledger/LedgerScreen.swift`: quick-log bar behaviour reference.
- `ios/IncomeTrackerTests/Fixtures/gen/generate-fixtures.ts`: parity fixture generator to share.
- `supabase/migrations/`, `supabase/functions/`: schema and edge functions.
- `docs/IOS_APP_SPEC.md`: screen behaviour, design tokens, haptic/motion intent.

## Appendix B: Sources for external facts

- Galaxy Z Fold 8 displays: Samsung buying guide (5.5" 10:16 cover, 7.6" 4:3 main, 120Hz),
  https://www.samsung.com/au/mobile/buying-guide/galaxy-z-fold8-features-specs/ ; cover resolution
  ~1248×1972 per https://en.wikipedia.org/wiki/Samsung_Galaxy_Z_Fold_8 and
  https://www.androidauthority.com/samsung-galaxy-z-fold-8-3688636/ ; inner 1848×2448 per
  https://www.androidcentral.com/phones/samsung-galaxy/galaxy-z-fold-8-display-faq-everything-you-need-to-know-about-aspect-ratios
- Google Play target API (36 from 31 Aug 2026, extension to 1 Nov 2026):
  https://developer.android.com/google/play/requirements/target-sdk ,
  https://support.google.com/googleplay/android-developer/answer/11926878
- Android 17 ignores orientation/resizability restrictions on sw ≥ 600dp, Android 16 opt-out removed:
  https://developer.android.com/about/versions/17/changes/ff-restrictions-ignored ,
  https://docs.flutter.dev/release/breaking-changes/android-large-screens-restrictions-ignored
- Supabase Realtime broadcast from the database (`realtime.send`, `realtime.broadcast_changes`) and
  private-channel authorisation (`realtime.messages` RLS, `realtime.topic()`):
  https://supabase.com/docs/guides/realtime/broadcast ,
  https://supabase.com/docs/guides/realtime/authorization ,
  https://supabase.com/blog/realtime-broadcast-from-database
