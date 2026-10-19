import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  Briefcase,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Percent,
  ShieldCheck,
  Target,
} from "lucide-react";
import { interpretCreditScore, type ScoreReading } from "./creditScore";
import { clampPercent, estimateDebtPayoff, formatMonth, getMonthKey, shiftMonth } from "./finance";
import { US_REPAYMENT_PLANS, UK_STUDENT_LOAN_PLANS, loanSuggestion } from "./loans";
import { HEALTH_PLAN_TYPES, summarizeMedical } from "./medical";
import { HOUSING_PATTERN, TAX_TREATMENT_OPTIONS, accountTypeOption, isLoanType, type RegionKey } from "./region";
import {
  annualLimitFor,
  contributionLimitGroups,
  employerMatchShortfalls,
  limitYear,
  limitYearLabel,
} from "./retirement";
import { computeTakeHome } from "./takeHome";
import { ukTaxYearFor } from "./taxUK";
import { FILING_STATUS_OPTIONS, PAY_FREQUENCY_OPTIONS, US_STATES } from "./taxUS";
import type { Account, GoalSequenceResult, HealthPlan, MonthBudget, SavingsGoal, TaxProfile } from "./types";
import { EmptyState, InfoHint, MoneyInput, NumberInput, PanelTitle, formatDecimal } from "./ui";

// Panels for the country-specific experience: plan details on accounts (401(k) matches, pension
// contributions, student-loan plans), and the dashboard / insights widgets built on them.

type Money = { formatter: Intl.NumberFormat; symbol: string; privacy: boolean };

function money(formatter: Intl.NumberFormat, value: number, privacy: boolean): string {
  return privacy ? "•••" : formatter.format(value);
}

function positive(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

// The type label for an account in its own region's words.
function typeLabel(account: Account, region: RegionKey): string {
  return accountTypeOption(region, account.accountClass, account.type).label;
}

const PAYROLL_TYPES = new Set(["pension", "401k", "403b", "hsa", "fsa"]);
const EMPLOYER_TYPES = new Set(["pension", "401k", "403b", "hsa"]);
const CATCH_UP_TYPES = new Set(["401k", "403b", "traditional-ira", "roth-ira", "hsa"]);

function PlanField({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`planField ${wide ? "wide" : ""}`}>
      <span className="fieldLabel">
        {label}
        {hint && <InfoHint label={`${label} help`} text={hint} />}
      </span>
      {children}
    </label>
  );
}

// ─── Account plan details (asset accounts) ───────────────────────────────────

