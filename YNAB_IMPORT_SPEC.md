# YNAB Import — Spec & Implementation Plan

Status: **Draft for implementation** · Last updated: 2026-06-14

## 1. Goal

Let a user import a YNAB CSV export and apply it to the app. A YNAB export is **two
separate files** with different shapes:

- **Register.csv** — the transaction ledger (per-account). Today's export contains only
  *Starting Balance* rows, but future exports will contain real transactions.
- **Plan.csv** — YNAB envelope budgeting (per-category monthly `Assigned`/`Activity`/`Available`).

The current importer (`src/importer.ts`, `parseBankCsv`) only understands a *single-account*
generic bank statement and ignores account columns and budget files entirely. This adds a
YNAB-aware path alongside it.

## 2. Decisions (locked)

| Area | Decision |
|---|---|
| **Scope** | (a) Seed **accounts** from Register starting balances, (b) import **category taxonomy** from Plan, (c) support **full register transactions** in future exports. |
| **Currency** | YNAB always prints `$`. **Ask per import** — show a currency selector in the review screen; default to the ledger's current currency. Store amounts as plain numbers in that currency. |
| **Budget model** | **Taxonomy only.** Use the Plan to seed category names; **skip the `Assigned` amounts**. No envelope/budget feature for now. |
| **Account linkage** | **Entries stay account-agnostic.** Real register transactions are lumped into month income/expense as today. The `Account` column is used only for (i) creating accounts from Starting Balance rows and (ii) excluding intra-account transfers. |
| **Account classification** | **Auto-detect, editable in review.** Infer class/type/rate from YNAB signals; let the user correct before applying. |
| **Re-import** | **Match by name, update balance.** If an account with the same (normalized) name exists, update its balance instead of creating a duplicate. |
| **Category names** | **Strip emoji and group prefix.** `"Bills: 🏠 Rent"` → `"Rent"`. |

## 3. File detection

Route by header signature (case-insensitive, after normalization):

- **Register** if headers include `account` + (`outflow` & `inflow`) + `category group/category`.
- **Plan** if headers include `month` + `assigned` + `available` + `category group/category`.
- Otherwise → fall through to the existing generic `parseBankCsv`.

The import UI accepts one or both YNAB files. Detection is per-file, so the user can drop the
Register, the Plan, or both; we parse each with the right parser.

## 4. Register parsing

New parser `parseYnabRegister(...)` in `src/ynab.ts`. Columns:
`Account, Flag, Date, Payee, Category Group/Category, Category Group, Category, Memo, Outflow, Inflow, Cleared`.

For each row, `signed = inflow − outflow` (amounts parsed with the existing `parseAmount`, `$`/commas stripped).

### 4a. Starting Balance rows → Account drafts
A row is a starting balance when `Payee === "Starting Balance"` (case-insensitive).
Produce a `YnabAccountDraft` per account:

- `name` = Account column, trimmed.
- `balance` = `Math.abs(signed)` (app stores both debt and asset balances **positive**).
- **Class auto-detect:**
  - **debt** if any of: the account name/category appears under a `Credit Card Payments` group in the Plan; `signed < 0` (money owed shows as outflow); name matches `/loan|credit|card|overdraft|mortgage/i`.
  - **cash** otherwise (positive inflow balance, e.g. a current/debit account).
  - savings/investment are not auto-detected from this export but are selectable in review.
- **Type auto-detect:** `loan` if name matches `/loan/i`; `credit-card` for other debts; `current` for cash.
- Rate fields default to 0 (user fills APR/AER in review or later in Accounts).
- `matchExistingId` = id of an existing account whose normalized name matches, else `null`.

Expected result for the attached export:

| YNAB account | signed | Class | Type | Balance |
|---|---|---|---|---|
| natwest | −9,500 | debt | credit-card | 9,500 |
| hsbc | −4,730 | debt | credit-card | 4,730 |
| b-loan | −8,500 | debt | loan | 8,500 |
| natwest debit | +150 | cash | current | 150 |

### 4b. Real transaction rows → review rows
Non-starting-balance rows map to the existing `CsvImportRow` shape (so they reuse the current
review UI and `confirmCsvImport` apply path):

