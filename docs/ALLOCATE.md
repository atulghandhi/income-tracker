# Allocate: debt payoff strategies and lump-sum planning

The Allocate page ("Allocate debt and savings"; `/allocate`, `src/AllocateView.tsx`) answers one question: *where should spare
money go?* It takes the ledger's spare-per-month figure and an optional one-off lump sum, splits
them between the user's debts, a cash buffer, a tax reserve and savings under a priority the user
chooses, simulates every strategy month by month, and shows the results side by side. The engine
is `src/allocate.ts`; it has no React in it and is pinned by `tests/allocate.spec.ts`.

## Inputs

| Input | Source |
| --- | --- |
| Debts | Live debt accounts with a balance (`deriveLiveAccounts`), minus any the user has left out. Mortgages and UK student loans start left out (`defaultDebtIncluded`) and can be ticked in. |
| Spare each month | The same figure the Goals page plans with (recurring surplus after minimums and existing contributions), before any Goals-page override. The user can type their own. |
| Lump sum | Typed on the page. Split in "month 0", before any interest or minimums. |
| Buffer target | `bufferMonths × recurring monthly expenses`; easy-access savings already held count towards it (`accessibleSavings`). |
| Tax reserve | An amount and months until due. |
| Taxable lump sum (UK only) | A checkbox under the lump sum. When ticked, the source (self-employed, other untaxed income, rental, savings interest, dividends, capital gain), the monthly PAYE salary (defaults to the tax profile) and anything already received this tax year from that source size the tax to hold back (`src/lumpSumTax.ts`). It is worked out marginally — tax on (prior + lump) minus tax on (prior), stacked on salary — so bands, the allowance taper, Class 4 NI, the starting rate and Personal Savings Allowance, the dividend allowance and the CGT exempt amount all apply. A "Repaying a student loan" checkbox (pre-filled from the tax profile) adds the 9% / 6% Self Assessment repayment on earned income above the plan threshold — unearned income (rent, interest, dividends) counts only once over £2,000 in the year, gains never. The engine holds the total back on day one and releases it in the month the Self Assessment bill is due (31 January after the tax year ends). It is held once: the separate "Tax bill to set aside" field (relabelled "Other tax bill…" while a lump-sum tax is active) is for a different bill, and "Tax bill first" only orders that separate bill. |
| Savings destinations | The user's asset accounts (not payroll-only ones, not the home), ranked by the savings priority; an assumed account stands in when they have none. |

Everything is stored on the ledger as `LedgerState.allocation` (`AllocationSettings`), normalised on
load by `normalizeAllocationSettings`, so the plan syncs with the rest of the data.

## Strategies

Every priority is the same two decisions:

1. **A waterfall of buckets** the money flows through each month: tax reserve → cash buffer →
   debts → savings, in an order that depends on the priority. "Custom" uses fixed percentage
   shares instead, with anything a bucket cannot use spilling into the next.
2. **A debt order** once money reaches the debt bucket:
   - *avalanche* — highest effective APR this month first;
   - *snowball* — smallest balance first;
   - *cash-flow* — largest minimum payment relative to balance first (frees the most monthly
     outgoing per unit paid), re-ranked monthly;
   - *utilisation* — cards first, water-filled so the most-used card is brought level with the next
     and they come down together; then other debts by APR.

| Priority | Buckets | Debt order | Notes |
| --- | --- | --- | --- |
| Least interest | tax, debt, savings | avalanche | |
| Lower payments soonest | tax, debt, savings | cash-flow | |
| Quick wins | tax, debt, savings | snowball | |
| Credit score recovery | tax, debt, savings | utilisation | |
| Cash buffer first | tax, buffer, debt, savings | avalanche | full buffer target |
| Tax bill first | tax, debt, savings | avalanche | the reserve takes everything, lump sum included, until funded |
| Balanced | tax, buffer (1 month), debt, savings | avalanche | only debts costing more than the best safe rate are overpaid |
| Custom | shares | user's choice | |

Two rules apply to every priority and can be switched off: the **0% promo guard** (a balance on an
introductory rate gets enough on top of its minimum to clear before the rate rises — the lump sum
covers what the minimums alone would not, later months spread the shortfall evenly) and **rollover**
(a cleared debt's minimum keeps being paid, onto the next debt or into savings).

The tax reserve, when set, is funded in every strategy: pro rata to the due month normally, in
full under "Tax bill first". It is held as cash and leaves the picture in the month it is due; a
shortfall at that point is reported.

## Simulation

Month 0 is today: the lump sum is split. Each month after that, in order: interest at the
promo-aware geometric monthly rate (`effectiveAnnualRate` / `monthlyRateFromAnnual`, the same as
the net-worth forecast), minimum payments, growth on what the plan has already saved, then the
month's pool (spare + rolled-over minimums) through the buckets. Points are recorded up to the
horizon; the loop continues (to a 50-year cap) only to find the payoff date and lifetime interest.

A **minimums-only baseline** runs the same debts with the spare money left idle, so "interest
saved" and "months sooner" are like for like, and net position (savings built minus debt left) is
comparable across every row.

## What the page shows

Headline metrics for the chosen priority (debt-free date, total interest against minimums only,
committed payments a year out, card utilisation now and in a year, savings built by the horizon),
the lump-sum and first-month splits as stacked bars, the payoff order table (with include/exclude
per debt), the debt-and-savings path against minimums only, the comparison table and bar charts
for every strategy, the ranked savings destinations, and the notice. The **Debt payoff plan**
widget (`PayoffWidget`) repeats the headline figures, a sparkline and this month's move on
Insights (default) and in the Dashboard tray; the Insights variant adds the strategy table.

## Advice boundary

The Income Tracker is not authorised to give regulated financial advice, so the page gives
information and illustrations, never a personal recommendation:

- the user picks the priority; the comparison marks the lowest cost / earliest date / largest amount
  per column and says "which one matters is your call";
- every figure is labelled as an illustration from the user's own inputs under stated assumptions
  (rates constant, payments on time, no new borrowing, fixed minimums);
- investment returns are "assumed", with a capital-at-risk warning wherever an investment
  destination is involved; cash destinations carry the FSCS / FDIC note;
- priority debts (rent, mortgage arrears, council tax, energy, court fines) are called out as
  coming before any of this;
- free, impartial help is linked on every plan: MoneyHelper, StepChange, National Debtline and
  Citizens Advice in the UK; the CFPB, NFCC and 211 in the US.

Copy is written in British English and runs through `textLocalizer` for the US experience.