export function AccountPlanDetails({
  account,
  region,
  taxProfile,
  formatter,
  symbol,
  privacy,
  onChange,
}: Money & {
  account: Account;
  region: RegionKey;
  taxProfile: TaxProfile;
  onChange: (patch: Partial<Account>) => void;
}) {
  const option = accountTypeOption(region, account.accountClass, account.type);
  const salary = positive(taxProfile.grossAnnualSalary);
  const year = limitYear(region);
  const limit = annualLimitFor(account, region, year);
  const employee = positive(account.monthlyContribution);
  const employer = positive(account.employerMonthlyContribution);
  const annualIn = (employee + employer) * 12;
  const payrollType = PAYROLL_TYPES.has(account.type);
  const employerType = EMPLOYER_TYPES.has(account.type);
  const usesPercent = positive(account.contributionPercent) > 0;
  const source = account.contributionSource ?? "personal";
  const ira = account.type === "traditional-ira" || account.type === "roth-ira";
  const treatmentOptions = account.type === "401k" || account.type === "403b" ? TAX_TREATMENT_OPTIONS.filter((item) => item.value === "pre-tax" || item.value === "roth") : TAX_TREATMENT_OPTIONS;

  return (
    <div className="planDetails" aria-label={`Plan details for ${account.name}`}>
      <p className="planNote">{option.info}</p>
      <div className="planGrid">
        <PlanField label="Tax treatment" hint={TAX_TREATMENT_OPTIONS.find((item) => item.value === (account.taxTreatment ?? option.taxTreatment))?.hint ?? ""}>
          <select value={account.taxTreatment ?? option.taxTreatment ?? "taxable"} onChange={(event) => onChange({ taxTreatment: event.target.value as Account["taxTreatment"] })} aria-label={`Tax treatment for ${account.name}`}>
            {treatmentOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </PlanField>

        <PlanField
          label="Contributions come from"
          hint="Paycheck contributions are taken before take-home pay, so they are not subtracted from your monthly surplus. Bank contributions leave your budget like any other transfer."
        >
          <select value={source} onChange={(event) => onChange({ contributionSource: event.target.value as Account["contributionSource"] })} aria-label={`Contribution source for ${account.name}`}>
            <option value="payroll">{region === "US" ? "My paycheck (before take-home)" : "My pay (before take-home)"}</option>
            <option value="personal">My bank account (after tax)</option>
          </select>
        </PlanField>

        {payrollType && (
          <PlanField
            label="Your contribution, % of pay"
            hint={
              salary > 0
                ? "Sets the monthly amount from the gross salary in your take-home estimate. Leave at 0 to type the monthly amount instead."
                : "Add your gross salary on the Pay & tax page to use a % of pay; until then, type the monthly amount on the row above."
            }
          >
            <div className="planInputRow">
              <NumberInput value={positive(account.contributionPercent)} min={0} max={100} ariaLabel={`Contribution percent for ${account.name}`} onCommit={(value) => onChange({ contributionPercent: value })} disabled={salary <= 0} />
              <span className="fieldSuffix">%</span>
              {usesPercent && salary > 0 && <em className="planComputed">= {money(formatter, employee, privacy)}/mo</em>}
            </div>
          </PlanField>
        )}

        {employerType && (
          <>
            <PlanField label="Employer match" hint="How much of each unit you pay in your employer adds: 100 = dollar-for-dollar (pound-for-pound), 50 = half.">
              <div className="planInputRow">
                <NumberInput value={positive(account.employerMatchPercent)} min={0} max={1000} ariaLabel={`Employer match percent for ${account.name}`} onCommit={(value) => onChange({ employerMatchPercent: value })} />
                <span className="fieldSuffix">% of what you pay</span>
              </div>
            </PlanField>
            <PlanField label="Match up to" hint="The match stops once your own contribution reaches this % of pay — the classic '100% of the first 4%'.">
              <div className="planInputRow">
                <NumberInput value={positive(account.employerMatchCapPercent)} min={0} max={100} ariaLabel={`Employer match cap for ${account.name}`} onCommit={(value) => onChange({ employerMatchCapPercent: value })} />
                <span className="fieldSuffix">% of pay</span>
              </div>
            </PlanField>
            <PlanField label="Employer pays regardless" hint={region === "US" ? "A non-elective employer contribution paid whether or not you contribute." : "Auto-enrolment requires at least 3% of qualifying earnings from your employer whatever you pay in."}>
              <div className="planInputRow">
                <NumberInput value={positive(account.employerContributionPercent)} min={0} max={100} ariaLabel={`Employer fixed contribution percent for ${account.name}`} onCommit={(value) => onChange({ employerContributionPercent: value })} />
                <span className="fieldSuffix">% of pay</span>
              </div>
            </PlanField>
            <PlanField
              label="Employer adds per month"
              hint={salary > 0 ? "Worked out from the match rules and your salary. Type a figure instead if the rules above are left blank." : "With no salary on file, type what your employer adds each month."}
            >
              <MoneyInput
                ariaLabel={`Employer monthly contribution for ${account.name}`}
                value={String(employer)}
                symbol={symbol}
                privacy={privacy}
                readOnly={salary > 0 && (positive(account.employerMatchPercent) > 0 || positive(account.employerContributionPercent) > 0)}
                onChange={(value) => onChange({ employerMonthlyContribution: positive(Number(value)) })}
              />
            </PlanField>
          </>
        )}

        {account.type === "hsa" && (
          <PlanField label="Coverage" hint="The HSA limit depends on whether the high-deductible plan covers just you or your family.">
            <select value={account.coverage ?? "self"} onChange={(event) => onChange({ coverage: event.target.value as Account["coverage"] })} aria-label={`HSA coverage for ${account.name}`}>
              <option value="self">Self-only</option>
              <option value="family">Family</option>
            </select>
          </PlanField>
        )}

        {CATCH_UP_TYPES.has(account.type) && (
          <label className="planCheck">
            <input type="checkbox" checked={Boolean(account.catchUpEligible)} onChange={(event) => onChange({ catchUpEligible: event.target.checked })} aria-label={`Catch-up contributions for ${account.name}`} />
            <span>
              Catch-up eligible ({account.type === "hsa" ? "55" : "50"}+)
              <InfoHint label="Catch-up help" text="From age 50 (55 for an HSA) the annual limit rises by a catch-up amount." />
            </span>
          </label>
        )}

        {account.type === "cd" && (
          <PlanField label="Term remaining" hint="Months until the CD matures. The rate above is fixed until then; withdrawing early usually forfeits some interest.">
            <div className="planInputRow">
              <NumberInput value={positive(account.termMonths)} min={0} max={600} integer ariaLabel={`Term months for ${account.name}`} onCommit={(value) => onChange({ termMonths: value })} />
              <span className="fieldSuffix">months</span>
              {positive(account.termMonths) > 0 && <em className="planComputed">matures {formatMonth(shiftMonth(getMonthKey(), positive(account.termMonths)))}</em>}
            </div>
          </PlanField>
        )}

        {limit && (
          <PlanField label={`${limit.label} (${limitYearLabel(region, year)})`} hint={`${limit.note} Type a figure to override the statutory limit.`}>
            <MoneyInput
              ariaLabel={`Annual limit override for ${account.name}`}
              value={String(positive(account.annualLimitOverride) > 0 ? account.annualLimitOverride : limit.limit)}
              symbol={symbol}
              privacy={privacy}
              onChange={(value) => onChange({ annualLimitOverride: positive(Number(value)) === limit.limit ? 0 : positive(Number(value)) })}
            />
          </PlanField>
        )}
      </div>

      {limit && (
        <div className="limitMeter">
          <div className="limitMeterHead">
            <span>
              {money(formatter, (limit.key === "hsa" || limit.key === "pension" ? annualIn : employee * 12), privacy)} of {money(formatter, limit.limit, privacy)} planned this year
              {ira ? " · shared across your IRAs" : ""}
            </span>
            <b>{formatDecimal(clampPercent(((limit.key === "hsa" || limit.key === "pension" ? annualIn : employee * 12) / Math.max(1, limit.limit)) * 100))}%</b>
          </div>
          <div className="ruleTrack">
            <strong style={{ width: `${clampPercent(((limit.key === "hsa" || limit.key === "pension" ? annualIn : employee * 12) / Math.max(1, limit.limit)) * 100)}%` }} />
          </div>
        </div>
      )}

      {employer > 0 && (
        <p className="planSummaryLine">
          <Briefcase size={13} />
          You add {money(formatter, employee, privacy)}/mo, your employer adds {money(formatter, employer, privacy)}/mo — {money(formatter, annualIn, privacy)} a year in total.
        </p>
      )}
    </div>
  );
}

// ─── Loan details (debt accounts) ────────────────────────────────────────────

export function LoanDetails({
  account,
  region,
  taxProfile,
  formatter,
  privacy,
  onChange,
}: Omit<Money, "symbol"> & {
  account: Account;
  region: RegionKey;
  taxProfile: TaxProfile;
  onChange: (patch: Partial<Account>) => void;
}) {
  const year = region === "US" ? new Date().getFullYear() : ukTaxYearFor();
  const suggestion = loanSuggestion(account, region, taxProfile, year);
  const isStudent = account.type === "student-loan";
  const federal = isStudent && region === "US" && (account.studentLoanType ?? "federal") === "federal";
  const showTerm = !isStudent || (region === "US" && !(federal && account.repaymentPlan === "income-driven"));

  return (
    <div className="planDetails" aria-label={`Loan details for ${account.name}`}>
      <p className="planNote">{accountTypeOption(region, "debt", account.type).info}</p>
      <div className="planGrid">
        {isStudent && region === "US" && (
          <PlanField label="Loan type" hint="Federal loans have income-driven plans, deferment and forgiveness; private loans follow the lender's contract.">
            <select value={account.studentLoanType ?? "federal"} onChange={(event) => onChange({ studentLoanType: event.target.value as Account["studentLoanType"] })} aria-label={`Student loan type for ${account.name}`}>
              <option value="federal">Federal</option>
              <option value="private">Private</option>
            </select>
          </PlanField>
        )}
        {federal && (
          <PlanField label="Repayment plan" hint={US_REPAYMENT_PLANS.find((plan) => plan.value === (account.repaymentPlan ?? "standard"))?.hint ?? ""}>
            <select value={account.repaymentPlan ?? "standard"} onChange={(event) => onChange({ repaymentPlan: event.target.value as Account["repaymentPlan"] })} aria-label={`Repayment plan for ${account.name}`}>
              {US_REPAYMENT_PLANS.map((plan) => (
                <option key={plan.value} value={plan.value}>
                  {plan.label}
                </option>
              ))}
            </select>
          </PlanField>
        )}
        {federal && account.repaymentPlan === "income-driven" && (
          <PlanField label="Household size" hint="Income-driven payments protect 150% of the poverty guideline for your household size.">
            <NumberInput value={Math.max(1, positive(account.familySize) || 1)} min={1} max={20} integer ariaLabel={`Household size for ${account.name}`} onCommit={(value) => onChange({ familySize: value })} />
          </PlanField>
        )}
        {isStudent && region === "GB" && (
          <PlanField label="Repayment plan" hint={UK_STUDENT_LOAN_PLANS.find((plan) => plan.value === account.studentLoanPlan)?.hint ?? "Which plan you are on depends on where and when you studied. It is printed on your statement."}>
            <select value={account.studentLoanPlan ?? ""} onChange={(event) => onChange({ studentLoanPlan: (event.target.value || undefined) as Account["studentLoanPlan"] })} aria-label={`Student loan plan for ${account.name}`}>
              <option value="">Choose a plan…</option>
              {UK_STUDENT_LOAN_PLANS.map((plan) => (
                <option key={plan.value} value={plan.value}>
                  {plan.label}
                </option>
              ))}
            </select>
          </PlanField>
        )}
        {showTerm && (
          <PlanField label="Remaining term" hint="Months left on the agreement. With the balance and rate this gives the level payment that clears it on time.">
            <div className="planInputRow">
              <NumberInput value={positive(account.termMonths)} min={0} max={1200} integer ariaLabel={`Remaining term for ${account.name}`} onCommit={(value) => onChange({ termMonths: value })} />
              <span className="fieldSuffix">months</span>
            </div>
          </PlanField>
        )}
      </div>
      {suggestion.suggestedPayment !== null ? (
        <div className="planSuggestion" role="status">
          <span>
            Suggested payment <strong className={privacy ? "masked" : ""}>{formatter.format(suggestion.suggestedPayment)}</strong>/mo · {suggestion.basis}
          </span>
          {Math.abs(suggestion.suggestedPayment - positive(account.minimumPayment)) > 0.5 && (
            <button className="commandButton" type="button" onClick={() => onChange({ minimumPayment: suggestion.suggestedPayment ?? 0 })}>
              <Check size={14} />
              Use as monthly payment
            </button>
          )}
        </div>
      ) : null}
      {suggestion.notes.map((note) => (
        <p className="planHint" key={note}>
          <AlertCircle size={13} />
          {note}
        </p>
      ))}
    </div>
  );
}

// ─── Retirement / pensions widget ────────────────────────────────────────────

export function RetirementWidget({
  accounts,
  region,
  taxProfile,
  formatter,
  privacy,
  title: titleOverride,
  onOpenAccounts,
  onOpenEstimator,
}: Omit<Money, "symbol"> & {
  accounts: Account[];
  region: RegionKey;
  taxProfile: TaxProfile;
  title?: string;
  onOpenAccounts: () => void;
  onOpenEstimator: () => void;
}) {
  const year = limitYear(region);
  const groups = contributionLimitGroups(accounts, region, year);
  const shortfalls = employerMatchShortfalls(accounts, taxProfile.grossAnnualSalary);
  const tracked = accounts.filter((account) => account.accountClass !== "debt" && annualLimitFor(account, region, year));
  const salary = positive(taxProfile.grossAnnualSalary);
  const title = titleOverride ?? (region === "US" ? "Retirement & tax-advantaged accounts" : "Pensions & ISAs");
  const totalMonthly = tracked.reduce((sum, account) => sum + positive(account.monthlyContribution) + positive(account.employerMonthlyContribution), 0);
  const employerMonthly = tracked.reduce((sum, account) => sum + positive(account.employerMonthlyContribution), 0);

  return (
    <article className="miniPanel retirementPanel">
      <PanelTitle title={title} icon={<Landmark size={16} />} action={<span className="panelWhen">{limitYearLabel(region, year)}</span>} />
      {tracked.length === 0 ? (
        <EmptyState
          icon={<Landmark size={18} />}
          title={region === "US" ? "No retirement or tax-advantaged accounts yet" : "No pensions or ISAs yet"}
          text={
            region === "US"
              ? "Add a 401(k), IRA, HSA or 529 on the Accounts page to track contributions, employer match and this year's limits."
              : "Add a workplace pension, SIPP or ISA on the Accounts page to track contributions against this year's allowances."
          }
          onAction={onOpenAccounts}
        />
      ) : (
        <>
          <div className="debtMiniGrid retirementStats">
            <div>
              <span>Going in monthly</span>
              <strong className={privacy ? "masked" : ""}>{formatter.format(totalMonthly)}</strong>
            </div>
            <div>
              <span>From your employer</span>
              <strong className={privacy ? "masked" : ""}>{formatter.format(employerMonthly)}</strong>
            </div>
            <div>
              <span>Accounts tracked</span>
              <strong>{tracked.length}</strong>
            </div>
          </div>
          <div className="limitList">
            {groups.map((group) => (
              <div className={`limitRow ${group.counted > group.limit ? "over" : ""}`} key={group.key}>
                <div className="limitRowHead">
                  <span>
                    {group.label}
                    <InfoHint label={`${group.label} help`} text={group.note} />
                  </span>
                  <b className={privacy ? "masked" : ""}>
                    {formatter.format(group.counted)} / {formatter.format(group.limit)}
                  </b>
                </div>
                <div className="ruleTrack">
                  <strong style={{ width: `${group.usedPercent}%` }} />
                </div>
                <em>
                  {group.counted > group.limit
                    ? `Over the limit by ${money(formatter, group.counted - group.limit, privacy)} a year`
                    : group.remaining > 0
                      ? `${formatDecimal(group.usedPercent)}% used · ${money(formatter, group.remaining, privacy)} headroom · +${money(formatter, group.monthlyToMax, privacy)}/mo would max it`
                      : "Maxed out for the year"}
                  {group.employerAnnual > 0 && !group.key.startsWith("hsa") && group.key !== "pension" ? ` · employer adds ${money(formatter, group.employerAnnual, privacy)}/yr on top` : ""}
                </em>
              </div>
            ))}
          </div>
          {shortfalls.map((shortfall) => (
            <p className="planHint warn" key={shortfall.accountId}>
              <AlertCircle size={13} />
              {shortfall.name}: you pay in {shortfall.currentPercent}% but the match runs to {shortfall.neededPercent}% — about {money(formatter, shortfall.missedAnnual, privacy)} a year of free money left behind.
            </p>
          ))}
          <div className="retirementAccounts">
            {tracked.map((account) => {
              const treatment = TAX_TREATMENT_OPTIONS.find((item) => item.value === (account.taxTreatment ?? accountTypeOption(region, account.accountClass, account.type).taxTreatment));
              return (
                <div className="retirementAccount" key={account.id}>
                  <span className="swatch small" style={{ background: account.color }} />
                  <div className="subscriptionName">
                    <strong>{account.name}</strong>
                    <em>
                      {typeLabel(account, region)}
                      {treatment ? ` · ${treatment.label}` : ""}
                      {account.contributionSource === "payroll" ? " · from pay" : ""}
                    </em>
                  </div>
                  <strong className={privacy ? "masked" : ""}>{formatter.format(account.balance)}</strong>
                  <em className={privacy ? "masked" : ""}>
                    +{formatter.format(positive(account.monthlyContribution))}
                    {positive(account.employerMonthlyContribution) > 0 ? ` +${formatter.format(positive(account.employerMonthlyContribution))}` : ""}/mo
                  </em>
                </div>
              );
            })}
          </div>
          {salary <= 0 && (
            <button className="linkButton" type="button" onClick={onOpenEstimator}>
              Add your gross salary to set contributions as a % of pay and work out employer matches →
            </button>
          )}
        </>
      )}
    </article>
  );
}

// ─── Take-home pay ───────────────────────────────────────────────────────────

export function TakeHomeWidget({
  region,
  taxProfile,
  accounts,
  formatter,
  privacy,
  onOpen,
}: Omit<Money, "symbol"> & { region: RegionKey; taxProfile: TaxProfile; accounts: Account[]; onOpen: () => void }) {
  const summary = useMemo(() => computeTakeHome(region, taxProfile, accounts), [region, taxProfile, accounts]);
  return (
    <article className="miniPanel takeHomePanel">
      <PanelTitle title="Take-home estimate" icon={<Calculator size={16} />} action={<span className="panelWhen">{summary.yearLabel}</span>} />
      {!summary.hasSalary ? (
        <EmptyState
          icon={<Calculator size={18} />}
          title="Estimate your take-home pay"
          text={region === "US" ? "Enter a gross salary to see federal, state and FICA taxes and your net paycheck." : "Enter a gross salary to see income tax, National Insurance, student loan and your net pay."}
          onAction={onOpen}
        />
      ) : (
        <>
          <div className="takeHomeHeadline">
            <div>
              <span>Net per month</span>
              <strong className={privacy ? "masked" : ""}>{formatter.format(summary.netMonthly)}</strong>
            </div>
            <div>
              <span>Gross per year</span>
              <strong className={privacy ? "masked" : ""}>{formatter.format(summary.gross)}</strong>
            </div>
            <div>
              <span>{region === "US" ? "Taxes" : "Deductions"}</span>
              <strong>{formatDecimal(summary.effectiveRate)}%</strong>
            </div>
          </div>
          <p className="panelSubcopy">
            {summary.payPeriods !== 12 ? `About ${money(formatter, summary.netPerPaycheck, privacy)} per paycheck · ` : ""}
            marginal rate {formatDecimal(summary.marginalRate)}% · estimate only
          </p>
          <button className="linkButton" type="button" onClick={onOpen}>
            Open the full breakdown →
          </button>
        </>
      )}
    </article>
  );
}

// Dashboard: a picture of where gross pay goes, built from the estimate on the Pay & tax page.
// No inputs here — the numbers live on that page; this just charts them.
export function PaycheckBreakdownWidget({
  region,
  taxProfile,
  accounts,
  formatter,
  privacy,
  onOpenPay,
}: Omit<Money, "symbol"> & { region: RegionKey; taxProfile: TaxProfile; accounts: Account[]; onOpenPay: () => void }) {
  const summary = useMemo(() => computeTakeHome(region, taxProfile, accounts), [region, taxProfile, accounts]);
  const title = region === "US" ? "Where your paycheck goes" : "Where your pay goes";
  if (!summary.hasSalary) {
    return (
      <article className="miniPanel paycheckPanel">
        <PanelTitle title={title} icon={<Calculator size={16} />} />
        <EmptyState
          icon={<Calculator size={18} />}
          title="No salary to chart yet"
          text={region === "US" ? "Enter your gross salary on the Paycheck & tax page and this shows how it splits into taxes, deductions and take-home." : "Enter your gross salary on the Pay & tax page and this shows how it splits into tax, National Insurance, student loan and take-home."}
          onAction={onOpenPay}
        />
      </article>
    );
  }
  const palette = ["var(--red)", "var(--amber)", "var(--blue)", "#7a6cd6", "#d55181", "#e26030", "#c98500", "#008300"];
  const segments = summary.lines
    .slice(1, -1)
    .filter((line) => line.amount < 0)
    .map((line, index) => ({ label: line.label, amount: -line.amount, color: palette[index % palette.length] }));
  const net = { label: "Take-home pay", amount: summary.net, color: "var(--mint)" };
  const all = [net, ...segments];
  return (
    <article className="miniPanel paycheckPanel">
      <PanelTitle title={title} icon={<Calculator size={16} />} action={<span className="panelWhen">{summary.yearLabel}</span>} />
      <div className="paycheckBar" role="img" aria-label={`${title}: ${all.map((item) => `${item.label} ${Math.round((item.amount / summary.gross) * 100)}%`).join(", ")}`}>
        {all.map((item) => (
          <span key={item.label} style={{ flex: Math.max(item.amount, 0.0001), background: item.color }} title={`${item.label}: ${money(formatter, item.amount / 12, privacy)}/mo`} />
        ))}
      </div>
      <div className="paycheckLegend">
        {all.map((item) => (
          <div className="paycheckLegendRow" key={item.label}>
            <span className="swatch small" style={{ background: item.color }} />
            <span>{item.label}</span>
            <strong className={privacy ? "masked" : ""}>{formatter.format(item.amount / 12)}/mo</strong>
            <em>{formatDecimal((item.amount / Math.max(1, summary.gross)) * 100)}%</em>
          </div>
        ))}
      </div>
      <p className="panelSubcopy">
        Gross {money(formatter, summary.gross, privacy)} a year · effective {region === "US" ? "tax" : "deduction"} rate {formatDecimal(summary.effectiveRate)}% · estimate only.
      </p>
      <button className="linkButton" type="button" onClick={onOpenPay}>
        Adjust the estimate on {region === "US" ? "Paycheck & tax" : "Pay & tax"} →
      </button>
    </article>
  );
}

export function TakeHomeEstimator({
  region,
  taxProfile,
  accounts,
  formatter,
  symbol,
  privacy,
  onChange,
  onUseAsIncome,
}: Money & {
  region: RegionKey;
  taxProfile: TaxProfile;
  accounts: Account[];
  onChange: (patch: Partial<TaxProfile>) => void;
  onUseAsIncome: (monthlyNet: number) => void;
}) {
  const summary = useMemo(() => computeTakeHome(region, taxProfile, accounts), [region, taxProfile, accounts]);
  const stateEntry = US_STATES.find((state) => state.code === taxProfile.state);
  const payroll = summary.payroll;

  return (
    <article className="miniPanel estimatorPanel" aria-label="Take-home pay estimator">
      <PanelTitle
        title={region === "US" ? "Gross-to-net pay estimate" : "Take-home pay estimate"}
        icon={<Calculator size={16} />}
        action={<span className="estimateBadge">Estimate · {summary.yearLabel}</span>}
      />
      <p className="panelSubcopy">
        {region === "US"
          ? "A rough picture of where a paycheck goes: federal brackets and the standard deduction, Social Security and Medicare, and a single state rate. No credits, itemized deductions or local taxes — not tax advice."
          : "A rough picture of where pay goes: PAYE income tax (England, Wales and NI rates), employee National Insurance, student-loan deductions and pension contributions taken before tax. Standard tax code assumed — not tax advice."}
      </p>
      <div className="estimatorGrid">
        <div className="estimatorInputs">
          <PlanField label="Gross annual salary">
            <MoneyInput ariaLabel="Gross annual salary" value={String(positive(taxProfile.grossAnnualSalary))} symbol={symbol} privacy={privacy} onChange={(value) => onChange({ grossAnnualSalary: positive(Number(value)) })} />
          </PlanField>
          <PlanField label="Paid">
            <select value={taxProfile.payFrequency} onChange={(event) => onChange({ payFrequency: event.target.value as TaxProfile["payFrequency"] })} aria-label="Pay frequency">
              {PAY_FREQUENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </PlanField>
          {region === "US" ? (
            <>
              <PlanField label="Filing status">
                <select value={taxProfile.filingStatus} onChange={(event) => onChange({ filingStatus: event.target.value as TaxProfile["filingStatus"] })} aria-label="Filing status">
                  {FILING_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </PlanField>
              <PlanField label="State" hint="Flat-tax states use their statutory rate. Progressive states carry a rough middle-income effective rate — override it below if you know yours.">
                <select value={taxProfile.state} onChange={(event) => onChange({ state: event.target.value, stateRateOverride: null })} aria-label="State">
                  <option value="">Choose a state…</option>
                  {US_STATES.map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.name} {state.kind === "none" ? "(no income tax)" : state.kind === "flat" ? `(${state.rate}% flat)` : `(≈${state.rate}%)`}
                    </option>
                  ))}
                </select>
              </PlanField>
              <PlanField label="State rate override" hint="Leave blank to use the state's figure.">
                <div className="planInputRow">
                  <NumberInput
                    value={taxProfile.stateRateOverride ?? stateEntry?.rate ?? 0}
                    min={0}
                    max={30}
                    ariaLabel="State tax rate override"
                    onCommit={(value) => onChange({ stateRateOverride: value === (stateEntry?.rate ?? 0) ? null : value })}
                  />
                  <span className="fieldSuffix">%</span>
                </div>
              </PlanField>
              <PlanField label="Health premium per month" hint="Your share of the health insurance premium, taken from pay before tax. The Medical spending widget keeps the plan's deductible.">
                <MoneyInput ariaLabel="Pre-tax health premium per month" value={String(positive(taxProfile.preTaxHealthPremiumMonthly))} symbol={symbol} privacy={privacy} onChange={(value) => onChange({ preTaxHealthPremiumMonthly: positive(Number(value)) })} />
              </PlanField>
            </>
          ) : (
            <>
              <PlanField label="Student loan plan" hint="Repayments are 9% of pay above the plan's threshold (6% for postgraduate loans), collected through payroll.">
                <select value={taxProfile.studentLoanPlan} onChange={(event) => onChange({ studentLoanPlan: event.target.value as TaxProfile["studentLoanPlan"] })} aria-label="Student loan plan">
                  <option value="none">None</option>
                  {UK_STUDENT_LOAN_PLANS.filter((plan) => plan.value !== "postgrad").map((plan) => (
                    <option key={plan.value} value={plan.value}>
                      {plan.label}
                    </option>
                  ))}
                </select>
              </PlanField>
              <label className="planCheck">
                <input type="checkbox" checked={taxProfile.postgradLoan} onChange={(event) => onChange({ postgradLoan: event.target.checked })} aria-label="Postgraduate loan" />
                <span>Postgraduate loan too (6% above £21,000)</span>
              </label>
            </>
          )}
          <p className="planHint">
            <Briefcase size={13} />
            {payroll.preTaxRetirementAnnual + payroll.preTaxHealthAccountsAnnual + payroll.afterTaxAnnual > 0
              ? `Paycheck contributions from your accounts: ${money(formatter, (payroll.preTaxRetirementAnnual + payroll.preTaxHealthAccountsAnnual + payroll.afterTaxAnnual) / 12, privacy)}/mo (set on each account's plan details).`
              : region === "US"
                ? "401(k), HSA and FSA contributions set as \u201cfrom my paycheck\u201d on the Accounts page are deducted here automatically."
                : "Pension contributions set as \u201cfrom my pay\u201d on the Accounts page are deducted here automatically."}
          </p>
        </div>
        <div className="estimatorResult">
          {!summary.hasSalary ? (
            <EmptyState icon={<Calculator size={18} />} title="Enter a gross salary" text="The breakdown appears as soon as there is a salary to work from." />
          ) : (
            <>
              <table className="taxTable">
                <thead>
                  <tr>
                    <th scope="col" />
                    <th scope="col">Monthly</th>
                    <th scope="col">Yearly</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.lines.map((line, index) => {
                    const last = index === summary.lines.length - 1;
                    return (
                      <tr key={line.label} className={last ? "total" : index === 0 ? "gross" : ""}>
                        <th scope="row">
                          {line.label}
                          {line.rate !== undefined && line.rate > 0 && !last ? <small> {formatDecimal(line.rate)}%</small> : null}
                        </th>
                        <td className={privacy ? "masked" : ""}>{formatter.format(line.amount / 12)}</td>
                        <td className={privacy ? "masked" : ""}>{formatter.format(line.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="estimatorFacts">
                <span>
                  Effective {region === "US" ? "tax" : "deduction"} rate <b>{formatDecimal(summary.effectiveRate)}%</b>
                </span>
                <span>
                  Marginal rate <b>{formatDecimal(summary.marginalRate)}%</b>
                </span>
                {summary.payPeriods !== 12 && (
                  <span>
                    Per paycheck <b className={privacy ? "masked" : ""}>{formatter.format(summary.netPerPaycheck)}</b>
                  </span>
                )}
                {summary.us && (
                  <span>
                    Standard deduction <b className={privacy ? "masked" : ""}>{formatter.format(summary.us.standardDeduction)}</b>
                  </span>
                )}
                {summary.uk && (
                  <span>
                    Personal allowance <b className={privacy ? "masked" : ""}>{formatter.format(summary.uk.personalAllowance)}</b>
                  </span>
                )}
              </div>
              <div className="buttonRow">
                <button className="commandButton" type="button" onClick={() => onUseAsIncome(summary.netMonthly)}>
                  <Check size={14} />
                  Use {money(formatter, summary.netMonthly, privacy)} as monthly income
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Medical spending (US) ───────────────────────────────────────────────────

export function MedicalWidget({
  months,
  healthPlan,
  accounts,
  formatter,
  symbol,
  privacy,
  onChange,
  onOpenAccounts,
}: Money & {
  months: Record<string, MonthBudget>;
  healthPlan: HealthPlan;
  accounts: Account[];
  onChange: (patch: Partial<HealthPlan>) => void;
  onOpenAccounts: () => void;
}) {
  const summary = useMemo(() => summarizeMedical({ months, healthPlan, accounts }), [months, healthPlan, accounts]);
  const [setupOpen, setSetupOpen] = useState(!summary.hasPlan);

  return (
    <article className="miniPanel medicalPanel">
      <PanelTitle
        title="Medical spending"
        icon={<HeartPulse size={16} />}
        action={
          <button className="commandButton" type="button" onClick={() => setSetupOpen((open) => !open)} aria-expanded={setupOpen}>
            {setupOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {summary.hasPlan ? "Plan" : "Set up plan"}
          </button>
        }
      />
      {setupOpen && (
        <div className="planDetails inline">
          <div className="planGrid">
            <PlanField label="Plan type" hint={HEALTH_PLAN_TYPES.find((type) => type.value === healthPlan.planType)?.hint || "The kind of health insurance you have."}>
              <select value={healthPlan.planType} onChange={(event) => onChange({ planType: event.target.value as HealthPlan["planType"] })} aria-label="Health plan type">
                {HEALTH_PLAN_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </PlanField>
            <PlanField label="Coverage">
              <select value={healthPlan.coverage} onChange={(event) => onChange({ coverage: event.target.value as HealthPlan["coverage"] })} aria-label="Health plan coverage">
                <option value="self">Self-only</option>
                <option value="family">Family</option>
              </select>
            </PlanField>
            <PlanField label="Deductible" hint="What you pay for covered care each plan year before insurance starts paying its share.">
              <MoneyInput ariaLabel="Health plan deductible" value={String(healthPlan.deductible)} symbol={symbol} privacy={privacy} onChange={(value) => onChange({ deductible: positive(Number(value)) })} />
            </PlanField>
            <PlanField label="Out-of-pocket maximum" hint="The most you can pay in a plan year for covered in-network care; after this the plan pays 100%.">
              <MoneyInput ariaLabel="Out-of-pocket maximum" value={String(healthPlan.outOfPocketMax)} symbol={symbol} privacy={privacy} onChange={(value) => onChange({ outOfPocketMax: positive(Number(value)) })} />
            </PlanField>
            <PlanField label="Plan year starts" hint="Most plans run January to December; some employer plans start in another month.">
              <select value={String(healthPlan.planYearStartMonth)} onChange={(event) => onChange({ planYearStartMonth: Number(event.target.value) })} aria-label="Plan year start month">
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {new Date(2000, index, 1).toLocaleString("en", { month: "long" })}
                  </option>
                ))}
              </select>
            </PlanField>
          </div>
        </div>
      )}
      {!summary.hasPlan && !summary.hasAccounts ? (
        setupOpen ? (
          <p className="planHint">
            <HeartPulse size={13} />
            Set the deductible and out-of-pocket maximum above. Expenses in a Medical, Health, Doctor, Dental or Pharmacy category count towards them; an HSA or FSA on Accounts shows what is set aside.
          </p>
        ) : (
          <EmptyState
            icon={<HeartPulse size={18} />}
            title="Track medical costs against your plan"
            text="Set the plan's deductible and out-of-pocket maximum. Expenses in a Medical, Health, Doctor, Dental or Pharmacy category count towards them; add an HSA or FSA on Accounts to see what is set aside."
            onAction={() => setSetupOpen(true)}
          />
        )
      ) : (
        <>
          <div className="limitList">
            {summary.deductible > 0 && (
              <div className={`limitRow ${summary.deductibleMet ? "done" : ""}`}>
                <div className="limitRowHead">
                  <span>Deductible</span>
                  <b className={privacy ? "masked" : ""}>
                    {formatter.format(summary.spentThisPlanYear)} / {formatter.format(summary.deductible)}
                  </b>
                </div>
                <div className="ruleTrack">
                  <strong style={{ width: `${summary.deductiblePercent}%` }} />
                </div>
                <em>{summary.deductibleMet ? "Deductible met — insurance now shares the cost" : `${money(formatter, summary.remainingDeductible, privacy)} to go before insurance pays its share`}</em>
              </div>
            )}
            {summary.outOfPocketMax > 0 && (
              <div className="limitRow">
                <div className="limitRowHead">
                  <span>Out-of-pocket maximum</span>
                  <b className={privacy ? "masked" : ""}>
                    {formatter.format(summary.spentThisPlanYear)} / {formatter.format(summary.outOfPocketMax)}
                  </b>
                </div>
                <div className="ruleTrack">
                  <strong style={{ width: `${summary.outOfPocketPercent}%` }} />
                </div>
                <em>{money(formatter, summary.remainingOutOfPocket, privacy)} of protection left this plan year</em>
              </div>
            )}
          </div>
          <div className="debtMiniGrid medicalStats">
            <div>
              <span>Spent this plan year</span>
              <strong className={privacy ? "masked" : ""}>{formatter.format(summary.spentThisPlanYear)}</strong>
            </div>
            <div>
              <span>HSA balance</span>
              <strong className={privacy ? "masked" : ""}>{formatter.format(summary.hsaBalance)}</strong>
            </div>
            <div>
              <span>FSA balance</span>
              <strong className={privacy ? "masked" : ""}>{formatter.format(summary.fsaBalance)}</strong>
            </div>
            <div>
              <span>Set aside monthly</span>
              <strong className={privacy ? "masked" : ""}>{formatter.format(summary.hsaMonthly + summary.fsaMonthly)}</strong>
            </div>
          </div>
          {summary.fsaBalance > 0 && (
            <p className={`planHint ${summary.monthsLeftInPlanYear <= 2 ? "warn" : ""}`}>
              <AlertCircle size={13} />
              FSA money is use-it-or-lose-it: {summary.monthsLeftInPlanYear === 0 ? "the plan year ends this month" : `${summary.monthsLeftInPlanYear} month${summary.monthsLeftInPlanYear === 1 ? "" : "s"} left to spend it`}.
            </p>
          )}
          {!summary.hasAccounts && (
            <button className="linkButton" type="button" onClick={onOpenAccounts}>
              Add an HSA or FSA to see what is set aside →
            </button>
          )}
        </>
      )}
    </article>
  );
}

// ─── Loans widget ────────────────────────────────────────────────────────────

export function LoansWidget({
  accounts,
  region,
  taxProfile,
  formatter,
  privacy,
  onOpenAccounts,
}: Omit<Money, "symbol"> & { accounts: Account[]; region: RegionKey; taxProfile: TaxProfile; onOpenAccounts: () => void }) {
  const loans = accounts.filter((account) => account.accountClass === "debt" && isLoanType(account.type));
  const year = region === "US" ? new Date().getFullYear() : ukTaxYearFor();
  const totalBalance = loans.reduce((sum, loan) => sum + positive(loan.balance), 0);
  const totalPayment = loans.reduce((sum, loan) => sum + positive(loan.minimumPayment), 0);

  return (
    <article className="miniPanel loansPanel">
      <PanelTitle title={region === "US" ? "Loans & student loans" : "Loans"} icon={<GraduationCap size={16} />} />
      {!loans.length ? (
        <EmptyState
          icon={<GraduationCap size={18} />}
          title="No loans tracked"
          text={region === "US" ? "Add a mortgage, auto loan or student loan on the Accounts page. Federal student loans get repayment-plan estimates." : "Add a mortgage, car finance or student loan on the Accounts page. Student loans get plan-based repayment estimates."}
          onAction={onOpenAccounts}
        />
      ) : (
        <>
          <div className="debtMiniGrid loanStats">
            <div>
              <span>Owed on loans</span>
              <strong className={privacy ? "masked" : ""}>{formatter.format(totalBalance)}</strong>
            </div>
            <div>
              <span>Monthly payments</span>
              <strong className={privacy ? "masked" : ""}>{formatter.format(totalPayment)}</strong>
            </div>
          </div>
          <div className="subscriptionList">
            {loans.map((loan) => {
              const suggestion = loanSuggestion(loan, region, taxProfile, year);
              const payoff = estimateDebtPayoff(loan);
              const planLabel =
                loan.type === "student-loan"
                  ? region === "GB"
                    ? UK_STUDENT_LOAN_PLANS.find((plan) => plan.value === loan.studentLoanPlan)?.label ?? "Plan not set"
                    : (loan.studentLoanType ?? "federal") === "federal"
                      ? `Federal · ${US_REPAYMENT_PLANS.find((plan) => plan.value === (loan.repaymentPlan ?? "standard"))?.label ?? "Standard"}`
                      : "Private"
                  : `${formatDecimal(positive(loan.rate))}% APR${positive(loan.termMonths) > 0 ? ` · ${loan.termMonths} months left` : ""}`;
              return (
                <div className="subscriptionRow loanRow" key={loan.id}>
                  <span className="swatch small" style={{ background: loan.color }} />
                  <div className="subscriptionName">
                    <strong>{loan.name}</strong>
                    <em>
                      {typeLabel(loan, region)} · {planLabel}
                      {payoff.monthsToPayoff && payoff.monthsToPayoff > 0 ? ` · paid off ${formatMonth(shiftMonth(getMonthKey(), payoff.monthsToPayoff))}` : ""}
                    </em>
                  </div>
                  <strong className={privacy ? "masked" : ""}>{formatter.format(loan.balance)}</strong>
                  <em className={privacy ? "masked" : ""}>
                    {formatter.format(positive(loan.minimumPayment))}/mo
                    {suggestion.suggestedPayment !== null && Math.abs(suggestion.suggestedPayment - positive(loan.minimumPayment)) > 0.5 ? ` · plan says ${formatter.format(suggestion.suggestedPayment)}` : ""}
                  </em>
                </div>
              );
            })}
          </div>
        </>
      )}
    </article>
  );
}

// ─── Housing costs ───────────────────────────────────────────────────────────

export function HousingWidget({
  month,
  income,
  region,
  formatter,
  privacy,
  onOpenLedger,
}: Omit<Money, "symbol"> & { month: MonthBudget; income: number; region: RegionKey; onOpenLedger: () => void }) {
  const rows = month.expenses.filter((expense) => HOUSING_PATTERN.test(`${expense.category} ${expense.name}`));
  const total = rows.reduce((sum, expense) => sum + positive(expense.amount), 0);
  const share = income > 0 ? (total / income) * 100 : 0;
  return (
    <article className="miniPanel housingPanel">
      <PanelTitle title="Housing costs" icon={<House size={16} />} />
      {!rows.length ? (
        <EmptyState
          icon={<House size={18} />}
          title="No housing costs this month"
          text={
            region === "US"
              ? "Expenses named or categorised as rent, mortgage, property tax, HOA or home insurance are totalled here. Add them in the Ledger."
              : "Expenses named or categorised as rent, mortgage, council tax, service charge or ground rent are totalled here. Add them in the Ledger."
          }
          onAction={onOpenLedger}
        />
      ) : (
        <>
          <div className="takeHomeHeadline">
            <div>
              <span>This month</span>
              <strong className={privacy ? "masked" : ""}>{formatter.format(total)}</strong>
            </div>
            <div>
              <span>Of income</span>
              <strong className={share > 35 ? "negativeText" : ""}>{income > 0 ? `${formatDecimal(share)}%` : "—"}</strong>
            </div>
          </div>
          <div className="categoryList">
            {rows.map((expense) => (
              <div className="categoryRow" key={expense.id}>
                <span className="swatch small" style={{ background: expense.color }} />
                <span>{expense.name}</span>
                <strong className={privacy ? "masked" : ""}>{formatter.format(expense.amount)}</strong>
                <em>{total > 0 ? `${formatDecimal((positive(expense.amount) / total) * 100)}%` : ""}</em>
              </div>
            ))}
          </div>
          <p className="panelSubcopy">{share > 35 ? "Over the 30–35% of income most lenders treat as the comfortable ceiling for housing." : "Under the 30–35% of income guideline for housing."}</p>
        </>
      )}
    </article>
  );
}

// ─── Credit score ────────────────────────────────────────────────────────────

function ScoreScale({ reading, privacy }: { reading: ScoreReading; privacy: boolean }) {
  const position = ((reading.score - reading.min) / Math.max(1, reading.max - reading.min)) * 100;
  return (
    <div className="scoreScale" aria-label={`${reading.scale} scale`}>
      <div className="scoreScaleHead">
        <span>{reading.scale}</span>
        <b className={privacy ? "masked" : ""}>
          {reading.score} <small>/ {reading.max}</small>
        </b>
        <em className={`scoreBandChip ${reading.band.tone}`}>{reading.band.label}</em>
      </div>
      <div className="scoreBands">
        {reading.bands.map((band) => (
          <span key={band.label} className={`scoreBand ${band.tone}`} style={{ flex: band.max - band.min + 1 }} title={`${band.label}: ${band.min}–${band.max}`} />
        ))}
        <i className="scoreMarker" style={{ left: `${clampPercent(position)}%` }} />
      </div>
      <div className="scoreBandLabels">
        {reading.bands.map((band) => (
          <span key={band.label} style={{ flex: band.max - band.min + 1 }}>
            {band.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CreditScoreWidget({ estimate, noData, region, privacy }: { estimate: number; noData: boolean; region: RegionKey; privacy: boolean }) {
  const reading = interpretCreditScore(estimate, region);
  return (
    <article className="miniPanel creditPanel">
      <PanelTitle
        title="Credit score estimate"
        icon={<ShieldCheck size={16} />}
        action={<InfoHint label="About the credit score estimate" text="A rough local estimate from your utilisation, payment pressure and cash flow — not a bureau score. Your real score also depends on payment history, account age and searches, none of which this app can see." />}
      />
      {noData ? (
        <EmptyState icon={<ShieldCheck size={18} />} title="No estimate yet" text="Add income, spending and a credit card or loan to get a rough credit estimate." />
      ) : (
        <>
          <ScoreScale reading={reading.primary} privacy={privacy} />
          {reading.secondary && <ScoreScale reading={reading.secondary} privacy={privacy} />}
          <p className="panelSubcopy">{reading.meaning}</p>
          <p className="planHint">
            <Percent size={13} />
            {reading.primary.note}
            {reading.secondary ? ` ${reading.secondary.note}` : ""}
          </p>
        </>
      )}
    </article>
  );
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export function GoalsWidget({
  goals,
  goalSequence,
  formatter,
  privacy,
  onOpenGoals,
}: Omit<Money, "symbol"> & { goals: SavingsGoal[]; goalSequence: GoalSequenceResult; onOpenGoals: () => void }) {
  const sorted = [...goals].sort((a, b) => a.priority - b.priority);
  return (
    <article className="miniPanel goalsPanel">
      <PanelTitle title="Goals" icon={<Target size={16} />} />
      {!sorted.length ? (
        <EmptyState icon={<Target size={18} />} title="No goals yet" text="Set a savings goal and see when you'll reach it." onAction={onOpenGoals} />
      ) : (
        <div className="limitList">
          {sorted.slice(0, 5).map((goal) => {
            const outcome = goalSequence.goals.find((item) => item.goalId === goal.id);
            const percent = goal.target > 0 ? clampPercent((goal.saved / goal.target) * 100) : 0;
            return (
              <div className="limitRow" key={goal.id}>
                <div className="limitRowHead">
                  <span>
                    <span className="swatch small" style={{ background: goal.color }} /> {goal.name || "Goal"}
                  </span>
                  <b className={privacy ? "masked" : ""}>
                    {formatter.format(goal.saved)} / {formatter.format(goal.target)}
                  </b>
                </div>
                <div className="ruleTrack">
                  <strong style={{ width: `${percent}%`, background: goal.color }} />
                </div>
                <em>
                  {formatDecimal(percent)}% saved
                  {outcome?.completionDate ? ` · ${outcome.completionDate === "Already complete" ? "complete" : `on track for ${outcome.completionDate}`}` : ""}
                </em>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