- `date` ← Date (YNAB `MM/DD/YYYY` → ISO via existing `parseDateValue`).
- `description` ← Payee (fallback to Memo).
- `amount` ← `signed`; `kind` = income if `> 0` else expense.
- `category` ← cleaned `Category` (section 6); feeds category suggestion / rules.
- Intra-account **transfers** (YNAB payee `"Transfer : <account>"`) are detected and default
  `include = false` (consistent with current transfer handling) so net worth isn't double-counted.
- Duplicate detection reuses `createTransactionHash` + `collectExistingTransactionHashes`.

## 5. Plan parsing (taxonomy only)

New parser `parseYnabPlan(...)`. Columns:
`Month, Category Group/Category, Category Group, Category, Assigned, Activity, Available`.

- Collect the distinct `Category` values, cleaned (section 6). **Ignore `Assigned`/`Activity`/`Available`.**
- Output: a deduped category list + optional `Category Group → Category` mapping, used to:
  - extend `importCategoryOptions` so these categories appear in the review dropdowns, and
  - optionally seed lightweight `CategoryRule`s (pattern = cleaned category, kind = expense) so
    future imports auto-categorise. (Rules are additive; never overwrite user rules.)

## 6. Category name cleaning

`cleanYnabCategory(raw)`:
1. Drop the group prefix before the first `": "` (`"Bills: 🏠 Rent"` → `"🏠 Rent"`).
2. Strip emoji / pictographs and leftover symbol clutter.
3. Collapse whitespace, title-case-safe trim → `"Rent"`.
Skip YNAB system categories (`"Inflow: Ready to Assign"`, `"Uncategorized"`).

## 7. UI / apply flow

Extend the existing import review screen ([App.tsx:1076](src/App.tsx:1076)) rather than build a new one:

1. User drops file(s). Each is detected and parsed.
2. **Currency selector** shown at top of review (defaults to ledger currency).
3. **Accounts section** (new): table of `YnabAccountDraft`s with editable name / class / type /
   balance / rate, and a badge showing *“updates existing”* vs *“new”*. User can deselect any.
4. **Transactions section**: the existing review table, populated from register transaction rows
   (empty for this particular export).
5. **Confirm** applies atomically:
   - Accounts: update matched-by-name accounts' balance (and class/type/rate if edited); create
     the rest via the existing `addAccount` shape. Reuse `createId("account")`.
   - Transactions: existing `confirmCsvImport` path (month entries + `ImportBatch` + merged rules).
   - Categories/rules from the Plan merged in (additive).
   - One toast summarising: *N accounts, M transactions, K categories*.

## 8. Files to touch

- **`src/ynab.ts`** (new): `detectYnabFile`, `parseYnabRegister`, `parseYnabPlan`,
  `cleanYnabCategory`, `YnabAccountDraft` type. Reuse helpers from `importer.ts`
  (`parseAmount`, `parseDateValue`, `createTransactionHash`) — extract them to a shared
  `csv-utils.ts` if cleaner than cross-importing.
- **`src/importer.ts`**: export the shared helpers (or move to `csv-utils.ts`).
- **`src/App.tsx`**: detect YNAB in `importCsv`, add Accounts section + currency selector to the
  review state/UI, extend `confirmCsvImport` to apply account drafts.
- **`src/types.ts`**: add `YnabAccountDraft` (or keep local to `ynab.ts`). No `LedgerState`
  schema change required (no model migration — entries stay account-agnostic, no budget concept).
- **Tests** (`tests/`, Playwright): fixtures for the two attached CSVs; assert 4 accounts created
  with correct class/balance, categories seeded, zero transactions, currency respected, and a
  re-import updates rather than duplicates.

## 9. Out of scope (future)

- Envelope budgeting (`Assigned`/`Activity`/`Available`) as a real feature.
- Linking transactions to accounts / per-account transaction views.
- YNAB milestones/targets → app `goals` mapping.
- Multi-currency per account.

## 10. Effort estimate

- `ynab.ts` parsers + cleaning + detection: ~0.5 day.
- Review UI Accounts section + currency selector + apply wiring: ~0.5–1 day.
- Tests + fixtures + polish: ~0.5 day.

**~1.5–2 days** for the locked scope. The auto-detect/review and name-matching are the only
real risk areas; everything else reuses existing import plumbing.
