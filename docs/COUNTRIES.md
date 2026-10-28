# Countries: the UK app and the US experience

The app started UK-only. It now carries a `country` on the ledger that picks one of two
*experiences* — `GB` (the original app) or `US` — plus a currency. Every country other than the
United States uses the GB experience with its own currency, exactly as the old currency dropdown did.

## Where things live

| Module | What it owns |
| --- | --- |
| `src/region.ts` | Country list and detection (`detectCountry`), UK→US copy (`americanize`, `textLocalizer`), per-region account types with explanatory text for the "i" icons, onboarding presets, statement date order. |
| `src/retirement.ts` | Contribution amounts from % of pay, employer match / fixed employer contributions, statutory annual limits by year (401(k), IRA, HSA, FSA, 529 gift exclusion; ISA, LISA, pension allowance), limit groups, match shortfalls, `syncPlanContributions`. |
| `src/loans.ts` | Amortised payments, US federal repayment plans incl. a simplified income-driven estimate, UK plan thresholds (9% / 6% above threshold), `loanSuggestion`. |
| `src/taxUS.ts` / `src/taxUK.ts` | Gross-to-net estimates: federal brackets + standard deduction, FICA, flat state rate; PAYE bands with allowance taper, employee NI, student loan, net-pay pension. |
| `src/takeHome.ts` | Picks the estimator for the region and feeds it the payroll contributions set on the accounts. |
| `src/medical.ts` | Medical spending in the plan year against deductible / out-of-pocket maximum; HSA and FSA balances. |
| `src/creditScore.ts` | Reads the 300–850 credit estimate as FICO + VantageScore (US) or Experian 0–999 (UK). |
| `src/planSignals.ts` | Anomalies from plan data: match left behind, limit exceeded, FSA expiring, HSA without an HDHP. |
| `src/layout.ts` + `src/WidgetGrid.tsx` | Customisable Dashboard layout (order, width, add/remove), persisted in localStorage per region. |
| `src/routes.ts` | `/dashboard`, `/ledger`, `/pay`, … ↔ views; `public/sw.js` and `vercel.json` serve them. |
| `src/RegionPanels.tsx` | Plan / loan detail editors on account rows and the region widgets. |
| `src/sampleData.ts` | Dev-only US and UK sample ledgers, loaded automatically for a fresh profile on the dev server (`?sample=us`, `?sample=uk`, `?sample=blank` to choose). |

The per-page tutorials (`TUTORIALS_GB` / `TUTORIALS_US` in `App.tsx`) and the onboarding presets are
also chosen by region, so a US user is walked through 401(k)s, the gross-to-net estimate and medical
tracking rather than ISAs and council tax.

## Data model additions

`Account` gained optional plan fields — `taxTreatment`, `contributionSource` (`payroll` | `personal`),
`contributionPercent`, `employerMatchPercent`, `employerMatchCapPercent`, `employerContributionPercent`,
`employerMonthlyContribution`, `annualLimitOverride`, `catchUpEligible`, `coverage`, `termMonths`,
`studentLoanType`, `repaymentPlan`, `studentLoanPlan`, `familySize`. An account with none of them set
behaves exactly as before, which is what keeps the UK numbers unchanged.

`LedgerState` gained `country`, `taxProfile` (gross salary, pay frequency, US filing status and
state, UK student-loan plan, pre-tax health premium) and `healthPlan`. Schema version is 9; older
ledgers take their country from their currency (USD → US, anything else → the country using it).

## The one calculation rule that matters

Contributions marked **payroll** are taken from gross pay before take-home. The ledger's income is
take-home, so that money is already gone: it is added to the account in the forecast but **not**
subtracted from the surplus (`cashContribution` vs `accountInflow` in `finance.ts`). Employer money
likewise only ever adds to the account. The goal planner, the over-allocation warning and the asset
summary (`cashContributions` / `payrollContributions` / `employerContributions`) all follow this.

## Figures to refresh each year

- `src/taxUS.ts` — `US_FEDERAL_TABLES` (brackets, standard deduction, SS wage base), `US_STATES`.
- `src/taxUK.ts` — `UK_TAX_TABLES`.
- `src/retirement.ts` — `US_LIMITS`, `GB_LIMITS`.
- `src/loans.ts` — `UK_THRESHOLDS` (student-loan plans), `US_POVERTY_GUIDELINE`.

Each table is keyed by year; the latest year at or before today is used, so the app keeps working
when a new year arrives before the table does. The tests in `tests/tax.spec.ts`, `tests/retirement.spec.ts`
and `tests/loans.spec.ts` work every figure by hand — update them together with the tables.
